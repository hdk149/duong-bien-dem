import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { code } = await context.params;

    const playerToken = request.headers.get("x-player-token");

    if (!playerToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing player token",
        },
        { status: 401 }
      );
    }

    // 1. Find room
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, code, status")
      .eq("code", code)
      .maybeSingle();

    if (roomError) {
      console.error("Get room error:", roomError);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to load room",
        },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          success: false,
          error: "Room not found",
        },
        { status: 404 }
      );
    }

    // 2. Verify requester
    const { data: requester, error: requesterError } =
      await supabase
        .from("room_players")
        .select(
          `
          id,
          player_name,
          role,
          moderation_status,
          is_connected
        `
        )
        .eq("room_id", room.id)
        .eq("player_token", playerToken)
        .maybeSingle();

    if (requesterError) {
      console.error(
        "Get requester error:",
        requesterError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Failed to verify player",
        },
        { status: 500 }
      );
    }

    if (!requester) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid player token",
        },
        { status: 401 }
      );
    }

    if (
      requester.role === "spectator" ||
      requester.moderation_status !== "active"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "You cannot access the player list",
        },
        { status: 403 }
      );
    }

    // 3. Get active players
    const { data: players, error: playersError } =
      await supabase
        .from("room_players")
        .select(
          `
          id,
          player_name,
          role,
          hp,
          money,
          location,
          legal_risk,
          is_connected,
          moderation_status
        `
        )
        .eq("room_id", room.id)
        .in("role", ["host", "player"])
        .eq("moderation_status", "active")
        .order("created_at", {
          ascending: true,
        });

    if (playersError) {
      console.error(
        "Get players error:",
        playersError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Failed to load players",
        },
        { status: 500 }
      );
    }

    // 4. Return only data needed by the item UI
    const result = (players ?? []).map((player) => ({
      id: player.id,
      player_name: player.player_name,
      role: player.role,
      hp: player.hp,
      money: player.money,
      location: player.location,
      legal_risk: player.legal_risk,
      is_connected: player.is_connected,
      is_self: player.id === requester.id,
    }));

    return NextResponse.json({
      success: true,
      players: result,
    });
  } catch (error) {
    console.error("Players API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}