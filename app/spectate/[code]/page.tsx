"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useLanguage } from "../../components/LanguageProvider";
import { useTheme } from "../../components/ThemeProvider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Player = {
  id: string;
  player_name: string;
  hp: number;
  money: number;
  country: string | null;
  role: string;
  is_connected: boolean;
};

type Room = {
  id: string;
  code: string;
  host_name: string;
  max_players: number;
  status: string;
};

type GameState = {
  round: number;
  phase: string;
};

const countryFlags: Record<string, string> = {
  Vietnam: "🇻🇳",
  "Việt Nam": "🇻🇳",

  Thailand: "🇹🇭",
  "Thái Lan": "🇹🇭",

  Japan: "🇯🇵",
  "Nhật Bản": "🇯🇵",

  Singapore: "🇸🇬",

  "South Korea": "🇰🇷",
  "Hàn Quốc": "🇰🇷",

  China: "🇨🇳",
  "Trung Quốc": "🇨🇳",

  "United States": "🇺🇸",
  "Hoa Kỳ": "🇺🇸",

  "United Kingdom": "🇬🇧",
  "Vương quốc Anh": "🇬🇧",

  France: "🇫🇷",
  "Pháp": "🇫🇷",

  Germany: "🇩🇪",
  "Đức": "🇩🇪",

  Australia: "🇦🇺",
  "Úc": "🇦🇺",

  Canada: "🇨🇦",

  "Malaysia": "🇲🇾",

  Indonesia: "🇮🇩",

  Philippines: "🇵🇭",

  Cambodia: "🇰🇭",
  "Campuchia": "🇰🇭",

  Laos: "🇱🇦",
  "Lào": "🇱🇦",

  Myanmar: "🇲🇲",

  India: "🇮🇳",
  "Ấn Độ": "🇮🇳",
};

function getCountryFlag(country: string | null) {
  if (!country) return "🌍";

  return countryFlags[country] || "🌍";
}

function GameBackground() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundColor: isDark ? "#090a08" : "#e8dfcf",
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

