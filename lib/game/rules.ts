export const GAME_RULES = {
  hp: {
    min: 0,
    max: 100,
  },

  legalRisk: {
    min: 0,
    max: 10,
  },

  money: {
    min: 0,
  },
} as const;

export function clampHp(hp: number): number {
  return Math.min(
    Math.max(hp, GAME_RULES.hp.min),
    GAME_RULES.hp.max
  );
}

export function clampLegalRisk(
  legalRisk: number
): number {
  return Math.min(
    Math.max(
      legalRisk,
      GAME_RULES.legalRisk.min
    ),
    GAME_RULES.legalRisk.max
  );
}

export function clampMoney(money: number): number {
  return Math.max(
    money,
    GAME_RULES.money.min
  );
}

export function isPlayerDead(hp: number): boolean {
  return hp <= GAME_RULES.hp.min;
}

export function isMaximumLegalRisk(
  legalRisk: number
): boolean {
  return (
    legalRisk >=
    GAME_RULES.legalRisk.max
  );
}