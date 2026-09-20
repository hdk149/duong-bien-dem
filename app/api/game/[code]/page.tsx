"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "../../../components/LanguageProvider";
import { useTheme } from "../../../components/ThemeProvider";
import { triggerEndGame } from "../../../components/EndGameOverlay";

type Choice = {
  id: string;
  text?: string;
  label?: string;
  description?: string;
  [key: string]: unknown;
};

type EventData = {
  id: string;
  round: number;
  title: string;
  description: string;
  event_type: string;
  choices: Choice[];
};

type GamePlayer = {
  id: string;
  playerName?: string;
  player_name?: string;
  hp?: number;
  money?: number | string;
  location?: string;
  location_id?: string;
  role?: string;
  isConnected?: boolean;
  is_connected?: boolean;
  lastChoice?: string | null;
  last_choice?: string | null;
};

type GameData = {
  success: boolean;

  room: {
    id: string;
    code: string;
    hostName?: string;
    host_name?: string;
    maxPlayers: number;
    status: string;
    goalMoney?: number | string;
    goal_money?: number | string;
    diceSystem?: string;
    dice_system?: string;
  };

  session: {
    id: string;
    sessionNumber?: number;
    session_number?: number;
    status: string;
    round: number;
    phase: string;
    currentEventId?: string | null;
    current_event_id?: string | null;
  };

  currentPlayer: {
    id: string;
    playerName?: string;
    player_name?: string;
    hp: number;
    money: number | string;
    location: string;
    location_id?: string;
    role: string;
    isConnected?: boolean;
    is_connected?: boolean;
    lastChoice?: string | null;
    last_choice?: string | null;
  };

  players?: GamePlayer[];

  event: EventData | null;

  choiceStatus: {
    selected: boolean;
    selectedChoiceId: string | null;
    chosenPlayers: number;
    totalPlayers: number;
    allPlayersChosen: boolean;
  };
};

type ApiError = {
  error?: string;
  message?: string;
};

const PLAYER_STATS_STORAGE_KEY =
  "duong-bien-dem-player-stats-visible";

const DEFAULT_GOAL_MONEY = 400_000_000;

function formatMoney(value: number | string) {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(number)) {
    return "0đ";
  }

  return `${new Intl.NumberFormat("vi-VN").format(
    number
  )}đ`;
}

function getChoiceText(choice: Choice) {
  return (
    choice.text ||
    choice.label ||
    choice.description ||
    choice.id
  );
}

function getChoiceLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function getPlayerName(player: GamePlayer) {
  return (
    player.playerName ||
    player.player_name ||
    "Player"
  );
}

function getPlayerConnected(player: GamePlayer) {
  return (
    player.isConnected ??
    player.is_connected ??
    false
  );
}

function getPlayerHp(player: GamePlayer) {
  return player.hp ?? 0;
}

function getPlayerMoney(player: GamePlayer) {
  return player.money ?? 0;
}