export default function SpectateRoomPage() {
  const params = useParams();

  const code =
    typeof params.code === "string"
      ? params.code
      : "";

  const { language } = useLanguage();
  const isVietnamese = language === "vi";

  const [room, setRoom] =
    useState<Room | null>(null);

  const [players, setPlayers] =
    useState<Player[]>([]);

  const [gameState, setGameState] =
    useState<GameState>({
      round: 0,
      phase: "waiting",
    });

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  async function loadSpectatorRoom() {
    if (!/^\d{6}$/.test(code)) {
      setError(
        isVietnamese
          ? "Mã phòng không hợp lệ."
          : "Invalid room code."
      );

      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/spectate/${code}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (isVietnamese
              ? "Không thể tải phòng."
              : "Unable to load room.")
        );
      }

      if (!data.room) {
        throw new Error(
          isVietnamese
            ? "Không tìm thấy phòng."
            : "Room not found."
        );
      }

      setRoom(data.room);

      setPlayers(
        Array.isArray(data.players)
          ? data.players
          : []
      );

      const state =
        data.gameState ||
        data.game_state ||
        null;

      setGameState({
        round:
          typeof data.round === "number"
            ? data.round
            : typeof state?.round === "number"
              ? state.round
              : 0,

        phase:
          typeof data.phase === "string"
            ? data.phase
            : typeof state?.phase === "string"
              ? state.phase
              : data.room.status === "playing"
                ? "choosing"
                : "waiting",
      });

      setError("");
    } catch (err) {
      console.error(
        "[SPECTATE] Load error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : isVietnamese
            ? "Không thể tải phòng."
            : "Unable to load room."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSpectatorRoom();
  }, [code, isVietnamese]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`spectator-room-${room.id}`)

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          loadSpectatorRoom();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        () => {
          loadSpectatorRoom();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_states",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          loadSpectatorRoom();
        }
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id, isVietnamese]);

  useEffect(() => {
    if (!room?.id) return;

    const interval = window.setInterval(() => {
      loadSpectatorRoom();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [room?.id, code, isVietnamese]);

  function getPhaseLabel() {
    switch (gameState.phase) {
      case "waiting":
        return isVietnamese
          ? "Đang chờ"
          : "Waiting";

      case "generating_event":
        return isVietnamese
          ? "Đang tạo sự kiện"
          : "Generating event";

      case "choosing":
        return isVietnamese
          ? "Đang lựa chọn"
          : "Choosing";

      case "resolving":
        return isVietnamese
          ? "Đang xử lý"
          : "Resolving";

      case "result":
        return isVietnamese
          ? "Kết quả"
          : "Result";

      case "finished":
        return isVietnamese
          ? "Đã kết thúc"
          : "Finished";

      default:
        return gameState.phase;
    }
  }

  function formatMoney(amount: number) {
    return new Intl.NumberFormat("vi-VN").format(
      amount || 0
    );
  }

  /*
   * SPECTATOR PERMISSIONS
   *
   * Spectator được xem:
   * - Tên người chơi
   * - HP
   * - Tiền
   * - Quốc gia hiện tại + cờ
   * - Online / Offline
   *
   * Spectator KHÔNG được xem:
   * - Location thành phố cụ thể
   * - Last choice
   * - Choice hiện tại
   * - Choice data
   * - Inventory
   * - Skills
   * - Quests
   * - Private events
   * - Dice result
   * - Developer / debug data
   *
   * Quốc gia thay đổi theo game state.
   * Ban đầu người chơi ở Việt Nam.
   */

  /* ==========================================
     INVALID ROOM CODE
     ========================================== */

  if (!/^\d{6}$/.test(code)) {
    return (
      <main className="relative min-h-screen overflow-hidden px-4 py-5 text-[#292620] dark:text-[#eee7d9]">
        <GameBackground />

        <div className="relative z-10 mx-auto w-full max-w-md">
          <Link
            href="/spectate"
            className="text-sm font-semibold text-[#625d54] transition hover:text-[#292620] dark:text-[#c0b9ad] dark:hover:text-white"
          >
            ←{" "}
            {isVietnamese
              ? "Nhập mã khác"
              : "Enter another code"}
          </Link>

          <div
            className="
              mt-10
              rounded-3xl
              border
              border-[#d5b9b3]
              bg-[#fbf7f0]/92
              p-7
              text-center
              shadow-[0_18px_50px_rgba(75,55,35,0.18)]
              backdrop-blur-xl
              dark:border-[#55332f]
              dark:bg-[#171614]/88
            "
          >
            <div className="text-4xl">
              ⚠
            </div>

            <h1 className="mt-4 text-2xl font-bold">
              {isVietnamese
                ? "Mã phòng không hợp lệ"
                : "Invalid room code"}
            </h1>

            <p className="mt-3 text-sm font-medium leading-6 text-[#a55f55] dark:text-[#c47d72]">
              {isVietnamese
                ? "Mã phòng phải gồm đúng 6 chữ số."
                : "Room code must contain exactly 6 digits."}
            </p>

            <Link
              href="/spectate"
              className="
                mt-6
                block
                rounded-2xl
                border
                border-[#d0c7b9]
                bg-[#eee8dc]
                py-3.5
                text-sm
                font-bold
                text-[#292620]
                transition
                hover:bg-[#e4ddd0]
                dark:border-[#454139]
                dark:bg-[#24231f]
                dark:text-[#eee7d9]
                dark:hover:bg-[#302e29]
              "
            >
              {isVietnamese
                ? "Nhập mã khác"
                : "Enter another code"}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /* ==========================================
     LOADING
     ========================================== */

  if (loading) {
    return (
      <main className="relative min-h-screen overflow-hidden px-4 py-5 text-[#292620] dark:text-[#eee7d9]">
        <GameBackground />

        <div className="relative z-10 flex min-h-[80vh] items-center justify-center">
          <div
            className="
              rounded-3xl
              border
              border-[#d2c7b5]
              bg-[#f9f5ec]/88
              px-8
              py-7
              text-center
              shadow-[0_18px_50px_rgba(75,55,35,0.13)]
              backdrop-blur-xl
              dark:border-[#3f3c35]
              dark:bg-[#1d1c19]/88
            "
          >
            <div
              className="
                mx-auto
                h-10
                w-10
                animate-spin
                rounded-full
                border-[3px]
                border-[#d8d0c2]
                border-t-[#806b48]
                dark:border-[#403d35]
                dark:border-t-[#bca873]
              "
            />

            <p className="mt-5 text-sm font-semibold text-[#625d54] dark:text-[#aaa397]">
              {isVietnamese
                ? "Đang kết nối phòng..."
                : "Connecting to room..."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* ==========================================
     ERROR
     ========================================== */

  if (error && !room) {
    return (
      <main className="relative min-h-screen overflow-hidden px-4 py-5 text-[#292620] dark:text-[#eee7d9]">
        <GameBackground />

        <div className="relative z-10 mx-auto w-full max-w-md">
          <Link
            href="/spectate"
            className="text-sm font-semibold text-[#625d54] transition hover:text-[#292620] dark:text-[#c0b9ad] dark:hover:text-white"
          >
            ← Spectator
          </Link>

          <div
            className="
              mt-10
              rounded-3xl
              border
              border-[#d5b9b3]
              bg-[#fbf7f0]/92
              p-7
              text-center
              shadow-[0_18px_50px_rgba(75,55,35,0.18)]
              backdrop-blur-xl
              dark:border-[#55332f]
              dark:bg-[#171614]/88
            "
          >
            <div className="text-4xl">
              ⚠
            </div>

            <h1 className="mt-4 text-2xl font-bold">
              {isVietnamese
                ? "Không thể xem phòng"
                : "Could not view room"}
            </h1>

            <p className="mt-3 text-sm font-medium leading-6 text-[#a55f55] dark:text-[#c47d72]">
              {error}
            </p>

            <Link
              href="/spectate"
              className="
                mt-6
                block
                rounded-2xl
                border
                border-[#d0c7b9]
                bg-[#eee8dc]
                py-3.5
                text-sm
                font-bold
                text-[#292620]
                transition
                hover:bg-[#e4ddd0]
                dark:border-[#454139]
                dark:bg-[#24231f]
                dark:text-[#eee7d9]
                dark:hover:bg-[#302e29]
              "
            >
              {isVietnamese
                ? "Về Spectator"
                : "Back to Spectator"}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!room) return null;

  return (
    <main
      className="
        relative
        min-h-screen
        overflow-hidden
        px-4
        py-5
        text-[#292620]
        transition-colors
        duration-300
        dark:text-[#eee7d9]
        sm:px-5
        sm:py-8
      "
    >
      <GameBackground />

      <div className="relative z-10 mx-auto w-full max-w-md">
        {/* ======================================
            HEADER
            ====================================== */}

        <div
          className="
            flex
            items-center
            justify-between
            rounded-2xl
            border
            px-4
            py-3
            backdrop-blur-xl
            border-[#d4cabb]
            bg-[#f7f3ea]/78
            dark:border-[#3c3932]
            dark:bg-[#171614]/72
          "
        >
          <Link
            href="/spectate"
            className="
              text-sm
              font-semibold
              text-[#625d54]
              transition
              hover:text-[#292620]
              dark:text-[#c0b9ad]
              dark:hover:text-white
            "
          >
            ← Spectator
          </Link>

          <span
            className="
              flex
              items-center
              gap-2
              text-sm
              font-semibold
              text-[#65713e]
              dark:text-[#a0b36d]
            "
          >
            <span
              className="
                h-2.5
                w-2.5
                rounded-full
                bg-[#7b8b4c]
                shadow-[0_0_8px_rgba(123,139,76,0.45)]
              "
            />

            LIVE
          </span>
        </div>

        {/* ======================================
            TITLE
            ====================================== */}

        <div className="mt-7 px-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p
                className="
                  text-sm
                  font-semibold
                  text-[#8a7046]
                  dark:text-[#c0a875]
                "
              >
                ĐƯỜNG BIÊN ĐÊM
              </p>

              <h1
                className="
                  mt-2
                  text-4xl
                  font-bold
                  leading-tight
                  tracking-tight
                  text-[#292620]
                  dark:text-[#eee7d9]
                  sm:text-5xl
                "
              >
                {isVietnamese
                  ? "Theo dõi"
                  : "Spectate"}
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

          <div
            className="
              mt-4
              inline-flex
              items-center
              gap-2
              rounded-full
              border
              border-[#d4c49e]
              bg-[#f6eed8]/90
              px-4
              py-2
              text-sm
              font-semibold
              text-[#806b35]
              dark:border-[#665331]
              dark:bg-[#282319]/90
              dark:text-[#c5aa6b]
            "
          >
            👁{" "}
            {isVietnamese
              ? "Chế độ Spectator"
              : "Spectator Mode"}
          </div>
        </div>

        {/* ======================================
            GAME STATUS
            ====================================== */}

        <section
          className="
            relative
            mt-6
            overflow-hidden
            rounded-3xl
            border
            border-[#d2c7b5]
            bg-[#f9f5ec]/84
            shadow-[0_18px_50px_rgba(75,55,35,0.13)]
            backdrop-blur-xl
            dark:border-[#3f3c35]
            dark:bg-[#1d1c19]/82
            dark:shadow-[0_18px_50px_rgba(0,0,0,0.38)]
          "
        >
          <div
            className="
              absolute
              left-0
              top-0
              h-12
              w-12
              rounded-tl-3xl
              border-l-2
              border-t-2
              border-[#9b8151]
              dark:border-[#806d48]
            "
          />

          <div
            className="
              absolute
              bottom-0
              right-0
              h-12
              w-12
              rounded-br-3xl
              border-b-2
              border-r-2
              border-[#9b8151]
              dark:border-[#806d48]
            "
          />

          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#81796e] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "TRẠNG THÁI"
                    : "STATUS"}
                </p>

                <h2 className="mt-1 text-xl font-bold text-[#292620] dark:text-[#dcd4c5]">
                  Round {gameState.round}
                </h2>
              </div>

              <span
                className="
                  rounded-full
                  border
                  border-[#d4c9b8]
                  bg-[#eee8dc]/90
                  px-3
                  py-1.5
                  text-xs
                  font-bold
                  text-[#675e51]
                  dark:border-[#454139]
                  dark:bg-[#25231f]/90
                  dark:text-[#a49678]
                "
              >
                {getPhaseLabel()}
              </span>
            </div>

            <div
              className="
                mt-5
                grid
                grid-cols-2
                gap-3
              "
            >
              <div
                className="
                  rounded-2xl
                  border
                  border-[#d8d0c2]
                  bg-[#eee8dc]/70
                  p-4
                  dark:border-[#34312b]
                  dark:bg-[#25231f]/70
                "
              >
                <p className="text-xs font-semibold text-[#81796e] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "NGƯỜI CHƠI"
                    : "PLAYERS"}
                </p>

                <p className="mt-1 text-2xl font-bold text-[#292620] dark:text-[#dcd4c5]">
                  {players.length}
                  <span className="text-sm font-medium text-[#81796e] dark:text-[#817a70]">
                    {" "}
                    / {room.max_players}
                  </span>
                </p>
              </div>

              <div
                className="
                  rounded-2xl
                  border
                  border-[#d8d0c2]
                  bg-[#eee8dc]/70
                  p-4
                  dark:border-[#34312b]
                  dark:bg-[#25231f]/70
                "
              >
                <p className="text-xs font-semibold text-[#81796e] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "QUỐC GIA"
                    : "COUNTRY"}
                </p>

                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xl">
                    🌍
                  </span>

                  <p className="text-sm font-bold text-[#65713e] dark:text-[#a0b36d]">
                    {isVietnamese
                      ? "Theo người chơi"
                      : "Per player"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================
            PLAYERS
            ====================================== */}

        <section
          className="
            mt-4
            overflow-hidden
            rounded-3xl
            border
            border-[#d2c7b5]
            bg-[#f9f5ec]/84
            shadow-[0_15px_40px_rgba(75,55,35,0.10)]
            backdrop-blur-xl
            dark:border-[#3f3c35]
            dark:bg-[#1b1a18]/84
            dark:shadow-[0_15px_40px_rgba(0,0,0,0.32)]
          "
        >
          <div
            className="
              flex
              items-center
              justify-between
              border-b
              border-[#ddd4c5]
              px-5
              py-4
              dark:border-[#37342e]
            "
          >
            <div>
              <p className="text-sm font-semibold text-[#81796e] dark:text-[#aaa397]">
                {isVietnamese
                  ? "TRONG CHUYẾN ĐI"
                  : "ON THE JOURNEY"}
              </p>

              <h2 className="mt-1 text-lg font-bold text-[#292620] dark:text-[#dcd4c5]">
                {isVietnamese
                  ? "Người chơi"
                  : "Players"}
              </h2>
            </div>

            <span
              className="
                rounded-full
                border
                border-[#d4c9b8]
                bg-[#eee8dc]/90
                px-3
                py-1
                font-mono
                text-sm
                font-bold
                text-[#675e51]
                dark:border-[#454139]
                dark:bg-[#25231f]/90
                dark:text-[#a49678]
              "
            >
              {players.length}
              <span className="mx-1 text-[#aaa194]">
                /
              </span>
              {room.max_players}
            </span>
          </div>

          <div>
            {players.map(
              (player, index) => {
                const hp = Math.max(
                  0,
                  Math.min(
                    100,
                    player.hp ?? 0
                  )
                );

                const country =
                  player.country ||
                  (isVietnamese
                    ? "Không xác định"
                    : "Unknown");

                const countryFlag =
                  getCountryFlag(
                    player.country
                  );

                return (
                  <div
                    key={player.id}
                    className="
                      border-b
                      border-[#e0d8cb]
                      px-5
                      py-5
                      last:border-b-0
                      dark:border-[#302e29]
                    "
                  >
                    {/* PLAYER HEADER */}

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span
                          className="
                            flex
                            h-8
                            w-8
                            shrink-0
                            items-center
                            justify-center
                            rounded-full
                            bg-[#e5ded1]
                            font-mono
                            text-xs
                            font-bold
                            text-[#746b5e]
                            dark:bg-[#302e29]
                            dark:text-[#817a70]
                          "
                        >
                          {index + 1}
                        </span>

                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-[#292620] dark:text-[#d8d0c2]">
                            {player.player_name}
                          </p>

                          <p className="mt-0.5 text-xs font-medium text-[#81796e] dark:text-[#8f897e]">
                            {player.role ===
                            "host"
                              ? "♛ Host"
                              : isVietnamese
                                ? "Người chơi"
                                : "Player"}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
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

                    {/* MONEY + HP */}

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      {/* MONEY */}

                      <div
                        className="
                          rounded-2xl
                          border
                          border-[#d8d0c2]
                          bg-[#eee8dc]/70
                          p-4
                          dark:border-[#34312b]
                          dark:bg-[#25231f]/70
                        "
                      >
                        <p className="text-xs font-semibold text-[#81796e] dark:text-[#aaa397]">
                          💰{" "}
                          {isVietnamese
                            ? "TIỀN"
                            : "MONEY"}
                        </p>

                        <p className="mt-1 break-words text-base font-bold text-[#806b48] dark:text-[#c0a875]">
                          {formatMoney(
                            player.money
                          )}{" "}
                          <span className="text-xs font-semibold">
                            đ
                          </span>
                        </p>
                      </div>

                      {/* HP */}

                      <div
                        className="
                          rounded-2xl
                          border
                          border-[#d8d0c2]
                          bg-[#eee8dc]/70
                          p-4
                          dark:border-[#34312b]
                          dark:bg-[#25231f]/70
                        "
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-[#81796e] dark:text-[#aaa397]">
                            ❤️ HP
                          </p>

                          <span className="font-mono text-sm font-bold text-[#a55f55] dark:text-[#b96e62]">
                            {hp}
                          </span>
                        </div>

                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dcd4c7] dark:bg-[#302e29]">
                          <div
                            className="h-full rounded-full bg-[#7f914d] transition-all duration-500"
                            style={{
                              width: `${hp}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* COUNTRY */}

                    <div
                      className="
                        mt-3
                        rounded-2xl
                        border
                        border-[#d8d0c2]
                        bg-[#eee8dc]/70
                        p-4
                        dark:border-[#34312b]
                        dark:bg-[#25231f]/70
                      "
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="
                            flex
                            h-10
                            w-10
                            shrink-0
                            items-center
                            justify-center
                            rounded-full
                            bg-[#e3dbcc]
                            text-2xl
                            dark:bg-[#302e29]
                          "
                        >
                          {countryFlag}
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#81796e] dark:text-[#aaa397]">
                            {isVietnamese
                              ? "QUỐC GIA"
                              : "COUNTRY"}
                          </p>

                          <p className="mt-1 break-words text-base font-semibold text-[#403c35] dark:text-[#c7c0b3]">
                            {country}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
            )}

            {players.length === 0 && (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-[#81796e] dark:text-[#aaa397]">
                  {isVietnamese
                    ? "Chưa có người chơi."
                    : "No players yet."}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ======================================
            SPECTATOR RULE
            ====================================== */}

        <section
          className="
            mt-4
            rounded-3xl
            border
            border-[#d2c7b5]
            bg-[#f9f5ec]/84
            p-5
            shadow-[0_15px_40px_rgba(75,55,35,0.10)]
            backdrop-blur-xl
            dark:border-[#3f3c35]
            dark:bg-[#1b1a18]/84
            dark:shadow-[0_15px_40px_rgba(0,0,0,0.32)]
          "
        >
          <div className="flex items-start gap-3">
            <div
              className="
                flex
                h-10
                w-10
                shrink-0
                items-center
                justify-center
                rounded-full
                bg-[#e5ded1]
                text-lg
                dark:bg-[#302e29]
              "
            >
              👁️
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#81796e] dark:text-[#aaa397]">
                {isVietnamese
                  ? "QUYỀN SPECTATOR"
                  : "SPECTATOR ACCESS"}
              </p>

              <h3 className="mt-1 text-base font-bold text-[#292620] dark:text-[#dcd4c5]">
                {isVietnamese
                  ? "Thông tin đang hiển thị"
                  : "Visible information"}
              </h3>

              <p className="mt-2 text-sm font-medium leading-6 text-[#6c665d] dark:text-[#aaa397]">
                {isVietnamese
                  ? "Spectator có thể xem tên, HP, tiền, quốc gia hiện tại và trạng thái online/offline của tất cả người chơi."
                  : "Spectators can see player names, HP, current country, and online/offline status."}
              </p>

              <p className="mt-2 text-sm font-medium leading-6 text-[#6c665d] dark:text-[#aaa397]">
                {isVietnamese
                  ? "Vị trí thành phố cụ thể, lựa chọn riêng của người chơi và dữ liệu Developer không được hiển thị."
                  : "Specific city locations, players' private choices, and Developer data are not displayed."}
              </p>
            </div>
          </div>
        </section>

        {/* ======================================
            FOOTER
            ====================================== */}

        <div className="pb-8 pt-7 text-center">
          <p className="text-xs font-medium text-[#81796e] dark:text-[#aaa397]">
            {isVietnamese
              ? "Bạn đang quan sát chuyến đi theo thời gian thực."
              : "You are watching the journey in real time."}
          </p>

          <p className="mt-2 font-mono text-[10px] font-medium tracking-[0.12em] text-[#9b9285] dark:text-[#777167]">
            ĐƯỜNG BIÊN ĐÊM // SPECTATOR //{" "}
            {room.code}
          </p>
        </div>
      </div>
    </main>
  );
}