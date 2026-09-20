import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlayerStats } from "./stats";

export type StatHistoryInput = {
  roomId: string;
  sessionId: string;
  playerId: string;
  round: number;

  eventId?: string | null;
  playerEventId?: string | null;

  before: PlayerStats;
  after: PlayerStats;

  effects: unknown;
};

export async function recordPlayerStatHistory(
  supabase: SupabaseClient,
  input: StatHistoryInput
) {
  const { data, error } = await supabase
    .from("player_stat_history")
    .insert({
      room_id: input.roomId,
      session_id: input.sessionId,
      player_id: input.playerId,
      round: input.round,

      event_id: input.eventId ?? null,
      player_event_id:
        input.playerEventId ?? null,

      hp_before: input.before.hp,
      hp_after: input.after.hp,

      money_before: input.before.money,
      money_after: input.after.money,

      location_before: input.before.location,
      location_after: input.after.location,

      legal_risk_before:
        input.before.legal_risk,

      legal_risk_after:
        input.after.legal_risk,

      effects: input.effects ?? {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Failed to record player stat history: ${error.message}`
    );
  }

  return data;
}