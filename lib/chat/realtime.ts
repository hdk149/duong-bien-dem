import { supabase } from "@/lib/supabase";

import type { RoomMessage } from "./types";

export function subscribeToRoomChat(
  roomId: string,
  onMessage: (message: RoomMessage) => void
) {
  const channel = supabase
    .channel(`room-chat:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "room_messages",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        onMessage(payload.new as RoomMessage);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}