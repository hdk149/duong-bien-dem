import type {
  AIEvent,
  AIPlayerEffects,
} from "./ai/schema";

import type {
  PlayerStats,
} from "./stats";

import {
  resolvePlayerStats,
} from "./stat-resolver";

/* =====================================================
   PLAYER RESULT APPLICATION
   ===================================================== */

export type PlayerResultApplication = {
  playerId: string;

  event: AIEvent;

  selectedChoiceId: string | null;

  before: PlayerStats;

  effects: AIPlayerEffects;

  after: PlayerStats;
};

/* =====================================================
   APPLY PLAYER RESULT
   =====================================================

   IMPORTANT:

   Event comes from the player's actual
   player_round_events record.

   Effects come from the AI outcome resolver.

   This prevents the resolve layer from accidentally
   using a different event than the one the player
   actually saw.
   ===================================================== */

export function applyPlayerResult(
  currentStats: PlayerStats,
  playerId: string,
  event: AIEvent,
  effects: AIPlayerEffects,
  selectedChoiceId: string | null
): PlayerResultApplication {
  const resolved =
    resolvePlayerStats(
      currentStats,
      effects
    );

  return {
    playerId,

    event,

    selectedChoiceId,

    before:
      resolved.before,

    effects:
      resolved.effects,

    after:
      resolved.after,
  };
}