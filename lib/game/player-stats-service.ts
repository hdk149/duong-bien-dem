import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerStats } from "./stats";

export type UpdatePlayerStatsWithHistoryInput = {
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

export async function updatePlayerStats(
  supabase: SupabaseClient,
  playerId: string,
  stats: PlayerStats
) {
  const { data, error } = await supabase.rpc(
    "apply_player_stats",
    {
      p_player_id: playerId,
      p_hp: stats.hp,
      p_money: stats.money,
      p_location: stats.location,
      p_legal_risk: stats.legal_risk,
    }
  );

  if (error) {
    throw new Error(
      `Failed to update player stats: ${error.message}`
    );
  }

  return data;
}

export async function updatePlayerStatsWithHistory(
  supabase: SupabaseClient,
  input: UpdatePlayerStatsWithHistoryInput
) {
  const { data, error } = await supabase.rpc(
    "apply_player_stats_with_history",
    {
      p_room_id: input.roomId,
      p_session_id: input.sessionId,
      p_player_id: input.playerId,
      p_round: input.round,

      p_event_id: input.eventId ?? null,
      p_player_event_id:
        input.playerEventId ?? null,

      p_hp: input.after.hp,
      p_money: input.after.money,
      p_location: input.after.location,
      p_legal_risk: input.after.legal_risk,

      p_hp_before: input.before.hp,
      p_money_before: input.before.money,
      p_location_before: input.before.location,
      p_legal_risk_before:
        input.before.legal_risk,

      p_effects: input.effects ?? {},
    }
  );

  if (error) {
    throw new Error(
      `Failed to update player stats with history: ${error.message}`
    );
  }

  return data;
}