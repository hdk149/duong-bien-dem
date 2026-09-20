import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Player } from "../../../../../lib/game/types";
import {
  buildLocationLeak,
  shouldLeakLocation,
} from "../../../../../lib/game/location-leak";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ code: string }>;
  }
) {
  try {
    const { code } = await context.params;

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Invalid room code." },
        { status: 400 }
      );
    }

    const token =
      request.headers.get("x-player-token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing player token." },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // ROOM
    // --------------------------------------------------

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select(
          "id, code, status"
        )
        .eq("code", code)
        .maybeSingle();

    if (roomError || !room) {
      return NextResponse.json(
        { error: "Room not found." },
        { status: 404 }
      );
    }

    // --------------------------------------------------
    // AUTH PLAYER
    // --------------------------------------------------

    const { data: currentPlayer, error: playerError } =
      await supabase
        .from("room_players")
        .select(
          "id, room_id, player_name, role, hp, money, location, is_connected, last_choice"
        )
        .eq("room_id", room.id)
        .eq("player_token", token)
        .maybeSingle();

    if (playerError || !currentPlayer) {
      return NextResponse.json(
        { error: "Player not found." },
        { status: 403 }
      );
    }

    // --------------------------------------------------
    // ACTIVE SESSION
    // --------------------------------------------------

    const { data: session, error: sessionError } =
      await supabase
        .from("game_sessions")
        .select(
          "id, room_id, session_number, status, round, phase, current_event_id"
        )
        .eq("room_id", room.id)
        .eq("status", "active")
        .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Active session not found." },
        { status: 409 }
      );
    }

    /*
     * Leak của round vừa hoàn thành.
     *
     * Nếu session đã chuyển sang round mới,
     * ví dụ:
     *
     * round 5 -> round 6
     *
     * thì leakRound = 5.
     */

    const requestedRound =
      Number(
        request.headers.get(
          "x-location-leak-round"
        )
      );

    const leakRound =
      Number.isInteger(requestedRound) &&
      requestedRound > 0
        ? requestedRound
        : session.round;

    if (!shouldLeakLocation(leakRound)) {
      return NextResponse.json(
        {
          success: false,
          leaked: false,
        },
        { status: 200 }
      );
    }

    // --------------------------------------------------
    // EXISTING LEAK
    // --------------------------------------------------

    const { data: existingLeak } =
      await supabase
        .from("location_leaks")
        .select(
          "id, room_id, session_id, round, locations, created_at"
        )
        .eq("room_id", room.id)
        .eq("round", leakRound)
        .maybeSingle();

    if (existingLeak) {
      return NextResponse.json({
        success: true,
        leaked: true,
        leak: existingLeak,
      });
    }

    // --------------------------------------------------
    // LOAD PLAYERS
    // --------------------------------------------------

    const { data: players, error: playersError } =
      await supabase
        .from("room_players")
        .select(
          "id, player_name, role, hp, money, location, is_connected, last_choice"
        )
        .eq("room_id", room.id)
        .in("role", ["host", "player"]);

    if (playersError) {
      return NextResponse.json(
        {
          error:
            "Unable to load players.",
        },
        { status: 500 }
      );
    }

    const typedPlayers =
      (players || []) as Player[];

    // --------------------------------------------------
    // OSM / NOMINATIM
    // --------------------------------------------------

    const locations =
      await buildLocationLeak(
        typedPlayers
      );

    // --------------------------------------------------
    // INSERT
    // --------------------------------------------------

    const { data: leak, error: insertError } =
      await supabase
        .from("location_leaks")
        .insert({
          room_id: room.id,
          session_id: session.id,
          round: leakRound,
          locations,
        })
        .select(
          "id, room_id, session_id, round, locations, created_at"
        )
        .single();

    if (insertError) {
      /*
       * Nếu client khác vừa tạo leak trước mình,
       * unique(room_id, round) sẽ fail.
       *
       * Load lại leak thay vì báo lỗi.
       */

      const { data: raceLeak } =
        await supabase
          .from("location_leaks")
          .select(
            "id, room_id, session_id, round, locations, created_at"
          )
          .eq("room_id", room.id)
          .eq("round", leakRound)
          .maybeSingle();

      if (raceLeak) {
        return NextResponse.json({
          success: true,
          leaked: true,
          leak: raceLeak,
        });
      }

      return NextResponse.json(
        {
          error:
            "Unable to create location leak.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      leaked: true,
      leak,
    });
  } catch (error) {
    console.error(
      "LOCATION LEAK API ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      { status: 500 }
    );
  }
}