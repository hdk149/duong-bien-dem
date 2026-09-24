import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type {
  BackendChoice,
  EventData,
  Player,
  PlayerVote,
} from "@/lib/game/types";

import { getVoteProgress } from "@/lib/game/vote";
import { generatePlayerRoundEvents } from "@/lib/game/rounds";
import { resolveCurrentRound } from "@/lib/game/resolve-service";

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

/* =====================================================
   FALLBACK EVENT
   ===================================================== */

function getFallbackEvent(
  round: number
) {
  return {
    round,

    title:
      `Một ngày mới - Vòng ${round}`,

    description:
      "Bạn tiếp tục hành trình và phải đưa ra một quyết định mới.",

    event_type:
      "normal",

    choices: [
      {
        id: "a",

        title:
          "Tiếp tục tiến lên",

        description:
          "Bạn quyết định tiếp tục hành trình.",
      },

      {
        id: "b",

        title:
          "Tìm cơ hội kiếm tiền",

        description:
          "Bạn dành thời gian tìm một cơ hội mới.",
      },

      {
        id: "c",

        title:
          "Nghỉ ngơi",

        description:
          "Bạn tạm thời nghỉ ngơi để chuẩn bị cho chặng tiếp theo.",
      },

      {
        id: "d",

        title:
          "Khám phá khu vực",

        description:
          "Bạn khám phá nơi mình đang ở.",
      },
    ],
  };
}

/* =====================================================
   EMPTY UUID
   ===================================================== */

const EMPTY_UUID =
  "00000000-0000-0000-0000-000000000000";

/* =====================================================
   SHOP SCHEDULE
   ===================================================== */

const SHOP_INTERVAL = 6;

/* =====================================================
   GET ACTIVE PLAYERS
   ===================================================== */

async function getActivePlayers(
  roomId: string
): Promise<{
  players: Player[];
  error: unknown | null;
}> {
  const {
    data,
    error,
  } = await supabase
    .from("room_players")
    .select(`
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
    `)
    .eq(
      "room_id",
      roomId
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

  if (error) {
    return {
      players: [],
      error,
    };
  }

  const players: Player[] =
    (data ?? []).map(
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
      })
    );

  return {
    players,
    error: null,
  };
}

/* =====================================================
   SYNC GAME STATE
   ===================================================== */

