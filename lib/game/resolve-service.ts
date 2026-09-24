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
   * These were generated in the same AI request
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
   3. Save result vào đúng player_round_events
   4. Apply stats
   5. Write player_stat_history
   6. Mark player events resolved
   7. Save shared game event result

   Nó KHÔNG:
   - đổi game_sessions sang round mới
   - tạo next event
   - update game_states sang round mới
   - reset last_choice

   Việc chuyển round vẫn do route/controller quản lý.
   ============================================================ */

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
      room_id,
      session_id,
      round,
      player_id,
      title,
      description,
      event_type,
      choices,
      selected_choice_id,
      source_event_id,
      result,
      status,
      resolved_at
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
    currentPlayerEvents as ResolvePlayerRoundEvent[];

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
     4. MAP EXISTING PLAYER EVENTS
     
     QUAN TRỌNG:
     Không tạo/upsert event mới.

     player_round_events đã tồn tại từ lúc tạo event.
     Ta update ĐÚNG ROW bằng id của nó.
     ========================================================== */

  const playerEventMap =
    new Map<
      string,
      typeof currentPlayerEvents[number]
    >();

  for (
    const playerEvent of currentPlayerEvents
  ) {
    playerEventMap.set(
      playerEvent.player_id,
      playerEvent
    );
  }

  /* ==========================================================
     5. SAVE AI RESULT VÀO PLAYER EVENT
     
     Chỉ lưu result trước.
     Status vẫn pending cho tới khi stats/history thành công.
     ========================================================== */

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

    const {
      error: updatePlayerEventError,
    } = await supabase
      .from("player_round_events")
      .update({
        title:
          application.event.title,

        description:
          application.event.description,

        event_type:
          application.event.type,

        choices:
          application.event.choices,

        selected_choice_id:
          application.selectedChoiceId,

        result: {
          effects:
            application.effects,

          before:
            application.before,

          after:
            application.after,

          source_event_id:
            event.id,

          selected_choice_id:
            application.selectedChoiceId,
        },

        status:
          "pending",

        resolved_at:
          null,
      })
      .eq(
        "id",
        playerEvent.id
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
        resolvedPlayer.player.id
      );

    if (updatePlayerEventError) {
      throw new Error(
        `Không thể lưu kết quả player event ${playerEvent.id}: ${updatePlayerEventError.message}`
      );
    }
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

    /*
     * Đây là điểm duy nhất trong service
     * gửi after.money xuống DB.
     *
     * money-engine đã tính:
     *
     * before.money + effects.money
     *
     * thành:
     *
     * after.money
     */

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