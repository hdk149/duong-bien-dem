import { createClient } from "@supabase/supabase-js";

const SHOP_DURATION_MS = 85_000;

type SupabaseClient = any;

type CloseShopResult = {
  closed: boolean;
  alreadyClosed: boolean;
  expired: boolean;

  session?: {
    id: string;
    room_id: string;
    round: number;
    phase: string;
    current_event_id: string | null;
  };

  shopSession?: {
    id: string;
    room_id: string;
    round: number;
    started_at: string | null;
    expires_at: string | null;
  };
};

/* =====================================================
   START SHOP
   =====================================================

   Khi game chuyển sang:

   game_sessions.phase = "shop"

   thì Shop chỉ được HIỂN THỊ.

   Timer KHÔNG bắt đầu.

   Chỉ khi player bấm:

   "Vào shop"

   mới gọi startShop().

   Khi đó:

   started_at = NOW()
   expires_at = NOW() + 85 giây

   ===================================================== */

export async function startShop(
  supabase: SupabaseClient,
  roomId: string
): Promise<{
  started: boolean;
  alreadyStarted: boolean;

  session: {
    id: string;
    room_id: string;
    round: number;
    phase: string;
    current_event_id: string | null;
  };

  shopSession: {
    id: string;
    room_id: string;
    round: number;
    started_at: string;
    expires_at: string;
  };
}> {
  /* ===================================================
     1. LOAD ACTIVE SESSION
     =================================================== */

  const {
    data: session,
    error: sessionError,
  } = await supabase
    .from("game_sessions")
    .select(`
      id,
      room_id,
      round,
      phase,
      current_event_id
    `)
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "status",
      "active"
    )
    .order(
      "session_number",
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    console.error(
      "[START SHOP] session lookup error:",
      sessionError
    );

    throw new Error(
      "Không thể tải game session."
    );
  }

  if (!session) {
    throw new Error(
      "Không tìm thấy game session đang chạy."
    );
  }

  /* ===================================================
     2. MUST BE SHOP PHASE
     =================================================== */

  if (
    session.phase !==
    "shop"
  ) {
    throw new Error(
      "Hiện tại không ở giai đoạn Shop."
    );
  }

  /* ===================================================
     3. LOAD SHOP SESSION
     =================================================== */

  const {
    data: shopSession,
    error: shopSessionError,
  } = await supabase
    .from("shop_sessions")
    .select(`
      id,
      room_id,
      round,
      started_at,
      expires_at
    `)
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "round",
      session.round
    )
    .maybeSingle();

  if (shopSessionError) {
    console.error(
      "[START SHOP] shop session lookup error:",
      shopSessionError
    );

    throw new Error(
      "Không thể tải phiên Shop."
    );
  }

  if (!shopSession) {
    throw new Error(
      "Phiên Shop không tồn tại."
    );
  }

  /* ===================================================
     4. ALREADY STARTED
     =================================================== */

  if (
    shopSession.started_at
  ) {
    if (
      !shopSession.expires_at
    ) {
      throw new Error(
        "Phiên Shop đã bắt đầu nhưng thiếu thời gian kết thúc."
      );
    }

    return {
      started: false,
      alreadyStarted: true,

      session: {
        id:
          session.id,

        room_id:
          session.room_id,

        round:
          session.round,

        phase:
          session.phase,

        current_event_id:
          session.current_event_id,
      },

      shopSession: {
        id:
          shopSession.id,

        room_id:
          shopSession.room_id,

        round:
          shopSession.round,

        started_at:
          shopSession.started_at,

        expires_at:
          shopSession.expires_at,
      },
    };
  }

  /* ===================================================
     5. CREATE TIMER
     =================================================== */

  const now =
    new Date();

  const startedAt =
    now.toISOString();

  const expiresAt =
    new Date(
      now.getTime() +
        SHOP_DURATION_MS
    ).toISOString();

  /* ===================================================
     6. ATOMIC START
     ===================================================

     Chỉ request đầu tiên được phép start.

     Điều kiện:

     started_at IS NULL

     Các player khác click cùng lúc sẽ không
     reset timer.
     =================================================== */

  const {
    data: startedShopSession,
    error: startError,
  } = await supabase
    .from("shop_sessions")
    .update({
      started_at:
        startedAt,

      expires_at:
        expiresAt,
    })
    .eq(
      "id",
      shopSession.id
    )
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "round",
      session.round
    )
    .is(
      "started_at",
      null
    )
    .select(`
      id,
      room_id,
      round,
      started_at,
      expires_at
    `)
    .maybeSingle();

  if (startError) {
    console.error(
      "[START SHOP] update error:",
      startError
    );

    throw new Error(
      "Không thể bắt đầu Shop."
    );
  }

  /* ===================================================
     7. ANOTHER PLAYER STARTED IT
     =================================================== */

  if (!startedShopSession) {
    const {
      data: latestShopSession,
      error:
        latestShopSessionError,
    } = await supabase
      .from("shop_sessions")
      .select(`
        id,
        room_id,
        round,
        started_at,
        expires_at
      `)
      .eq(
        "id",
        shopSession.id
      )
      .maybeSingle();

    if (
      latestShopSessionError
    ) {
      console.error(
        "[START SHOP] race recovery error:",
        latestShopSessionError
      );

      throw new Error(
        "Không thể xác nhận trạng thái Shop."
      );
    }

    if (
      !latestShopSession ||
      !latestShopSession.started_at ||
      !latestShopSession.expires_at
    ) {
      throw new Error(
        "Không thể bắt đầu phiên Shop."
      );
    }

    return {
      started: false,
      alreadyStarted: true,

      session: {
        id:
          session.id,

        room_id:
          session.room_id,

        round:
          session.round,

        phase:
          session.phase,

        current_event_id:
          session.current_event_id,
      },

      shopSession: {
        id:
          latestShopSession.id,

        room_id:
          latestShopSession.room_id,

        round:
          latestShopSession.round,

        started_at:
          latestShopSession.started_at,

        expires_at:
          latestShopSession.expires_at,
      },
    };
  }

  /* ===================================================
     8. DONE
     =================================================== */

  console.log(
    "[START SHOP] SHOP STARTED",
    {
      roomId,

      sessionId:
        session.id,

      round:
        session.round,

      startedAt,

      expiresAt,
    }
  );

  return {
    started: true,
    alreadyStarted: false,

    session: {
      id:
        session.id,

      room_id:
        session.room_id,

      round:
        session.round,

      phase:
        session.phase,

      current_event_id:
        session.current_event_id,
    },

    shopSession: {
      id:
        startedShopSession.id,

      room_id:
        startedShopSession.room_id,

      round:
        startedShopSession.round,

      started_at:
        startedShopSession.started_at!,

      expires_at:
        startedShopSession.expires_at!,
    },
  };
}

