import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase server environment variables"
  );
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

    const roomCode = String(code ?? "").trim();

    /*
     * =====================================
     * VALIDATE
     * =====================================
     */

    if (!/^\d{6}$/.test(roomCode)) {
      return NextResponse.json(
        {
          error: "Mã phòng không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    const token =
      request.headers.get("x-player-token");

    if (!token) {
      return NextResponse.json(
        {
          error: "Thiếu player token.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * =====================================
     * ROOM
     * =====================================
     */

    const {
      data: room,
      error: roomError,
    } = await supabase
      .from("rooms")
      .select(`
        id,
        code,
        host_name,
        max_players,
        status
      `)
      .eq("code", roomCode)
      .maybeSingle();

    if (roomError) {
      console.error(
        "GAME STATE ROOM ERROR:",
        roomError
      );

      return NextResponse.json(
        {
          error: "Không thể tải phòng.",
        },
        {
          status: 500,
        }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error: "Phòng không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =====================================
     * PLAYER AUTH
     * =====================================
     */

    const {
      data: currentPlayer,
      error: playerError,
    } = await supabase
      .from("room_players")
      .select(`
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
      `)
      .eq("room_id", room.id)
      .eq("player_token", token)
      .maybeSingle();

    if (playerError) {
      console.error(
        "GAME STATE PLAYER ERROR:",
        playerError
      );

      return NextResponse.json(
        {
          error:
            "Không thể xác thực người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    if (!currentPlayer) {
      return NextResponse.json(
        {
          error:
            "Bạn không thuộc phòng này.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * =====================================
     * ROOM MUST BE PLAYING
     * =====================================
     */

    if (room.status !== "playing") {
      return NextResponse.json(
        {
          error:
            "Game chưa được bắt đầu.",
          status: room.status,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * =====================================
     * ACTIVE GAME SESSION
     * =====================================
     */

    const {
      data: session,
      error: sessionError,
    } = await supabase
      .from("game_sessions")
      .select(`
        id,
        room_id,
        session_number,
        status,
        round,
        phase,
        current_event_id,
        started_at,
        finished_at,
        created_at
      `)
      .eq("room_id", room.id)
      .eq("status", "active")
      .order("session_number", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      console.error(
        "GAME STATE SESSION ERROR:",
        sessionError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải game session.",
          detail: sessionError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Không tìm thấy game session đang chạy.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =====================================
     * GAME STATE
     * =====================================
     */

    const {
      data: gameState,
      error: gameStateError,
    } = await supabase
      .from("game_states")
      .select(`
        id,
        room_id,
        session_id,
        round,
        phase,
        current_event_id,
        started_at,
        updated_at,
        created_at
      `)
      .eq("session_id", session.id)
      .maybeSingle();

    if (gameStateError) {
      console.error(
        "GAME STATE ERROR:",
        gameStateError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải game state.",
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
          error:
            "Game state không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * =====================================
     * CURRENT EVENT
     * =====================================
     */

    let currentEvent = null;

    if (gameState.current_event_id) {
      const {
        data: event,
        error: eventError,
      } = await supabase
        .from("game_events")
        .select(`
          id,
          room_id,
          session_id,
          round,
          title,
          description,
          event_type,
          choices,
          result,
          created_at
        `)
        .eq("id", gameState.current_event_id)
        .eq("session_id", session.id)
        .maybeSingle();

      if (eventError) {
        console.error(
          "GAME EVENT ERROR:",
          eventError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải event hiện tại.",
          },
          {
            status: 500,
          }
        );
      }

      currentEvent = event;
    }

    /*
     * =====================================
     * PLAYERS
     * =====================================
     */

    const {
      data: players,
      error: playersError,
    } = await supabase
      .from("room_players")
      .select(`
        id,
        player_name,
        role,
        hp,
        money,
        location,
        is_connected,
        last_choice
      `)
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
          error:
            "Không thể tải người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =====================================
     * SAFE CURRENT PLAYER
     * =====================================
     */

    const safeCurrentPlayer = {
      id: currentPlayer.id,
      player_name:
        currentPlayer.player_name,
      role: currentPlayer.role,
      hp: currentPlayer.hp,
      money: currentPlayer.money,
      location:
        currentPlayer.location,
      is_connected:
        currentPlayer.is_connected,
      last_choice:
        currentPlayer.last_choice,
    };

    /*
     * =====================================
     * RESPONSE
     * =====================================
     */

    return NextResponse.json({
      room,

      session,

      gameState,

      currentEvent,

      currentPlayer:
        safeCurrentPlayer,

      players:
        players ?? [],
    });
  } catch (error) {
    console.error(
      "GAME STATE UNEXPECTED ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}