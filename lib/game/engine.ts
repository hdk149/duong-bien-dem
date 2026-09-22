import type { SupabaseClient } from "@supabase/supabase-js";

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

type EventChoice = {
  id: string;
  title: string;
  description: string;
};

type EventTemplate = {
  title: string;
  description: string;
  event_type: string;
  choices: EventChoice[];
};

/*
 * ============================================================
 * ROUND 1
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
 *
 * Tạm thời dùng cho Round 2+.
 * Sau này thay bằng Gemini.
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
        description: "Bạn chọn phương án A.",
      },

      {
        id: "b",
        title: "Lựa chọn B",
        description: "Bạn chọn phương án B.",
      },

      {
        id: "c",
        title: "Lựa chọn C",
        description: "Bạn chọn phương án C.",
      },

      {
        id: "d",
        title: "Lựa chọn D",
        description: "Bạn chọn phương án D.",
      },
    ],
  };
}

/*
 * ============================================================
 * SHOP ROUND HELPER
 * ============================================================
 */

function isShopRound(
  round: number
): boolean {
  return (
    round > 0 &&
    round % 7 === 0
  );
}

/*
 * ============================================================
 * SYNC GAME SESSION
 * ============================================================
 *
 * game_sessions hiện có cả:
 *
 * round
 * phase
 * current_round
 * current_phase
 *
 * Luôn cập nhật đồng bộ cả 4.
 */

