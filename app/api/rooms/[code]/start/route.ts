import { NextRequest, NextResponse } from "next/server";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  generatePlayerRoundEvents,
} from "../../../../../lib/game/rounds";

/*
 * ============================================================
 * SUPABASE ADMIN
 * ============================================================
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

type GameEventRow = {
  id: string;
  room_id: string;
  session_id: string;
  round: number;
  title: string;
  description: string;
  event_type: string;
  choices: unknown[];
  result: unknown;
  created_at?: string;
};

type GenerateRoundEventResult = {
  success: boolean;
  event?: GameEventRow;
  error?: string;
};

type EventTemplate = {
  title: string;
  description: string;
  event_type: string;
  choices: {
    id: string;
    title: string;
    description: string;
  }[];
};

/*
 * ============================================================
 * ROUND 1 EVENT
 * ============================================================
 */

const ROUND_1_EVENT: EventTemplate = {
  title: "Một cơ hội bất ngờ",

  description:
    "Bạn vừa đặt chân đến một thành phố xa lạ. Sau nhiều giờ di chuyển, số tiền trong túi vẫn còn nguyên nhưng bạn chưa tìm được nơi nghỉ qua đêm.",

  event_type: "normal",

  choices: [
    {
      id: "a",
      title: "Nhận lời ngay",
      description:
        "Bạn chấp nhận công việc mà không hỏi thêm quá nhiều.",
    },
    {
      id: "b",
      title: "Từ chối",
      description:
        "Bạn quyết định không nhận lời và tự tìm cách khác.",
    },
    {
      id: "c",
      title: "Hỏi kỹ hơn",
      description:
        "Bạn tìm hiểu công việc, tiền công và những rủi ro trước khi quyết định.",
    },
    {
      id: "d",
      title: "Đề nghị đi cùng người quen",
      description:
        "Bạn chỉ đồng ý nếu có một người quen đi cùng.",
    },
  ],
};

/*
 * ============================================================
 * FALLBACK EVENT
 * ============================================================
 */

function getFallbackEvent(
  round: number
): EventTemplate {
  return {
    title: `Sự kiện Round ${round}`,

    description:
      "Một tình huống mới bất ngờ xuất hiện trên hành trình của bạn.",

    event_type: "normal",

    choices: [
      {
        id: "a",
        title: "Lựa chọn A",
        description:
          "Bạn chọn phương án A.",
      },
      {
        id: "b",
        title: "Lựa chọn B",
        description:
          "Bạn chọn phương án B.",
      },
      {
        id: "c",
        title: "Lựa chọn C",
        description:
          "Bạn chọn phương án C.",
      },
      {
        id: "d",
        title: "Lựa chọn D",
        description:
          "Bạn chọn phương án D.",
      },
    ],
  };
}

/*
 * ============================================================
 * SYNC SESSION
 * ============================================================
 *
 * CHỈ dùng:
 *   - round
 *   - phase
 *   - current_event_id
 *
 * Không dùng current_phase.
 * Không dùng current_round.
 */

async function syncSession(
  supabase: SupabaseClient,
  sessionId: string,
  eventId: string | null,
  round: number,
  phase: string
) {
  return await supabase
    .from("game_sessions")
    .update({
      round,
      phase,
      current_event_id: eventId,
    })
    .eq("id", sessionId);
}

/*
 * ============================================================
 * SYNC GAME STATE
 * ============================================================
 */

async function syncGameState(
  supabase: SupabaseClient,
  sessionId: string,
  eventId: string | null,
  round: number,
  phase: string
) {
  return await supabase
    .from("game_states")
    .update({
      round,
      phase,
      current_event_id: eventId,
      updated_at:
        new Date().toISOString(),
    })
    .eq("session_id", sessionId);
}

/*
 * ============================================================
 * GENERATE ROUND EVENT
 * ============================================================
 */