function getNumericMoney(
  value: number | string | undefined
) {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();

  const code = String(params.code);

  const { language } = useLanguage();
  const { theme } = useTheme();

  const isVietnamese = language === "vi";
  const isDark = theme === "dark";

  const [game, setGame] =
    useState<GameData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [localChoice, setLocalChoice] =
    useState<string | null>(null);

  const [connectionLost, setConnectionLost] =
    useState(false);

  const [playersOpen, setPlayersOpen] =
    useState(false);

  const [playerStatsVisible, setPlayerStatsVisible] =
    useState(true);

  const requestIdRef =
    useRef(0);

  const submittingRef =
    useRef(false);

  /*
   * ==========================================================
   * END GAME
   *
   * Quan trọng:
   * Không dùng state để chống trigger vì polling chạy liên tục.
   * Ref đảm bảo overlay chỉ được gọi 1 lần.
   * ==========================================================
   */

  const endGameTriggeredRef =
    useRef(false);

  const triggerGameEndOverlay =
    useCallback(
      (gameData: GameData) => {
        if (
          endGameTriggeredRef.current
        ) {
          return;
        }

        const roomStatus =
          String(
            gameData.room?.status ?? ""
          ).toLowerCase();

        const sessionStatus =
          String(
            gameData.session?.status ?? ""
          ).toLowerCase();

        const phase =
          String(
            gameData.session?.phase ?? ""
          ).toLowerCase();

        const currentMoney =
          getNumericMoney(
            gameData.currentPlayer
              ?.money
          );

        const configuredGoal =
          getNumericMoney(
            gameData.room
              ?.goalMoney ??
              gameData.room
                ?.goal_money
          );

        const goalMoney =
          configuredGoal > 0
            ? configuredGoal
            : DEFAULT_GOAL_MONEY;

        const forceFinished =
          roomStatus ===
            "finished" ||
          sessionStatus ===
            "finished" ||
          phase ===
            "finished";

        const reachedGoal =
          currentMoney >=
          goalMoney;

        if (
          !forceFinished &&
          !reachedGoal
        ) {
          return;
        }

        endGameTriggeredRef.current =
          true;

        const currentPlayer =
          gameData.currentPlayer;

        const playerName =
          currentPlayer.playerName ||
          currentPlayer.player_name ||
          "Người sống sót";

        const reason =
          reachedGoal &&
          !forceFinished
            ? isVietnamese
              ? "Bạn đã đạt mốc tài sản chiến thắng!"
              : "You reached the victory wealth goal!"
            : isVietnamese
              ? "Trận đấu đã được kết thúc bởi hệ thống."
              : "The game was ended by the system.";

        console.log(
          "[GAME] END GAME OVERLAY TRIGGERED",
          {
            code,
            roomStatus,
            sessionStatus,
            phase,
            currentMoney,
            goalMoney,
            reason,
          }
        );

        triggerEndGame({
          playerName,
          money: currentMoney,
          hp:
            currentPlayer.hp ??
            100,
          location:
            currentPlayer.location ||
            "Việt Nam",
          rounds:
            gameData.session.round ??
            0,
          message:
            isVietnamese
              ? `Chúc mừng ${playerName}! ${reason} Cảm ơn bạn đã sống sót qua hành trình Đường Biên Đêm.`
              : `Congratulations ${playerName}! ${reason} Thank you for surviving the Night Border journey.`,
        });
      },
      [code, isVietnamese]
    );

  /*
   * ==========================================================
   * PLAYER TOKEN
   * ==========================================================
   */

  const getPlayerToken = useCallback(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return null;
    }

    return (
      sessionStorage.getItem(
        "player_token"
      ) ||
      localStorage.getItem(
        "player_token"
      )
    );
  }, []);

  /*
   * ==========================================================
   * PLAYER STATS VISIBILITY
   * ==========================================================
   */

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(
          PLAYER_STATS_STORAGE_KEY
        );

      if (saved === "false") {
        setPlayerStatsVisible(false);
      } else {
        setPlayerStatsVisible(true);
      }
    } catch {
      setPlayerStatsVisible(true);
    }
  }, []);

  function togglePlayerStats() {
    setPlayerStatsVisible((current) => {
      const next = !current;

      try {
        window.localStorage.setItem(
          PLAYER_STATS_STORAGE_KEY,
          String(next)
        );
      } catch {}

      if (!next) {
        setPlayersOpen(false);
      }

      return next;
    });
  }

  /*
   * ==========================================================
   * LOAD GAME
   * ==========================================================
   */

  const loadGame = useCallback(
    async (silent = false) => {
      const requestId =
        ++requestIdRef.current;

      try {
        const token =
          getPlayerToken();

        if (!token) {
          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          setError(
            isVietnamese
              ? "Không tìm thấy phiên người chơi."
              : "Player session not found."
          );

          setLoading(false);
          return;
        }

        const response =
          await fetch(
            `/api/rooms/${code}/game-state`,
            {
              method: "GET",
              headers: {
                "x-player-token":
                  token,
              },
              cache: "no-store",
            }
          );

        let data:
          | GameData
          | ApiError = {};

        try {
          data =
            (await response.json()) as
              | GameData
              | ApiError;
        } catch {
          throw new Error(
            isVietnamese
              ? "Server trả về dữ liệu không hợp lệ."
              : "Server returned invalid data."
          );
        }

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        if (!response.ok) {
          const apiError =
            data as ApiError;

          const message =
            apiError.error ||
            apiError.message ||
            "";

          if (
            message
              .toLowerCase()
              .includes("chưa bắt đầu") ||
            message
              .toLowerCase()
              .includes("not started")
          ) {
            router.replace(
              `/room/${code}`
            );

            return;
          }

          throw new Error(
            message ||
              (isVietnamese
                ? "Không thể tải trạng thái game."
                : "Unable to load game state.")
          );
        }

        const gameData =
          data as GameData;

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        /*
         * ======================================================
         * QUAN TRỌNG
         *
         * Kiểm tra END GAME ngay khi nhận state từ server.
         *
         * Developer Force End:
         *   room.status/session.status/phase = finished
         *
         * Goal:
         *   currentPlayer.money >= goalMoney
         * ======================================================
         */

        triggerGameEndOverlay(
          gameData
        );

        setGame(
          gameData
        );

        setError("");

        setConnectionLost(
          false
        );

        if (
          gameData.choiceStatus.selected
        ) {
          setLocalChoice(
            gameData
              .choiceStatus
              .selectedChoiceId
          );
        } else if (
          !submittingRef.current
        ) {
          setLocalChoice(
            null
          );
        }
      } catch (err) {
        console.error(
          "GAME PAGE LOAD ERROR:",
          err
        );

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        setConnectionLost(
          true
        );

        if (!silent) {
          setError(
            err instanceof Error
              ? err.message
              : isVietnamese
                ? "Không thể kết nối game."
                : "Unable to connect to game."
          );
        }
      } finally {
        if (
          requestId ===
          requestIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [
      code,
      getPlayerToken,
      isVietnamese,
      router,
      triggerGameEndOverlay,
    ]
  );

  /*
   * ==========================================================
   * INITIAL LOAD
   * ==========================================================
   */

  useEffect(() => {
    loadGame(false);
  }, [loadGame]);

  /*
   * ==========================================================
   * POLLING
   *
   * Force End được phát hiện tối đa sau ~1.5 giây.
   * ==========================================================
   */

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        if (
          submittingRef.current
        ) {
          return;
        }

        loadGame(true);
      }, 1500);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [loadGame]);

  /*
   * ==========================================================
   * CHOOSE
   * ==========================================================
   */

  async function choose(
    choiceId: string
  ) {
    if (
      submitting ||
      !game?.event ||
      game.choiceStatus.selected
    ) {
      return;
    }

    const token =
      getPlayerToken();

    if (!token) {
      setError(
        isVietnamese
          ? "Không tìm thấy phiên người chơi."
          : "Player session not found."
      );

      return;
    }

    const eventId =
      game.event.id;

    submittingRef.current =
      true;

    ++requestIdRef.current;

    setSubmitting(
      true
    );

    setLocalChoice(
      choiceId
    );

    setError("");

    try {
      const response =
        await fetch(
          `/api/rooms/${code}/choose`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "x-player-token":
                token,
            },
            body: JSON.stringify({
              event_id:
                eventId,
              choice_id:
                choiceId,
            }),
            cache: "no-store",
          }
        );

      let data:
        | Record<string, unknown>
        | ApiError = {};

      try {
        data =
          await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          "error" in data &&
          typeof data.error ===
            "string"
            ? data.error
            : "message" in data &&
                typeof data.message ===
                  "string"
              ? data.message
              : isVietnamese
                ? "Không thể gửi lựa chọn."
                : "Unable to submit choice."
        );
      }

      await loadGame(
        true
      );
    } catch (err) {
      console.error(
        "CHOOSE ERROR:",
        err
      );

      setLocalChoice(
        null
      );

      setError(
        err instanceof Error
          ? err.message
          : isVietnamese
            ? "Không thể gửi lựa chọn."
            : "Unable to submit choice."
      );
    } finally {
      submittingRef.current =
        false;

      setSubmitting(
        false
      );

      void loadGame(
        true
      );
    }
  }

  /*
   * ==========================================================
   * DERIVED STATE
   * ==========================================================
   */

  const phase =
    game?.session.phase ||
    "waiting";

  const isChoosing =
    phase === "choosing";

  const isGenerating =
    phase ===
    "generating_event";

  const isResolving =
    phase === "resolving";

  const isResult =
    phase === "result";

  const isFinished =
    phase === "finished" ||
    game?.session.status ===
      "finished" ||
    game?.room.status ===
      "finished";

  const hasSelected =
    game?.choiceStatus.selected ||
    submitting;

  const selectedChoiceId =
    game?.choiceStatus
      .selectedChoiceId ||
    (submitting
      ? localChoice
      : null);

  const progressText =
    useMemo(() => {
      if (!game) {
        return "";
      }

      return `${game.choiceStatus.chosenPlayers}/${game.choiceStatus.totalPlayers}`;
    }, [game]);

  const otherPlayers =
    useMemo(() => {
      if (!game) {
        return [];
      }

      const players =
        Array.isArray(
          game.players
        )
          ? game.players
          : [];

      return players.filter(
        (player) =>
          player.id !==
            game.currentPlayer.id &&
          player.role !==
            "spectator"
      );
    }, [game]);

  /*
   * ==========================================================
   * THEME
   * ==========================================================
   */

  const pageClass =
    isDark
      ? "bg-[#0b0a08] text-[#eee7d9]"
      : "bg-[#e8dfcf] text-[#292620]";

  const cardClass =
    isDark
      ? "border-[#403b33] bg-[#191815]"
      : "border-[#d2c7b5] bg-[#f9f5ec]";

  const softClass =
    isDark
      ? "border-[#403b33] bg-[#24211c]"
      : "border-[#d9cfbf] bg-[#f2ede3]";

  const dividerClass =
    isDark
      ? "border-[#353129]"
      : "border-[#ded5c7]";

  const mutedClass =
    isDark
      ? "text-[#aaa397]"
      : "text-[#81796e]";

  const bodyMutedClass =
    isDark
      ? "text-[#c5bcae]"
      : "text-[#675e51]";

  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (loading) {
    return (
      <main
        className={`min-h-[100dvh] ${pageClass}`}
      >
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center justify-center px-5">
          <div className="w-full max-w-md">
            <div
              className={`h-px w-full overflow-hidden ${
                isDark
                  ? "bg-[#302d28]"
                  : "bg-[#d3c8b7]"
              }`}
            >
              <div
                className={`h-full w-1/2 animate-pulse ${
                  isDark
                    ? "bg-[#b7a98e]"
                    : "bg-[#675e51]"
                }`}
              />
            </div>

            <div className="mt-5 text-center">
              <p
                className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedClass}`}
              >
                {isVietnamese
                  ? "Đường Biên Đêm"
                  : "Night Border"}
              </p>

              <p
                className={`mt-2 text-sm ${mutedClass}`}
              >
                {isVietnamese
                  ? "Đang kết nối vào trận..."
                  : "Connecting to game..."}
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ==========================================================
   * ERROR
   * ==========================================================
   */

  if (!game) {
    return (
      <main
        className={`min-h-[100dvh] ${pageClass}`}
      >
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5">
          <div
            className={`rounded-[28px] border p-6 shadow-[0_20px_60px_rgba(60,45,30,0.10)] ${cardClass}`}
          >
            <div
              className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${softClass}`}
            >
              ⚠️
            </div>

            <p
              className={`text-[10px] font-bold uppercase tracking-[0.18em] ${mutedClass}`}
            >
              {isVietnamese
                ? "Đường Biên Đêm"
                : "Night Border"}
            </p>

            <h1 className="mt-2 text-xl font-bold tracking-tight">
              {isVietnamese
                ? "Không thể vào game"
                : "Unable to enter game"}
            </h1>

            <p
              className={`mt-3 text-sm leading-6 ${mutedClass}`}
            >
              {error ||
                (isVietnamese
                  ? "Đã xảy ra lỗi."
                  : "Something went wrong.")}
            </p>

            <button
              type="button"
              onClick={() =>
                loadGame(false)
              }
              className={`mt-6 min-h-12 w-full rounded-2xl font-semibold transition active:scale-[0.98] ${
                isDark
                  ? "bg-[#eee7d9] text-[#161512] hover:bg-white"
                  : "bg-[#292620] text-[#f9f5ec] hover:bg-[#403a31]"
              }`}
            >
              {isVietnamese
                ? "Thử lại"
                : "Try again"}
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/room/${code}`
                )
              }
              className={`mt-2 min-h-12 w-full rounded-2xl border font-semibold transition active:scale-[0.98] ${dividerClass} ${mutedClass}`}
            >
              {isVietnamese
                ? "Quay lại phòng"
                : "Back to room"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ==========================================================
   * MAIN
   * ==========================================================
   */

  return (
    <main
      className={`min-h-[100dvh] ${pageClass}`}
    >
      <div className="mx-auto min-h-[100dvh] w-full max-w-2xl">
        <div className="px-3 pb-32 pt-3 sm:px-5 sm:pt-5">

          {/* TOP BAR */}

          <header className="mb-3 flex items-center justify-between px-1">
            <div>
              <p
                className={`text-[9px] font-bold uppercase tracking-[0.2em] ${mutedClass}`}
              >
                {isVietnamese
                  ? "Đường Biên Đêm"
                  : "Night Border"}
              </p>

              <p className="mt-0.5 text-sm font-bold">
                {isVietnamese
                  ? `Vòng ${game.session.round}`
                  : `Round ${game.session.round}`}
              </p>
            </div>

            <div className="text-right">
              <p
                className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${mutedClass}`}
              >
                {isVietnamese
                  ? "Phòng"
                  : "Room"}
              </p>

              <p className="mt-0.5 font-mono text-sm font-bold tracking-[0.12em]">
                {code}
              </p>
            </div>
          </header>

          {/* EVENT CARD */}

          {game.event && (
            <section
              className={`overflow-hidden rounded-[26px] border shadow-[0_18px_50px_rgba(65,48,30,0.10)] ${cardClass}`}
            >
              {/* MY STATUS */}

              <div
                className={`border-b px-3 py-3 sm:px-4 ${dividerClass}`}
              >
                <div
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${softClass}`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      (
                        game.currentPlayer
                          .isConnected ??
                        game.currentPlayer
                          .is_connected ??
                        false
                      )
                        ? "bg-[#849553] shadow-[0_0_8px_rgba(132,149,83,0.55)]"
                        : "bg-[#a45d52]"
                    }`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold sm:text-sm">
                        {game.currentPlayer.playerName ||
                          game.currentPlayer.player_name}
                      </span>

                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider ${
                          (
                            game.currentPlayer
                              .isConnected ??
                            game.currentPlayer
                              .is_connected ??
                            false
                          )
                            ? isDark
                              ? "text-[#a7b774]"
                              : "text-[#65713e]"
                            : isDark
                              ? "text-[#c47d72]"
                              : "text-[#a45d52]"
                        }`}
                      >
                        {(
                          game.currentPlayer
                            .isConnected ??
                          game.currentPlayer
                            .is_connected ??
                          false
                        )
                          ? "Online"
                          : "Offline"}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-4 text-[11px]">
                      <span className={bodyMutedClass}>
                        ❤️{" "}
                        <strong>
                          {
                            game.currentPlayer
                              .hp
                          }
                        </strong>
                      </span>

                      <span className={bodyMutedClass}>
                        💰{" "}
                        <strong>
                          {formatMoney(
                            game.currentPlayer
                              .money
                          )}
                        </strong>
                      </span>

                      <span
                        className={`min-w-0 truncate ${mutedClass}`}
                      >
                        📍{" "}
                        <strong className={bodyMutedClass}>
                          {
                            game.currentPlayer
                              .location
                          }
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* EVENT HEADER */}

              <div
                className="px-4 pb-5 pt-5 sm:px-5 sm:pb-6 sm:pt-6"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.15em] ${
                      isDark
                        ? "border-[#464137] bg-[#24211c] text-[#aaa397]"
                        : "border-[#d7ccba] bg-[#eee8dc] text-[#675e51]"
                    }`}
                  >
                    {
                      game.event
                        .event_type
                    }
                  </span>

                  <span
                    className={`text-[10px] ${mutedClass}`}
                  >
                    /
                  </span>

                  <span
                    className={`text-[10px] font-medium uppercase tracking-wider ${mutedClass}`}
                  >
                    {isVietnamese
                      ? `Vòng ${game.event.round}`
                      : `Round ${game.event.round}`}
                  </span>
                </div>

                <h1 className="mt-4 text-[21px] font-bold leading-[1.2] tracking-[-0.02em] sm:text-[25px]">
                  {
                    game.event.title
                  }
                </h1>

                <p
                  className={`mt-3 whitespace-pre-line text-[13px] leading-[1.7] sm:text-[14px] ${bodyMutedClass}`}
                >
                  {
                    game.event
                      .description
                  }
                </p>
              </div>

              {/* CHOICES */}

              {isChoosing && (
                <div
                  className={`border-t p-2.5 sm:p-3 ${dividerClass}`}
                >
                  <div className="space-y-2">
                    {game.event.choices.map(
                      (
                        choice,
                        index
                      ) => {
                        const selected =
                          selectedChoiceId ===
                          choice.id;

                        const disabled =
                          submitting ||
                          game.choiceStatus
                            .selected;

                        return (
                          <button
                            key={
                              choice.id
                            }
                            type="button"
                            disabled={
                              disabled
                            }
                            onClick={() =>
                              choose(
                                choice.id
                              )
                            }
                            className={`group relative min-h-[62px] w-full rounded-[17px] border p-3 text-left transition-all active:scale-[0.985] sm:min-h-[72px] sm:rounded-[19px] sm:p-3.5 ${
                              selected
                                ? isDark
                                  ? "border-[#eee7d9] bg-[#eee7d9] text-[#171512]"
                                  : "border-[#292620] bg-[#292620] text-[#f9f5ec]"
                                : isDark
                                  ? "border-[#39362f] bg-[#24211c] hover:border-[#5a5448]"
                                  : "border-[#d8cebe] bg-[#f7f3ea] hover:border-[#aaa092]"
                            } ${
                              disabled &&
                              !selected
                                ? "cursor-default opacity-45"
                                : ""
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${
                                  selected
                                    ? isDark
                                      ? "bg-[#292620] text-[#eee7d9]"
                                      : "bg-[#f9f5ec] text-[#292620]"
                                    : isDark
                                      ? "bg-[#302d27] text-[#c9c0b1]"
                                      : "bg-white text-[#675e51] shadow-[0_2px_7px_rgba(60,45,30,0.08)]"
                                }`}
                              >
                                {getChoiceLetter(
                                  index
                                )}
                              </div>

                              <div className="min-w-0 flex-1 pt-0.5">
                                <div className="text-[12px] font-semibold leading-5 sm:text-[14px]">
                                  {getChoiceText(
                                    choice
                                  )}
                                </div>

                                {choice.description &&
                                  choice.text && (
                                    <div
                                      className={`mt-1 text-[10px] leading-4 ${
                                        selected
                                          ? "opacity-65"
                                          : "opacity-50"
                                      }`}
                                    >
                                      {
                                        choice.description
                                      }
                                    </div>
                                  )}
                              </div>

                              {selected && (
                                <span className="pt-0.5 text-sm font-bold">
                                  ✓
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      }
                    )}
                  </div>

                  {hasSelected && (
                    <div
                      className={`mt-2 rounded-[17px] border px-4 py-3 text-center ${softClass}`}
                    >
                      <div className="text-xs font-bold">
                        {isVietnamese
                          ? "✓ Đã lựa chọn"
                          : "✓ Choice submitted"}
                      </div>

                      <div
                        className={`mt-1 text-[10px] ${mutedClass}`}
                      >
                        {isVietnamese
                          ? `Đang chờ người chơi khác · ${progressText}`
                          : `Waiting for other players · ${progressText}`}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* PLAYER STATS */}

          {otherPlayers.length > 0 && (
            <section
              className={`mt-3 overflow-hidden rounded-[22px] border shadow-[0_10px_35px_rgba(65,48,30,0.07)] ${cardClass}`}
            >
              {!playerStatsVisible ? (
                <button
                  type="button"
                  onClick={togglePlayerStats}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm ${softClass}`}
                    >
                      👥
                    </div>

                    <div className="min-w-0">
                      <p
                        className={`text-[9px] font-bold uppercase tracking-[0.16em] ${mutedClass}`}
                      >
                        {isVietnamese
                          ? "Thông tin"
                          : "Information"}
                      </p>

                      <h2 className="mt-0.5 truncate text-sm font-bold">
                        {isVietnamese
                          ? "Player Stats đang ẩn"
                          : "Player Stats hidden"}
                      </h2>
                    </div>
                  </div>

                  <span
                    className={`rounded-xl border px-3 py-2 text-[10px] font-bold ${softClass}`}
                  >
                    {isVietnamese
                      ? "Hiện"
                      : "Show"}
                  </span>
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPlayersOpen(
                          (current) =>
                            !current
                        )
                      }
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm ${softClass}`}
                      >
                        👥
                      </div>

                      <div className="min-w-0">
                        <p
                          className={`text-[9px] font-bold uppercase tracking-[0.16em] ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Thông tin"
                            : "Information"}
                        </p>

                        <h2 className="mt-0.5 truncate text-sm font-bold">
                          {isVietnamese
                            ? "Người chơi khác"
                            : "Other players"}
                        </h2>
                      </div>
                    </button>

                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      <span
                        className={`flex h-7 min-w-7 items-center justify-center rounded-full border px-2 font-mono text-[10px] font-bold ${softClass}`}
                      >
                        {
                          otherPlayers.length
                        }
                      </span>

                      <button
                        type="button"
                        onClick={togglePlayerStats}
                        aria-label={
                          isVietnamese
                            ? "Ẩn Player Stats"
                            : "Hide Player Stats"
                        }
                        className={`rounded-xl border px-2.5 py-1.5 text-[9px] font-bold transition active:scale-95 ${softClass}`}
                      >
                        {isVietnamese
                          ? "Ẩn"
                          : "Hide"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPlayersOpen(
                            (current) =>
                              !current
                          )
                        }
                        aria-label={
                          isVietnamese
                            ? "Mở hoặc đóng danh sách người chơi"
                            : "Open or close player list"
                        }
                        className={`flex h-7 w-7 items-center justify-center rounded-xl text-base transition-transform duration-200 ${
                          playersOpen
                            ? "rotate-180"
                            : ""
                        } ${mutedClass}`}
                      >
                        ▾
                      </button>
                    </div>
                  </div>

                  {playersOpen && (
                    <div
                      className={`border-t ${dividerClass}`}
                    >
                      {otherPlayers.map(
                        (
                          player,
                          index
                        ) => {
                          const connected =
                            getPlayerConnected(
                              player
                            );

                          return (
                            <div
                              key={
                                player.id
                              }
                              className={`px-4 py-3.5 ${
                                index > 0
                                  ? `border-t ${dividerClass}`
                                  : ""
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${
                                    connected
                                      ? "bg-[#849553]"
                                      : "bg-[#a45d52]"
                                  }`}
                                />

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="truncate text-xs font-bold">
                                      {getPlayerName(
                                        player
                                      )}
                                    </span>

                                    <span
                                      className={`text-[9px] font-bold uppercase tracking-wider ${
                                        connected
                                          ? isDark
                                            ? "text-[#a7b774]"
                                            : "text-[#65713e]"
                                          : isDark
                                            ? "text-[#c47d72]"
                                            : "text-[#a45d52]"
                                      }`}
                                    >
                                      {connected
                                        ? "Online"
                                        : "Offline"}
                                    </span>
                                  </div>

                                  <div className="mt-1.5 flex items-center gap-4 text-[11px]">
                                    <span className={bodyMutedClass}>
                                      ❤️{" "}
                                      <strong>
                                        {getPlayerHp(
                                          player
                                        )}
                                      </strong>
                                    </span>

                                    <span className={bodyMutedClass}>
                                      💰{" "}
                                      <strong>
                                        {formatMoney(
                                          getPlayerMoney(
                                            player
                                          )
                                        )}
                                      </strong>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* GENERATING */}

          {isGenerating && (
            <section
              className={`mt-3 flex min-h-[300px] items-center justify-center rounded-[26px] border shadow-[0_15px_40px_rgba(65,48,30,0.08)] ${cardClass}`}
            >
              <div className="px-8 text-center">
                <div
                  className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${softClass}`}
                >
                  🌙
                </div>

                <p
                  className={`mt-5 text-[9px] font-bold uppercase tracking-[0.2em] ${mutedClass}`}
                >
                  {isVietnamese
                    ? "Đường Biên Đêm"
                    : "Night Border"}
                </p>

                <h2 className="mt-2 text-lg font-bold">
                  {isVietnamese
                    ? "Đang chuẩn bị sự kiện..."
                    : "Preparing the event..."}
                </h2>

                <div
                  className={`mx-auto mt-5 h-px w-36 overflow-hidden ${
                    isDark
                      ? "bg-[#37342e]"
                      : "bg-[#d6ccbb]"
                  }`}
                >
                  <div
                    className={`h-full w-1/2 animate-pulse ${
                      isDark
                        ? "bg-[#b7a98e]"
                        : "bg-[#675e51]"
                    }`}
                  />
                </div>
              </div>
            </section>
          )}

          {/* RESOLVING */}

          {isResolving && (
            <section
              className={`mt-3 rounded-[26px] border p-8 text-center shadow-[0_15px_40px_rgba(65,48,30,0.08)] ${cardClass}`}
            >
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${softClass}`}
              >
                🎲
              </div>

              <p
                className={`mt-5 text-[9px] font-bold uppercase tracking-[0.2em] ${mutedClass}`}
              >
                {isVietnamese
                  ? "Hệ thống"
                  : "System"}
              </p>

              <h2 className="mt-2 text-lg font-bold">
                {isVietnamese
                  ? "Đang xử lý lựa chọn..."
                  : "Resolving choices..."}
              </h2>

              <p
                className={`mx-auto mt-2 max-w-sm text-xs leading-5 ${mutedClass}`}
              >
                {isVietnamese
                  ? "Máy chủ đang xác định kết quả."
                  : "The server is determining the result."}
              </p>
            </section>
          )}

          {/* RESULT */}

          {isResult && (
            <section
              className={`mt-3 rounded-[26px] border p-8 text-center shadow-[0_15px_40px_rgba(65,48,30,0.08)] ${cardClass}`}
            >
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${softClass}`}
              >
                ✨
              </div>

              <p
                className={`mt-5 text-[9px] font-bold uppercase tracking-[0.2em] ${mutedClass}`}
              >
                {isVietnamese
                  ? "Kết quả"
                  : "Result"}
              </p>

              <h2 className="mt-2 text-lg font-bold">
                {isVietnamese
                  ? "Kết quả đang được cập nhật"
                  : "Result is being updated"}
              </h2>

              <p
                className={`mx-auto mt-2 max-w-sm text-xs leading-5 ${mutedClass}`}
              >
                {isVietnamese
                  ? "Trạng thái của bạn sẽ tự động cập nhật."
                  : "Your status will update automatically."}
              </p>
            </section>
          )}

          {/* FINISHED */}

          {isFinished && (
            <section
              className={`mt-3 rounded-[26px] border p-8 text-center shadow-[0_15px_40px_rgba(65,48,30,0.08)] ${cardClass}`}
            >
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${softClass}`}
              >
                🏁
              </div>

              <p
                className={`mt-5 text-[9px] font-bold uppercase tracking-[0.2em] ${mutedClass}`}
              >
                {isVietnamese
                  ? "Kết thúc"
                  : "Finished"}
              </p>

              <h2 className="mt-2 text-xl font-bold">
                {isVietnamese
                  ? "Trận đấu kết thúc"
                  : "Game finished"}
              </h2>
            </section>
          )}

          {/* ERROR */}

          {error && (
            <div
              className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${
                isDark
                  ? "border-[#6d2924] bg-[#2a1110] text-[#e7aaa2]"
                  : "border-[#e6c7c2] bg-[#fbefec] text-[#8c4d45]"
              }`}
            >
              {error}
            </div>
          )}

          {connectionLost &&
            !error && (
              <div
                className={`mt-3 rounded-2xl border px-4 py-3 text-[10px] ${softClass} ${mutedClass}`}
              >
                {isVietnamese
                  ? "Đang thử kết nối lại..."
                  : "Reconnecting..."}
              </div>
            )}
        </div>
      </div>
    </main>
  );
}