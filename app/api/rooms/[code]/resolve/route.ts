import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type {
  Player,
  PlayerVote,
} from "@/lib/game/types";

import {
  getVoteProgress,
} from "@/lib/game/vote";

import {
  prepareResolve,
} from "@/lib/game/resolver";

import {
  resolveRound,
} from "@/lib/game/round-resolver";

import {
  updatePlayerStatsWithHistory,
} from "@/lib/game/player-stats-service";

/*
 * ============================================================
 * SUPABASE ADMIN
 * ============================================================
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase server environment variables"
  );
}

const supabaseAdmin =
  createClient(
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

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
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
 * HELPERS
 * ============================================================
 */

const EMPTY_UUID =
  "00000000-0000-0000-0000-000000000000";

function hashToken(
  token: string
) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

/*
 * ============================================================
 * FALLBACK EVENT
 * ============================================================
 */

function getFallbackEvent(
  round: number
): EventTemplate {
  return {
    title:
      `Sự kiện Round ${round}`,

    description:
      "Một tình huống mới bất ngờ xuất hiện trên hành trình của bạn.",

    event_type:
      "normal",

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
      current_event_id:
        eventId,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "session_id",
      sessionId
    );
}

/*
 * ============================================================
 * GENERATE NEXT SHARED EVENT
 *
 * Giữ lại để tương thích với hệ thống game hiện tại.
 *
 * Event riêng từng player nằm trong:
 * player_round_events
 * ============================================================
 */

