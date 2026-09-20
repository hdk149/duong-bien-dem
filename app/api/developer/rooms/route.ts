import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function GET(request: NextRequest) {
  try {
    const developerToken =
      request.headers.get("x-developer-session")?.trim() || "";

    if (!developerToken) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing developer session.",
        },
        { status: 401 }
      );
    }

    const tokenHash = hashToken(developerToken);

    const { data: developerSession, error: sessionError } =
      await supabase
        .from("developer_sessions")
        .select("id, player_id, expires_at")
        .eq("token_hash", tokenHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

    if (sessionError) {
      console.error(
        "Developer session lookup error:",
        sessionError
      );

      return NextResponse.json(
        {
          success: false,
          message: "Failed to validate developer session.",
        },
        { status: 500 }
      );
    }

    if (!developerSession) {
      return NextResponse.json(
        {
          success: false,
          message: "Developer session expired or invalid.",
        },
        { status: 401 }
      );
    }

    const { data: rooms, error: roomsError } =
      await supabase
        .from("rooms")
        .select(
          `
          id,
          code,
          host_name,
          max_players,
          status,
          created_at
          `
        )
        .order("created_at", {
          ascending: false,
        });

    if (roomsError) {
      console.error("Rooms lookup error:", roomsError);

      return NextResponse.json(
        {
          success: false,
          message: "Failed to load rooms.",
        },
        { status: 500 }
      );
    }

    const roomIds = (rooms || []).map(
      (room) => room.id
    );

    let playerCounts: Record<string, number> = {};

    if (roomIds.length > 0) {
      const { data: players, error: playersError } =
        await supabase
          .from("room_players")
          .select("room_id, role")
          .in("room_id", roomIds)
          .in("role", ["host", "player"]);

      if (playersError) {
        console.error(
          "Player count lookup error:",
          playersError
        );
      } else {
        playerCounts = (players || []).reduce(
          (acc, player) => {
            acc[player.room_id] =
              (acc[player.room_id] || 0) + 1;

            return acc;
          },
          {} as Record<string, number>
        );
      }
    }

    const result = (rooms || []).map((room) => ({
      id: room.id,
      code: room.code,
      host_name: room.host_name,
      max_players: room.max_players,
      status: room.status,
      player_count: playerCounts[room.id] || 0,
      created_at: room.created_at,
    }));

    return NextResponse.json(
      {
        success: true,
        rooms: result,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "Developer rooms API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error.",
      },
      { status: 500 }
    );
  }
}