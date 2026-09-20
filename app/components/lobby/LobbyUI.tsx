"use client";

import Link from "next/link";
import { useState } from "react";

import { useLanguage } from "../LanguageProvider";
import { useTheme } from "../ThemeProvider";

export type Room = {
  id: string;
  code: string;
  host_name: string;
  max_players: number;
  status: string;
  starting_money?: number;
  goal_money?: number;
  starting_location?: string;
  dice_system?: string;
};

export type Player = {
  id: string;
  player_name: string;
  role: string;
  is_connected: boolean;
};

export type LobbyUIProps = {
  room: Room | null;
  players: Player[];

  isHost: boolean;
  loading: boolean;
  error: string;

  realtimeConnected: boolean;
  starting: boolean;

  onStart: () => void;
  onRetry: () => void;
};

function GameBackground() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundColor: isDark
            ? "#090a08"
            : "#e8dfcf",
          backgroundImage: `url('${
            isDark
              ? "/background-dark.jpg"
              : "/background-light.jpg"
          }')`,
        }}
      />

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background: isDark
            ? "rgba(0,0,0,0.30)"
            : "rgba(255,255,255,0.18)",
        }}
      />

      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background: isDark
            ? "linear-gradient(to bottom, rgba(0,0,0,0.08), transparent 45%, rgba(0,0,0,0.45))"
            : "linear-gradient(to bottom, rgba(255,255,255,0.05), transparent 45%, rgba(232,223,207,0.35))",
        }}
      />
    </>
  );
}