/* =====================================================
   CLOSE SHOP
   =====================================================

   Shop chỉ được đóng khi:

   1. phase === "shop"
   2. Shop ĐÃ được start
   3. expires_at đã hết

   Nếu player chưa bấm "Vào shop":

   started_at = null

   => closeShop() KHÔNG đóng Shop.

   ===================================================== */

export async function closeShop(
  supabase: SupabaseClient,
  roomId: string
): Promise<CloseShopResult> {
  /* ===================================================
     1. LOAD ACTIVE SESSION
     =================================================== */

  const {
    data: session,
    error: sessionError,
  } = await supabase
    .from("game_sessions")
    .select(`
      id,
      room_id,
      round,
      phase,
      current_event_id
    `)
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "status",
      "active"
    )
    .order(
      "session_number",
      {
        ascending: false,
      }
    )
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    console.error(
      "[CLOSE SHOP] session lookup error:",
      sessionError
    );

    throw new Error(
      "Không thể tải game session."
    );
  }

  if (!session) {
    throw new Error(
      "Không tìm thấy game session đang chạy."
    );
  }

  /* ===================================================
     2. NOT SHOP
     =================================================== */

  if (
    session.phase !==
    "shop"
  ) {
    return {
      closed: false,
      alreadyClosed: true,
      expired: true,

      session: {
        id:
          session.id,

        room_id:
          session.room_id,

        round:
          session.round,

        phase:
          session.phase,

        current_event_id:
          session.current_event_id,
      },
    };
  }

  /* ===================================================
     3. LOAD SHOP SESSION
     =================================================== */

  const {
    data: shopSession,
    error: shopSessionError,
  } = await supabase
    .from("shop_sessions")
    .select(`
      id,
      room_id,
      round,
      started_at,
      expires_at
    `)
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "round",
      session.round
    )
    .maybeSingle();

  if (shopSessionError) {
    console.error(
      "[CLOSE SHOP] shop session lookup error:",
      shopSessionError
    );

    throw new Error(
      "Không thể tải phiên Shop."
    );
  }

  if (!shopSession) {
    throw new Error(
      "Phiên Shop không tồn tại."
    );
  }

  /* ===================================================
     4. SHOP CHƯA START
     ===================================================

     Đây là điểm quan trọng nhất.

     Nếu:

     started_at = null

     thì player chưa bấm "Vào shop".

     KHÔNG được tự đóng.
     KHÔNG được tự chạy timer.
     =================================================== */

  if (
    !shopSession.started_at
  ) {
    return {
      closed: false,
      alreadyClosed: false,
      expired: false,

      session: {
        id:
          session.id,

        room_id:
          session.room_id,

        round:
          session.round,

        phase:
          session.phase,

        current_event_id:
          session.current_event_id,
      },

      shopSession: {
        id:
          shopSession.id,

        room_id:
          shopSession.room_id,

        round:
          shopSession.round,

        started_at:
          null,

        expires_at:
          null,
      },
    };
  }

  /* ===================================================
     5. VALIDATE TIMER
     =================================================== */

  const startedAt =
    new Date(
      shopSession.started_at
    ).getTime();

  if (
    !Number.isFinite(
      startedAt
    )
  ) {
    throw new Error(
      "Thời gian bắt đầu Shop không hợp lệ."
    );
  }

  /*
   * Server luôn giới hạn Shop tối đa 85 giây.
   */

  const calculatedExpiresAt =
    startedAt +
    SHOP_DURATION_MS;

  let actualExpiresAt =
    calculatedExpiresAt;

  /*
   * Nếu DB đã có expires_at thì lấy
   * mốc sớm hơn.
   */

  if (
    shopSession.expires_at
  ) {
    const databaseExpiresAt =
      new Date(
        shopSession.expires_at
      ).getTime();

    if (
      Number.isFinite(
        databaseExpiresAt
      )
    ) {
      actualExpiresAt =
        Math.min(
          databaseExpiresAt,
          calculatedExpiresAt
        );
    }
  }

  const now =
    Date.now();

  const expired =
    now >=
    actualExpiresAt;

  /* ===================================================
     6. SHOP CHƯA HẾT
     =================================================== */

  if (!expired) {
    return {
      closed: false,
      alreadyClosed: false,
      expired: false,

      session: {
        id:
          session.id,

        room_id:
          session.room_id,

        round:
          session.round,

        phase:
          session.phase,

        current_event_id:
          session.current_event_id,
      },

      shopSession: {
        id:
          shopSession.id,

        room_id:
          shopSession.room_id,

        round:
          shopSession.round,

        started_at:
          shopSession.started_at,

        expires_at:
          new Date(
            actualExpiresAt
          ).toISOString(),
      },
    };
  }

  /* ===================================================
     7. ATOMIC CLOSE
     ===================================================

     Chỉ request đầu tiên được phép:

     shop -> choosing

     =================================================== */

  const {
    data: closedSession,
    error: closeError,
  } = await supabase
    .from("game_sessions")
    .update({
      phase:
        "choosing",
    })
    .eq(
      "id",
      session.id
    )
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "status",
      "active"
    )
    .eq(
      "round",
      session.round
    )
    .eq(
      "phase",
      "shop"
    )
    .eq(
      "current_event_id",
      session.current_event_id
    )
    .select(`
      id,
      room_id,
      round,
      phase,
      current_event_id
    `)
    .maybeSingle();

  if (closeError) {
    console.error(
      "[CLOSE SHOP] update error:",
      closeError
    );

    throw new Error(
      "Không thể đóng Shop."
    );
  }

  /* ===================================================
     8. ANOTHER REQUEST CLOSED IT
     =================================================== */

  if (!closedSession) {
    const {
      data: latestSession,
      error:
        latestSessionError,
    } = await supabase
      .from("game_sessions")
      .select(`
        id,
        room_id,
        round,
        phase,
        current_event_id
      `)
      .eq(
        "id",
        session.id
      )
      .maybeSingle();

    if (latestSessionError) {
      console.error(
        "[CLOSE SHOP] race recovery error:",
        latestSessionError
      );

      throw new Error(
        "Không thể xác nhận trạng thái Shop."
      );
    }

    return {
      closed: false,
      alreadyClosed: true,
      expired: true,

      session:
        latestSession
          ? {
              id:
                latestSession.id,

              room_id:
                latestSession.room_id,

              round:
                latestSession.round,

              phase:
                latestSession.phase,

              current_event_id:
                latestSession.current_event_id,
            }
          : undefined,

      shopSession: {
        id:
          shopSession.id,

        room_id:
          shopSession.room_id,

        round:
          shopSession.round,

        started_at:
          shopSession.started_at,

        expires_at:
          new Date(
            actualExpiresAt
          ).toISOString(),
      },
    };
  }

  /* ===================================================
     9. SYNC GAME STATE
     =================================================== */

  const {
    error:
      syncError,
  } = await supabase
    .from("game_states")
    .update({
      room_id:
        roomId,

      session_id:
        session.id,

      round:
        session.round,

      phase:
        "choosing",

      current_event_id:
        session.current_event_id,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "session_id",
      session.id
    );

  if (syncError) {
    /*
     * Không rollback game_sessions.

     * game_sessions là SOURCE OF TRUTH.
     */

    console.error(
      "[CLOSE SHOP] game state sync error:",
      syncError
    );
  }

  /* ===================================================
     10. DONE
     =================================================== */

  console.log(
    "[CLOSE SHOP] SHOP CLOSED",
    {
      roomId,

      sessionId:
        session.id,

      round:
        session.round,

      eventId:
        session.current_event_id,
    }
  );

  return {
    closed: true,
    alreadyClosed: false,
    expired: true,

    session: {
      id:
        closedSession.id,

      room_id:
        closedSession.room_id,

      round:
        closedSession.round,

      phase:
        closedSession.phase,

      current_event_id:
        closedSession.current_event_id,
    },

    shopSession: {
      id:
        shopSession.id,

      room_id:
        shopSession.room_id,

      round:
        shopSession.round,

      started_at:
        shopSession.started_at!,

      expires_at:
        new Date(
          actualExpiresAt
        ).toISOString(),
    },
  };
}