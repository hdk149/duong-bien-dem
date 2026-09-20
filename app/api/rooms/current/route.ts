import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey
);

export async function GET(request: Request) {
  try {
    const token =
      request.headers.get(
        "x-player-token"
      );

    if (!token) {
      return NextResponse.json(
        {
          error: "Missing player token.",
        },
        { status: 401 }
      );
    }

    const { data: player, error: playerError } =
      await supabaseAdmin
        .from("room_players")
        .select(
          `
          id,
          room_id,
          player_name,
          role,
          rooms!inner (
            id,
            code,
            status,
            host_name,
            max_players
          )
        `
        )
        .eq("player_token", token)
        .maybeSingle();

    if (playerError) {
      console.error(
        "[CURRENT ROOM] Player lookup error:",
        playerError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra phòng.",
        },
        { status: 500 }
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          error:
            "Bạn không thuộc phòng nào.",
        },
        { status: 404 }
      );
    }

    const room = Array.isArray(player.rooms)
      ? player.rooms[0]
      : player.rooms;

    if (!room) {
      return NextResponse.json(
        {
          error:
            "Không tìm thấy phòng.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      room: {
        id: room.id,
        code: room.code,
        status: room.status,
        host_name: room.host_name,
        max_players: room.max_players,
      },
      player: {
        id: player.id,
        playerName: player.player_name,
        role: player.role,
      },
    });
  } catch (error) {
    console.error(
      "[CURRENT ROOM] Unexpected error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Không thể kiểm tra phòng.",
      },
      { status: 500 }
    );
  }
}