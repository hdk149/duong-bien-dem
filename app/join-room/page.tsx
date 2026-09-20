"use client";

import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "../components/LanguageProvider";

export default function JoinRoom() {
  const { language } = useLanguage();
  const isVietnamese = language === "vi";

  const [playerName, setPlayerName] =
    useState("");

  const [roomCode, setRoomCode] =
    useState("");

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function handleJoin() {
    setError("");

    const name =
      playerName.trim();

    const code =
      roomCode.trim();

    if (!name) {
      setError(
        isVietnamese
          ? "Vui lòng nhập tên."
          : "Please enter your name."
      );
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setError(
        isVietnamese
          ? "Mã phòng phải gồm đúng 6 chữ số."
          : "Room code must contain exactly 6 digits."
      );
      return;
    }

    setLoading(true);

    try {
      const response =
        await fetch(
          "/api/rooms/join",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              playerName: name,
              roomCode: code,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (isVietnamese
              ? "Không thể vào phòng."
              : "Could not join the room.")
        );
      }

      if (
        !data.playerId ||
        !data.playerToken ||
        !data.room?.code
      ) {
        throw new Error(
          isVietnamese
            ? "Server chưa trả thông tin người chơi."
            : "Server did not return player information."
        );
      }

      /*
       * ==========================================
       * LƯU SESSION
       * ==========================================
       */

      sessionStorage.setItem(
        "player_id",
        data.playerId
      );

      sessionStorage.setItem(
        "player_token",
        data.playerToken
      );

      sessionStorage.setItem(
        "player_role",
        data.playerRole ||
          "player"
      );

      /*
       * QUAN TRỌNG
       * Settings dùng cái này để biết
       * player đang ở phòng nào.
       */

      sessionStorage.setItem(
        "room_code",
        data.room.code
      );

      window.location.href =
        `/room/${data.room.code}`;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isVietnamese
            ? "Không thể vào phòng."
            : "Could not join the room."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground transition-colors duration-200">
      <div className="mx-auto w-full max-w-md">

        <Link
          href="/"
          className="text-sm text-muted transition hover:text-foreground"
        >
          ←{" "}
          {isVietnamese
            ? "Quay lại"
            : "Back"}
        </Link>

        <div className="mt-10">

          <p className="text-xs tracking-[0.2em] text-muted">
            JOIN GAME
          </p>

          <h1 className="mt-2 text-3xl font-bold text-foreground">
            {isVietnamese
              ? "Tham gia phòng"
              : "Join Room"}
          </h1>

          <p className="mt-2 text-sm text-muted">
            {isVietnamese
              ? "Nhập mã phòng mà bạn bè gửi cho bạn."
              : "Enter the room code your friends sent you."}
          </p>

        </div>

        <div className="mt-8 space-y-5">

          {/* PLAYER NAME */}

          <div>

            <label
              htmlFor="player-name"
              className="mb-2 block text-sm text-muted"
            >
              {isVietnamese
                ? "Tên của bạn"
                : "Your name"}
            </label>

            <input
              id="player-name"
              type="text"
              maxLength={20}
              value={playerName}
              onChange={(e) =>
                setPlayerName(
                  e.target.value
                )
              }
              placeholder={
                isVietnamese
                  ? "Nhập tên..."
                  : "Enter your name..."
              }
              className="
                w-full
                rounded-2xl
                border
                border-border
                bg-card
                px-4
                py-4
                text-foreground
                outline-none
                placeholder:text-muted
                focus:border-foreground/40
                transition-colors
              "
            />

          </div>

          {/* ROOM CODE */}

          <div>

            <label
              htmlFor="room-code"
              className="mb-2 block text-sm text-muted"
            >
              {isVietnamese
                ? "Mã phòng"
                : "Room code"}
            </label>

            <input
              id="room-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={roomCode}
              onChange={(e) =>
                setRoomCode(
                  e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6)
                )
              }
              placeholder="123456"
              className="
                w-full
                rounded-2xl
                border
                border-border
                bg-card
                px-4
                py-4
                text-center
                text-2xl
                font-black
                tracking-[0.3em]
                text-foreground
                outline-none
                placeholder:text-muted
                focus:border-foreground/40
                transition-colors
              "
            />

          </div>

          {/* ERROR */}

          {error && (
            <div
              className="
                rounded-2xl
                border
                border-red-500/30
                bg-red-500/10
                p-4
                text-sm
                text-red-600
                dark:text-red-400
              "
            >
              {error}
            </div>
          )}

          {/* JOIN */}

          <button
            type="button"
            onClick={handleJoin}
            disabled={loading}
            className="
              w-full
              rounded-2xl
              bg-foreground
              py-4
              text-lg
              font-bold
              text-background
              transition-all
              hover:opacity-85
              active:scale-[0.98]
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            {loading
              ? isVietnamese
                ? "Đang vào phòng..."
                : "Joining room..."
              : isVietnamese
                ? "Vào phòng"
                : "Join Room"}
          </button>

        </div>
      </div>
    </main>
  );
}