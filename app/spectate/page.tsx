"use client";

import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "../components/LanguageProvider";

export default function SpectatePage() {
  const { language } = useLanguage();
  const isVietnamese = language === "vi";

  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSpectate() {
    setError("");

    const code = roomCode.trim();

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
      const response = await fetch(`/api/spectate/${code}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (isVietnamese
              ? "Không thể xem phòng."
              : "Could not spectate the room.")
        );
      }

      window.location.href = `/spectate/${code}`;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isVietnamese
            ? "Không thể xem phòng."
            : "Could not spectate the room."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="
        min-h-screen
        bg-background
        px-5
        py-6
        text-foreground
        transition-colors
        duration-200
        sm:py-8
      "
    >
      <div className="mx-auto w-full max-w-md">
        {/* Back */}

        <Link
          href="/"
          className="
            inline-flex
            items-center
            text-sm
            font-semibold
            text-muted
            transition
            hover:text-foreground
          "
        >
          ← {isVietnamese ? "Quay lại" : "Back"}
        </Link>

        {/* Header */}

        <div className="mt-10">
          <p
            className="
              text-xs
              font-bold
              tracking-[0.22em]
              text-muted
            "
          >
            ĐƯỜNG BIÊN ĐÊM
          </p>

          <h1
            className="
              mt-3
              text-4xl
              font-black
              tracking-tight
              text-foreground
            "
          >
            {isVietnamese ? "Xem phòng" : "Spectate"}
          </h1>

          <p
            className="
              mt-3
              text-sm
              leading-6
              text-muted
            "
          >
            {isVietnamese
              ? "Theo dõi hành trình của những người chơi mà không tham gia vào game."
              : "Follow the players' journey without participating in the game."}
          </p>
        </div>

        <div className="mt-8 space-y-5">
          {/* Room code */}

          <div
            className="
              rounded-3xl
              border
              border-border
              bg-card
              p-5
              shadow-sm
              transition-colors
            "
          >
            <label
              htmlFor="room-code"
              className="
                mb-3
                block
                text-sm
                font-semibold
                text-foreground
              "
            >
              {isVietnamese ? "Mã phòng" : "Room code"}
            </label>

            <input
              id="room-code"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={roomCode}
              onChange={(e) => {
                setRoomCode(
                  e.target.value.replace(/\D/g, "").slice(0, 6)
                );
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) {
                  handleSpectate();
                }
              }}
              placeholder="123456"
              className="
                w-full
                rounded-2xl
                border
                border-border
                bg-background
                px-4
                py-5
                text-center
                text-3xl
                font-black
                tracking-[0.35em]
                text-foreground
                outline-none
                placeholder:text-muted
                focus:border-foreground/40
                transition-colors
              "
            />

            <p
              className="
                mt-3
                text-center
                text-xs
                font-medium
                text-muted
              "
            >
              {isVietnamese
                ? "Nhập mã 6 chữ số của phòng đang chơi."
                : "Enter the 6-digit code of the room in progress."}
            </p>
          </div>

          {/* Spectator information */}

          <div
            className="
              overflow-hidden
              rounded-3xl
              border
              border-border
              bg-card
              shadow-sm
              transition-colors
            "
          >
            <div
              className="
                border-b
                border-border
                px-5
                py-4
              "
            >
              <div className="flex items-center gap-3">
                <span
                  className="
                    flex
                    h-10
                    w-10
                    items-center
                    justify-center
                    rounded-full
                    bg-background
                    text-lg
                  "
                >
                  👁️
                </span>

                <div>
                  <p
                    className="
                      text-base
                      font-bold
                      text-foreground
                    "
                  >
                    {isVietnamese
                      ? "Chế độ Spectator"
                      : "Spectator Mode"}
                  </p>

                  <p
                    className="
                      mt-0.5
                      text-xs
                      font-medium
                      text-muted
                    "
                  >
                    {isVietnamese
                      ? "Chỉ theo dõi"
                      : "View only"}
                  </p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-border">
              {/* Player name */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  px-5
                  py-4
                "
              >
                <span
                  className="
                    text-sm
                    font-medium
                    text-muted
                  "
                >
                  👤{" "}
                  {isVietnamese
                    ? "Tên người chơi"
                    : "Player name"}
                </span>

                <span
                  className="
                    text-xs
                    font-bold
                    text-green-600
                    dark:text-green-400
                  "
                >
                  ✓
                </span>
              </div>

              {/* HP */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  px-5
                  py-4
                "
              >
                <span
                  className="
                    text-sm
                    font-medium
                    text-muted
                  "
                >
                  ❤️ HP
                </span>

                <span
                  className="
                    text-xs
                    font-bold
                    text-green-600
                    dark:text-green-400
                  "
                >
                  ✓
                </span>
              </div>

              {/* Money */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  px-5
                  py-4
                "
              >
                <span
                  className="
                    text-sm
                    font-medium
                    text-muted
                  "
                >
                  💰{" "}
                  {isVietnamese
                    ? "Tiền"
                    : "Money"}
                </span>

                <span
                  className="
                    text-xs
                    font-bold
                    text-green-600
                    dark:text-green-400
                  "
                >
                  ✓
                </span>
              </div>

              {/* Location */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  px-5
                  py-4
                "
              >
                <span
                  className="
                    text-sm
                    font-medium
                    text-muted
                  "
                >
                  📍{" "}
                  {isVietnamese
                    ? "Vị trí"
                    : "Location"}
                </span>

                <span
                  className="
                    text-xs
                    font-bold
                    text-green-600
                    dark:text-green-400
                  "
                >
                  ✓
                </span>
              </div>

              {/* Online status */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  px-5
                  py-4
                "
              >
                <span
                  className="
                    text-sm
                    font-medium
                    text-muted
                  "
                >
                  🟢{" "}
                  {isVietnamese
                    ? "Trạng thái online"
                    : "Online status"}
                </span>

                <span
                  className="
                    text-xs
                    font-bold
                    text-green-600
                    dark:text-green-400
                  "
                >
                  ✓
                </span>
              </div>

              {/* Choice */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-4
                  px-5
                  py-4
                "
              >
                <span
                  className="
                    text-sm
                    font-medium
                    text-muted
                  "
                >
                  🎯{" "}
                  {isVietnamese
                    ? "Lựa chọn"
                    : "Choice"}
                </span>

                <span
                  className="
                    text-xs
                    font-bold
                    text-red-500
                    dark:text-red-400
                  "
                >
                  ✕
                </span>
              </div>
            </div>
          </div>

          {/* Important note */}

          <div
            className="
              rounded-2xl
              border
              border-border
              bg-card
              px-4
              py-3
              text-center
              shadow-sm
            "
          >
            <p
              className="
                text-xs
                font-medium
                leading-5
                text-muted
              "
            >
              🔒{" "}
              {isVietnamese
                ? "Spectator chỉ xem tên, HP, tiền, vị trí và trạng thái online/offline."
                : "Spectators can only see player names, HP, money, location, and online/offline status."}
            </p>
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
                font-medium
                leading-6
                text-red-600
                dark:text-red-400
              "
            >
              {error}
            </div>
          )}

          {/* Spectate button */}

          <button
            type="button"
            onClick={handleSpectate}
            disabled={
              loading ||
              roomCode.length !== 6
            }
            className="
              w-full
              rounded-2xl
              bg-foreground
              py-4
              text-lg
              font-black
              text-background
              shadow-sm
              transition-all
              hover:opacity-85
              active:scale-[0.98]
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            {loading
              ? isVietnamese
                ? "Đang kiểm tra..."
                : "Checking..."
              : isVietnamese
                ? "Xem phòng"
                : "Spectate"}
          </button>

          {/* Footer */}

          <p
            className="
              pb-6
              pt-2
              text-center
              text-xs
              font-medium
              text-muted
            "
          >
            {isVietnamese
              ? "Spectator không thể thay đổi diễn biến game."
              : "Spectators cannot affect the game."}
          </p>
        </div>
      </div>
    </main>
  );
}