import type { StatEffects } from "./stats";

export type ValidatedEffects = StatEffects;

export function validateEffects(
  effects: unknown
): ValidatedEffects {
  if (!effects || typeof effects !== "object") {
    return {};
  }

  const input = effects as Record<string, unknown>;

  const validated: ValidatedEffects = {};

  if (typeof input.hp === "number" && Number.isFinite(input.hp)) {
    validated.hp = Math.trunc(input.hp);
  }

  if (
    typeof input.money === "number" &&
    Number.isFinite(input.money)
  ) {
    validated.money = Math.trunc(input.money);
  }

  if (
    typeof input.legal_risk === "number" &&
    Number.isFinite(input.legal_risk)
  ) {
    validated.legal_risk = Math.trunc(input.legal_risk);
  }

  if (
    typeof input.location === "string" &&
    input.location.trim().length > 0
  ) {
    validated.location = input.location.trim();
  }

  return validated;
}