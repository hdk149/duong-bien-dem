export type PlayerStats = {
  hp: number;
  money: number;
  location: string;
  legal_risk: number;
};

export type StatEffects = {
  hp?: number;
  money?: number;
  location?: string;
  legal_risk?: number;
};

export type AppliedPlayerStats = {
  before: PlayerStats;
  effects: StatEffects;
  after: PlayerStats;
};

const MIN_HP = 0;
const MAX_HP = 100;

const MIN_LEGAL_RISK = 0;
const MAX_LEGAL_RISK = 10;

export function applyPlayerStats(
  current: PlayerStats,
  effects: StatEffects
): AppliedPlayerStats {
  const before: PlayerStats = {
    hp: current.hp,
    money: current.money,
    location: current.location,
    legal_risk: current.legal_risk,
  };

  const after: PlayerStats = {
    hp: clamp(
      current.hp + (effects.hp ?? 0),
      MIN_HP,
      MAX_HP
    ),

    money: Math.max(
      0,
      current.money + (effects.money ?? 0)
    ),

    location:
      typeof effects.location === "string" &&
      effects.location.trim().length > 0
        ? effects.location.trim()
        : current.location,

    legal_risk: clamp(
      current.legal_risk + (effects.legal_risk ?? 0),
      MIN_LEGAL_RISK,
      MAX_LEGAL_RISK
    ),
  };

  return {
    before,
    effects,
    after,
  };
}

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.min(Math.max(value, min), max);
}