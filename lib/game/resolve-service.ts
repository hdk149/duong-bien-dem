import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  EventData,
  Player,
  PlayerVote,
} from "./types";

import {
  resolveRound,
  type ResolvePlayerRoundEvent,
} from "./round-resolver";

import {
  updatePlayerStatsWithHistory,
} from "./player-stats-service";

/* ============================================================
   TYPES
   ============================================================ */

export type ResolveRoundServiceInput = {
  supabase: SupabaseClient;

  roomId: string;
  sessionId: string;
  round: number;

  event: EventData;

  players: Player[];
  votes: PlayerVote[];
};

export type AppliedPlayerResult = {
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
};

export type ResolveRoundServiceResult = {
  round: number;

  event: EventData;

  appliedPlayers: AppliedPlayerResult[];

  /*
   * AI-generated events for the next round.
   *
   * These were generated in the same Gemini request
   * that resolved the current round.
   */
  nextEvents: import("./ai/validate").ValidatedAIEventResponse;

  resolveResult: {
    resolved: true;
    round: number;
    votes: Array<{
      player_id: string;
      player_name: string;
      choice_id: string;
    }>;
    players: AppliedPlayerResult[];
    effects: Array<{
      player_id: string;
      hp_before: number;
      hp_after: number;
      money_before: number;
      money_after: number;
      location_before: string;
      location_after: string;
      legal_risk_before: number;
      legal_risk_after: number;
      effects: unknown;
    }>;
  };
};

/* ============================================================
   RESOLVE CURRENT ROUND
   ============================================================

   Service này xử lý DUY NHẤT round hiện tại:

   1. Load private player events
   2. AI resolve outcome
   3. Apply stats
   4. Write player_stat_history
   5. Mark player events resolved
   6. Save shared game event result

   Nó KHÔNG:
   - đổi game_sessions sang round mới
   - tạo next event
   - update game_states sang round mới
   - reset last_choice

   Việc chuyển round vẫn do route/controller quản lý.
   ============================================================ */

type ServerMoneyQuestData = {
  reward: number;
  job: string;
  reward_status?: string;
};

function getServerMoneyQuestData(
  playerEvent: ResolvePlayerRoundEvent & {
    result?: unknown;
  }
): ServerMoneyQuestData | null {
  if (
    playerEvent.event_type !==
    "money_main_quest"
  ) {
    return null;
  }

  if (
    !playerEvent.result ||
    typeof playerEvent.result !== "object" ||
    Array.isArray(playerEvent.result)
  ) {
    return null;
  }

  const root =
    playerEvent.result as Record<
      string,
      unknown
    >;

  const raw =
    root.server_money_quest;

  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return null;
  }

  const data =
    raw as Record<string, unknown>;

  const reward =
    typeof data.reward === "number"
      ? data.reward
      : NaN;

  const job =
    typeof data.job === "string"
      ? data.job
      : "";

  if (
    !Number.isFinite(reward) ||
    reward < 20_000_000 ||
    reward > 50_000_000 ||
    reward % 1_000_000 !== 0 ||
    !job.trim()
  ) {
    throw new Error(
      "Money Main Quest server reward is invalid."
    );
  }

  return {
    reward,
    job,
    reward_status:
      typeof data.reward_status === "string"
        ? data.reward_status
        : "pending",
  };
}

