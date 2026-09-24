import { supabase } from "@/lib/supabase";

import type { RoomMessage } from "./types";

/**
 * Load lịch sử chat của room.
 */
export async function getRoomMessages(
  roomId: string,
  limit = 100
): Promise<RoomMessage[]> {
  const { data, error } = await supabase
    .from("room_messages")
    .select(
      "id, room_id, player_id, player_name, message, created_at"
    )
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to load room messages:", error);
    throw error;
  }

  return (data ?? []) as RoomMessage[];
}

export async function sendRoomMessage(
  roomId: string,
  playerId: string,
  playerName: string,
  message: string
): Promise<RoomMessage> {
  const text = message.trim();

  if (!text) {
    throw new Error("Message cannot be empty");
  }

  if (text.length > 500) {
    throw new Error("Message is too long");
  }

  const { data, error } = await supabase
    .from("room_messages")
    .insert({
      room_id: roomId,
      player_id: playerId,
      player_name: playerName,
      message: text,
    })
    .select(
      "id, room_id, player_id, player_name, message, created_at"
    )
    .single();

  if (error) {
    console.error("Failed to send room message:", error);
    throw error;
  }

  return data as RoomMessage;
}