export default function LobbyUI({
  room,
  players,
  isHost,
  loading,
  error,
  realtimeConnected,
  starting,
  onStart,
  onRetry,
}: LobbyUIProps) {
  const { language } = useLanguage();

  const isVietnamese = language === "vi";

  const [showStartConfirm, setShowStartConfirm] =
    useState(false);

  const [rulesOpen, setRulesOpen] =
    useState(false);

  async function copyRoomCode() {
    if (!room?.code) return;

    try {
      await navigator.clipboard.writeText(
        room.code
      );
    } catch {
      // Clipboard có thể bị trình duyệt chặn.
    }
  }

  /*
   * ==========================================
   * INVALID / MISSING ROOM
   * ==========================================
   */

  if (!room && !loading && !error) {
    return (
      <main className="relative min-h-screen overflow-hidden px-5 py-8 text-[#292620] dark:text-[#eee7d9]">
        <GameBackground />

        <div className="relative z-10 mx-auto w-full max-w-md">
          <Link
            href="/"
            className="text-base font-semibold text-[#625d54] transition hover:text-[#292620] dark:text-[#c0b9ad] dark:hover:text-white"
          >
            ←{" "}
            {isVietnamese
              ? "Trang chủ"
              : "Home"}
          </Link>

          <div className="mt-16 rounded-3xl border border-[#d5b9b3] bg-[#fbf7f0]/92 p-7 text-center shadow-[0_18px_50px_rgba(75,55,35,0.18)] backdrop-blur-xl dark:border-[#55332f] dark:bg-[#171614]/88 dark:shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
            <div className="text-4xl">
              ⚠
            </div>

            <h1 className="mt-4 text-2xl font-bold text-[#292620] dark:text-[#eee7d9]">
              {isVietnamese
                ? "Không thể vào phòng"
                : "Could not enter room"}
            </h1>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ==========================================
   * INVALID CODE
   * ==========================================
   */

  if (
    !room &&
    !loading &&
    error ===
      (isVietnamese
        ? "Mã phòng không hợp lệ."
        : "Invalid room code.")
  ) {
    return (
      <main className="relative min-h-screen overflow-hidden px-5 py-8 text-[#292620] dark:text-[#eee7d9]">
        <GameBackground />

        <div className="relative z-10 mx-auto w-full max-w-md">
          <Link
            href="/"
            className="text-base font-semibold text-[#625d54] transition hover:text-[#292620] dark:text-[#c0b9ad] dark:hover:text-white"
          >
            ←{" "}
            {isVietnamese
              ? "Trang chủ"
              : "Home"}
          </Link>

          <div className="mt-16 rounded-3xl border border-[#d5b9b3] bg-[#fbf7f0]/92 p-7 text-center shadow-[0_18px_50px_rgba(75,55,35,0.18)] backdrop-blur-xl dark:border-[#55332f] dark:bg-[#171614]/88 dark:shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
            <div className="text-4xl">
              ⚠
            </div>

            <h1 className="mt-4 text-2xl font-bold text-[#292620] dark:text-[#eee7d9]">
              {isVietnamese
                ? "Mã phòng không hợp lệ"
                : "Invalid room code"}
            </h1>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ==========================================
   * LOADING
   * ==========================================
   */

  if (loading) {
    return (
      <main className="relative min-h-screen overflow-hidden px-5 py-8 text-[#292620] dark:text-[#eee7d9]">
        <GameBackground />

        <div className="relative z-10 mx-auto flex min-h-[80vh] w-full max-w-md items-center justify-center">
          <div className="rounded-3xl border border-[#d5cbb9] bg-[#f8f4ec]/90 px-8 py-7 text-center shadow-[0_18px_50px_rgba(75,55,35,0.18)] backdrop-blur-xl dark:border-[#3f3c34] dark:bg-[#171614]/88">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-[#d1c7b5] border-t-[#806b48] dark:border-[#403d35] dark:border-t-[#bca873]" />

            <p className="mt-5 text-base font-semibold text-[#625d54] dark:text-[#aaa397]">
              {isVietnamese
                ? "Đang tải phòng..."
                : "Loading room..."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ==========================================
   * ERROR
   * ==========================================
   */

  if (error || !room) {
    return (
      <main className="relative min-h-screen overflow-hidden px-5 py-8 text-[#292620] dark:text-[#eee7d9]">
        <GameBackground />

        <div className="relative z-10 mx-auto w-full max-w-md">
          <Link
            href="/"
            className="text-base font-semibold text-[#625d54] hover:text-[#292620] dark:text-[#c0b9ad] dark:hover:text-white"
          >
            ←{" "}
            {isVietnamese
              ? "Trang chủ"
              : "Home"}
          </Link>

          <div className="mt-16 rounded-3xl border border-[#d5b9b3] bg-[#fbf7f0]/92 p-7 text-center shadow-[0_18px_50px_rgba(75,55,35,0.18)] backdrop-blur-xl dark:border-[#55332f] dark:bg-[#171614]/88 dark:shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
            <div className="text-4xl">
              ⚠
            </div>

            <h1 className="mt-4 text-2xl font-bold text-[#292620] dark:text-[#eee7d9]">
              {isVietnamese
                ? "Không thể vào phòng"
                : "Could not enter room"}
            </h1>

            <p className="mt-3 text-base font-medium leading-7 text-[#a55f55] dark:text-[#c47d72]">
              {error ||
                (isVietnamese
                  ? "Không tìm thấy phòng."
                  : "Room not found.")}
            </p>

            <button
              type="button"
              onClick={onRetry}
              className="mt-6 w-full rounded-2xl border border-[#c9c1b3] bg-[#eee8dc] py-4 text-base font-bold text-[#292620] transition hover:bg-[#e4ddd0] dark:border-[#454139] dark:bg-[#292722] dark:text-[#e8e1d3] dark:hover:bg-[#34312b]"
            >
              {isVietnamese
                ? "Thử lại"
                : "Try again"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ==========================================
   * LOBBY
   * ==========================================
   */

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 text-[#292620] transition-colors duration-300 dark:text-[#eee7d9] sm:px-5 sm:py-8">
      <GameBackground />

      <div className="relative z-10 mx-auto w-full max-w-md">
        {/* HEADER */}

        <div className="flex items-center justify-between rounded-2xl border border-[#d4cabb] bg-[#f7f3ea]/78 px-4 py-3 backdrop-blur-xl dark:border-[#3c3932] dark:bg-[#171614]/72">
          <Link
            href="/"
            className="text-sm font-semibold text-[#625d54] hover:text-[#292620] dark:text-[#c0b9ad] dark:hover:text-white"
          >
            ←{" "}
            {isVietnamese
              ? "Trang chủ"
              : "Home"}
          </Link>

          <span
            className={`flex items-center gap-2 text-sm font-semibold ${
              realtimeConnected
                ? "text-[#65713e] dark:text-[#a0b36d]"
                : "text-[#8a7046] dark:text-[#bca873]"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                realtimeConnected
                  ? "bg-[#7b8b4c] shadow-[0_0_8px_rgba(123,139,76,0.45)]"
                  : "bg-[#a49678]"
              }`}
            />

            {realtimeConnected
              ? isVietnamese
                ? "Đang hoạt động"
                : "Online"
              : isVietnamese
                ? "Đang kết nối"
                : "Connecting"}
          </span>
        </div>

        {/* TITLE */}

        <div className="mt-7 px-1">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold text-[#8a7046] dark:text-[#c0a875]">
                ĐƯỜNG BIÊN ĐÊM
              </p>

              <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-[#292620] dark:text-[#eee7d9] sm:text-5xl">
                {isVietnamese
                  ? "Phòng chờ"
                  : "Lobby"}
              </h1>
            </div>

            <div className="mb-1 text-right">
              <p className="text-xs font-medium text-[#81796e] dark:text-[#aaa397]">
                Room
              </p>

              <p className="mt-1 font-mono text-base font-bold text-[#554f47] dark:text-[#d0c6b4]">
                #{room.code}
              </p>
            </div>
          </div>

          {isHost && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#d4c49e] bg-[#f6eed8]/90 px-4 py-2 text-sm font-semibold text-[#806b35] dark:border-[#665331] dark:bg-[#282319]/90 dark:text-[#c5aa6b]">
              <span>♛</span>

              {isVietnamese
                ? "Bạn là Host"
                : "You are the Host"}
            </div>
          )}
        </div>

        {/* ROOM CODE */}

        <section className="relative mt-6 overflow-hidden rounded-3xl border border-[#d2c7b5] bg-[#f9f5ec]/84 shadow-[0_18px_50px_rgba(75,55,35,0.13)] backdrop-blur-xl dark:border-[#3f3c35] dark:bg-[#1d1c19]/82 dark:shadow-[0_18px_50px_rgba(0,0,0,0.38)]">
          <div className="absolute left-0 top-0 h-12 w-12 rounded-tl-3xl border-l-2 border-t-2 border-[#9b8151] dark:border-[#806d48]" />

          <div className="absolute bottom-0 right-0 h-12 w-12 rounded-br-3xl border-b-2 border-r-2 border-[#9b8151] dark:border-[#806d48]" />

          <div className="p-6 text-center sm:p-7">
            <p className="text-sm font-semibold text-[#81796e] dark:text-[#aaa397]">
              {isVietnamese
                ? "Mã phòng"
                : "Room code"}
            </p>

            <button
              type="button"
              onClick={copyRoomCode}
              title={
                isVietnamese
                  ? "Bấm để sao chép mã phòng"
                  : "Click to copy room code"
              }
              className="mt-3 block w-full rounded-2xl transition active:scale-[0.98]"
            >
              <p className="font-mono text-5xl font-bold tracking-[0.16em] text-[#292620] dark:text-[#e7dfcf] sm:text-6xl">
                {room.code}
              </p>
            </button>

            <div className="mx-auto mt-4 h-px w-20 bg-[#c8bda9] dark:bg-[#514a3e]" />

            <p className="mx-auto mt-4 max-w-xs text-sm font-medium leading-6 text-[#6c665d] dark:text-[#aaa397]">
              {isVietnamese
                ? "Bấm vào mã để sao chép và đưa mã này cho những người cùng chuyến đi."
                : "Tap the code to copy it and give it to the people joining your journey."}
            </p>
          </div>
        </section>

        {/* PLAYERS */}

        <section className="mt-4 overflow-hidden rounded-3xl border border-[#d2c7b5] bg-[#f9f5ec]/84 shadow-[0_15px_40px_rgba(75,55,35,0.10)] backdrop-blur-xl dark:border-[#3f3c35] dark:bg-[#1b1a18]/84 dark:shadow-[0_15px_40px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between border-b border-[#ddd4c5] px-5 py-4 dark:border-[#37342e]">
            <div>
              <p className="text-sm font-semibold text-[#81796e] dark:text-[#aaa397]">
                {isVietnamese
                  ? "Người tham gia"
                  : "Participants"}
              </p>

              <h2 className="mt-1 text-lg font-bold text-[#292620] dark:text-[#dcd4c5]">
                {isVietnamese
                  ? "Người chơi"
                  : "Players"}
              </h2>
            </div>

            <span className="rounded-full border border-[#d4c9b8] bg-[#eee8dc]/90 px-3 py-1 font-mono text-sm font-bold text-[#675e51] dark:border-[#454139] dark:bg-[#25231f]/90 dark:text-[#a49678]">
              {players.length}
              <span className="mx-1 text-[#aaa194]">
                /
              </span>
              {room.max_players}
            </span>
          </div>

          <div>
            {players.map(
              (player, index) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between border-b border-[#e0d8cb] px-5 py-4 last:border-b-0 dark:border-[#302e29]"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5ded1] font-mono text-xs font-bold text-[#746b5e] dark:bg-[#302e29] dark:text-[#817a70]">
                      {index + 1}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-[#292620] dark:text-[#d8d0c2]">
                        {player.player_name}
                      </p>

                      <p className="mt-0.5 text-sm font-medium text-[#81796e] dark:text-[#8f897e]">
                        {player.role ===
                        "host"
                          ? "♛ Host"
                          : isVietnamese
                            ? "Người chơi"
                            : "Player"}
                      </p>
                    </div>
                  </div>

                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        player.is_connected
                          ? "bg-[#7f914d] shadow-[0_0_7px_rgba(127,145,77,0.45)]"
                          : "bg-[#aaa399] dark:bg-[#57534b]"
                      }`}
                    />

                    <span className="hidden text-xs font-semibold text-[#777067] dark:text-[#aaa397] sm:block">
                      {player.is_connected
                        ? "Online"
                        : "Offline"}
                    </span>
                  </div>
                </div>
              )
            )}

            {Array.from({
              length: Math.max(
                0,
                room.max_players -
                  players.length
              ),
            }).map(
              (_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3.5 border-b border-dashed border-[#d8d0c2] px-5 py-4 last:border-b-0 dark:border-[#34312b]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5ded1] font-mono text-xs font-bold text-[#9b9285] dark:bg-[#292722] dark:text-[#5f5b53]">
                    +
                  </span>

                  <span className="text-sm font-medium text-[#81796e] dark:text-[#8f897e]">
                    {isVietnamese
                      ? "Đang chờ người chơi..."
                      : "Waiting for player..."}
                  </span>
                </div>
              )
            )}
          </div>
        </section>

        {/* RULES */}

        <section className="mt-4 overflow-hidden rounded-3xl border border-[#d2c7b5] bg-[#f9f5ec]/84 shadow-[0_15px_40px_rgba(75,55,35,0.10)] backdrop-blur-xl dark:border-[#3f3c35] dark:bg-[#1b1a18]/84">
          <button
            type="button"
            onClick={() =>
              setRulesOpen(
                (open) => !open
              )
            }
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#eee8dc]/50 dark:hover:bg-[#25231f]/50"
          >
            <div>
              <p className="text-sm font-semibold text-[#81796e] dark:text-[#aaa397]">
                {isVietnamese
                  ? "Thiết lập"
                  : "Setup"}
              </p>

              <h2 className="mt-1 text-lg font-bold text-[#292620] dark:text-[#dcd4c5]">
                {isVietnamese
                  ? "Luật mặc định"
                  : "Default rules"}
              </h2>
            </div>

            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d2c7b5] bg-[#eee8dc]/80 text-lg text-[#746b5e] transition-transform duration-200 dark:border-[#454139] dark:bg-[#25231f] dark:text-[#aaa397] ${
                rulesOpen
                  ? "rotate-180"
                  : ""
              }`}
            >
              ↓
            </span>
          </button>

          {rulesOpen && (
            <div className="border-t border-[#ddd4c5] dark:border-[#37342e]">
              <div className="flex items-center justify-between gap-4 border-b border-[#e0d8cb] px-5 py-4 dark:border-[#302e29]">
                <span className="text-sm font-medium text-[#6c665d] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "Vốn ban đầu"
                    : "Starting money"}
                </span>

                <span className="font-mono text-sm font-bold text-[#7c673c] dark:text-[#bca873]">
                  5.000.000đ
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[#e0d8cb] px-5 py-4 dark:border-[#302e29]">
                <span className="text-sm font-medium text-[#6c665d] dark:text-[#aaa397]">
                  HP
                </span>

                <span className="font-mono text-sm font-bold text-[#a55f55] dark:text-[#b96e62]">
                  100
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[#e0d8cb] px-5 py-4 dark:border-[#302e29]">
                <span className="text-sm font-medium text-[#6c665d] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "Bắt đầu"
                    : "Starting location"}
                </span>

                <span className="text-sm font-semibold text-[#403c35] dark:text-[#c7c0b3]">
                  Việt Nam
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[#e0d8cb] px-5 py-4 dark:border-[#302e29]">
                <span className="text-sm font-medium text-[#6c665d] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "Mục tiêu"
                    : "Goal"}
                </span>

                <span className="font-mono text-sm font-bold text-[#7c673c] dark:text-[#bca873]">
                  400.000.000đ
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-[#e0d8cb] px-5 py-4 dark:border-[#302e29]">
                <span className="text-sm font-medium text-[#6c665d] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "Xúc xắc"
                    : "Dice"}
                </span>

                <span className="font-mono text-sm font-bold text-[#403c35] dark:text-[#c7c0b3]">
                  1d6
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 bg-[#eee8dc]/80 px-5 py-4 dark:bg-[#211f1a]/80">
                <span className="text-sm font-medium text-[#6c665d] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "Lộ vị trí"
                    : "Location reveal"}
                </span>

                <span className="rounded-full bg-[#ead9d4] px-3 py-1 text-xs font-bold text-[#99574d] dark:bg-[#352421] dark:text-[#c47d72]">
                  {isVietnamese
                    ? "Mỗi 5 round"
                    : "Every 5 rounds"}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* START */}

        {isHost &&
          room.status ===
            "lobby" && (
            <button
              type="button"
              onClick={() =>
                setShowStartConfirm(
                  true
                )
              }
              disabled={starting}
              className="mt-5 flex min-h-[60px] w-full items-center justify-center rounded-2xl border border-[#89734d] bg-[#806b48] px-5 py-4 text-lg font-bold text-[#181612] shadow-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#927d56]"
            >
              {starting
                ? isVietnamese
                  ? "Đang bắt đầu..."
                  : "Starting..."
                : isVietnamese
                  ? "Xuất phát"
                  : "Start Game"}

              {!starting && (
                <span className="ml-2 text-xl opacity-60">
                  →
                </span>
              )}
            </button>
          )}

        {/* FOOTER */}

        <div className="pb-8 pt-7 text-center">
          <p className="text-xs font-medium text-[#81796e] dark:text-[#aaa397]">
            {isVietnamese
              ? "Chờ những người còn lại trước khi lên đường."
              : "Wait for the others before setting off."}
          </p>

          <p className="mt-2 font-mono text-[10px] font-medium tracking-[0.12em] text-[#9b9285] dark:text-[#777167]">
            ĐƯỜNG BIÊN ĐÊM //{" "}
            {room.code}
          </p>
        </div>
      </div>

      {/* START CONFIRMATION */}

      {showStartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#40392e]/45 p-5 backdrop-blur-sm dark:bg-[#090908]/80">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[#d2c7b5] bg-[#faf6ee] shadow-[0_30px_100px_rgba(55,45,30,0.3)] dark:border-[#504a40] dark:bg-[#1b1a18] dark:shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
            <div className="absolute left-0 top-0 h-9 w-9 rounded-tl-3xl border-l-2 border-t-2 border-[#8b7650]" />

            <div className="absolute bottom-0 right-0 h-9 w-9 rounded-br-3xl border-b-2 border-r-2 border-[#8b7650]" />

            <div className="border-b border-[#ded6c9] px-6 py-6 dark:border-[#37342e]">
              <p className="text-sm font-bold tracking-wide text-[#8a7046] dark:text-[#a08c62]">
                START GAME
              </p>

              <h2 className="mt-3 text-2xl font-bold leading-tight text-[#292620] dark:text-[#e5ddcf]">
                {isVietnamese
                  ? "Xác nhận xuất phát?"
                  : "Start the game?"}
              </h2>

              <p className="mt-3 text-base font-medium leading-7 text-[#6c665d] dark:text-[#aaa397]">
                {isVietnamese
                  ? "Chuyến đi sẽ bắt đầu ngay sau khi xác nhận."
                  : "The journey will begin immediately after confirmation."}
              </p>
            </div>

            <div className="space-y-3 p-6">
              <button
                type="button"
                onClick={onStart}
                disabled={starting}
                className="min-h-[58px] w-full rounded-2xl border border-[#89734d] bg-[#806b48] px-5 py-4 text-base font-bold text-[#171512] transition-all active:scale-[0.98] hover:bg-[#927d56] disabled:opacity-50"
              >
                {starting
                  ? isVietnamese
                    ? "Đang bắt đầu..."
                    : "Starting..."
                  : isVietnamese
                    ? "Xác nhận xuất phát"
                    : "Confirm"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowStartConfirm(
                    false
                  )
                }
                disabled={starting}
                className="min-h-[58px] w-full rounded-2xl border border-[#d0c7b9] bg-[#eee8dc] px-5 py-4 text-base font-semibold text-[#625d54] transition-all active:scale-[0.98] hover:bg-[#e4ddd0] disabled:opacity-50 dark:border-[#454139] dark:bg-[#24231f] dark:text-[#aaa398] dark:hover:bg-[#2d2b26]"
              >
                {isVietnamese
                  ? "Hủy"
                  : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}