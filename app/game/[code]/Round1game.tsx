"use client";

import { useEffect, useState } from "react";

import { useTheme } from "../../components/ThemeProvider";

import type {
  BackendChoice,
  GameResponse,
} from "../../../lib/game/types";

import {
  formatMoney,
  getChoiceDescription,
  getChoiceId,
  getChoiceLetter,
  getChoiceTitle,
  getEventQuestion,
  getHpPercent,
  getPhaseText,
  hasChosen,
  isChoosing,
} from "../../../lib/game/game-utils";

type Round1GameProps = {
  data: GameResponse;
  selectedChoice: string | null;
  submitting: boolean;
  showInfo: boolean;
  onChoice: (choiceId: string) => void;
  onToggleInfo: () => void;
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
            ? "rgba(0,0,0,0.32)"
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

export default function Round1Game({
  data,
  selectedChoice,
  submitting,
  showInfo,
  onChoice,
  onToggleInfo,
}: Round1GameProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const {
    room,
    session,
    gameState,
    currentEvent,
    currentPlayer,
    players,
  } = data;

  const choosing = isChoosing(
    gameState.phase
  );

  const alreadyChosen = hasChosen(
    currentPlayer.last_choice,
    selectedChoice
  );

  const [locked, setLocked] =
    useState(false);

  useEffect(() => {
    setLocked(false);
  }, [currentEvent?.id]);

  function handleChoice(
    choiceId: string
  ) {
    if (
      !choosing ||
      submitting ||
      alreadyChosen ||
      locked
    ) {
      return;
    }

    setLocked(true);
    onChoice(choiceId);
  }

  const hpPercent = getHpPercent(
    currentPlayer.hp
  );

  const chosenCount = players.filter(
    (player) =>
      Boolean(player.last_choice)
  ).length;

  return (
    <main
      className={`relative min-h-screen overflow-hidden px-4 py-5 transition-colors duration-300 sm:px-6 sm:py-7 ${
        isDark
          ? "text-[#eee7d9]"
          : "text-[#292620]"
      }`}
    >
      <GameBackground />

      <div className="relative z-10 mx-auto w-full max-w-5xl">

        {/* HEADER */}

        <header
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 backdrop-blur-xl ${
            isDark
              ? "border-[#3c3932] bg-[#171614]/80"
              : "border-[#d4cabb] bg-[#f7f3ea]/90"
          }`}
        >
          <div>
            <p
              className={`text-[9px] font-black uppercase tracking-[0.28em] ${
                isDark
                  ? "text-[#928b80]"
                  : "text-[#887c6d]"
              }`}
            >
              ĐƯỜNG BIÊN ĐÊM
            </p>

            <p className="mt-1 text-sm font-black">
              Hành trình
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-[#65734c] bg-[#596542] px-3 py-1.5 text-[10px] font-black text-white">
              LIVE
            </div>

            <div
              className={`rounded-xl border px-3 py-1.5 text-xs font-black ${
                isDark
                  ? "border-[#49453c] bg-[#25231f]"
                  : "border-[#d2c9bb] bg-[#eee8dc]"
              }`}
            >
              #{room.code}
            </div>
          </div>
        </header>

        {/* ROUND TITLE */}

        <section className="mt-6 px-1">
          <p
            className={`text-[10px] font-black uppercase tracking-[0.24em] ${
              isDark
                ? "text-[#918a80]"
                : "text-[#897d6e]"
            }`}
          >
            ROUND {gameState.round}
          </p>

          <div className="mt-1 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                {currentEvent?.title ??
                  "Đang chuẩn bị..."}
              </h1>

              {session && (
                <p
                  className={`mt-2 text-xs ${
                    isDark
                      ? "text-[#817b72]"
                      : "text-[#8b7f70]"
                  }`}
                >
                  Session #{session.session_number}
                </p>
              )}
            </div>

            <div
              className={`hidden rounded-2xl border px-4 py-3 text-right sm:block ${
                isDark
                  ? "border-[#403d36] bg-[#1c1b18]/80"
                  : "border-[#d4cabc] bg-[#f7f2e8]/90"
              }`}
            >
              <p className="text-[9px] font-black uppercase tracking-wider opacity-60">
                TRẠNG THÁI
              </p>

              <p className="mt-1 text-sm font-black">
                {getPhaseText(
                  gameState.phase
                )}
              </p>
            </div>
          </div>
        </section>

        {/* PLAYER STATUS */}

        <section className="mt-5 grid grid-cols-3 gap-2.5">
          <div
            className={`rounded-2xl border p-3 backdrop-blur-xl ${
              isDark
                ? "border-[#403d36] bg-[#1d1c19]/90"
                : "border-[#d2c7b5] bg-[#f9f5ec]/92"
            }`}
          >
            <p className="text-[9px] font-black uppercase tracking-wider opacity-55">
              💰 TIỀN
            </p>

            <p className="mt-1 truncate text-sm font-black sm:text-base">
              {formatMoney(
                currentPlayer.money
              )}
              đ
            </p>
          </div>

          <div
            className={`rounded-2xl border p-3 backdrop-blur-xl ${
              isDark
                ? "border-[#403d36] bg-[#1d1c19]/90"
                : "border-[#d2c7b5] bg-[#f9f5ec]/92"
            }`}
          >
            <p className="text-[9px] font-black uppercase tracking-wider opacity-55">
              ❤️ MÁU
            </p>

            <p className="mt-1 text-sm font-black sm:text-base">
              {currentPlayer.hp}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-3 backdrop-blur-xl ${
              isDark
                ? "border-[#403d36] bg-[#1d1c19]/90"
                : "border-[#d2c7b5] bg-[#f9f5ec]/92"
            }`}
          >
            <p className="text-[9px] font-black uppercase tracking-wider opacity-55">
              📍 VỊ TRÍ
            </p>

            <p className="mt-1 truncate text-sm font-black sm:text-base">
              {currentPlayer.location ||
                "Việt Nam"}
            </p>
          </div>
        </section>

        {/* HP */}

        <section
          className={`mt-3 rounded-2xl border px-4 py-3 ${
            isDark
              ? "border-[#403d36] bg-[#1d1c19]/90"
              : "border-[#d2c7b5] bg-[#f9f5ec]/92"
          }`}
        >
          <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="opacity-55">
              Sức khỏe
            </span>

            <span>
              {currentPlayer.hp}/100
            </span>
          </div>

          <div
            className={`mt-2 h-2 overflow-hidden rounded-full ${
              isDark
                ? "bg-[#302e29]"
                : "bg-[#ded6c9]"
            }`}
          >
            <div
              className="h-full rounded-full bg-[#71804e] transition-all duration-500"
              style={{
                width: `${hpPercent}%`,
              }}
            />
          </div>
        </section>

        {/* EVENT */}

        <section
          className={`relative mt-5 overflow-hidden rounded-[30px] border backdrop-blur-xl ${
            isDark
              ? "border-[#403d36] bg-[#181714]/95"
              : "border-[#d2c7b5] bg-[#faf6ed]/95"
          }`}
        >
          <div
            className={`absolute left-5 top-5 h-9 w-9 border-l border-t ${
              isDark
                ? "border-[#74664e]"
                : "border-[#aa9677]"
            }`}
          />

          <div
            className={`absolute right-5 top-5 h-9 w-9 border-r border-t ${
              isDark
                ? "border-[#74664e]"
                : "border-[#aa9677]"
            }`}
          />

          <div className="p-6 sm:p-9">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] ${
                  isDark
                    ? "border-[#554d40] bg-[#2b271f] text-[#c8beae]"
                    : "border-[#d3c7b6] bg-[#eee7db] text-[#776b5c]"
                }`}
              >
                🎲 TÌNH HUỐNG
              </span>

              <span className="text-[10px] font-bold opacity-50">
                EVENT #{gameState.round}
              </span>
            </div>

            {currentEvent ? (
              <>
                <h2 className="mt-7 text-3xl font-black leading-tight sm:text-5xl">
                  {currentEvent.title}
                </h2>

                <p
                  className={`mt-6 whitespace-pre-line text-[15px] leading-8 sm:text-lg sm:leading-9 ${
                    isDark
                      ? "text-[#d8d1c5]"
                      : "text-[#403a32]"
                  }`}
                >
                  {currentEvent.description}
                </p>

                <div
                  className={`mt-7 rounded-2xl border p-5 sm:p-6 ${
                    isDark
                      ? "border-[#504a40] bg-[#27241f]"
                      : "border-[#d8cdbd] bg-[#eee8dc]"
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-55">
                    QUYẾT ĐỊNH
                  </p>

                  <p className="mt-3 text-lg font-black leading-8 sm:text-2xl sm:leading-9">
                    {getEventQuestion(
                      currentEvent
                    )}
                  </p>
                </div>
              </>
            ) : (
              <div className="py-14 text-center">
                <div className="text-5xl">
                  🎲
                </div>

                <p className="mt-5 text-lg font-black">
                  Game Master đang chuẩn bị
                  sự kiện...
                </p>
              </div>
            )}
          </div>
        </section>

        {/* CHOICES */}

        {currentEvent &&
          currentEvent.choices?.length > 0 && (
            <section className="mt-6">
              <div className="mb-4 flex items-end justify-between px-1">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">
                    LỰA CHỌN
                  </p>

                  <h3 className="mt-1 text-xl font-black sm:text-2xl">
                    Bạn sẽ làm gì?
                  </h3>
                </div>

                <p className="text-xs font-bold opacity-55">
                  {chosenCount}/{players.length}{" "}
                  đã chọn
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {currentEvent.choices.map(
                  (
                    choice: BackendChoice,
                    index: number
                  ) => {
                    const id =
                      getChoiceId(
                        choice,
                        index
                      );

                    const selected =
                      selectedChoice === id ||
                      currentPlayer.last_choice ===
                        id;

                    const disabled =
                      !choosing ||
                      submitting ||
                      alreadyChosen ||
                      locked;

                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          handleChoice(id)
                        }
                        className={`rounded-[24px] border p-5 text-left transition-all sm:p-6 ${
                          selected
                            ? isDark
                              ? "border-[#a18a60] bg-[#302b21]"
                              : "border-[#a28b65] bg-[#eee5d5]"
                            : isDark
                              ? "border-[#454139] bg-[#1d1c19]/92 hover:border-[#716857]"
                              : "border-[#d2c8ba] bg-[#f9f5ec]/96 hover:border-[#b5a68c]"
                        } ${
                          !disabled
                            ? "cursor-pointer active:scale-[0.985]"
                            : "cursor-default"
                        }`}
                      >
                        <div className="flex gap-4">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black ${
                              selected
                                ? "bg-[#806b48] text-[#181612]"
                                : isDark
                                  ? "bg-[#302e28] text-[#c0b8aa]"
                                  : "bg-[#e5ded1] text-[#74695b]"
                            }`}
                          >
                            {getChoiceLetter(
                              index
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-base font-black leading-7 sm:text-lg">
                              {getChoiceTitle(
                                choice
                              )}
                            </p>

                            {getChoiceDescription(
                              choice
                            ) && (
                              <p className="mt-1.5 text-sm leading-6 opacity-65">
                                {getChoiceDescription(
                                  choice
                                )}
                              </p>
                            )}
                          </div>

                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
                              selected
                                ? "border-[#806b48] bg-[#806b48] text-[#181612]"
                                : isDark
                                  ? "border-[#514d45] text-transparent"
                                  : "border-[#cec5b8] text-transparent"
                            }`}
                          >
                            ✓
                          </div>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>

              <div
                className={`mt-4 rounded-2xl border p-4 text-center text-sm font-semibold ${
                  isDark
                    ? "border-[#403d36] bg-[#1d1c19]/90 text-[#aaa39a]"
                    : "border-[#d5ccbf] bg-[#f6f1e8]/95 text-[#776e62]"
                }`}
              >
                {submitting ? (
                  "⏳ Đang gửi lựa chọn..."
                ) : alreadyChosen ? (
                  "✓ Đã ghi nhận lựa chọn của bạn."
                ) : choosing ? (
                  "Chọn một phương án để tiếp tục."
                ) : (
                  getPhaseText(
                    gameState.phase
                  )
                )}
              </div>
            </section>
          )}

        {/* PLAYERS */}

        <section
          className={`mt-6 overflow-hidden rounded-[28px] border backdrop-blur-xl ${
            isDark
              ? "border-[#3f3c35] bg-[#1d1c19]/88"
              : "border-[#d2c7b5] bg-[#f9f5ec]/92"
          }`}
        >
          <button
            type="button"
            onClick={onToggleInfo}
            className="flex w-full items-center justify-between px-5 py-5 text-left sm:px-6"
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">
                NGƯỜI CHƠI
              </p>

              <h3 className="mt-1 text-xl font-black">
                Bảng hành trình
              </h3>
            </div>

            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current/20">
              {showInfo ? "⌃" : "⌄"}
            </span>
          </button>

          {showInfo && (
            <div className="border-t border-current/10 p-4 sm:p-6">
              <div className="space-y-3">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className={`rounded-2xl border p-4 ${
                      player.id ===
                      currentPlayer.id
                        ? isDark
                          ? "border-[#776647] bg-[#29251e]"
                          : "border-[#b5a17e] bg-[#eee5d7]"
                        : isDark
                          ? "border-[#403d36] bg-[#24221e]"
                          : "border-[#d8cec0] bg-[#f4efe7]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            player.is_connected
                              ? "bg-[#71804e]"
                              : "bg-[#99938a]"
                          }`}
                        />

                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">
                            {player.player_name}

                            {player.id ===
                              currentPlayer.id && (
                              <span className="ml-2 text-[9px] opacity-55">
                                BẠN
                              </span>
                            )}
                          </p>

                          <p className="text-[11px] opacity-50">
                            {player.is_connected
                              ? "Online"
                              : "Offline"}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right text-xs font-bold">
                        <div>
                          ❤️ {player.hp}
                        </div>

                        <div className="mt-1">
                          💰{" "}
                          {formatMoney(
                            player.money
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <footer className="py-9 text-center text-[10px] font-medium opacity-45">
          ĐƯỜNG BIÊN ĐÊM · Mỗi lựa chọn đều có
          giá của nó.
        </footer>
      </div>
    </main>
  );
}