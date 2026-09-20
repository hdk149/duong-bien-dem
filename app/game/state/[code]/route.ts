import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase server environment variables");
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

    const playerToken =
      request.headers.get("x-player-token");

    if (!playerToken) {
      return NextResponse.json(
        {
          error: "Missing player token",
        },
        {
          status: 401,
        }
      );
    }

    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        {
          error: "Invalid room code",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // 1. FIND ROOM
    // =====================================================

    const {
      data: room,
      error: roomError,
    } = await supabase
      .from("rooms")
      .select(
        `
          id,
          code,
          host_name,
          max_players,
          status
        `
      )
      .eq("code", code)
      .maybeSingle();

    if (roomError) {
      console.error(
        "GAME STATE ROOM ERROR:",
        roomError
      );

      return NextResponse.json(
        {
          error: "Unable to load room",
          detail: roomError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error: "Room not found",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // 2. VERIFY PLAYER TOKEN BELONGS TO THIS ROOM
    // =====================================================

    const {
      data: currentPlayer,
      error: playerError,
    } = await supabase
      .from("room_players")
      .select(
        `
          id,
          room_id,
          player_name,
          role,
          hp,
          money,
          location,
          is_connected,
          last_choice,
          player_token
        `
      )
      .eq("room_id", room.id)
      .eq("player_token", playerToken)
      .maybeSingle();

    if (playerError) {
      console.error(
        "GAME STATE PLAYER ERROR:",
        playerError
      );

      return NextResponse.json(
        {
          error: "Unable to verify player",
          detail: playerError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!currentPlayer) {
      return NextResponse.json(
        {
          error: "You are not a member of this room",
        },
        {
          status: 403,
        }
      );
    }

    // =====================================================
    // 3. GAME MUST BE PLAYING
    // =====================================================

    if (room.status !== "playing") {
      return NextResponse.json(
        {
          error: "Game has not started",
          status: room.status,
        },
        {
          status: 409,
        }
      );
    }

    // =====================================================
    // 4. LOAD GAME STATE
    // =====================================================

    const {
      data: gameState,
      error: gameStateError,
    } = await supabase
      .from("game_states")
      .select(
        `
          id,
          room_id,
          round,
          phase,
          current_event_id,
          started_at,
          updated_at,
          created_at
        `
      )
      .eq("room_id", room.id)
      .maybeSingle();

    if (gameStateError) {
      console.error(
        "GAME STATE ERROR:",
        gameStateError
      );

      return NextResponse.json(
        {
          error: "Unable to load game state",
          detail: gameStateError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!gameState) {
      return NextResponse.json(
        {
          error: "Game state not found",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // 5. LOAD CURRENT EVENT
    // =====================================================

    let currentEvent = null;

    if (gameState.current_event_id) {
      const {
        data: event,
        error: eventError,
      } = await supabase
        .from("game_events")
        .select(
          `
            id,
            room_id,
            round,
            title,
            description,
            event_type,
            choices,
            result,
            created_at
          `
        )
        .eq("id", gameState.current_event_id)
        .eq("room_id", room.id)
        .maybeSingle();

      if (eventError) {
        console.error(
          "GAME EVENT ERROR:",
          eventError
        );

        return NextResponse.json(
          {
            error: "Unable to load current event",
            detail: eventError.message,
          },
          {
            status: 500,
          }
        );
      }

      currentEvent = event;
    }

    // =====================================================
    // 6. LOAD PLAYERS
    // =====================================================

    const {
      data: players,
      error: playersError,
    } = await supabase
      .from("room_players")
      .select(
        `
          id,
          player_name,
          role,
          hp,
          money,
          location,
          is_connected,
          last_choice
        `
      )
      .eq("room_id", room.id)
      .order("created_at", {
        ascending: true,
      });

    if (playersError) {
      console.error(
        "GAME PLAYERS ERROR:",
        playersError
      );

      return NextResponse.json(
        {
          error: "Unable to load players",
          detail: playersError.message,
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // 7. REMOVE PRIVATE TOKEN FROM RESPONSE
    // =====================================================

    const safeCurrentPlayer = {
      id: currentPlayer.id,
      player_name: currentPlayer.player_name,
      role: currentPlayer.role,
      hp: currentPlayer.hp,
      money: currentPlayer.money,
      location: currentPlayer.location,
      is_connected: currentPlayer.is_connected,
      last_choice: currentPlayer.last_choice,
    };

    // =====================================================
    // 8. RESPONSE
    // =====================================================

    return NextResponse.json({
      room,
      gameState,
      currentEvent,
      currentPlayer: safeCurrentPlayer,
      players: players ?? [],
    });
  } catch (error) {
    console.error(
      "GAME STATE UNEXPECTED ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}