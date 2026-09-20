import type {
  PlayerStats,
  StatEffects,
} from "./stats";

import { validateEffects } from "./effects";

import {
  clampHp,
  clampLegalRisk,
  clampMoney,
} from "./rules";

export type ResolvedPlayerStats = {
  before: PlayerStats;
  effects: StatEffects;
  after: PlayerStats;
};

export function resolvePlayerStats(
  current: PlayerStats,
  rawEffects: unknown
): ResolvedPlayerStats {
  const effects = validateEffects(rawEffects);

  const after: PlayerStats = {
    hp: clampHp(
      current.hp + (effects.hp ?? 0)
    ),

    money: clampMoney(
      current.money + (effects.money ?? 0)
    ),

    location:
      effects.location !== undefined
        ? effects.location
        : current.location,

    legal_risk: clampLegalRisk(
      current.legal_risk +
        (effects.legal_risk ?? 0)
    ),
  };

  return {
    before: current,
    effects,
    after,
  };
}