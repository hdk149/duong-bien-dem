"use client";

import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "../components/LanguageProvider";

export default function CreateRoom() {
  const { language } = useLanguage();
  const isVietnamese = language === "vi";

  const [playerName, setPlayerName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreateRoom() {
    setError("");

    const name = playerName.trim();

    if (!name) {
      setError(
        isVietnamese
          ? "Bạn chưa nhập tên."
          : "Please enter your name."
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hostName: name,
          maxPlayers: Number(maxPlayers),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (isVietnamese
              ? "Không thể tạo phòng."
              : "Could not create room.")
        );
      }

      if (
        !data.room?.code ||
        !data.playerId ||
        !data.playerToken
      ) {
        throw new Error(
          isVietnamese
            ? "Server chưa trả đủ thông tin phòng và người chơi."
            : "Server did not return complete room and player information."
        );
      }

      /*
       * Lưu toàn bộ thông tin phiên hiện tại.
       * Đặc biệt room_code phải luôn là mã phòng
       * vừa được server tạo.
       */

      sessionStorage.setItem(
        "room_code",
        data.room.code
      );

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
        data.playerRole || "host"
      );

      window.location.href =
        `/room/${data.room.code}`;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isVietnamese
            ? "Đã xảy ra lỗi."
            : "An error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground transition-colors duration-200">
      <div className="mx-auto w-full max-w-md">

        {/* Back */}
        <Link
          href="/"
          className="
            text-sm
            text-muted
            transition
            hover:text-foreground
          "
        >
          ← {isVietnamese ? "Quay lại" : "Back"}
        </Link>

        {/* Header */}
        <div className="mt-10">
          <p className="text-xs tracking-[0.2em] text-muted">
            NEW GAME
          </p>

          <h1 className="mt-2 text-3xl font-bold text-foreground">
            {isVietnamese
              ? "Tạo phòng"
              : "Create Room"}
          </h1>

          <p className="mt-2 text-sm text-muted">
            {isVietnamese
              ? "Tạo một thế giới mới cho nhóm của bạn."
              : "Create a new world for your group."}
          </p>
        </div>

        <div className="mt-8 space-y-5">

          {/* Player name */}
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
                setPlayerName(e.target.value)
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

          {/* Number of players */}
          <div>
            <label
              htmlFor="players"
              className="mb-2 block text-sm text-muted"
            >
              {isVietnamese
                ? "Số người chơi"
                : "Number of players"}
            </label>

            <select
              id="players"
              value={maxPlayers}
              onChange={(e) =>
                setMaxPlayers(e.target.value)
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
                transition-colors
              "
            >
              <option value="1">
                {isVietnamese
                  ? "1 người"
                  : "1 player"}
              </option>

              <option value="2">
                {isVietnamese
                  ? "2 người"
                  : "2 players"}
              </option>

              <option value="3">
                {isVietnamese
                  ? "3 người"
                  : "3 players"}
              </option>

              <option value="4">
                {isVietnamese
                  ? "4 người"
                  : "4 players"}
              </option>
            </select>
          </div>

          {/* Default rules */}
          <div
            className="
              rounded-2xl
              border
              border-border
              bg-card
              p-4
              shadow-sm
              transition-colors
            "
          >
            <p className="text-sm font-semibold text-foreground">
              {isVietnamese
                ? "Luật mặc định"
                : "Default Rules"}
            </p>

            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>
                💰{" "}
                {isVietnamese
                  ? "Vốn ban đầu: 5.000.000đ"
                  : "Starting money: 5,000,000 VND"}
              </p>

              <p>
                ❤️ HP: 100
              </p>

              <p>
                📍{" "}
                {isVietnamese
                  ? "Bắt đầu: Việt Nam"
                  : "Starting location: Vietnam"}
              </p>

              <p>
                🎯{" "}
                {isVietnamese
                  ? "Mục tiêu: 400.000.000đ"
                  : "Goal: 400,000,000 VND"}
              </p>

              <p>
                🎲{" "}
                {isVietnamese
                  ? "Xúc xắc: Host điều hành"
                  : "Dice: Host controlled"}
              </p>
            </div>
          </div>

          {/* Error */}
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

          {/* Create */}
          <button
            type="button"
            onClick={handleCreateRoom}
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
                ? "Đang tạo phòng..."
                : "Creating room..."
              : isVietnamese
                ? "Tạo phòng"
                : "Create Room"}
          </button>

        </div>
      </div>
    </main>
  );
}