async function generateRoundEvent(
  supabase: SupabaseClient,
  sessionId: string
): Promise<GenerateRoundEventResult> {
  /*
   * ----------------------------------------------------------
   * 1. LOAD SESSION
   * ----------------------------------------------------------
   */

  const {
    data: session,
    error: sessionError,
  } = await supabase
    .from("game_sessions")
    .select(
      `
        id,
        room_id,
        status,
        round,
        phase,
        current_event_id
      `
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error(
      "ENGINE - LOAD SESSION ERROR:",
      sessionError
    );

    return {
      success: false,
      error:
        "Không thể tải game session.",
    };
  }

  if (!session) {
    return {
      success: false,
      error:
        "Game session không tồn tại.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 2. SESSION ACTIVE
   * ----------------------------------------------------------
   */

  if (session.status !== "active") {
    return {
      success: false,
      error:
        "Game session không còn hoạt động.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 3. DETERMINE ROUND
   * ----------------------------------------------------------
   */

  const round = Number(
    session.round ?? 1
  );

  if (
    !Number.isInteger(round) ||
    round < 1
  ) {
    return {
      success: false,
      error: "Round không hợp lệ.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 4. CURRENT EVENT EXISTS
   * ----------------------------------------------------------
   */

  if (session.current_event_id) {
    const {
      data: currentEvent,
      error: currentEventError,
    } = await supabase
      .from("game_events")
      .select("*")
      .eq(
        "id",
        session.current_event_id
      )
      .eq(
        "session_id",
        session.id
      )
      .maybeSingle();

    if (currentEventError) {
      console.error(
        "ENGINE - CURRENT EVENT ERROR:",
        currentEventError
      );

      return {
        success: false,
        error:
          "Không thể tải event hiện tại.",
      };
    }

    if (currentEvent) {
      const {
        error: stateError,
      } = await syncGameState(
        supabase,
        session.id,
        currentEvent.id,
        round,
        "choosing"
      );

      if (stateError) {
        console.error(
          "ENGINE - CURRENT EVENT STATE ERROR:",
          stateError
        );

        return {
          success: false,
          error:
            "Không thể đồng bộ game state.",
        };
      }

      const {
        error: sessionUpdateError,
      } = await syncSession(
        supabase,
        session.id,
        currentEvent.id,
        round,
        "choosing"
      );

      if (sessionUpdateError) {
        console.error(
          "ENGINE - CURRENT EVENT SESSION ERROR:",
          sessionUpdateError
        );

        return {
          success: false,
          error:
            "Không thể đồng bộ game session.",
        };
      }

      return {
        success: true,
        event:
          currentEvent as GameEventRow,
      };
    }

    /*
     * current_event_id bị stale.
     */

    const {
      error: clearSessionError,
    } = await supabase
      .from("game_sessions")
      .update({
        current_event_id: null,
      })
      .eq(
        "id",
        session.id
      );

    if (clearSessionError) {
      console.error(
        "ENGINE - CLEAR STALE SESSION EVENT ERROR:",
        clearSessionError
      );

      return {
        success: false,
        error:
          "Không thể xóa event cũ.",
      };
    }

    const {
      error: clearStateError,
    } = await supabase
      .from("game_states")
      .update({
        current_event_id: null,
      })
      .eq(
        "session_id",
        session.id
      );

    if (clearStateError) {
      console.error(
        "ENGINE - CLEAR STALE STATE EVENT ERROR:",
        clearStateError
      );

      return {
        success: false,
        error:
          "Không thể đồng bộ event cũ.",
      };
    }
  }

  /*
   * ----------------------------------------------------------
   * 5. CHECK EXISTING EVENT
   * ----------------------------------------------------------
   */

  const {
    data: existingEvent,
    error: existingEventError,
  } = await supabase
    .from("game_events")
    .select("*")
    .eq(
      "session_id",
      session.id
    )
    .eq(
      "round",
      round
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (existingEventError) {
    console.error(
      "ENGINE - EXISTING EVENT ERROR:",
      existingEventError
    );

    return {
      success: false,
      error:
        "Không thể kiểm tra event hiện tại.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 6. EXISTING EVENT
   * ----------------------------------------------------------
   */

  if (existingEvent) {
    const stateResult =
      await syncGameState(
        supabase,
        session.id,
        existingEvent.id,
        round,
        "choosing"
      );

    if (stateResult.error) {
      console.error(
        "ENGINE - EXISTING EVENT STATE ERROR:",
        stateResult.error
      );

      return {
        success: false,
        error:
          "Không thể đồng bộ game state.",
      };
    }

    const sessionResult =
      await syncSession(
        supabase,
        session.id,
        existingEvent.id,
        round,
        "choosing"
      );

    if (sessionResult.error) {
      console.error(
        "ENGINE - EXISTING EVENT SESSION ERROR:",
        sessionResult.error
      );

      return {
        success: false,
        error:
          "Không thể đồng bộ game session.",
      };
    }

    return {
      success: true,
      event:
        existingEvent as GameEventRow,
    };
  }

  /*
   * ----------------------------------------------------------
   * 7. GENERATE EVENT DATA
   * ----------------------------------------------------------
   */

  const eventData =
    round === 1
      ? ROUND_1_EVENT
      : getFallbackEvent(round);

  /*
   * ----------------------------------------------------------
   * 8. INSERT EVENT
   * ----------------------------------------------------------
   */

  const {
    data: event,
    error: eventError,
  } = await supabase
    .from("game_events")
    .insert({
      room_id:
        session.room_id,

      session_id:
        session.id,

      round,

      title:
        eventData.title,

      description:
        eventData.description,

      event_type:
        eventData.event_type,

      choices:
        eventData.choices,

      result: null,
    })
    .select("*")
    .single();

  /*
   * ----------------------------------------------------------
   * 9. HANDLE EVENT INSERT ERROR
   * ----------------------------------------------------------
   */

  if (eventError) {
    console.error(
      "ENGINE - CREATE EVENT ERROR:",
      {
        message: eventError.message,
        details: eventError.details,
        hint: eventError.hint,
        code: eventError.code,
      }
    );

    /*
     * Có thể request khác vừa tạo event.
     * Kiểm tra lại DB.
     */

    const {
      data: duplicateEvent,
      error: duplicateEventError,
    } = await supabase
      .from("game_events")
      .select("*")
      .eq(
        "session_id",
        session.id
      )
      .eq(
        "round",
        round
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (duplicateEventError) {
      console.error(
        "ENGINE - LOAD DUPLICATE EVENT ERROR:",
        duplicateEventError
      );
    }

    if (duplicateEvent) {
      const stateResult =
        await syncGameState(
          supabase,
          session.id,
          duplicateEvent.id,
          round,
          "choosing"
        );

      if (stateResult.error) {
        return {
          success: false,
          error:
            "Không thể đồng bộ event.",
        };
      }

      const sessionResult =
        await syncSession(
          supabase,
          session.id,
          duplicateEvent.id,
          round,
          "choosing"
        );

      if (sessionResult.error) {
        return {
          success: false,
          error:
            "Không thể đồng bộ session.",
        };
      }

      return {
        success: true,
        event:
          duplicateEvent as GameEventRow,
      };
    }

    return {
      success: false,
      error:
        "Không thể tạo game event.",
    };
  }

  if (!event) {
    return {
      success: false,
      error:
        "Game event không được tạo.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 10. UPDATE GAME STATE
   * ----------------------------------------------------------
   */

  const {
    error: gameStateError,
  } = await syncGameState(
    supabase,
    session.id,
    event.id,
    round,
    "choosing"
  );

  if (gameStateError) {
    console.error(
      "ENGINE - UPDATE GAME STATE ERROR:",
      gameStateError
    );

    await supabase
      .from("game_events")
      .delete()
      .eq(
        "id",
        event.id
      );

    return {
      success: false,
      error:
        "Không thể cập nhật game state.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 11. UPDATE GAME SESSION
   * ----------------------------------------------------------
   */

  const {
    error: sessionUpdateError,
  } = await syncSession(
    supabase,
    session.id,
    event.id,
    round,
    "choosing"
  );

  if (sessionUpdateError) {
    console.error(
      "ENGINE - UPDATE SESSION ERROR:",
      sessionUpdateError
    );

    await supabase
      .from("game_states")
      .update({
        current_event_id: null,
        round,
        phase:
          "generating_event",
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "session_id",
        session.id
      );

    await supabase
      .from("game_events")
      .delete()
      .eq(
        "id",
        event.id
      );

    return {
      success: false,
      error:
        "Không thể cập nhật game session.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 12. SUCCESS
   * ----------------------------------------------------------
   */

  return {
    success: true,
    event:
      event as GameEventRow,
  };
}

/*
 * ============================================================
 * POST /api/rooms/[code]/start
 * ============================================================
 */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  }
) {
  try {
    /*
     * --------------------------------------------------------
     * 1. ROOM CODE
     * --------------------------------------------------------
     */

    const { code } =
      await context.params;

    const roomCode =
      String(code).trim();

    if (!/^\d{6}$/.test(roomCode)) {
      return NextResponse.json(
        {
          error:
            "Mã phòng không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 2. PLAYER TOKEN
     * --------------------------------------------------------
     */

    const playerToken =
      request.headers.get(
        "x-player-token"
      );

    if (!playerToken) {
      return NextResponse.json(
        {
          error:
            "Thiếu player token.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 3. LOAD ROOM
     * --------------------------------------------------------
     */

    const {
      data: room,
      error: roomError,
    } = await supabaseAdmin
      .from("rooms")
      .select("*")
      .eq(
        "code",
        roomCode
      )
      .maybeSingle();

    if (roomError) {
      console.error(
        "START - LOAD ROOM ERROR:",
        roomError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải phòng.",
        },
        {
          status: 500,
        }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error:
            "Phòng không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 4. LOAD PLAYER BY TOKEN
     * --------------------------------------------------------
     */

    const {
      data: player,
      error: playerError,
    } = await supabaseAdmin
      .from("room_players")
      .select("*")
      .eq(
        "room_id",
        room.id
      )
      .eq(
        "player_token",
        playerToken
      )
      .maybeSingle();

    if (playerError) {
      console.error(
        "START - LOAD PLAYER ERROR:",
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

    if (!player) {
      return NextResponse.json(
        {
          error:
            "Player token không hợp lệ.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 5. HOST ONLY
     * --------------------------------------------------------
     */

    if (player.role !== "host") {
      return NextResponse.json(
        {
          error:
            "Chỉ host mới có thể bắt đầu game.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 6. ROOM MUST BE LOBBY
     * --------------------------------------------------------
     */

    if (room.status !== "lobby") {
      return NextResponse.json(
        {
          error:
            "Phòng này đã được bắt đầu hoặc đã kết thúc.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 7. CHECK ACTIVE SESSION
     * --------------------------------------------------------
     */

    const {
      data: activeSession,
      error: activeSessionError,
    } = await supabaseAdmin
      .from("game_sessions")
      .select("id")
      .eq(
        "room_id",
        room.id
      )
      .eq(
        "status",
        "active"
      )
      .limit(1)
      .maybeSingle();

    if (activeSessionError) {
      console.error(
        "START - ACTIVE SESSION ERROR:",
        activeSessionError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra session hiện tại.",
        },
        {
          status: 500,
        }
      );
    }

    if (activeSession) {
      return NextResponse.json(
        {
          error:
            "Phòng đã có game session đang hoạt động.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 8. LOAD PLAYERS
     * --------------------------------------------------------
     */

    const {
      data: players,
      error: playersError,
    } = await supabaseAdmin
      .from("room_players")
      .select("*")
      .eq(
        "room_id",
        room.id
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (playersError) {
      console.error(
        "START - LOAD PLAYERS ERROR:",
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

    if (
      !players ||
      players.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Phòng chưa có người chơi.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 9. SESSION NUMBER
     * --------------------------------------------------------
     */

    const {
      data: lastSession,
      error: lastSessionError,
    } = await supabaseAdmin
      .from("game_sessions")
      .select(
        "session_number"
      )
      .eq(
        "room_id",
        room.id
      )
      .order(
        "session_number",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (lastSessionError) {
      console.error(
        "START - LAST SESSION ERROR:",
        lastSessionError
      );

      return NextResponse.json(
        {
          error:
            "Không thể xác định session number.",
        },
        {
          status: 500,
        }
      );
    }

    const sessionNumber =
      lastSession
        ? Number(
            lastSession.session_number
          ) + 1
        : 1;

    /*
     * --------------------------------------------------------
     * 10. RESET PLAYERS
     * --------------------------------------------------------
     */

    const {
      error: resetPlayersError,
    } = await supabaseAdmin
      .from("room_players")
      .update({
        hp: 100,
        money:
          room.starting_money,
        location:
          room.starting_location,
        rounds_in_location: 1,  
        is_connected: true,
        last_choice: null,
      })
      .eq(
        "room_id",
        room.id
      );

    if (resetPlayersError) {
      console.error(
        "START - RESET PLAYERS ERROR:",
        resetPlayersError
      );

      return NextResponse.json(
        {
          error:
            "Không thể reset người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 11. CREATE SESSION
     * --------------------------------------------------------
     *
     * CHỈ INSERT CÁC COLUMN THỰC SỰ CẦN:
     *
     * round
     * phase
     * current_event_id
     *
     * Không insert current_phase/current_round.
     */

    const now =
      new Date().toISOString();

    const {
      data: session,
      error: sessionError,
    } = await supabaseAdmin
      .from("game_sessions")
      .insert({
        room_id:
          room.id,

        session_number:
          sessionNumber,

        status:
          "active",

        round: 1,

        phase:
          "generating_event",

        current_event_id:
          null,

        started_at:
          now,
      })
      .select("*")
      .single();

    if (
      sessionError ||
      !session
    ) {
      console.error(
        "================================="
      );

      console.error(
        "START - CREATE SESSION ERROR"
      );

      console.error(
        "message:",
        sessionError?.message
      );

      console.error(
        "details:",
        sessionError?.details
      );

      console.error(
        "hint:",
        sessionError?.hint
      );

      console.error(
        "code:",
        sessionError?.code
      );

      console.error(
        "sessionNumber:",
        sessionNumber
      );

      console.error(
        "roomId:",
        room.id
      );

      console.error(
        "================================="
      );

      return NextResponse.json(
        {
          error:
            "Không thể tạo game session.",

          debug: {
            message:
              sessionError?.message,

            details:
              sessionError?.details,

            hint:
              sessionError?.hint,

            code:
              sessionError?.code,
          },
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 12. CREATE GAME STATE
     * --------------------------------------------------------
     */

    const {
      data: gameState,
      error: gameStateError,
    } = await supabaseAdmin
      .from("game_states")
      .insert({
        room_id:
          room.id,

        session_id:
          session.id,

        round: 1,

        phase:
          "generating_event",

        current_event_id:
          null,

        started_at:
          now,

        updated_at:
          now,
      })
      .select("*")
      .single();

    if (
      gameStateError ||
      !gameState
    ) {
      console.error(
        "START - CREATE GAME STATE ERROR:",
        gameStateError
      );

      await supabaseAdmin
        .from("game_sessions")
        .delete()
        .eq(
          "id",
          session.id
        );

      return NextResponse.json(
        {
          error:
            "Không thể tạo game state.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 13. GENERATE ROUND 1
     * --------------------------------------------------------
     */

    const eventResult =
      await generateRoundEvent(
        supabaseAdmin,
        session.id
      );

    if (
      !eventResult.success ||
      !eventResult.event
    ) {
      console.error(
        "START - GENERATE ROUND 1 ERROR:",
        eventResult.error
      );

      await supabaseAdmin
        .from("game_states")
        .delete()
        .eq(
          "session_id",
          session.id
        );

      await supabaseAdmin
        .from("game_sessions")
        .delete()
        .eq(
          "id",
          session.id
        );

      await supabaseAdmin
        .from("room_players")
        .update({
          hp: 100,
          money:
            room.starting_money,
          location:
            room.starting_location,
          is_connected: true,
          last_choice: null,
        })
        .eq(
          "room_id",
          room.id
        );

      return NextResponse.json(
        {
          error:
            eventResult.error ||
            "Không thể tạo Round 1.",
        },
        {
          status: 500,
        }
      );
    }
    /* ========================================================
     * 13B. GENERATE PRIVATE PLAYER EVENTS - ROUND 1
     * ========================================================
     *
     * Host được tính là player.
     * Spectator sẽ bị loại trong helper.
     * Gemini chỉ được gọi 1 lần cho toàn bộ Round 1.
     */

    try {
      await generatePlayerRoundEvents({
        supabase: supabaseAdmin,
        roomId: room.id,
        sessionId: session.id,
        round: 1,
        players,
        sourceEventId: eventResult.event.id,
      });
    } catch (playerEventsError) {
      console.error(
        "START - GENERATE ROUND 1 PLAYER EVENTS ERROR:",
        playerEventsError
      );

      await supabaseAdmin
        .from("game_states")
        .delete()
        .eq(
          "session_id",
          session.id
        );

      await supabaseAdmin
        .from("game_sessions")
        .delete()
        .eq(
          "id",
          session.id
        );

      return NextResponse.json(
        {
          error:
            "Không thể tạo sự kiện riêng cho người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 14. CHANGE ROOM TO PLAYING
     * --------------------------------------------------------
     */

    const {
      data: updatedRoom,
      error: roomUpdateError,
    } = await supabaseAdmin
      .from("rooms")
      .update({
        status:
          "playing",
      })
      .eq(
        "id",
        room.id
      )
      .eq(
        "status",
        "lobby"
      )
      .select("*")
      .single();

    if (
      roomUpdateError ||
      !updatedRoom
    ) {
      console.error(
        "START - UPDATE ROOM ERROR:",
        roomUpdateError
      );

      await supabaseAdmin
        .from("game_states")
        .delete()
        .eq(
          "session_id",
          session.id
        );

      await supabaseAdmin
        .from("game_sessions")
        .delete()
        .eq(
          "id",
          session.id
        );

      await supabaseAdmin
        .from("room_players")
        .update({
          hp: 100,
          money:
            room.starting_money,
          location:
            room.starting_location,
          is_connected: true,
          last_choice: null,
        })
        .eq(
          "room_id",
          room.id
        );

      return NextResponse.json(
        {
          error:
            "Không thể chuyển phòng sang trạng thái playing.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 15. RELOAD FINAL SESSION
     * --------------------------------------------------------
     */

    const {
      data: finalSession,
      error: finalSessionError,
    } = await supabaseAdmin
      .from("game_sessions")
      .select("*")
      .eq(
        "id",
        session.id
      )
      .single();

    if (
      finalSessionError ||
      !finalSession
    ) {
      console.error(
        "START - LOAD FINAL SESSION ERROR:",
        finalSessionError
      );

      return NextResponse.json(
        {
          error:
            "Game đã tạo nhưng không thể tải session cuối.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 16. RELOAD FINAL GAME STATE
     * --------------------------------------------------------
     */

    const {
      data: finalGameState,
      error: finalGameStateError,
    } = await supabaseAdmin
      .from("game_states")
      .select("*")
      .eq(
        "session_id",
        session.id
      )
      .single();

    if (
      finalGameStateError ||
      !finalGameState
    ) {
      console.error(
        "START - LOAD FINAL GAME STATE ERROR:",
        finalGameStateError
      );

      return NextResponse.json(
        {
          error:
            "Game đã tạo nhưng không thể tải game state cuối.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 17. FINAL RESPONSE
     * --------------------------------------------------------
     */

    return NextResponse.json({
  success: true,
  room: updatedRoom,
  session: finalSession,
  gameState: finalGameState,
  currentEvent: eventResult.event,
  players,
});
  } catch (error) {
    console.error("START GAME ERROR:", error);

    return NextResponse.json(
      {
        error: "Lỗi máy chủ khi bắt đầu game.",
      },
      {
        status: 500,
      }
    );
  }
}