"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import LobbyUI, {
  type Player,
  type Room,
} from "../../components/lobby/LobbyUI";

type RoomResponse = {
  room?: Room;
  players?: Player[];
  error?: string;
};

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();

  const code =
    typeof params.code === "string"
      ? params.code
      : "";

  const [room, setRoom] =
    useState<Room | null>(null);

  const [players, setPlayers] =
    useState<Player[]>([]);

  const [playerId, setPlayerId] =
    useState("");

  const [playerToken, setPlayerToken] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [starting, setStarting] =
    useState(false);

  const [realtimeConnected, setRealtimeConnected] =
    useState(false);

  const redirectedRef =
    useRef(false);

  const initializedRef =
    useRef(false);

  /*
   * ==========================================
   * INITIAL SESSION
   * ==========================================
   */

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    if (!/^\d{6}$/.test(code)) {
      setError("Mã phòng không hợp lệ.");
      setLoading(false);
      return;
    }

    const id =
      window.sessionStorage.getItem(
        "player_id"
      );

    const token =
      window.sessionStorage.getItem(
        "player_token"
      );

    if (!id || !token) {
      setError(
        "Không tìm thấy thông tin người chơi. Hãy tham gia phòng lại."
      );

      setLoading(false);
      return;
    }

    window.sessionStorage.setItem(
      "room_code",
      code
    );

    setPlayerId(id);
    setPlayerToken(token);
  }, [code]);

  /*
   * ==========================================
   * LOAD ROOM
   *
   * Lobby chỉ load room/player state.
   * KHÔNG gọi game-state.
   * KHÔNG polling.
   * ==========================================
   */

  const loadRoom = useCallback(
    async () => {
      if (!code || !playerToken) {
        return;
      }

      try {
        const response = await fetch(
          `/api/rooms/${code}`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              "x-player-token": playerToken,
            },
          }
        );

        let data: RoomResponse | null =
          null;

        try {
          data =
            (await response.json()) as RoomResponse;
        } catch {
          data = null;
        }

        if (!response.ok) {
          throw new Error(
            data?.error ||
              `Không thể tải phòng. (${response.status})`
          );
        }

        if (!data?.room) {
          throw new Error(
            "Server không trả về dữ liệu phòng."
          );
        }

        const nextRoom = data.room;

        /*
         * Nếu Host đã Start ở thiết bị khác,
         * tất cả client trong lobby chuyển sang Game.
         */

        if (nextRoom.status === "playing") {
          if (!redirectedRef.current) {
            redirectedRef.current = true;

            router.replace(
              `/game/${code}`
            );
          }

          return;
        }

        setRoom(nextRoom);

        setPlayers(
          Array.isArray(data.players)
            ? data.players
            : []
        );

        setError("");
        setLoading(false);
      } catch (err) {
        console.error(
          "[ROOM] Load error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải phòng."
        );

        setLoading(false);
      }
    },
    [
      code,
      playerToken,
      router,
    ]
  );

  /*
   * ==========================================
   * INITIAL ROOM LOAD
   * ==========================================
   */

  useEffect(() => {
    if (!code || !playerToken) {
      return;
    }

    loadRoom();
  }, [
    code,
    playerToken,
    loadRoom,
  ]);

  /*
   * ==========================================
   * SUPABASE REALTIME
   *
   * Lobby dùng realtime thay vì polling.
   * ==========================================
   */

  useEffect(() => {
    if (
      !code ||
      !playerToken ||
      !room?.id
    ) {
      return;
    }

    let active = true;

    const channel =
      supabase.channel(
        `room-lobby-${room.id}`
      );

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        async () => {
          if (!active) {
            return;
          }

          await loadRoom();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          if (!active) {
            return;
          }

          await loadRoom();
        }
      )
      .subscribe((status) => {
        if (!active) {
          return;
        }

        if (
          status === "SUBSCRIBED"
        ) {
          setRealtimeConnected(true);

          console.log(
            "[ROOM] Realtime connected"
          );
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeConnected(false);

          console.warn(
            "[ROOM] Realtime status:",
            status
          );
        }
      });

    return () => {
      active = false;

      setRealtimeConnected(false);

      supabase.removeChannel(
        channel
      );
    };
  }, [
    code,
    playerToken,
    room?.id,
    loadRoom,
  ]);

  /*
   * ==========================================
   * CURRENT PLAYER
   * ==========================================
   */

  const currentPlayer =
    players.find(
      (player) =>
        player.id === playerId
    );

  /*
   * Host được xác định từ dữ liệu server.
   */

  const isHost =
    currentPlayer?.role === "host";

  /*
   * ==========================================
   * START GAME
   * ==========================================
   */

  const startGame = useCallback(
    async () => {
      if (
        !isHost ||
        !room ||
        starting ||
        room.status !== "lobby"
      ) {
        return;
      }

      setStarting(true);
      setError("");

      try {
        console.log(
          "[ROOM] Starting game:",
          code
        );

        const response = await fetch(
          `/api/rooms/${code}/start`,
          {
            method: "POST",
            cache: "no-store",
            headers: {
              "x-player-token":
                playerToken,
            },
          }
        );

        let data: {
          error?: string;
        } | null = null;

        try {
          data =
            await response.json();
        } catch {
          data = null;
        }

        console.log(
          "[ROOM] Start response:",
          response.status,
          data
        );

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Không thể bắt đầu game."
          );
        }

        /*
         * Server đã đổi status → playing.
         */

        redirectedRef.current = true;

        router.replace(
          `/game/${code}`
        );
      } catch (err) {
        console.error(
          "[ROOM] Start error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Không thể bắt đầu game."
        );

        setStarting(false);
      }
    },
    [
      code,
      isHost,
      playerToken,
      room,
      router,
      starting,
    ]
  );

  /*
   * ==========================================
   * UI
   * ==========================================
   */

  return (
    <LobbyUI
      room={room}
      players={players}
      isHost={isHost}
      loading={loading}
      error={error}
      realtimeConnected={
        realtimeConnected
      }
      starting={starting}
      onStart={startGame}
      onRetry={() => {
        setLoading(true);
        loadRoom();
      }}
    />
  );
}