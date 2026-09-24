import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getInventory } from "@/lib/game/inventory";

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
  },
);

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { code } = await context.params;

    const playerToken =
      request.headers.get("x-player-token");

    if (!playerToken) {
      return NextResponse.json(
        {
          error: "Missing player token",
        },
        {
          status: 401,
        },
      );
    }

    const normalizedCode = code.trim();

    if (!normalizedCode) {
      return NextResponse.json(
        {
          error: "Missing room code",
        },
        {
          status: 400,
        },
      );
    }

    // --------------------------------------------------
    // 1. Find room
    // --------------------------------------------------

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select("id, code")
        .eq("code", normalizedCode)
        .maybeSingle();

    if (roomError) {
      console.error(
        "Inventory room lookup error:",
        roomError,
      );

      return NextResponse.json(
        {
          error: "Failed to load room",
          details: roomError.message,
          step: "room_lookup",
        },
        {
          status: 500,
        },
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error: "Room not found",
        },
        {
          status: 404,
        },
      );
    }

    // --------------------------------------------------
    // 2. Find player
    // --------------------------------------------------

    const { data: player, error: playerError } =
      await supabase
        .from("room_players")
        .select(
          `
            id,
            room_id,
            player_name,
            role,
            moderation_status,
            is_connected
          `,
        )
        .eq("room_id", room.id)
        .eq("player_token", playerToken)
        .maybeSingle();

    if (playerError) {
      console.error(
        "Inventory player lookup error:",
        playerError,
      );

      return NextResponse.json(
        {
          error: "Failed to load player",
          details: playerError.message,
          step: "player_lookup",
        },
        {
          status: 500,
        },
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          error: "Player not found",
        },
        {
          status: 404,
        },
      );
    }

    // --------------------------------------------------
    // 3. Permission
    // --------------------------------------------------

    if (player.role === "spectator") {
      return NextResponse.json(
        {
          error:
            "Spectators do not have an inventory",
        },
        {
          status: 403,
        },
      );
    }

    if (player.moderation_status !== "active") {
      return NextResponse.json(
        {
          error: "Player is not active",
        },
        {
          status: 403,
        },
      );
    }

    // --------------------------------------------------
    // 4. Inventory
    // --------------------------------------------------

    console.log(
      "[INVENTORY] loading",
      {
        roomId: room.id,
        playerId: player.id,
      },
    );

    const inventory = await getInventory(
      room.id,
      player.id,
    );

    console.log(
      "[INVENTORY] loaded",
      {
        count: inventory.length,
      },
    );

    // --------------------------------------------------
    // 5. Success
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      player: {
        id: player.id,
        name: player.player_name,
        role: player.role,
      },

      inventory,
    });
  } catch (error) {
    console.error(
      "GET /api/rooms/[code]/inventory error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return NextResponse.json(
      {
        error: "Internal server error",
        details: message,
        step: "inventory_get",
      },
      {
        status: 500,
      },
    );
  }
}