async function syncGameState(
  sessionId: string,
  roomId: string,
  round: number,
  phase: string,
  currentEventId: string | null
) {
  const {
    error,
  } = await supabase
    .from("game_states")
    .update({
      room_id:
        roomId,

      session_id:
        sessionId,

      round,

      phase,

      current_event_id:
        currentEventId,

      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "session_id",
      sessionId
    );

  if (error) {
    console.error(
      "SYNC GAME STATE ERROR:",
      error
    );
  }
}

/* =====================================================
   GENERATE NEXT EVENT
   ===================================================== */

async function generateNextEvent(
  roomId: string,
  sessionId: string,
  round: number
) {
  const {
    data: existingEvent,
    error:
      existingEventError,
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
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "session_id",
      sessionId
    )
    .eq(
      "round",
      round
    )
    .maybeSingle();

  if (existingEventError) {
    console.error(
      "NEXT EVENT CHECK ERROR:",
      existingEventError
    );

    throw new Error(
      "Không thể kiểm tra event tiếp theo."
    );
  }

  if (existingEvent) {
    return existingEvent;
  }

  const fallback =
    getFallbackEvent(
      round
    );

  const {
    data: newEvent,
    error:
      createEventError,
  } = await supabase
    .from("game_events")
    .insert({
      room_id:
        roomId,

      session_id:
        sessionId,

      round,

      title:
        fallback.title,

      description:
        fallback.description,

      event_type:
        fallback.event_type,

      choices:
        fallback.choices,

      result:
        null,
    })
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
    .single();

  if (createEventError) {
    if (
      createEventError.code ===
      "23505"
    ) {
      const {
        data: raceEvent,
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
        .eq(
          "room_id",
          roomId
        )
        .eq(
          "session_id",
          sessionId
        )
        .eq(
          "round",
          round
        )
        .maybeSingle();

      if (raceEvent) {
        return raceEvent;
      }
    }

    console.error(
      "NEXT EVENT CREATE ERROR:",
      createEventError
    );

    throw new Error(
      "Không thể tạo event tiếp theo."
    );
  }

  return newEvent;
}

/* =====================================================
   LOAD PRIVATE PLAYER EVENT
   ===================================================== */

async function getPlayerRoundEvent(
  roomId: string,
  sessionId: string,
  round: number,
  playerId: string,
  playerEventId: string
) {
  const {
    data,
    error,
  } = await supabase
    .from("player_round_events")
    .select(`
      id,
      room_id,
      session_id,
      round,
      player_id,
      source_event_id,
      title,
      description,
      event_type,
      choices,
      selected_choice_id,
      result,
      status
    `)
    .eq(
      "id",
      playerEventId
    )
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "session_id",
      sessionId
    )
    .eq(
      "round",
      round
    )
    .eq(
      "player_id",
      playerId
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Không thể tải player event: ${error.message}`
    );
  }

  return data;
}

/* =====================================================
   AUTO RESOLVE
   ===================================================== */

async function autoResolve(
  roomId: string,
  sessionId: string,
  eventId: string,
  round: number
) {
  /* ===================================================
     1. LOAD ACTIVE PLAYERS AGAIN
     =================================================== */

  const {
    players,
    error:
      activePlayersError,
  } = await getActivePlayers(
    roomId
  );

  console.log(
    "ACTIVE PLAYERS DEBUG:",
    players.map((p) => ({
      id:
        p.id,

      name:
        p.player_name,

      role:
        p.role,

      choice:
        p.last_choice,
    }))
  );

  if (activePlayersError) {
    console.error(
      "AUTO RESOLVE ACTIVE PLAYERS ERROR:",
      activePlayersError
    );

    return {
      resolved: false,
      alreadyResolving: false,
    };
  }

  if (
    players.length === 0
  ) {
    console.warn(
      "AUTO RESOLVE ABORTED: NO ACTIVE PLAYERS"
    );

    return {
      resolved: false,
      alreadyResolving: false,
    };
  }

  /* ===================================================
     2. ATOMIC CLAIM
     =================================================== */

  const {
    data: claimedSession,
    error:
      claimError,
  } = await supabase
    .from("game_sessions")
    .update({
      phase:
        "resolving",
    })
    .eq(
      "id",
      sessionId
    )
    .eq(
      "status",
      "active"
    )
    .eq(
      "round",
      round
    )
    .eq(
      "phase",
      "choosing"
    )
    .eq(
      "current_event_id",
      eventId
    )
    .select(`
      id,
      room_id,
      round,
      phase,
      current_event_id
    `)
    .maybeSingle();

  if (claimError) {
    console.error(
      "RESOLVE CLAIM ERROR:",
      claimError
    );

    return {
      resolved: false,
      alreadyResolving: false,
    };
  }

  if (!claimedSession) {
    return {
      resolved: false,
      alreadyResolving: true,
    };
  }

  /* ===================================================
     3. SYNC RESOLVING
     =================================================== */

  await syncGameState(
    sessionId,
    roomId,
    round,
    "resolving",
    eventId
  );

  /* ===================================================
     4. ACTIVE PLAYER IDS
     =================================================== */

  const playerIds =
    players.map(
      (player) =>
        player.id
    );

  /* ===================================================
     5. GET VOTES
     =================================================== */

  const {
    data: choiceRows,
    error:
      choiceRowsError,
  } = await supabase
    .from("player_choices")
    .select(`
      player_id,
      choice_id
    `)
    .eq(
      "session_id",
      sessionId
    )
    .eq(
      "event_id",
      eventId
    )
    .in(
      "player_id",
      playerIds.length > 0
        ? playerIds
        : [EMPTY_UUID]
    );

  if (choiceRowsError) {
    console.error(
      "RESOLVE VOTES ERROR:",
      choiceRowsError
    );

    await supabase
      .from("game_sessions")
      .update({
        phase:
          "choosing",
      })
      .eq(
        "id",
        sessionId
      )
      .eq(
        "status",
        "active"
      )
      .eq(
        "round",
        round
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
      sessionId,
      roomId,
      round,
      "choosing",
      eventId
    );

    return {
      resolved: false,
      alreadyResolving: false,
    };
  }

  const votes: PlayerVote[] =
    (
      choiceRows ??
      []
    ).map(
      (row) => ({
        player_id:
          row.player_id,

        choice_id:
          row.choice_id,
      })
    );

  /* ===================================================
     6. FINAL PROGRESS CHECK
     =================================================== */

  const finalProgress =
    getVoteProgress(
      players,
      votes
    );

  console.log(
    "AUTO RESOLVE FINAL PROGRESS:",
    {
      roomId,

      sessionId,

      eventId,

      round,

      chosenPlayers:
        finalProgress.chosenPlayers,

      totalPlayers:
        finalProgress.totalPlayers,

      allPlayersChosen:
        finalProgress.allPlayersChosen,
    }
  );

  if (
    !finalProgress.allPlayersChosen
  ) {
    console.warn(
      "RESOLVE CLAIMED BUT NOT ALL ACTIVE PLAYERS VOTED:",
      {
        sessionId,

        eventId,

        round,

        chosenPlayers:
          finalProgress.chosenPlayers,

        totalPlayers:
          finalProgress.totalPlayers,
      }
    );

    await supabase
      .from("game_sessions")
      .update({
        phase:
          "choosing",
      })
      .eq(
        "id",
        sessionId
      )
      .eq(
        "status",
        "active"
      )
      .eq(
        "round",
        round
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
      sessionId,
      roomId,
      round,
      "choosing",
      eventId
    );

    return {
      resolved: false,
      alreadyResolving: false,
    };
  }

  if (
    finalProgress.chosenPlayers !==
    finalProgress.totalPlayers
  ) {
    console.error(
      "RESOLVE PLAYER COUNT MISMATCH:",
      finalProgress
    );

    await supabase
      .from("game_sessions")
      .update({
        phase:
          "choosing",
      })
      .eq(
        "id",
        sessionId
      )
      .eq(
        "status",
        "active"
      )
      .eq(
        "round",
        round
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
      sessionId,
      roomId,
      round,
      "choosing",
      eventId
    );

    return {
      resolved: false,
      alreadyResolving: false,
    };
  }

  /* ===================================================
     7. LOAD FULL SOURCE EVENT
     
     QUAN TRỌNG:
     resolveCurrentRound() cần event đầy đủ.
     =================================================== */

  const {
    data: currentEvent,
    error:
      currentEventError,
  } = await supabase
    .from("game_events")
    .select("*")
    .eq(
      "id",
      eventId
    )
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "session_id",
      sessionId
    )
    .eq(
      "round",
      round
    )
    .maybeSingle();

  if (
    currentEventError ||
    !currentEvent
  ) {
    console.error(
      "RESOLVE LOAD FULL EVENT ERROR:",
      currentEventError
    );

    await supabase
      .from("game_sessions")
      .update({
        phase:
          "choosing",
      })
      .eq(
        "id",
        sessionId
      )
      .eq(
        "status",
        "active"
      )
      .eq(
        "round",
        round
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
      sessionId,
      roomId,
      round,
      "choosing",
      eventId
    );

    return {
      resolved: false,
      alreadyResolving: false,
    };
  }

  const fullEvent =
    currentEvent as EventData;

  /* ===================================================
     8. REAL ROUND RESOLUTION
     
     ĐÂY LÀ PHẦN BỊ THIẾU TRƯỚC ĐÂY.

     resolveCurrentRound():
     - resolve AI outcome
     - applyPlayerResult
     - money-engine
     - update player stats
     - write player_stat_history
     - write player_round_events.result
     - mark player_round_events resolved
     - write game_events.result
     =================================================== */

  let resolvedService;

  try {
    console.log(
      "AUTO RESOLVE → CALL resolveCurrentRound",
      {
        roomId,
        sessionId,
        eventId,
        round,
        players:
          players.length,
        votes:
          votes.length,
      }
    );

    resolvedService =
      await resolveCurrentRound({
        supabase,

        roomId,

        sessionId,

        round,

        event:
          fullEvent,

        players,

        votes,
      });

    console.log(
      "AUTO RESOLVE → resolveCurrentRound SUCCESS",
      {
        roomId,

        sessionId,

        eventId,

        round,

        appliedPlayers:
          resolvedService.appliedPlayers.map(
            (item) => ({
              player_id:
                item.player_id,

              money_before:
                item.money_before,

              money_after:
                item.money_after,

              effects:
                item.effects,
            })
          ),
      }
    );
  } catch (error) {
    console.error(
      "AUTO RESOLVE → resolveCurrentRound ERROR:",
      error
    );

    await supabase
      .from("game_sessions")
      .update({
        phase:
          "choosing",
      })
      .eq(
        "id",
        sessionId
      )
      .eq(
        "status",
        "active"
      )
      .eq(
        "round",
        round
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
      sessionId,
      roomId,
      round,
      "choosing",
      eventId
    );

    return {
      resolved: false,
      alreadyResolving: false,
      error:
        error instanceof Error
          ? error.message
          : "Không thể resolve round.",
    };
  }

  /* ===================================================
     9. RESET LAST CHOICE
     =================================================== */

  const {
    error:
      resetChoiceError,
  } = await supabase
    .from("room_players")
    .update({
      last_choice:
        null,
    })
    .eq(
      "room_id",
      roomId
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
      "RESOLVE RESET CHOICE ERROR:",
      resetChoiceError
    );
  }

  /* ===================================================
     10. NEXT ROUND
     =================================================== */

  const nextRound =
    round + 1;

  const nextEvent =
    await generateNextEvent(
      roomId,
      sessionId,
      nextRound
    );

  /* ===================================================
     11. GENERATE PRIVATE PLAYER EVENTS
     =================================================== */

  const {
    players: nextRoundPlayers,
    error:
      nextRoundPlayersError,
  } = await getActivePlayers(
    roomId
  );

  if (nextRoundPlayersError) {
    console.error(
      "RESOLVE NEXT ROUND PLAYERS ERROR:",
      nextRoundPlayersError
    );

    return {
      resolved: false,
      alreadyResolving: false,
      error:
        "Không thể lấy người chơi cho round tiếp theo.",
    };
  }

  try {
    await generatePlayerRoundEvents({
      supabase,

      roomId,

      sessionId,

      round:
        nextRound,

      players:
        nextRoundPlayers,

      sourceEventId:
        nextEvent.id,
    });
  } catch (error) {
    console.error(
      "RESOLVE GENERATE PRIVATE EVENTS ERROR:",
      error
    );

    return {
      resolved: false,
      alreadyResolving: false,
      error:
        error instanceof Error
          ? error.message
          : "Không thể tạo player events.",
    };
  }

  /* ===================================================
     12. SHOP TRANSITION
     =================================================== */

  const shouldOpenShop =
    round > 0 &&
    round % SHOP_INTERVAL === 0;

  const nextPhase =
    shouldOpenShop
      ? "shop"
      : "choosing";

  /* ===================================================
     13. MOVE TO NEXT ROUND
     =================================================== */

  const {
    data: nextSession,
    error:
      nextSessionError,
  } = await supabase
    .from("game_sessions")
    .update({
      round:
        nextRound,

      phase:
        nextPhase,

      current_event_id:
        nextEvent.id,
    })
    .eq(
      "id",
      sessionId
    )
    .eq(
      "status",
      "active"
    )
    .eq(
      "round",
      round
    )
    .eq(
      "phase",
      "resolving"
    )
    .eq(
      "current_event_id",
      eventId
    )
    .select(`
      id,
      room_id,
      round,
      phase,
      current_event_id
    `)
    .maybeSingle();

  if (nextSessionError) {
    console.error(
      "RESOLVE NEXT SESSION ERROR:",
      nextSessionError
    );

    return {
      resolved: false,
      alreadyResolving: false,
      error:
        nextSessionError.message,
    };
  }

  if (!nextSession) {
    return {
      resolved: false,
      alreadyResolving: true,
    };
  }

  /* ===================================================
     14. SYNC NEXT ROUND
     =================================================== */

  await syncGameState(
    sessionId,
    roomId,
    nextRound,
    nextPhase,
    nextEvent.id
  );

  /* ===================================================
     DONE
     =================================================== */

  return {
    resolved:
      true,

    alreadyResolving:
      false,

    previousRound:
      round,

    nextRound:
      nextRound,

    nextPhase:
      nextPhase,

    previousEventId:
      eventId,

    nextEventId:
      nextEvent.id,
  };
}

/* =====================================================
   POST
   ===================================================== */

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { code } =
      await context.params;

    const roomCode =
      String(
        code ?? ""
      ).trim();

    /* ===================================================
       VALIDATE ROOM CODE
       =================================================== */

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

    /* ===================================================
       PLAYER TOKEN
       =================================================== */

    const token =
      request.headers.get(
        "x-player-token"
      );

    if (!token) {
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

    /* ===================================================
       REQUEST BODY
       =================================================== */

    let body: {
      event_id?: string;
      choice_id?: string;
    };

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "Dữ liệu gửi lên không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    const playerEventId =
      String(
        body.event_id ??
          ""
      ).trim();

    const choiceId =
      String(
        body.choice_id ??
          ""
      ).trim();

    if (!playerEventId) {
      return NextResponse.json(
        {
          error:
            "Thiếu event_id.",
        },
        {
          status: 400,
        }
      );
    }

    if (!choiceId) {
      return NextResponse.json(
        {
          error:
            "Thiếu choice_id.",
        },
        {
          status: 400,
        }
      );
    }

    /* ===================================================
       ROOM
       =================================================== */

    const {
      data: room,
      error: roomError,
    } = await supabase
      .from("rooms")
      .select(`
        id,
        code,
        status
      `)
      .eq(
        "code",
        roomCode
      )
      .maybeSingle();

    if (roomError) {
      console.error(
        "CHOOSE ROOM ERROR:",
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

    /* ===================================================
       PLAYER AUTH
       =================================================== */

    const {
      data: player,
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
        legal_risk,
        is_connected,
        player_token,
        last_choice,
        moderation_status
      `)
      .eq(
        "room_id",
        room.id
      )
      .eq(
        "player_token",
        token
      )
      .eq(
        "moderation_status",
        "active"
      )
      .maybeSingle();

    if (playerError) {
      console.error(
        "CHOOSE PLAYER ERROR:",
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
            "Bạn không còn là thành viên hoạt động của phòng này.",
        },
        {
          status: 403,
        }
      );
    }

    /* ===================================================
       ONLY NON-SPECTATOR CAN VOTE
       =================================================== */

    if (
      player.role ===
      "spectator"
    ) {
      return NextResponse.json(
        {
          error:
            "Khán giả không được lựa chọn.",
        },
        {
          status: 403,
        }
      );
    }

    /* ===================================================
       ACTIVE SESSION
       =================================================== */

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
        current_event_id
      `)
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
          ascending:
            false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      console.error(
        "CHOOSE SESSION ERROR:",
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
            "Không tìm thấy game session đang chạy.",
        },
        {
          status: 404,
        }
      );
    }

    /* ===================================================
       MUST BE CHOOSING
       =================================================== */

    if (
      session.phase !==
      "choosing"
    ) {
      return NextResponse.json(
        {
          error:
            "Hiện tại không phải thời gian lựa chọn.",

          phase:
            session.phase,
        },
        {
          status: 409,
        }
      );
    }

    /* ===================================================
       CURRENT SHARED EVENT
       =================================================== */

    const sourceEventId =
      session.current_event_id;

    const eventId =
      sourceEventId;

    if (!sourceEventId) {
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

    /* ===================================================
       LOAD PRIVATE PLAYER EVENT
       =================================================== */

    const playerEvent =
      await getPlayerRoundEvent(
        room.id,
        session.id,
        session.round,
        player.id,
        playerEventId
      );

    const isPrivatePlayerEvent =
      Boolean(playerEvent);

    if (playerEvent) {
      if (
        playerEvent.status !==
        "pending"
      ) {
        return NextResponse.json(
          {
            error:
              "Player event này đã được xử lý.",

            status:
              playerEvent.status,
          },
          {
            status: 409,
          }
        );
      }

      if (
        playerEvent.source_event_id &&
        playerEvent.source_event_id !==
          sourceEventId
      ) {
        return NextResponse.json(
          {
            error:
              "Player event không thuộc event hiện tại.",
          },
          {
            status: 409,
          }
        );
      }
    } else if (
      playerEventId !==
      sourceEventId
    ) {
      return NextResponse.json(
        {
          error:
            "Player event không tồn tại hoặc không thuộc lượt hiện tại của bạn.",
        },
        {
          status: 404,
        }
      );
    }

    /* ===================================================
       LOAD SOURCE EVENT
       =================================================== */

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
      .eq(
        "id",
        sourceEventId
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
        "CHOOSE SOURCE EVENT ERROR:",
        eventError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra event.",
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
            "Source event không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    /* ===================================================
       VALIDATE EVENT ROUND
       =================================================== */

    if (
      event.round !==
      session.round
    ) {
      return NextResponse.json(
        {
          error:
            "Event không thuộc round hiện tại.",

          eventRound:
            event.round,

          sessionRound:
            session.round,
        },
        {
          status: 409,
        }
      );
    }

    /* ===================================================
       VALIDATE EVENT SESSION
       =================================================== */

    if (
      event.session_id !==
      session.id
    ) {
      return NextResponse.json(
        {
          error:
            "Event không thuộc session hiện tại.",
        },
        {
          status: 409,
        }
      );
    }

    /* ===================================================
       VALIDATE CHOICE
       =================================================== */

    const choices: BackendChoice[] =
      Array.isArray(
        isPrivatePlayerEvent
          ? playerEvent?.choices
          : event.choices
      )
        ? (
            isPrivatePlayerEvent
              ? playerEvent?.choices
              : event.choices
          )
        : [];

    const selectedChoice =
      choices.find(
        (
          choice
        ) => {
          if (!choice) {
            return false;
          }

          if (
            typeof choice ===
            "string"
          ) {
            return (
              choice ===
              choiceId
            );
          }

          return (
            String(
              choice.id ??
                choice.choice_id ??
                ""
            ) ===
            choiceId
          );
        }
      );

    if (!selectedChoice) {
      return NextResponse.json(
        {
          error:
            "Lựa chọn không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    /* ===================================================
       CHECK EXISTING CHOICE
       =================================================== */

    const {
      data: existingChoice,
      error:
        existingChoiceError,
    } = await supabase
      .from("player_choices")
      .select(`
        id,
        session_id,
        event_id,
        player_id,
        choice_id,
        created_at
      `)
      .eq(
        "event_id",
        sourceEventId
      )
      .eq(
        "player_id",
        player.id
      )
      .eq(
        "session_id",
        session.id
      )
      .maybeSingle();

    if (
      existingChoiceError
    ) {
      console.error(
        "CHOOSE EXISTING CHOICE ERROR:",
        existingChoiceError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra lựa chọn hiện tại.",
        },
        {
          status: 500,
        }
      );
    }

    if (existingChoice) {
      return NextResponse.json(
        {
          error:
            "Bạn đã lựa chọn cho event này.",

          alreadyChosen:
            true,

          choiceId:
            existingChoice.choice_id,
        },
        {
          status: 409,
        }
      );
    }

    /* ===================================================
       SAVE CHOICE
       =================================================== */

    const {
      data: savedChoice,
      error:
        saveChoiceError,
    } = await supabase
      .from("player_choices")
      .insert({
        session_id:
          session.id,

        event_id:
          sourceEventId,

        player_id:
          player.id,

        choice_id:
          choiceId,

        choice_data:
          typeof selectedChoice ===
          "string"
            ? {
                id:
                  choiceId,
              }
            : selectedChoice,
      })
      .select(`
        id,
        session_id,
        event_id,
        player_id,
        choice_id,
        choice_data,
        created_at
      `)
      .single();

    if (saveChoiceError) {
      if (
        saveChoiceError.code ===
        "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "Bạn đã lựa chọn cho event này.",

            alreadyChosen:
              true,
          },
          {
            status: 409,
          }
        );
      }

      console.error(
        "CHOOSE SAVE ERROR:",
        saveChoiceError
      );

      return NextResponse.json(
        {
          error:
            "Không thể lưu lựa chọn.",

          detail:
            saveChoiceError.message,
        },
        {
          status: 500,
        }
      );
    }

    /* ===================================================
       UPDATE LAST CHOICE
       =================================================== */

    const {
      error:
        updatePlayerError,
    } = await supabase
      .from("room_players")
      .update({
        last_choice:
          choiceId,
      })
      .eq(
        "id",
        player.id
      )
      .eq(
        "room_id",
        room.id
      )
      .eq(
        "moderation_status",
        "active"
      );

    if (updatePlayerError) {
      console.error(
        "CHOOSE PLAYER UPDATE ERROR:",
        updatePlayerError
      );
    }

    /* ===================================================
       UPDATE PRIVATE PLAYER EVENT
       =================================================== */

    if (
      isPrivatePlayerEvent &&
      playerEvent
    ) {
      const {
        error:
          updatePlayerEventError,
      } = await supabase
        .from("player_round_events")
        .update({
          selected_choice_id:
            choiceId,
        })
        .eq(
          "id",
          playerEvent.id
        )
        .eq(
          "player_id",
          player.id
        )
        .eq(
          "session_id",
          session.id
        )
        .eq(
          "round",
          session.round
        )
        .eq(
          "status",
          "pending"
        );

      if (
        updatePlayerEventError
      ) {
        console.error(
          "CHOOSE PLAYER EVENT UPDATE ERROR:",
          updatePlayerEventError
        );
      }
    }

    /* ===================================================
       RELOAD ACTIVE PLAYERS
       =================================================== */

    const {
      players,
      error:
        activePlayersError,
    } = await getActivePlayers(
      room.id
    );

    if (activePlayersError) {
      console.error(
        "CHOOSE ACTIVE PLAYERS ERROR:",
        activePlayersError
      );

      return NextResponse.json(
        {
          error:
            "Không thể lấy danh sách người chơi hoạt động.",
        },
        {
          status: 500,
        }
      );
    }

    /* ===================================================
       GET LATEST SESSION
       =================================================== */

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
        "CHOOSE LATEST SESSION ERROR:",
        latestSessionError
      );

      return NextResponse.json(
        {
          error:
            "Không thể xác nhận trạng thái game hiện tại.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !latestSession ||
      latestSession.round !==
        session.round ||
      latestSession.phase !==
        "choosing" ||
      latestSession.current_event_id !==
        eventId
    ) {
      return NextResponse.json({
        success:
          true,

        choice: {
          id:
            savedChoice.id,

          choice_id:
            savedChoice.choice_id,

          event_id:
            savedChoice.event_id,

          created_at:
            savedChoice.created_at,
        },

        progress: {
          chosenPlayers:
            0,

          totalPlayers:
            players.length,

          allPlayersChosen:
            false,
        },

        resolved:
          false,

        message:
          "Bạn đã gửi lựa chọn.",
      });
    }

    /* ===================================================
       GET ALL ACTIVE VOTES
       =================================================== */

    const activePlayerIds =
      players.map(
        (item) =>
          item.id
      );

    const {
      data: choicesForEvent,
      error:
        choicesCountError,
    } = await supabase
      .from("player_choices")
      .select(`
        player_id,
        choice_id
      `)
      .eq(
        "session_id",
        session.id
      )
      .eq(
        "event_id",
        sourceEventId
      )
      .in(
        "player_id",
        activePlayerIds.length >
          0
          ? activePlayerIds
          : [EMPTY_UUID]
      );

    if (choicesCountError) {
      console.error(
        "CHOOSE COUNT ERROR:",
        choicesCountError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra tiến độ lựa chọn.",
        },
        {
          status: 500,
        }
      );
    }

    const votes: PlayerVote[] =
      (
        choicesForEvent ??
        []
      ).map(
        (item) => ({
          player_id:
            item.player_id,

          choice_id:
            item.choice_id,
        })
      );

    /* ===================================================
       CALCULATE PROGRESS
       =================================================== */

    const progress =
      getVoteProgress(
        players,
        votes
      );

    console.log(
      "CHOOSE PROGRESS:",
      {
        roomId:
          room.id,

        sessionId:
          session.id,

        eventId,

        round:
          session.round,

        chosenPlayers:
          progress.chosenPlayers,

        totalPlayers:
          progress.totalPlayers,

        allPlayersChosen:
          progress.allPlayersChosen,
      }
    );

    /* ===================================================
       AUTO RESOLVE
       =================================================== */

    if (
      progress.allPlayersChosen
    ) {
      const resolve =
        await autoResolve(
          room.id,
          session.id,
          eventId,
          session.round
        );

      /* ===============================================
         RESOLVED
         =============================================== */

      if (
        resolve.resolved
      ) {
        return NextResponse.json({
          success:
            true,

          choice: {
            id:
              savedChoice.id,

            choice_id:
              savedChoice.choice_id,

            event_id:
              savedChoice.event_id,

            created_at:
              savedChoice.created_at,
          },

          progress,

          resolved:
            true,

          previousRound:
            resolve.previousRound,

          nextRound:
            resolve.nextRound,

          nextPhase:
            resolve.nextPhase,

          previousEventId:
            resolve.previousEventId,

          nextEventId:
            resolve.nextEventId,

          message:
            resolve.nextPhase ===
            "shop"
              ? `Round ${resolve.previousRound} đã kết thúc. Shop đã mở trước Round ${resolve.nextRound}.`
              : "Tất cả người chơi đã lựa chọn. Đang chuyển sang vòng tiếp theo.",
        });
      }

      /* ===============================================
         ANOTHER REQUEST IS RESOLVING
         =============================================== */

      if (
        resolve.alreadyResolving
      ) {
        return NextResponse.json({
          success:
            true,

          choice: {
            id:
              savedChoice.id,

            choice_id:
              savedChoice.choice_id,

            event_id:
              savedChoice.event_id,

            created_at:
              savedChoice.created_at,
          },

          progress,

          resolved:
            false,

          alreadyResolving:
            true,

          message:
            "Tất cả người chơi đã lựa chọn. Đang xử lý kết quả...",
        });
      }

      /* ===============================================
         RESOLVE FAILED
         =============================================== */

      return NextResponse.json(
        {
          success:
            false,

          choice: {
            id:
              savedChoice.id,

            choice_id:
              savedChoice.choice_id,

            event_id:
              savedChoice.event_id,

            created_at:
              savedChoice.created_at,
          },

          progress,

          resolved:
            false,

          error:
            resolve.error ??
            "Không thể xử lý kết quả round.",
        },
        {
          status: 500,
        }
      );
    }

    /* ===================================================
       NORMAL WAITING
       =================================================== */

    return NextResponse.json({
      success:
        true,

      choice: {
        id:
          savedChoice.id,

        choice_id:
          savedChoice.choice_id,

        event_id:
          savedChoice.event_id,

        created_at:
          savedChoice.created_at,
      },

      progress,

      resolved:
        false,

      message:
        "Bạn đã gửi lựa chọn. Đang chờ những người chơi khác...",
    });
  } catch (error) {
    console.error(
      "CHOOSE UNEXPECTED ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}