async function generateNextEvent(
  supabase: SupabaseClient,
  sessionId: string,
  roomId: string,
  round: number
) {
  const {
    data: existingEvent,
    error:
      existingEventError,
  } = await supabase
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

  if (existingEventError) {
    console.error(
      "RESOLVE - EXISTING EVENT ERROR:",
      existingEventError
    );

    return {
      success: false,
      error:
        "Không thể kiểm tra event tiếp theo.",
    };
  }

  if (existingEvent) {
    return {
      success: true,
      event:
        existingEvent,
    };
  }

  const eventData =
    getFallbackEvent(
      round
    );

  const {
    data: event,
    error: eventError,
  } = await supabase
    .from("game_events")
    .insert({
      room_id:
        roomId,

      session_id:
        sessionId,

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

  if (eventError) {
    console.error(
      "RESOLVE - CREATE NEXT EVENT ERROR:",
      eventError
    );

    const {
      data: duplicateEvent,
    } = await supabase
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

    if (duplicateEvent) {
      return {
        success: true,
        event:
          duplicateEvent,
      };
    }

    return {
      success: false,
      error:
        "Không thể tạo event tiếp theo.",
    };
  }

  if (!event) {
    return {
      success: false,
      error:
        "Event tiếp theo không tồn tại.",
    };
  }

  return {
    success: true,
    event,
  };
}

/*
 * ============================================================
 * AUTH DEVELOPER SESSION
 * ============================================================
 */

async function validateDeveloperSession(
  token: string
) {
  if (!token) {
    return null;
  }

  const tokenHash =
    hashToken(token);

  const {
    data: developerSession,
    error,
  } = await supabaseAdmin
    .from("developer_sessions")
    .select(
      "id, player_id, expires_at"
    )
    .eq(
      "token_hash",
      tokenHash
    )
    .maybeSingle();

  if (
    error ||
    !developerSession
  ) {
    return null;
  }

  if (
    !developerSession.expires_at ||
    new Date(
      developerSession.expires_at
    ).getTime() <=
      Date.now()
  ) {
    return null;
  }

  return developerSession;
}

/*
 * ============================================================
 * POST /resolve
 * ============================================================
 */

export async function POST(
  request: NextRequest,
  context: RouteContext
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
      String(
        code ?? ""
      ).trim();

    if (
      !/^\d{6}$/.test(
        roomCode
      )
    ) {
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
     * 2. AUTH
     * --------------------------------------------------------
     */

    const playerToken =
      request.headers
        .get(
          "x-player-token"
        )
        ?.trim() ?? "";

    const developerToken =
      request.headers
        .get(
          "x-developer-session"
        )
        ?.trim() ?? "";

    const developerSession =
      await validateDeveloperSession(
        developerToken
      );

    if (
      !playerToken &&
      !developerSession
    ) {
      return NextResponse.json(
        {
          error:
            "Thiếu thông tin xác thực.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 3. ROOM
     * --------------------------------------------------------
     */

    const {
      data: room,
      error: roomError,
    } = await supabaseAdmin
      .from("rooms")
      .select(
        `
          id,
          code,
          status
        `
      )
      .eq(
        "code",
        roomCode
      )
      .maybeSingle();

    if (roomError) {
      console.error(
        "RESOLVE - ROOM ERROR:",
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

    if (
      room.status !==
      "playing"
    ) {
      return NextResponse.json(
        {
          error:
            "Game chưa được bắt đầu.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 4. AUTH PLAYER
     * --------------------------------------------------------
     */

    if (
      playerToken &&
      !developerSession
    ) {
      const {
        data: currentPlayer,
        error:
          playerError,
      } = await supabaseAdmin
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
            last_choice,
            moderation_status
          `
        )
        .eq(
          "room_id",
          room.id
        )
        .eq(
          "player_token",
          playerToken
        )
        .eq(
          "moderation_status",
          "active"
        )
        .maybeSingle();

      if (playerError) {
        console.error(
          "RESOLVE - PLAYER ERROR:",
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
              "Bạn không còn thuộc nhóm người chơi hoạt động.",
          },
          {
            status: 403,
          }
        );
      }

      if (
        currentPlayer.role ===
        "spectator"
      ) {
        return NextResponse.json(
          {
            error:
              "Khán giả không được resolve event.",
          },
          {
            status: 403,
          }
        );
      }
    }

    /*
     * --------------------------------------------------------
     * 5. ACTIVE SESSION
     * --------------------------------------------------------
     */

    const {
      data: session,
      error:
        sessionError,
    } = await supabaseAdmin
      .from("game_sessions")
      .select(
        `
          id,
          room_id,
          session_number,
          status,
          round,
          phase,
          current_event_id
        `
      )
      .eq(
        "room_id",
        room.id
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
        "RESOLVE - SESSION ERROR:",
        sessionError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải game session.",
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
            "Không tìm thấy game session.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 6. CURRENT EVENT
     * --------------------------------------------------------
     */

    if (
      !session.current_event_id
    ) {
      return NextResponse.json(
        {
          error:
            "Session chưa có event hiện tại.",
        },
        {
          status: 409,
        }
      );
    }

    const eventId =
      session.current_event_id;

    /*
     * --------------------------------------------------------
     * 7. LOAD EVENT
     * --------------------------------------------------------
     */

    const {
      data: event,
      error:
        eventError,
    } = await supabaseAdmin
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
    destination,
    choices,
    result
  `
)
      .eq(
        "id",
        eventId
      )
      .eq(
        "room_id",
        room.id
      )
      .eq(
        "session_id",
        session.id
      )
      .maybeSingle();

    if (eventError) {
      console.error(
        "RESOLVE - EVENT ERROR:",
        eventError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải event.",
        },
        {
          status: 500,
        }
      );
    }

    if (!event) {
      return NextResponse.json(
        {
          error:
            "Event không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 8. GET ACTIVE PLAYERS
     * --------------------------------------------------------
     *
     * Host + player = participant
     *
     * Spectator = không tính
     * kicked/banned = không tính
     * disconnected = vẫn tính
     */

    const {
      data: roomPlayers,
      error:
        roomPlayersError,
    } = await supabaseAdmin
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
          last_choice,
          moderation_status
        `
      )
      .eq(
        "room_id",
        room.id
      )
      .in(
        "role",
        ["host", "player"]
      )
      .eq(
        "moderation_status",
        "active"
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (roomPlayersError) {
      console.error(
        "RESOLVE - ROOM PLAYERS ERROR:",
        roomPlayersError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải danh sách người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    const players: Player[] =
      (
        roomPlayers ??
        []
      ).map(
        (item) => ({
          id:
            item.id,

          player_name:
            item.player_name,

          role:
            item.role,

          hp:
            item.hp,

          money:
            item.money,

          location:
            item.location,

          legal_risk:
            item.legal_risk,

          is_connected:
            item.is_connected,

          last_choice:
            item.last_choice,

          moderation_status:
            item.moderation_status,
        } as Player)
      );

    if (
      players.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "Phòng chưa có người chơi hoạt động.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 9. GET ACTIVE PLAYER VOTES
     * --------------------------------------------------------
     */

    const playerIds =
      players.map(
        (player) =>
          player.id
      );

    const {
      data: voteRows,
      error:
        voteError,
    } = await supabaseAdmin
      .from("player_choices")
      .select(
        `
          player_id,
          choice_id
        `
      )
      .eq(
        "event_id",
        eventId
      )
      .eq(
        "session_id",
        session.id
      )
      .in(
        "player_id",
        playerIds.length >
          0
          ? playerIds
          : [EMPTY_UUID]
      );

    if (voteError) {
      console.error(
        "RESOLVE - VOTES ERROR:",
        voteError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải lựa chọn.",
        },
        {
          status: 500,
        }
      );
    }

    const votes: PlayerVote[] =
      (
        voteRows ??
        []
      ).map(
        (vote) => ({
          player_id:
            vote.player_id,

          choice_id:
            vote.choice_id,
        })
      );

    /*
     * --------------------------------------------------------
     * 10. PREPARE RESOLVE
     * --------------------------------------------------------
     */

    const prepared =
      prepareResolve({
        event: {
          ...event,

          choices:
            Array.isArray(
              event.choices
            )
              ? event.choices
              : [],
        },

        players,

        votes,
      });

    /*
     * --------------------------------------------------------
     * 11. NOT READY
     * --------------------------------------------------------
     */

    if (!prepared) {
      const progress =
        getVoteProgress(
          players,
          votes
        );

      return NextResponse.json(
        {
          success: false,

          resolved: false,

          error:
            "Chưa đủ người chơi lựa chọn.",

          progress,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 12. ATOMIC CLAIM
     * --------------------------------------------------------
     */

    const {
      data: claimedSession,
      error:
        claimError,
    } = await supabaseAdmin
      .from("game_sessions")
      .update({
        phase:
          "resolving",
      })
      .eq(
        "id",
        session.id
      )
      .eq(
        "phase",
        "choosing"
      )
      .eq(
        "current_event_id",
        eventId
      )
      .select(
        `
          id,
          room_id,
          round,
          phase,
          current_event_id
        `
      )
      .maybeSingle();

    if (claimError) {
      console.error(
        "RESOLVE - CLAIM ERROR:",
        claimError
      );

      return NextResponse.json(
        {
          error:
            "Không thể khóa resolve.",
        },
        {
          status: 500,
        }
      );
    }

    if (!claimedSession) {
      return NextResponse.json({
        success: true,

        resolved: false,

        alreadyResolving:
          true,

        message:
          "Event đang được xử lý bởi request khác.",
      });
    }

    /*
     * --------------------------------------------------------
     * 13. SYNC RESOLVING
     * --------------------------------------------------------
     */

    const {
      error:
        resolvingStateError,
    } = await syncGameState(
      supabaseAdmin,

      session.id,

      eventId,

      session.round,

      "resolving"
    );

    if (resolvingStateError) {
      console.error(
        "RESOLVE - STATE RESOLVING ERROR:",
        resolvingStateError
      );

      await supabaseAdmin
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
          "phase",
          "resolving"
        )
        .eq(
          "current_event_id",
          eventId
        );

      return NextResponse.json(
        {
          error:
            "Không thể cập nhật resolving state.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 14. LOAD CURRENT PRIVATE PLAYER EVENTS
     * --------------------------------------------------------
     *
     * Đây là event riêng mà AI đã tạo
     * cho từng player ở round hiện tại.
     *
     * Không tạo event mới ở đây.
     */

    const {
  data: currentPlayerEvents,
  error:
    currentPlayerEventsError,
} = await supabaseAdmin
  .from("player_round_events")
  .select(`
    id,
    player_id,
    title,
    description,
    event_type,
    destination,
    choices,
    selected_choice_id,
    source_event_id
  `)
  .eq(
    "session_id",
    session.id
  )
  .eq(
    "round",
    session.round
  )
  .in(
    "player_id",
    players.map(
      (player) =>
        player.id
    )
  );

    if (
      currentPlayerEventsError
    ) {
      console.error(
        "RESOLVE PLAYER EVENTS ERROR:",
        currentPlayerEventsError
      );

      await supabaseAdmin
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
          "phase",
          "resolving"
        )
        .eq(
          "current_event_id",
          eventId
        );

      await syncGameState(
        supabaseAdmin,

        session.id,

        eventId,

        session.round,

        "choosing"
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải event riêng của người chơi.",

          details:
            currentPlayerEventsError.message,
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 15. AI HOST + RESOLVE ROUND
     * --------------------------------------------------------
     *
     * Gemini tạo kết quả riêng cho
     * từng player.
     *
     * Không dùng một event chung
     * cho tất cả người chơi.
     */

    let resolvedRound;

    try {
      resolvedRound =
        await resolveRound({
          round:
            session.round,

          event: {
            ...event,

            choices:
              Array.isArray(
                event.choices
              )
                ? event.choices
                : [],
          },

          players,

          votes:
            prepared.votes.map(
              (item) =>
                item.vote
            ),

          playerEvents:
            currentPlayerEvents ??
            [],
        });
    } catch (aiError) {
      console.error(
        "RESOLVE - AI ROUND ERROR:",
        aiError
      );

      await supabaseAdmin
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
          "phase",
          "resolving"
        )
        .eq(
          "current_event_id",
          eventId
        );

      await syncGameState(
        supabaseAdmin,

        session.id,

        eventId,

        session.round,

        "choosing"
      );

      return NextResponse.json(
        {
          error:
            aiError instanceof Error
              ? aiError.message
              : "AI Host không thể xử lý round.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 16. SAVE AI PLAYER EVENTS
     * --------------------------------------------------------
     */

    const playerEventRows =
  resolvedRound.players.map(
    (resolvedPlayer) => ({
      room_id:
        room.id,

      session_id:
        session.id,

      round:
        session.round,

      player_id:
        resolvedPlayer.player.id,

      source_event_id:
        eventId,

      title:
        resolvedPlayer
          .application
          .event
          .title,

      description:
        resolvedPlayer
          .application
          .event
          .description,

      event_type:
        resolvedPlayer
          .application
          .event
          .type,

      destination:
        resolvedPlayer
          .application
          .event
          .destination ?? null,

      choices:
        resolvedPlayer
          .application
          .event
          .choices,

      selected_choice_id:
        resolvedPlayer
          .application
          .selectedChoiceId,

      result: {
        effects:
          resolvedPlayer
            .application
            .effects,

        before:
          resolvedPlayer
            .application
            .before,

        after:
          resolvedPlayer
            .application
            .after,

        source_event_id:
          eventId,

        selected_choice_id:
          resolvedPlayer
            .application
            .selectedChoiceId,
      },

      status:
        "pending",
    })
  );

    const {
      data: playerEvents,
      error:
        playerEventsError,
    } = await supabaseAdmin
      .from("player_round_events")
      .upsert(
        playerEventRows,
        {
          onConflict:
            "session_id,round,player_id",
        }
      )
      .select("*");

    if (
      playerEventsError ||
      !playerEvents ||
      playerEvents.length !==
        playerEventRows.length
    ) {
      console.error(
        "RESOLVE - PLAYER EVENTS ERROR:",
        playerEventsError
      );

      await supabaseAdmin
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
          "phase",
          "resolving"
        )
        .eq(
          "current_event_id",
          eventId
        );

      await syncGameState(
        supabaseAdmin,

        session.id,

        eventId,

        session.round,

        "choosing"
      );

      return NextResponse.json(
        {
          error:
            "Không thể lưu event riêng của người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Map player_id -> player_event
     */

    const playerEventMap =
      new Map<
        string,
        typeof playerEvents[number]
      >();

    for (
      const playerEvent
      of playerEvents
    ) {
      playerEventMap.set(
        playerEvent.player_id,
        playerEvent
      );
    }

    /*
     * --------------------------------------------------------
     * 17. APPLY STATS + HISTORY
     * --------------------------------------------------------
     */

    const appliedPlayers: Array<{
      player_id: string;
      player_event_id: string;
      hp_before: number;
      hp_after: number;
      money_before: number;
      money_after: number;
      location_before: string;
      location_after: string;
      legal_risk_before: number;
      legal_risk_after: number;
      effects: unknown;
    }> = [];

    try {
      for (
        const resolvedPlayer
        of resolvedRound.players
      ) {
        const playerEvent =
          playerEventMap.get(
            resolvedPlayer.player.id
          );

        if (!playerEvent) {
          throw new Error(
            `Không tìm thấy player event cho ${resolvedPlayer.player.id}.`
          );
        }

        const application =
          resolvedPlayer
            .application;

        await updatePlayerStatsWithHistory(
          supabaseAdmin,

          {
            roomId:
              room.id,

            sessionId:
              session.id,

            playerId:
              resolvedPlayer
                .player.id,

            round:
              session.round,

            eventId:
              eventId,

            playerEventId:
              playerEvent.id,

            before:
              application.before,

            after:
              application.after,

            effects:
              application.effects,
          }
        );

        appliedPlayers.push({
          player_id:
            resolvedPlayer
              .player.id,

          player_event_id:
            playerEvent.id,

          hp_before:
            application.before.hp,

          hp_after:
            application.after.hp,

          money_before:
            application.before.money,

          money_after:
            application.after.money,

          location_before:
            application.before.location,

          location_after:
            application.after.location,

          legal_risk_before:
            application.before
              .legal_risk,

          legal_risk_after:
            application.after
              .legal_risk,

          effects:
            application.effects,
        });
      }
    } catch (statsError) {
      console.error(
        "RESOLVE - STATS ERROR:",
        statsError
      );

      await supabaseAdmin
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
          "phase",
          "resolving"
        )
        .eq(
          "current_event_id",
          eventId
        );

      await syncGameState(
        supabaseAdmin,

        session.id,

        eventId,

        session.round,

        "choosing"
      );

      return NextResponse.json(
        {
          error:
            statsError instanceof Error
              ? statsError.message
              : "Không thể cập nhật chỉ số người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 18. MARK PLAYER EVENTS RESOLVED
     * --------------------------------------------------------
     */

    const resolvedAt =
      new Date().toISOString();

    const {
      error:
        markResolvedError,
    } = await supabaseAdmin
      .from("player_round_events")
      .update({
        status:
          "resolved",

        resolved_at:
          resolvedAt,
      })
      .eq(
        "session_id",
        session.id
      )
      .eq(
        "round",
        session.round
      )
      .in(
        "player_id",
        playerIds
      );

    if (markResolvedError) {
      console.error(
        "RESOLVE - MARK PLAYER EVENTS ERROR:",
        markResolvedError
      );

      return NextResponse.json(
        {
          error:
            "Không thể hoàn tất player events.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 19. SAVE SHARED EVENT RESULT
     * --------------------------------------------------------
     *
     * game_events vẫn lưu tổng kết round.
     * Event gameplay thực tế của từng
     * player nằm trong player_round_events.
     */

    const resolveResult = {
      resolved:
        true,

      round:
        session.round,

      votes:
        prepared.votes.map(
          (item) => ({
            player_id:
              item.player.id,

            player_name:
              item.player
                .player_name,

            choice_id:
              item.vote
                .choice_id,
          })
        ),

      players:
        appliedPlayers,

      effects:
        appliedPlayers.map(
          (item) => ({
            player_id:
              item.player_id,

            hp_before:
              item.hp_before,

            hp_after:
              item.hp_after,

            money_before:
              item.money_before,

            money_after:
              item.money_after,

            location_before:
              item.location_before,

            location_after:
              item.location_after,

            legal_risk_before:
              item.legal_risk_before,

            legal_risk_after:
              item.legal_risk_after,

            effects:
              item.effects,
          })
        ),
    };

    const {
      error:
        resultError,
    } = await supabaseAdmin
      .from("game_events")
      .update({
        result:
          resolveResult,
      })
      .eq(
        "id",
        eventId
      )
      .eq(
        "session_id",
        session.id
      );

    if (resultError) {
      console.error(
        "RESOLVE - SAVE RESULT ERROR:",
        resultError
      );

      return NextResponse.json(
        {
          error:
            "Không thể lưu kết quả event.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 20. RESET ACTIVE PLAYER CHOICES
     * --------------------------------------------------------
     */

    const {
      error:
        resetChoiceError,
    } = await supabaseAdmin
      .from("room_players")
      .update({
        last_choice:
          null,
      })
      .eq(
        "room_id",
        room.id
      )
      .in(
        "role",
        ["host", "player"]
      )
      .eq(
        "moderation_status",
        "active"
      );

    if (resetChoiceError) {
      console.error(
        "RESOLVE - RESET LAST CHOICE ERROR:",
        resetChoiceError
      );
    }

    /*
     * --------------------------------------------------------
     * 21. NEXT ROUND
     * --------------------------------------------------------
     */

    const nextRound =
      Number(
        session.round
      ) + 1;

    /*
     * --------------------------------------------------------
     * 22. NEXT SHARED EVENT
     * --------------------------------------------------------
     *
     * Đây chỉ là compatibility event.
     *
     * Round mới sẽ dùng
     * player_round_events
     * sau khi AI tạo event riêng
     * ở round tiếp theo.
     */

    const nextEventResult =
      await generateNextEvent(
        supabaseAdmin,

        session.id,

        room.id,

        nextRound
      );

    if (
      !nextEventResult.success ||
      !nextEventResult.event
    ) {
      console.error(
        "RESOLVE - NEXT EVENT ERROR:",
        nextEventResult.error
      );

      await supabaseAdmin
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
          "phase",
          "resolving"
        )
        .eq(
          "current_event_id",
          eventId
        );

      await syncGameState(
        supabaseAdmin,

        session.id,

        eventId,

        session.round,

        "choosing"
      );

      return NextResponse.json(
        {
          error:
            nextEventResult.error ||
            "Không thể tạo round tiếp theo.",
        },
        {
          status: 500,
        }
      );
    }

    const nextEvent =
      nextEventResult.event;

    /*
     * --------------------------------------------------------
     * 23. UPDATE SESSION
     * --------------------------------------------------------
     */

    const {
      error:
        nextSessionError,
    } = await supabaseAdmin
      .from("game_sessions")
      .update({
        round:
          nextRound,

        phase:
          "choosing",

        current_event_id:
          nextEvent.id,
      })
      .eq(
        "id",
        session.id
      )
      .eq(
        "phase",
        "resolving"
      )
      .eq(
        "current_event_id",
        eventId
      );

    if (nextSessionError) {
      console.error(
        "RESOLVE - NEXT SESSION ERROR:",
        nextSessionError
      );

      return NextResponse.json(
        {
          error:
            "Không thể chuyển sang round tiếp theo.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 24. UPDATE GAME STATE
     * --------------------------------------------------------
     */

    const {
      error:
        nextStateError,
    } = await syncGameState(
      supabaseAdmin,

      session.id,

      nextEvent.id,

      nextRound,

      "choosing"
    );

    if (nextStateError) {
      console.error(
        "RESOLVE - NEXT STATE ERROR:",
        nextStateError
      );

      return NextResponse.json(
        {
          error:
            "Không thể cập nhật game state round tiếp theo.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * 25. SUCCESS
     * --------------------------------------------------------
     */

    return NextResponse.json({
      success: true,

      resolved: true,

      triggeredBy:
        developerSession
          ? "developer"
          : "player",

      previousRound:
        session.round,

      nextRound,

      previousEventId:
        eventId,

      nextEventId:
        nextEvent.id,

      progress:
        prepared.progress,

      players:
        appliedPlayers,

      message:
        `Round ${session.round} đã được AI Host xử lý. Round ${nextRound} bắt đầu.`,
    });
  } catch (error) {
    console.error(
      "RESOLVE - UNEXPECTED ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Lỗi máy chủ khi resolve event.",
      },
      {
        status: 500,
      }
    );
  }
}