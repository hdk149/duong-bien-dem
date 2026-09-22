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
    started_at: string;
    expires_at: string;
  };
};

/* =====================================================
   CLOSE SHOP
   =====================================================

   Shop chỉ được đóng khi:

   game_sessions.phase === "shop"

   và thời gian Shop đã hết.

   QUAN TRỌNG:

   closeShop KHÔNG tạo round mới.
   closeShop KHÔNG tạo event mới.

   Ví dụ:

   round = 7
   phase = shop
   current_event_id = EVENT_7

   ↓ closeShop()

   round = 7
   phase = choosing
   current_event_id = EVENT_7

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
     2. ALREADY CLOSED / NOT SHOP
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
     4. VALIDATE SHOP TIME
     =================================================== */

  const startedAt =
    new Date(
      shopSession.started_at
    ).getTime();

  const expiresAt =
    new Date(
      shopSession.expires_at
    ).getTime();

  if (
    !Number.isFinite(
      startedAt
    ) ||
    !Number.isFinite(
      expiresAt
    )
  ) {
    throw new Error(
      "Thời gian Shop không hợp lệ."
    );
  }

  /*
   * Server vẫn giới hạn theo 85 giây,
   * kể cả nếu expires_at trong DB bị sai dài hơn.
   */

  const calculatedExpiresAt =
    startedAt +
    SHOP_DURATION_MS;

  const actualExpiresAt =
    Math.min(
      expiresAt,
      calculatedExpiresAt
    );

  const now =
    Date.now();

  const expired =
    now >=
    actualExpiresAt;

  /* ===================================================
     5. SHOP CHƯA HẾT
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
     6. ATOMIC CLOSE
     ===================================================

     Chỉ request đầu tiên được phép chuyển:

     shop -> choosing

     Các request khác sẽ không update được
     vì phase không còn là "shop".
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
     7. ANOTHER REQUEST CLOSED IT
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
     8. SYNC GAME STATE
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
     * Không rollback game_sessions ở đây.

     * Lý do:
     * game_sessions là SOURCE OF TRUTH.
     *
     * Nếu game_states sync fail thì realtime/client
     * vẫn có thể đọc game_sessions và recover.
     */

    console.error(
      "[CLOSE SHOP] game state sync error:",
      syncError
    );
  }

  /* ===================================================
     9. DONE
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
        shopSession.started_at,

      expires_at:
        new Date(
          actualExpiresAt
        ).toISOString(),
    },
  };
}