export async function resolveCurrentRound(
  input: ResolveRoundServiceInput
): Promise<ResolveRoundServiceResult> {
  const {
    supabase,
    roomId,
    sessionId,
    round,
    event,
    players,
    votes,
  } = input;

  /* ==========================================================
     1. BASIC VALIDATION
     ========================================================== */

  if (players.length === 0) {
    throw new Error(
      "Cannot resolve round without active players."
    );
  }

  if (votes.length !== players.length) {
    throw new Error(
      `Expected ${players.length} votes, received ${votes.length}.`
    );
  }

  /* ==========================================================
     2. LOAD CURRENT PRIVATE PLAYER EVENTS
     ========================================================== */

  const playerIds = players.map(
    (player) => player.id
  );

  const {
    data: currentPlayerEvents,
    error: currentPlayerEventsError,
  } = await supabase
    .from("player_round_events")
    .select(`
      id,
      player_id,
      title,
      description,
      event_type,
      choices,
      selected_choice_id,
      source_event_id,
      result
    `)
    .eq(
      "session_id",
      sessionId
    )
    .eq(
      "round",
      round
    )
    .in(
      "player_id",
      playerIds
    );

  if (currentPlayerEventsError) {
    throw new Error(
      `Không thể tải event riêng của người chơi: ${currentPlayerEventsError.message}`
    );
  }

  if (
    !currentPlayerEvents ||
    currentPlayerEvents.length !== players.length
  ) {
    throw new Error(
      `Expected ${players.length} player events, received ${
        currentPlayerEvents?.length ?? 0
      }.`
    );
  }

  const playerEvents =
    currentPlayerEvents as (
      ResolvePlayerRoundEvent & {
        result?: unknown;
      }
    )[];

  /* ==========================================================
     3. RESOLVE ROUND
     ========================================================== */

  const resolvedRound =
    await resolveRound({
      round,

      event,

      players,

      votes,

      playerEvents,
    });

  /* ==========================================================
     SERVER MONEY MAIN QUEST REWARD

     ONLY money_main_quest is touched here.
     The server-selected reward replaces the AI money delta.
     ========================================================== */

  for (const resolvedPlayer of resolvedRound.players) {
    const playerEvent =
      playerEvents.find(
        (item) =>
          item.player_id ===
          resolvedPlayer.player.id
      );

    if (!playerEvent) {
      throw new Error(
        `Player event missing for player ${resolvedPlayer.player.id}.`
      );
    }

    const serverMoneyQuest =
      getServerMoneyQuestData(
        playerEvent
      );

    if (!serverMoneyQuest) {
      continue;
    }

    const beforeMoney =
      resolvedPlayer.application.before.money;

    resolvedPlayer.application = {
      ...resolvedPlayer.application,

      effects: {
        ...(
          resolvedPlayer.application.effects as Record<
            string,
            unknown
          >
        ),
        money:
          serverMoneyQuest.reward,
      },

      after: {
        ...resolvedPlayer.application.after,
        money:
          beforeMoney +
          serverMoneyQuest.reward,
      },
    };
  }

  /* ==========================================================
     4. SAVE RESOLVED PLAYER EVENTS
     
     Lưu kết quả AI vào player_round_events trước khi
     apply stats.

     Status vẫn pending cho tới khi stats/history thành công.
     ========================================================== */

  const playerEventRows =
    resolvedRound.players.map(
      (resolvedPlayer) => {
        const sourcePlayerEvent =
          playerEvents.find(
            (item) =>
              item.player_id ===
              resolvedPlayer.player.id
          );

        if (!sourcePlayerEvent) {
          throw new Error(
            `Player event missing for player ${resolvedPlayer.player.id}.`
          );
        }

        const serverMoneyQuest =
          getServerMoneyQuestData(
            sourcePlayerEvent
          );

        return {
        room_id:
          roomId,

        session_id:
          sessionId,

        round,

        player_id:
          resolvedPlayer.player.id,

        source_event_id:
          event.id,

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
          ...(
            serverMoneyQuest
              ? {
                  server_money_quest: {
                    ...serverMoneyQuest,
                    reward_status:
                      "paid",
                  },
                }
              : {}
          ),

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
            event.id,

          selected_choice_id:
            resolvedPlayer
              .application
              .selectedChoiceId,
        },

        status:
          "pending",
        };
      }
    );

  const {
    data: savedPlayerEvents,
    error: playerEventsError,
  } = await supabase
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
    !savedPlayerEvents ||
    savedPlayerEvents.length !==
      playerEventRows.length
  ) {
    throw new Error(
      `Không thể lưu event riêng của người chơi: ${
        playerEventsError?.message ??
        "số lượng player event không khớp"
      }`
    );
  }

  /* ==========================================================
     5. MAP PLAYER EVENT
     ========================================================== */

  const playerEventMap =
    new Map<
      string,
      typeof savedPlayerEvents[number]
    >();

  for (
    const playerEvent of
      savedPlayerEvents
  ) {
    playerEventMap.set(
      playerEvent.player_id,
      playerEvent
    );
  }

  /* ==========================================================
     6. APPLY STATS + HISTORY
     ========================================================== */

  const appliedPlayers:
    AppliedPlayerResult[] = [];

  for (
    const resolvedPlayer of
      resolvedRound.players
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
      resolvedPlayer.application;

    await updatePlayerStatsWithHistory(
      supabase,
      {
        roomId,

        sessionId,

        playerId:
          resolvedPlayer.player.id,

        round,

        eventId:
          event.id,

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
        resolvedPlayer.player.id,

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
        application.before.legal_risk,

      legal_risk_after:
        application.after.legal_risk,

      effects:
        application.effects,
    });
  }

  /* ==========================================================
     7. MARK PLAYER EVENTS RESOLVED
     ========================================================== */

  const resolvedAt =
    new Date().toISOString();

  const {
    error: markResolvedError,
  } = await supabase
    .from("player_round_events")
    .update({
      status:
        "resolved",

      resolved_at:
        resolvedAt,
    })
    .eq(
      "session_id",
      sessionId
    )
    .eq(
      "round",
      round
    )
    .in(
      "player_id",
      playerIds
    );

  if (markResolvedError) {
    throw new Error(
      `Không thể hoàn tất player events: ${markResolvedError.message}`
    );
  }

  /* ==========================================================
     8. BUILD SHARED ROUND RESULT
     ========================================================== */

  const resolveResult = {
    resolved:
      true as const,

    round,

    votes:
      resolvedRound.players.map(
        (resolvedPlayer) => ({
          player_id:
            resolvedPlayer.player.id,

          player_name:
            resolvedPlayer.player
              .player_name,

          choice_id:
            resolvedPlayer.vote.choice_id,
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

  /* ==========================================================
     9. SAVE GAME EVENT RESULT
     ========================================================== */

  const {
    error: resultError,
  } = await supabase
    .from("game_events")
    .update({
      result:
        resolveResult,
    })
    .eq(
      "id",
      event.id
    )
    .eq(
      "session_id",
      sessionId
    );

  if (resultError) {
    throw new Error(
      `Không thể lưu kết quả event: ${resultError.message}`
    );
  }

  /* ==========================================================
     10. RETURN
     ========================================================== */

  return {
  round,

  event,

  appliedPlayers,

  nextEvents:
    resolvedRound.nextEvents,

  resolveResult,
};
}