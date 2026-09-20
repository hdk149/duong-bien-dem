import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function hashToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ code: string }>;
  }
) {
  try {
    const { code } = await params;

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        {
          success: false,
          error: "Room code không hợp lệ.",
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * DEVELOPER SESSION
     * ============================================================
     */

    const developerToken =
      request.headers.get("x-developer-session")?.trim() ||
      "";

    if (!developerToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Không tìm thấy developer session.",
        },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const tokenHash =
      hashToken(developerToken);

    /*
     * ============================================================
     * VERIFY GLOBAL DEVELOPER SESSION
     * ============================================================
     */

    const {
      data: developerSession,
      error: sessionError,
    } = await supabase
      .from("developer_sessions")
      .select(
        `
        id,
        player_id,
        token_hash,
        expires_at,
        created_at
        `
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (sessionError) {
      console.error(
        "DEV DATA SESSION ERROR:",
        sessionError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể xác thực developer session.",
        },
        { status: 500 }
      );
    }

    if (!developerSession) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Developer session không hợp lệ.",
        },
        { status: 401 }
      );
    }

    /*
     * ============================================================
     * SESSION EXPIRATION
     * ============================================================
     */

    const expiresAt = new Date(
      developerSession.expires_at
    ).getTime();

    if (
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Developer session đã hết hạn.",
        },
        { status: 401 }
      );
    }

    /*
     * ============================================================
     * ROOM
     * ============================================================
     *
     * GLOBAL DEVELOPER:
     *
     * Developer không cần phải là player
     * của room này.
     *
     * Chỉ cần developer session hợp lệ
     * là có quyền xem room.
     */

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
        status,
        starting_money,
        goal_money,
        starting_location,
        dice_system,
        rules
        `
      )
      .eq("code", code)
      .maybeSingle();

    if (roomError) {
      console.error(
        "DEV DATA ROOM ERROR:",
        roomError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể tải thông tin room.",
        },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          success: false,
          error: "Không tìm thấy room.",
        },
        { status: 404 }
      );
    }

    /*
     * ============================================================
     * GAME STATE
     * ============================================================
     */

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
        created_at,
        session_id
        `
      )
      .eq("room_id", room.id)
      .maybeSingle();

    if (gameStateError) {
      console.error(
        "DEV DATA GAME STATE ERROR:",
        gameStateError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể tải game state.",
        },
        { status: 500 }
      );
    }

    /*
     * ============================================================
     * CURRENT SESSION
     * ============================================================
     */

    let session = null;

    if (gameState?.session_id) {
      const {
        data: sessionData,
        error: currentSessionError,
      } = await supabase
        .from("game_sessions")
        .select(
          `
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
          `
        )
        .eq("id", gameState.session_id)
        .eq("room_id", room.id)
        .maybeSingle();

      if (currentSessionError) {
        console.error(
          "DEV DATA CURRENT SESSION ERROR:",
          currentSessionError
        );
      }

      session = sessionData ?? null;
    }

    /*
     * Nếu game_state chưa có session_id,
     * lấy session mới nhất.
     */

    if (!session) {
      const {
        data: latestSession,
        error: latestSessionError,
      } = await supabase
        .from("game_sessions")
        .select(
          `
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
          `
        )
        .eq("room_id", room.id)
        .order("session_number", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (latestSessionError) {
        console.error(
          "DEV DATA LATEST SESSION ERROR:",
          latestSessionError
        );
      }

      session = latestSession ?? null;
    }

    /*
     * ============================================================
     * CURRENT EVENT
     * ============================================================
     */

    let event = null;

    const currentEventId =
      gameState?.current_event_id ??
      session?.current_event_id ??
      null;

    if (currentEventId) {
      const {
        data: eventData,
        error: eventError,
      } = await supabase
        .from("game_events")
        .select(
          `
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
          `
        )
        .eq("id", currentEventId)
        .eq("room_id", room.id)
        .maybeSingle();

      if (eventError) {
        console.error(
          "DEV DATA EVENT ERROR:",
          eventError
        );
      }

      event = eventData ?? null;
    }

    /*
     * ============================================================
     * PLAYERS
     * ============================================================
     */

    const {
      data: playersData,
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
        location_id,
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
        "DEV DATA PLAYERS ERROR:",
        playersError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể tải danh sách players.",
        },
        { status: 500 }
      );
    }

    const players = playersData ?? [];

    /*
     * ============================================================
     * CHOICE STATUS
     * ============================================================
     */

    let choiceStatus = {
      selected: false,

      selectedChoiceId:
        null as string | null,

      selected_choice_id:
        null as string | null,

      chosenPlayers: 0,

      totalPlayers:
        players.filter(
          (player) =>
            player.role === "host" ||
            player.role === "player"
        ).length,

      allPlayersChosen: false,
    };

    if (event?.id) {
      const {
        data: choices,
        error: choicesError,
      } = await supabase
        .from("player_choices")
        .select(
          `
          player_id,
          choice_id
          `
        )
        .eq("event_id", event.id);

      if (choicesError) {
        console.error(
          "DEV DATA CHOICES ERROR:",
          choicesError
        );
      }

      const validChoices =
        choices ?? [];

      const chosenPlayers =
        new Set(
          validChoices.map(
            (choice) =>
              choice.player_id
          )
        ).size;

      const totalPlayers =
        players.filter(
          (player) =>
            player.role === "host" ||
            player.role === "player"
        ).length;

      choiceStatus = {
        selected: false,

        selectedChoiceId: null,

        selected_choice_id: null,

        chosenPlayers,

        totalPlayers,

        allPlayersChosen:
          totalPlayers > 0 &&
          chosenPlayers >= totalPlayers,
      };
    }

    /*
     * ============================================================
     * RULES / QUEST / DICE
     * ============================================================
     */

    const rules =
      room.rules &&
      typeof room.rules === "object"
        ? room.rules
        : {};

    const quest =
      (rules as Record<string, unknown>)
        .quest ??
      (rules as Record<string, unknown>)
        .currentQuest ??
      null;

    const dice =
      (rules as Record<string, unknown>)
        .dice ??
      {
        system:
          room.dice_system ??
          "1d6",
      };

    /*
     * ============================================================
     * GLOBAL DEVELOPER
     * ============================================================
     *
     * Không có developerPlayer nữa.
     *
     * Developer là admin hệ thống,
     * không phải player của room.
     */

    const developer = {
      verified: true,

      type: "global",

      sessionId:
        developerSession.id,

      playerId:
        developerSession.player_id,

      expiresAt:
        developerSession.expires_at,
    };

    /*
     * ============================================================
     * RESPONSE
     * ============================================================
     */

    return NextResponse.json(
      {
        success: true,

        room: {
          id:
            room.id,

          code:
            room.code,

          host_name:
            room.host_name,

          hostName:
            room.host_name,

          max_players:
            room.max_players,

          status:
            room.status,

          starting_money:
            room.starting_money,

          startingMoney:
            room.starting_money,

          goal_money:
            room.goal_money,

          goalMoney:
            room.goal_money,

          starting_location:
            room.starting_location,

          startingLocation:
            room.starting_location,

          dice_system:
            room.dice_system,

          diceSystem:
            room.dice_system,
        },

        session,

        gameState,

        /*
         * Global Developer không có
         * current player trong room.
         */
        currentPlayer: null,

        players,

        event,

        choiceStatus,

        quest,

        dice,

        developer,

        serverTimeMs:
          Date.now(),
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
      "DEVELOPER DATA FATAL ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Developer API gặp lỗi.",
      },
      { status: 500 }
    );
  }
}