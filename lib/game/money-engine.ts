export type MoneyResult = {
  before: number;
  delta: number;
  after: number;
};

export function resolveMoney(
  currentMoney: number,
  delta?: number
): MoneyResult {
  const before =
    Number.isFinite(currentMoney)
      ? Math.max(0, Math.trunc(currentMoney))
      : 0;

  const safeDelta =
    typeof delta === "number" &&
    Number.isFinite(delta)
      ? Math.trunc(delta)
      : 0;

  const after = Math.max(
    0,
    before + safeDelta
  );

  return {
    before,
    delta: safeDelta,
    after,
  };
}