async function syncSession(
  supabase: SupabaseClient,
  sessionId: string,
  eventId: string | null,
  round: number,
  phase: string
) {
  const { data, error } =
    await supabase
      .from("game_sessions")
      .update({
        round,
        phase,
        current_round: round,
        current_phase: phase,
        current_event_id: eventId,
      })
      .eq("id", sessionId)
      .select(
        `
          id,
          room_id,
          status,
          round,
          phase,
          current_round,
          current_phase,
          current_event_id
        `
      )
      .maybeSingle();

  if (error) {
    return {
      data: null,
      error,
    };
  }

  if (!data) {
    return {
      data: null,
      error: new Error(
        "Không tìm thấy game session sau khi update."
      ),
    };
  }

  return {
    data,
    error: null,
  };
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
  const { data, error } =
    await supabase
      .from("game_states")
      .update({
        round,
        phase,
        current_event_id: eventId,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "session_id",
        sessionId
      )
      .select(
        `
          id,
          room_id,
          session_id,
          round,
          phase,
          current_event_id,
          started_at,
          updated_at,
          created_at
        `
      )
      .maybeSingle();

  if (error) {
    return {
      data: null,
      error,
    };
  }

  if (!data) {
    return {
      data: null,
      error: new Error(
        "Không tìm thấy game state sau khi update."
      ),
    };
  }

  return {
    data,
    error: null,
  };
}

/*
 * ============================================================
 * LOAD EVENT
 * ============================================================
 */

async function getEventById(
  supabase: SupabaseClient,
  sessionId: string,
  eventId: string
): Promise<{
  event: GameEventRow | null;
  error: unknown;
}> {
  const { data, error } =
    await supabase
      .from("game_events")
      .select("*")
      .eq("id", eventId)
      .eq("session_id", sessionId)
      .maybeSingle();

  return {
    event:
      data as GameEventRow | null,
    error,
  };
}

/*
 * ============================================================
 * LOAD EVENT BY SESSION + ROUND
 * ============================================================
 */

async function getEventByRound(
  supabase: SupabaseClient,
  sessionId: string,
  round: number
): Promise<{
  event: GameEventRow | null;
  error: unknown;
}> {
  const { data, error } =
    await supabase
      .from("game_events")
      .select("*")
      .eq(
        "session_id",
        sessionId
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

  return {
    event:
      data as GameEventRow | null,
    error,
  };
}

/*
 * ============================================================
 * SYNC EXISTING EVENT
 * ============================================================
 */

async function syncExistingEvent(
  supabase: SupabaseClient,
  sessionId: string,
  event: GameEventRow,
  round: number
): Promise<GenerateRoundEventResult> {
  /*
   * ----------------------------------------------------------
   * 1. GAME STATE
   * ----------------------------------------------------------
   */

  const {
    error: stateError,
  } = await syncGameState(
    supabase,
    sessionId,
    event.id,
    round,
    "choosing"
  );

  if (stateError) {
    console.error(
      "ENGINE - EXISTING EVENT STATE SYNC ERROR:",
      stateError
    );

    return {
      success: false,
      error:
        "Không thể đồng bộ game state.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 2. GAME SESSION
   * ----------------------------------------------------------
   */

  const {
    error: sessionError,
  } = await syncSession(
    supabase,
    sessionId,
    event.id,
    round,
    "choosing"
  );

  if (sessionError) {
    console.error(
      "ENGINE - EXISTING EVENT SESSION SYNC ERROR:",
      sessionError
    );

    return {
      success: false,
      error:
        "Không thể đồng bộ game session.",
    };
  }

  /*
   * ----------------------------------------------------------
   * 3. SUCCESS
   * ----------------------------------------------------------
   */

  return {
    success: true,
    event,
  };
}

/*
 * ============================================================
 * GENERATE ROUND EVENT
 * ============================================================
 */

export async function generateRoundEvent(
  supabase: SupabaseClient,
  sessionId: string
): Promise<GenerateRoundEventResult> {
  /*
   * ==========================================================
   * 1. LOAD SESSION
   * ==========================================================
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
        current_round,
        current_phase,
        current_event_id
      `
    )
    .eq(
      "id",
      sessionId
    )
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
   * ==========================================================
   * 2. SESSION MUST BE ACTIVE
   * ==========================================================
   */

  if (
    session.status !==
    "active"
  ) {
    return {
      success: false,
      error:
        "Game session không còn hoạt động.",
    };
  }

  /*
   * ==========================================================
   * 3. GET ROUND
   * ==========================================================
   *
   * Ưu tiên round chính.
   * Nếu round null thì fallback current_round.
   */

  const rawRound =
    session.round ??
    session.current_round ??
    1;

  const round =
    Number(rawRound);

  if (
    !Number.isInteger(round) ||
    round < 1
  ) {
    return {
      success: false,
      error:
        "Round không hợp lệ.",
    };
  }

  /*
   * ==========================================================
   * 4. SHOP PHASE
   * ==========================================================
   *
   * SHOP:
   *
   * 7
   * 14
   * 21
   * 28
   * ...
   *
   * Đây là điểm QUAN TRỌNG:
   *
   * Shop được kiểm tra TRƯỚC:
   *
   * - current_event_id
   * - existing event
   * - generate event
   *
   * Vì vậy round Shop tuyệt đối không
   * được rơi xuống pipeline tạo event.
   */

  const shopRound =
    isShopRound(round);

  console.log(
    "ENGINE - ROUND CHECK:",
    {
      sessionId:
        session.id,

      round,

      sessionPhase:
        session.phase,

      currentPhase:
        session.current_phase,

      currentEventId:
        session.current_event_id,

      shopRound,
    }
  );

  /*
   * ----------------------------------------------------------
   * 4A. ALREADY IN SHOP
   * ----------------------------------------------------------
   *
   * Nếu engine được gọi nhiều lần:
   *
   * KHÔNG update game_state.
   *
   * Điều này cực kỳ quan trọng vì
   * game_states.updated_at chính là
   * server timestamp mở Shop.
   *
   * Nếu update lại mỗi request thì timer
   * 75 giây sẽ bị reset.
   */

  if (
    shopRound &&
    (
      session.phase ===
        "shop" ||
      session.current_phase ===
        "shop"
    )
  ) {
    /*
     * Trường hợp một field đã là shop
     * nhưng field còn lại chưa đồng bộ,
     * sửa lại cả hai mà KHÔNG đụng
     * game_states.updated_at nếu cả hai
     * đã đúng.
     */

    if (
      session.phase ===
        "shop" &&
      session.current_phase ===
        "shop"
    ) {
      console.log(
        "ENGINE - SHOP ALREADY OPEN:",
        {
          sessionId:
            session.id,
          round,
        }
      );

      return {
        success: true,
      };
    }

    /*
     * Một trong hai field đang là shop,
     * field còn lại chưa đúng.
     *
     * Đồng bộ session trước.
     *
     * Lưu ý:
     * Không gọi syncGameState ở đây nếu
     * game state đã là shop, nhằm tránh
     * reset updated_at.
     */

    const {
      error: partialShopSyncError,
    } = await syncSession(
      supabase,
      session.id,
      null,
      round,
      "shop"
    );

    if (
      partialShopSyncError
    ) {
      console.error(
        "ENGINE - PARTIAL SHOP SESSION SYNC ERROR:",
        partialShopSyncError
      );

      return {
        success: false,
        error:
          "Không thể đồng bộ Shop Phase.",
      };
    }

    console.log(
      "ENGINE - SHOP SESSION RESYNCED:",
      {
        sessionId:
          session.id,
        round,
      }
    );

    return {
      success: true,
    };
  }

  /*
   * ----------------------------------------------------------
   * 4B. ENTER SHOP
   * ----------------------------------------------------------
   *
   * Nếu round là Shop nhưng session
   * chưa ở phase shop:
   *
   * → chuyển session sang shop
   * → clear event
   * → chuyển game_state sang shop
   *
   * game_states.updated_at chỉ được ghi
   * tại đây, tức thời điểm Shop thực sự mở.
   */

  if (shopRound) {
    const previousPhase =
      session.phase ??
      session.current_phase ??
      "choosing";

    const previousEventId =
      session.current_event_id ??
      null;

    console.log(
      "ENGINE - ENTERING SHOP:",
      {
        sessionId:
          session.id,

        round,

        previousPhase,

        previousEventId,
      }
    );

    /*
     * --------------------------------------------------------
     * 4B.1 GAME SESSION
     * --------------------------------------------------------
     *
     * Clear current_event_id vì Shop
     * không có event.
     */

    const {
      error:
        shopSessionError,
    } = await syncSession(
      supabase,
      session.id,
      null,
      round,
      "shop"
    );

    if (
      shopSessionError
    ) {
      console.error(
        "ENGINE - ENTER SHOP SESSION ERROR:",
        shopSessionError
      );

      return {
        success: false,
        error:
          "Không thể mở Shop Phase.",
      };
    }

    /*
     * --------------------------------------------------------
     * 4B.2 GAME STATE
     * --------------------------------------------------------
     *
     * updated_at = server timestamp
     * tại thời điểm Shop mở.
     */

    const {
      error:
        shopStateError,
    } = await syncGameState(
      supabase,
      session.id,
      null,
      round,
      "shop"
    );

    if (
      shopStateError
    ) {
      console.error(
        "ENGINE - ENTER SHOP STATE ERROR:",
        shopStateError
      );

      /*
       * Rollback session.
       */

      const {
        error:
          rollbackSessionError,
      } = await syncSession(
        supabase,
        session.id,
        previousEventId,
        round,
        previousPhase
      );

      if (
        rollbackSessionError
      ) {
        console.error(
          "ENGINE - SHOP SESSION ROLLBACK ERROR:",
          rollbackSessionError
        );
      }

      return {
        success: false,
        error:
          "Không thể cập nhật game state cho Shop.",
      };
    }

    console.log(
      "ENGINE - SHOP PHASE OPENED:",
      {
        sessionId:
          session.id,

        round,

        phase:
          "shop",

        durationSeconds:
          75,
      }
    );

    return {
      success: true,
    };
  }

  /*
   * ==========================================================
   * 5. CURRENT EVENT
   * ==========================================================
   *
   * Nếu session đã có current_event_id:
   *
   * - event tồn tại → dùng lại
   * - event không tồn tại → clear reference
   *   rồi tạo tiếp
   */

  if (
    session.current_event_id
  ) {
    const {
      event: currentEvent,
      error:
        currentEventError,
    } = await getEventById(
      supabase,
      session.id,
      session.current_event_id
    );

    if (
      currentEventError
    ) {
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

    /*
     * Event vẫn tồn tại.
     */

    if (currentEvent) {
      return await syncExistingEvent(
        supabase,
        session.id,
        currentEvent,
        round
      );
    }

    /*
     * Event không còn tồn tại.
     *
     * Clear reference trước khi tạo
     * event mới.
     */

    const {
      error:
        clearSessionError,
    } = await syncSession(
      supabase,
      session.id,
      null,
      round,
      "generating_event"
    );

    if (
      clearSessionError
    ) {
      console.error(
        "ENGINE - CLEAR SESSION EVENT ERROR:",
        clearSessionError
      );

      return {
        success: false,
        error:
          "Không thể reset event hiện tại.",
      };
    }

    const {
      error:
        clearStateError,
    } = await syncGameState(
      supabase,
      session.id,
      null,
      round,
      "generating_event"
    );

    if (
      clearStateError
    ) {
      console.error(
        "ENGINE - CLEAR STATE EVENT ERROR:",
        clearStateError
      );

      return {
        success: false,
        error:
          "Không thể reset game state.",
      };
    }
  }

  /*
   * ==========================================================
   * 6. CHECK EXISTING EVENT
   * ==========================================================
   *
   * Tránh tạo event trùng nếu engine
   * được gọi lại.
   */

  const {
    event: existingEvent,
    error:
      existingEventError,
  } = await getEventByRound(
    supabase,
    session.id,
    round
  );

  if (
    existingEventError
  ) {
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
   * ==========================================================
   * 7. EVENT ALREADY EXISTS
   * ==========================================================
   */

  if (existingEvent) {
    return await syncExistingEvent(
      supabase,
      session.id,
      existingEvent,
      round
    );
  }

  /*
   * ==========================================================
   * 8. GENERATE EVENT TEMPLATE
   * ==========================================================
   */

  const eventData: EventTemplate =
    round === 1
      ? ROUND_1_EVENT
      : getFallbackEvent(round);

  /*
   * ==========================================================
   * 9. INSERT EVENT
   * ==========================================================
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

      result:
        null,
    })
    .select("*")
    .single();

  /*
   * ==========================================================
   * 9A. DUPLICATE EVENT
   * ==========================================================
   */

  if (eventError) {
    /*
     * PostgreSQL unique violation.
     *
     * Nếu DB có:
     *
     * UNIQUE(session_id, round)
     *
     * thì đây là trường hợp hai request
     * cùng tạo một event.
     */

    if (
      eventError.code ===
      "23505"
    ) {
      const {
        event:
          duplicateEvent,
        error:
          duplicateEventError,
      } = await getEventByRound(
        supabase,
        session.id,
        round
      );

      if (
        duplicateEventError
      ) {
        console.error(
          "ENGINE - DUPLICATE EVENT LOAD ERROR:",
          duplicateEventError
        );

        return {
          success: false,
          error:
            "Event đã tồn tại nhưng không thể tải lại.",
        };
      }

      if (!duplicateEvent) {
        return {
          success: false,
          error:
            "Event bị trùng nhưng không thể tìm thấy event.",
        };
      }

      return await syncExistingEvent(
        supabase,
        session.id,
        duplicateEvent,
        round
      );
    }

    console.error(
      "ENGINE - CREATE EVENT ERROR:",
      eventError
    );

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

  const createdEvent =
    event as GameEventRow;

  /*
   * ==========================================================
   * 10. UPDATE GAME STATE
   * ==========================================================
   */

  const {
    error:
      gameStateError,
  } = await syncGameState(
    supabase,
    session.id,
    createdEvent.id,
    round,
    "choosing"
  );

  if (
    gameStateError
  ) {
    console.error(
      "ENGINE - UPDATE GAME STATE ERROR:",
      gameStateError
    );

    /*
     * Rollback event.
     */

    const {
      error:
        rollbackEventError,
    } = await supabase
      .from("game_events")
      .delete()
      .eq(
        "id",
        createdEvent.id
      );

    if (
      rollbackEventError
    ) {
      console.error(
        "ENGINE - ROLLBACK EVENT ERROR:",
        rollbackEventError
      );
    }

    return {
      success: false,
      error:
        "Không thể cập nhật game state.",
    };
  }

  /*
   * ==========================================================
   * 11. UPDATE GAME SESSION
   * ==========================================================
   */

  const {
    error:
      sessionUpdateError,
  } = await syncSession(
    supabase,
    session.id,
    createdEvent.id,
    round,
    "choosing"
  );

  if (
    sessionUpdateError
  ) {
    console.error(
      "ENGINE - UPDATE SESSION ERROR:",
      sessionUpdateError
    );

    /*
     * Rollback game state.
     */

    const {
      error:
        rollbackStateError,
    } = await syncGameState(
      supabase,
      session.id,
      null,
      round,
      "generating_event"
    );

    if (
      rollbackStateError
    ) {
      console.error(
        "ENGINE - ROLLBACK STATE ERROR:",
        rollbackStateError
      );
    }

    /*
     * Rollback event.
     */

    const {
      error:
        rollbackEventError,
    } = await supabase
      .from("game_events")
      .delete()
      .eq(
        "id",
        createdEvent.id
      );

    if (
      rollbackEventError
    ) {
      console.error(
        "ENGINE - ROLLBACK EVENT ERROR:",
        rollbackEventError
      );
    }

    return {
      success: false,
      error:
        "Không thể cập nhật game session.",
    };
  }

  /*
   * ==========================================================
   * 12. SUCCESS
   * ==========================================================
   */

  console.log(
    "ENGINE - NORMAL ROUND EVENT READY:",
    {
      sessionId:
        session.id,

      round,

      phase:
        "choosing",

      eventId:
        createdEvent.id,
    }
  );

  return {
    success: true,
    event:
      createdEvent,
  };
}