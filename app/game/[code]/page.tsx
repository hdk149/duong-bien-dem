"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

import { useLanguage } from "../../components/LanguageProvider";
import { useTheme } from "../../components/ThemeProvider";
import { supabase } from "../../../lib/supabase";
import { createClient } from "@supabase/supabase-js";


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

type RoomPlayer = {
  id: string;
  player_name: string;
  role: string;
  hp?: number;
  money?: number | string;
  location?: string;
  is_connected: boolean;
};

type CurrentPlayer = {
  id: string;
  playerName: string;
  hp: number;
  money: number | string;
  location: string;
  role: string;
  isConnected: boolean;
  lastChoice: string | null;
};

type GameData = {
  success: boolean;

  room: {
    id: string;
    code: string;
    hostName: string;
    maxPlayers: number;
    status: string;
    goalMoney: number | string;
    diceSystem: string;
  };

  session: {
    id: string;
    sessionNumber: number;
    status: string;
    round: number;
    phase: string;
    currentEventId: string | null;
  };

  currentPlayer: CurrentPlayer | null;

  event: EventData | null;

  choiceStatus: {
    selected: boolean;
    selectedChoiceId: string | null;
    chosenPlayers: number;
    totalPlayers: number;
    allPlayersChosen: boolean;
  };

  players?: RoomPlayer[];
};

type ApiError = {
  error?: string;
};

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

  // --------------------------------------------------
  // DEVELOPER NOTIFICATION
  // --------------------------------------------------

  const [developerNotification, setDeveloperNotification] =
    useState<string | null>(null);

  const [developerNotificationVisible, setDeveloperNotificationVisible] =
    useState(false);

  const developerNotificationTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const developerNotificationHideRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestIdRef =
    useRef(0);

  const submittingRef =
    useRef(false);

  // --------------------------------------------------
  // PLAYER TOKEN
  // --------------------------------------------------

  const getPlayerToken = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return (
      sessionStorage.getItem("player_token") ||
      localStorage.getItem("player_token")
    );
  }, []);

  // --------------------------------------------------
  // LOAD GAME
  // --------------------------------------------------

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

        // ==================================================
        // GAME STATE = SOURCE OF TRUTH
        // ==================================================

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
          | ApiError;

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
          throw new Error(
            data &&
            "error" in data &&
            data.error
              ? data.error
              : isVietnamese
                ? "Không thể tải trạng thái game."
                : "Unable to load game state."
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

        setGame(gameData);
        setError("");
        setConnectionLost(false);

        if (
          gameData.choiceStatus?.selected
        ) {
          setLocalChoice(
            gameData
              .choiceStatus
              .selectedChoiceId
          );
        } else if (
          !submittingRef.current
        ) {
          setLocalChoice(null);
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

        setConnectionLost(true);

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
    ]
  );

  // --------------------------------------------------
  // INITIAL LOAD
  // --------------------------------------------------

  useEffect(() => {
    void loadGame(false);
  }, [loadGame]);

  // --------------------------------------------------
  // REALTIME
  // --------------------------------------------------

  useEffect(() => {
    if (!game?.room?.id) {
      return;
    }

    const roomId = game.room.id;

    // =========================================================
    // GAME SYNC CHANNEL
    // =========================================================

    const gameChannel = supabase
      .channel(`game-sync-${roomId}`)

      // GAME SESSION
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          if (!submittingRef.current) {
            void loadGame(true);
          }
        }
      )

      // GAME STATE
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_states",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          if (!submittingRef.current) {
            void loadGame(true);
          }
        }
      )

      // ROOM PLAYERS
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          if (!submittingRef.current) {
            void loadGame(true);
          }
        }
      )
      .subscribe((status) => {
        console.log(
          "GAME REALTIME:",
          status
        );
      });

    // =========================================================
    // DEVELOPER NOTIFICATION CHANNEL
    // =========================================================

    const notificationChannel = supabase
      .channel(
        `developer-notifications-${roomId}`
      )

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_notifications",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          console.log(
            "🔥 GAME NOTIFICATION REALTIME:",
            payload
          );

          const notification =
            payload.new as {
              id?: string;
              type?: string;
              sender?: string;
              message?: string;
              created_at?: string;
            };

          // Chỉ nhận notification từ Developer
          if (
            notification.type !==
              "developer" &&
            notification.sender !==
              "developer"
          ) {
            return;
          }

          const message =
            notification.message?.trim();

          if (!message) {
            return;
          }

          console.log(
            "🔥 DEV MESSAGE:",
            message
          );

          // --------------------------------------------------
          // RESET OLD ANIMATIONS / TIMERS
          // --------------------------------------------------

          if (
            developerNotificationTimeoutRef.current
          ) {
            clearTimeout(
              developerNotificationTimeoutRef.current
            );

            developerNotificationTimeoutRef.current =
              null;
          }

          if (
            developerNotificationHideRef.current
          ) {
            clearTimeout(
              developerNotificationHideRef.current
            );

            developerNotificationHideRef.current =
              null;
          }

          // --------------------------------------------------
          // SHOW DYNAMIC ISLAND
          // --------------------------------------------------

          setDeveloperNotification(
            message
          );

          // Nếu đang hiện notification cũ,
          // tắt trước rồi bật lại animation.
          setDeveloperNotificationVisible(
            false
          );

          window.setTimeout(() => {
            setDeveloperNotificationVisible(
              true
            );
          }, 30);

          // --------------------------------------------------
          // AUTO HIDE
          // --------------------------------------------------

          developerNotificationTimeoutRef.current =
            setTimeout(() => {
              setDeveloperNotificationVisible(
                false
              );

              // Đợi animation thu lại xong
              // mới xoá nội dung khỏi DOM.
              developerNotificationHideRef.current =
                setTimeout(() => {
                  setDeveloperNotification(
                    null
                  );

                  developerNotificationHideRef.current =
                    null;
                }, 450);

              developerNotificationTimeoutRef.current =
                null;
            }, 5000);
        }
      )
      .subscribe((status) => {
        console.log(
          "🔔 NOTIFICATION REALTIME:",
          status
        );
      });

    return () => {
      void supabase.removeChannel(
        gameChannel
      );

      void supabase.removeChannel(
        notificationChannel
      );
    };
  }, [
    game?.room?.id,
    loadGame,
  ]);

  // --------------------------------------------------
  // CLEAN NOTIFICATION TIMERS
  // --------------------------------------------------

  useEffect(() => {
    return () => {
      if (
        developerNotificationTimeoutRef.current
      ) {
        clearTimeout(
          developerNotificationTimeoutRef.current
        );

        developerNotificationTimeoutRef.current =
          null;
      }

      if (
        developerNotificationHideRef.current
      ) {
        clearTimeout(
          developerNotificationHideRef.current
        );

        developerNotificationHideRef.current =
          null;
      }
    };
  }, []);

  // --------------------------------------------------
// REALTIME
// --------------------------------------------------

useEffect(() => {
  let channel:
    ReturnType<typeof supabase.channel> | null =
    null;

  let fallbackInterval:
    number | null = null;

  async function setupRealtime() {
    try {
      const token =
        getPlayerToken();

      if (!token) {
        return;
      }

      /*
       * Load một lần ngay khi realtime effect khởi tạo.
       */
      await loadGame(true);

      /*
       * Một channel cho toàn bộ game.
       *
       * game_sessions:
       * - round mới
       * - phase resolving / choosing
       * - current_event_id mới
       *
       * room_players:
       * - player vote
       * - HP
       * - money
       * - location
       * - connection
       */
      channel = supabase
        .channel(
          `game-room-${code}`
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "game_sessions",
            filter: `room_id=eq.${game?.room.id}`,
          },
          () => {
            console.log(
              "[REALTIME] game_sessions update"
            );

            void loadGame(true);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "room_players",
            filter: `room_id=eq.${game?.room.id}`,
          },
          () => {
            console.log(
              "[REALTIME] room_players update"
            );

            void loadGame(true);
          }
        )
        .subscribe(
          (status) => {
            console.log(
              "[REALTIME GAME]",
              status
            );

            if (
              status ===
              "SUBSCRIBED"
            ) {
              setConnectionLost(
                false
              );
            }

            if (
              status ===
                "CHANNEL_ERROR" ||
              status ===
                "TIMED_OUT" ||
              status ===
                "CLOSED"
            ) {
              setConnectionLost(
                true
              );
            }
          }
        );

      /*
       * Fallback:
       * Nếu Realtime chết thì vẫn tự cập nhật
       * mỗi 5 giây thay vì 1.5 giây.
       */
      fallbackInterval =
        window.setInterval(() => {
          void loadGame(true);
        }, 5000);
    } catch (error) {
      console.error(
        "[REALTIME SETUP ERROR]",
        error
      );

      /*
       * Realtime không setup được thì
       * polling 5 giây vẫn cứu game.
       */
      fallbackInterval =
        window.setInterval(() => {
          void loadGame(true);
        }, 5000);
    }
  }

  if (game?.room.id) {
    void setupRealtime();
  }

  return () => {
    if (fallbackInterval !== null) {
      window.clearInterval(
        fallbackInterval
      );
    }

    if (channel) {
      void supabase.removeChannel(
        channel
      );
    }
  };
}, [
  code,
  game?.room.id,
  getPlayerToken,
  loadGame,
]);

  // --------------------------------------------------
  // CHOOSE
  // --------------------------------------------------

  async function choose(
    choiceId: string
  ) {
    if (
      submitting ||
      !game?.event ||
      !game?.choiceStatus ||
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

    submittingRef.current = true;

    ++requestIdRef.current;

    setSubmitting(true);
    setLocalChoice(choiceId);
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
            : isVietnamese
              ? "Không thể gửi lựa chọn."
              : "Unable to submit choice."
        );
      }

      await loadGame(true);
    } catch (err) {
      console.error(
        "CHOOSE ERROR:",
        err
      );

      setLocalChoice(null);

      setError(
        err instanceof Error
          ? err.message
          : isVietnamese
            ? "Không thể gửi lựa chọn."
            : "Unable to submit choice."
      );
    } finally {
      submittingRef.current = false;

      setSubmitting(false);

      void loadGame(true);
    }
  }

  // --------------------------------------------------
  // DERIVED STATE
  // --------------------------------------------------

  const phase =
    game?.session?.phase ||
    "waiting";

  const isChoosing =
    phase === "choosing";

  const isGenerating =
    phase === "generating_event";

  const isResolving =
    phase === "resolving";

  const isResult =
    phase === "result";

  const isFinished =
    phase === "finished";

  const hasSelected =
    Boolean(
      game?.choiceStatus?.selected ||
      submitting
    );

  const selectedChoiceId =
    game?.choiceStatus
      ?.selectedChoiceId ||
    (submitting
      ? localChoice
      : null);

  const progressText =
    useMemo(() => {
      if (
        !game?.choiceStatus
      ) {
        return "0/0";
      }

      return `${game.choiceStatus.chosenPlayers}/${game.choiceStatus.totalPlayers}`;
    }, [game]);

  const otherPlayers =
    useMemo(() => {
      if (
        !game?.players ||
        !game?.currentPlayer
      ) {
        return [];
      }

      return game.players.filter(
        (player) =>
          player.id !==
            game.currentPlayer!.id &&
          player.role !==
            "spectator"
      );
    }, [game]);

  // --------------------------------------------------
  // CURRENT PLAYER HP
  // --------------------------------------------------

  const currentPlayerHp =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          game?.currentPlayer?.hp
        ) || 0
      )
    );

  // --------------------------------------------------
  // SHARED THEME
  // --------------------------------------------------

  const pageClass =
    "min-h-[100dvh] bg-background text-foreground";

  const cardClass =
    "border border-border bg-card shadow-[0_18px_50px_rgba(75,55,35,0.08)]";

  const mutedClass =
    "text-muted";

  // --------------------------------------------------
  // LOADING
  // --------------------------------------------------

  if (loading) {
    return (
      <main className={pageClass}>
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl items-center justify-center px-5">
          <div className="w-full max-w-md">
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
            </div>

            <p
              className={`mt-4 text-center text-sm ${mutedClass}`}
            >
              {isVietnamese
                ? "Đang kết nối vào trận..."
                : "Connecting to game..."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  // --------------------------------------------------
  // ERROR / NO GAME
  // --------------------------------------------------

  if (!game) {
    return (
      <main className={pageClass}>
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5">
          <div
            className={`${cardClass} rounded-[30px] p-6`}
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-2xl">
              ⚠️
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              ĐƯỜNG BIÊN ĐÊM
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight">
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
              className="mt-6 min-h-12 w-full rounded-2xl bg-primary px-4 font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.99]"
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
              className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-secondary px-4 font-semibold text-secondary-foreground transition hover:opacity-80"
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

  // --------------------------------------------------
  // GAME DATA SAFETY
  // --------------------------------------------------

  const currentPlayer =
    game.currentPlayer;

  const currentPlayerName =
    currentPlayer?.playerName ||
    (isVietnamese
      ? "Người chơi"
      : "Player");

  const currentPlayerLocation =
    currentPlayer?.location ||
    (isVietnamese
      ? "Việt Nam"
      : "Vietnam");

  const currentPlayerMoney =
    currentPlayer?.money ?? 0;

  const currentPlayerConnected =
    currentPlayer?.isConnected ??
    true;

  // --------------------------------------------------
  // MAIN
  // --------------------------------------------------

  return (
    <main className={pageClass}>

      {/* ==================================================
          DYNAMIC ISLAND - DEVELOPER NOTIFICATION
          ================================================== */}

      {developerNotification && (
        <div
          className="pointer-events-none fixed left-1/2 top-3 z-[9999] -translate-x-1/2 sm:top-4"
          role="status"
          aria-live="polite"
        >
          <div
            className={`
              pointer-events-auto
              overflow-hidden
              rounded-[30px]
              border
              shadow-[0_14px_45px_rgba(0,0,0,0.32)]
              backdrop-blur-2xl
              transition-all
              duration-[450ms]
              ease-[cubic-bezier(0.22,1,0.36,1)]

              ${
                isDark
                  ? "border-white/[0.08] bg-black text-white"
                  : "border-black/[0.08] bg-white text-black"
              }

              ${
                developerNotificationVisible
                  ? "w-[calc(100vw-24px)] max-w-[420px] scale-100 opacity-100"
                  : "w-[58px] max-w-[58px] scale-[0.82] opacity-0"
              }
            `}
          >
            <div className="flex min-h-[58px] items-center gap-3 px-3.5 py-2.5">

              {/* DYNAMIC ISLAND ICON */}

              <div
                className={`
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  text-[18px]
                  transition-all
                  duration-300

                  ${
                    isDark
                      ? "bg-white/[0.10]"
                      : "bg-black/[0.07]"
                  }

                  ${
                    developerNotificationVisible
                      ? "scale-100 opacity-100"
                      : "scale-75 opacity-0"
                  }
                `}
              >
                💬
              </div>

              {/* CONTENT */}

              <div
                className={`
                  min-w-0
                  flex-1
                  overflow-hidden
                  transition-all
                  duration-300
                  ${
                    developerNotificationVisible
                      ? "translate-x-0 opacity-100"
                      : "-translate-x-2 opacity-0"
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold leading-4">
                    Developer
                  </span>

                  <span
                    className={`
                      shrink-0
                      text-[10px]
                      font-medium
                      ${
                        isDark
                          ? "text-white/40"
                          : "text-black/40"
                      }
                    `}
                  >
                    now
                  </span>
                </div>

                <p
                  className={`
                    mt-1
                    line-clamp-3
                    break-words
                    text-[16px]
                    font-medium
                    leading-[22px]
                    ${
                      isDark
                        ? "text-white/75"
                        : "text-black/65"
                    }
                  `}
                >
                  {developerNotification}
                </p>
              </div>

              {/* CLOSE */}

              <button
                type="button"
                onClick={() => {
                  setDeveloperNotificationVisible(
                    false
                  );

                  if (
                    developerNotificationTimeoutRef.current
                  ) {
                    clearTimeout(
                      developerNotificationTimeoutRef.current
                    );

                    developerNotificationTimeoutRef.current =
                      null;
                  }

                  if (
                    developerNotificationHideRef.current
                  ) {
                    clearTimeout(
                      developerNotificationHideRef.current
                    );

                    developerNotificationHideRef.current =
                      null;
                  }

                  developerNotificationHideRef.current =
                    setTimeout(() => {
                      setDeveloperNotification(
                        null
                      );

                      developerNotificationHideRef.current =
                        null;
                    }, 450);
                }}
                className={`
                  flex
                  h-7
                  w-7
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  text-[16px]
                  leading-none
                  transition-all
                  duration-200

                  ${
                    isDark
                      ? "bg-white/[0.08] text-white/50 hover:bg-white/[0.15] hover:text-white"
                      : "bg-black/[0.06] text-black/40 hover:bg-black/[0.12] hover:text-black"
                  }

                  ${
                    developerNotificationVisible
                      ? "scale-100 opacity-100"
                      : "pointer-events-none scale-75 opacity-0"
                  }
                `}
                aria-label={
                  isVietnamese
                    ? "Đóng"
                    : "Close"
                }
              >
                ×
              </button>

            </div>
          </div>
        </div>
      )}

      <div className="mx-auto min-h-[100dvh] w-full max-w-2xl">
        <div className="px-4 pb-10 pt-4 sm:px-6 sm:pt-6">

          {/* TOP BAR */}

          <header
            className={`${cardClass} mb-4 flex items-center justify-between rounded-[22px] px-4 py-3`}
          >
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/room/${code}`
                )
              }
              className="flex min-h-9 items-center gap-2 rounded-xl px-2 text-sm font-semibold transition hover:bg-secondary"
            >
              <span className="text-base">
                ←
              </span>

              <span>
                {isVietnamese
                  ? "Phòng"
                  : "Room"}
              </span>
            </button>

            <div className="text-right">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wider ${mutedClass}`}
              >
                {isVietnamese
                  ? "Phòng"
                  : "Room"}
              </p>

              <p className="font-mono text-sm font-bold">
                #{game.room.code}
              </p>
            </div>
          </header>

          {/* GAME TITLE */}

          <section className="mb-4 px-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                  {isVietnamese
                    ? `Vòng ${game.session?.round ?? 0}`
                    : `Round ${game.session?.round ?? 0}`}
                </p>

                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                  {game.event?.title ||
                    (isVietnamese
                      ? "Đường Biên Đêm"
                      : "Midnight Border")}
                </h1>
              </div>

              <div className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm">
                {game.choiceStatus?.chosenPlayers ??
                  0}
                /
                {game.choiceStatus?.totalPlayers ??
                  0}
              </div>
            </div>
          </section>

          {/* PLAYER STATUS */}

          {currentPlayer && (
            <section
              className={`${cardClass} mb-4 rounded-[26px] p-3 sm:p-4`}
            >
              <div className="flex items-center gap-3">

                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${
                    isDark
                      ? "bg-secondary"
                      : "bg-secondary"
                  }`}
                >
                  {currentPlayerName
                    .slice(0, 1)
                    .toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">

                  {/* NAME + CONNECTION */}

                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">
                      {currentPlayerName}
                    </span>

                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        currentPlayerConnected
                          ? "bg-[#7f914d]"
                          : "bg-[#a55f55]"
                      }`}
                    />

                    <span
                      className={`text-[10px] font-semibold ${
                        currentPlayerConnected
                          ? "text-[#728246]"
                          : "text-[#a55f55]"
                      }`}
                    >
                      {currentPlayerConnected
                        ? "Online"
                        : "Offline"}
                    </span>
                  </div>

                  {/* HP BAR */}

                  <div className="mt-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-[0.12em] ${mutedClass}`}
                      >
                        ❤️ HP
                      </span>

                      <span className="font-mono text-xs font-bold text-[#a55f55] dark:text-[#b96e62]">
                        {currentPlayerHp}/100
                      </span>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-[#7f914d] transition-[width] duration-500 ease-out"
                        style={{
                          width: `${currentPlayerHp}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* MONEY + LOCATION */}

                  <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-xs">

                    <div className="min-w-0 rounded-xl bg-secondary/60 px-3 py-2">
                      <p
                        className={`text-[10px] font-semibold uppercase tracking-wider ${mutedClass}`}
                      >
                        💰{" "}
                        {isVietnamese
                          ? "Tiền"
                          : "Money"}
                      </p>

                      <p className="mt-0.5 truncate text-sm font-bold text-foreground">
                        {formatMoney(
                          currentPlayerMoney
                        )}
                      </p>
                    </div>

                    <div className="min-w-0 rounded-xl bg-secondary/60 px-3 py-2">
                      <p
                        className={`text-[10px] font-semibold uppercase tracking-wider ${mutedClass}`}
                      >
                        📍{" "}
                        {isVietnamese
                          ? "Vị trí"
                          : "Location"}
                      </p>

                      <p className="mt-0.5 truncate text-sm font-bold text-foreground">
                        {
                          currentPlayerLocation
                        }
                      </p>
                    </div>

                  </div>
                </div>
              </div>
            </section>
          )}

          {/* EVENT */}

          {game.event && (
            <section
              className={`${cardClass} overflow-hidden rounded-[30px]`}
            >

              {/* EVENT HEADER */}

              <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-secondary-foreground">
                    {game.event.event_type}
                  </span>

                  <span
                    className={`text-xs ${mutedClass}`}
                  >
                    {isVietnamese
                      ? `Vòng ${game.event.round}`
                      : `Round ${game.event.round}`}
                  </span>
                </div>

                <p
                  className={`mt-5 text-sm font-medium ${mutedClass}`}
                >
                  {isVietnamese
                    ? "Tình huống"
                    : "Situation"}
                </p>

                <h2 className="mt-1 text-[21px] font-bold leading-tight tracking-tight sm:text-[25px]">
                  {game.event.title}
                </h2>

                <p
                  className={`mt-3 whitespace-pre-line text-[13px] leading-6 sm:text-[15px] sm:leading-7 ${mutedClass}`}
                >
                  {
                    game.event
                      .description
                  }
                </p>
              </div>

              {/* CHOICES */}

              {isChoosing && (
                <div className="border-t border-border bg-secondary/30 p-3 sm:p-4">

                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {isVietnamese
                        ? "Lựa chọn của bạn"
                        : "Your choice"}
                    </span>

                    <span className="text-xs font-medium text-muted">
                      {progressText}
                    </span>
                  </div>

                  <div className="space-y-2.5">
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
                          Boolean(
                            game
                              .choiceStatus
                              ?.selected
                          );

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
                            className={`group w-full rounded-[20px] border p-3.5 text-left transition-all active:scale-[0.99] sm:p-4 ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground shadow-[0_8px_25px_rgba(130,95,45,0.18)]"
                                : "border-border bg-card hover:border-primary/50 hover:bg-secondary"
                            } ${
                              disabled &&
                              !selected
                                ? "cursor-default opacity-45"
                                : ""
                            }`}
                          >
                            <div className="flex items-center gap-3.5">

                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition ${
                                  selected
                                    ? "bg-primary-foreground/15 text-primary-foreground"
                                    : "bg-secondary text-secondary-foreground"
                                }`}
                              >
                                {getChoiceLetter(
                                  index
                                )}
                              </div>

                              <div className="min-w-0 flex-1">

                                <div className="text-[13px] font-semibold leading-5 sm:text-[15px] sm:leading-6">
                                  {getChoiceText(
                                    choice
                                  )}
                                </div>

                                {choice.description &&
                                  choice.text && (
                                    <div
                                      className={`mt-1 text-xs leading-5 ${
                                        selected
                                          ? "opacity-75"
                                          : "text-muted"
                                      }`}
                                    >
                                      {
                                        choice.description
                                      }
                                    </div>
                                  )}

                              </div>

                              {selected && (
                                <span className="text-lg font-bold">
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
                    <div className="mt-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-center">

                      <p className="text-sm font-semibold">
                        {isVietnamese
                          ? "✓ Đã lựa chọn"
                          : "✓ Choice submitted"}
                      </p>

                      <p
                        className={`mt-1 text-xs ${mutedClass}`}
                      >
                        {isVietnamese
                          ? `Đang chờ người chơi khác · ${progressText}`
                          : `Waiting for other players · ${progressText}`}
                      </p>

                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* OTHER PLAYERS */}

          {otherPlayers.length > 0 && (
            <section
              className={`${cardClass} mt-4 overflow-hidden rounded-[26px]`}
            >
              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    (current) =>
                      !current
                  )
                }
                className="flex w-full items-center justify-between px-4 py-4 text-left transition hover:bg-secondary sm:px-5"
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                    {isVietnamese
                      ? "Hành trình"
                      : "Journey"}
                  </p>

                  <h2 className="mt-1 text-base font-bold">
                    {isVietnamese
                      ? "Người chơi khác"
                      : "Other players"}
                  </h2>
                </div>

                <div className="flex items-center gap-3">

                  <span className="rounded-full border border-border bg-secondary px-2.5 py-1 font-mono text-xs font-bold">
                    {
                      otherPlayers.length
                    }
                  </span>

                  <span
                    className={`text-lg transition-transform ${
                      playersOpen
                        ? "rotate-180"
                        : ""
                    }`}
                  >
                    ↓
                  </span>

                </div>
              </button>

              {playersOpen && (
                <div className="border-t border-border">

                  {otherPlayers.map(
                    (
                      player,
                      index
                    ) => {
                      const hp =
                        Math.max(
                          0,
                          Math.min(
                            100,
                            Number(
                              player.hp
                            ) || 0
                          )
                        );

                      return (
                        <div
                          key={
                            player.id
                          }
                          className={`px-4 py-4 sm:px-5 ${
                            index > 0
                              ? "border-t border-border"
                              : ""
                          }`}
                        >

                          <div className="flex items-center gap-3">

                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                player.is_connected
                                  ? "bg-[#7f914d]"
                                  : "bg-[#a55f55]"
                              }`}
                            />

                            <div className="min-w-0 flex-1">

                              <div className="flex items-center justify-between gap-3">

                                <span className="truncate text-sm font-bold">
                                  {
                                    player.player_name
                                  }
                                </span>

                                <span className="shrink-0 text-[10px] font-semibold text-muted">
                                  {player.is_connected
                                    ? "Online"
                                    : "Offline"}
                                </span>

                              </div>

                              {/* OTHER PLAYER HP BAR */}

                              <div className="mt-2.5">

                                <div className="mb-1.5 flex items-center justify-between">

                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                                    ❤️ HP
                                  </span>

                                  <span className="font-mono text-[11px] font-bold text-[#a55f55] dark:text-[#b96e62]">
                                    {hp}/100
                                  </span>

                                </div>

                                <div className="h-2 overflow-hidden rounded-full bg-secondary">

                                  <div
                                    className="h-full rounded-full bg-[#7f914d] transition-[width] duration-500 ease-out"
                                    style={{
                                      width: `${hp}%`,
                                    }}
                                  />

                                </div>
                              </div>

                              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">

                                <span>
                                  💰{" "}
                                  <strong className="text-foreground">
                                    {formatMoney(
                                      player.money ??
                                        0
                                    )}
                                  </strong>
                                </span>

                                <span>
                                  📍{" "}
                                  <strong className="text-foreground">
                                    {player.location ||
                                      "Vietnam"}
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
            </section>
          )}

          {/* GENERATING */}

          {isGenerating && (
            <section
              className={`${cardClass} mt-4 rounded-[30px] p-10 text-center`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-3xl">
                🌙
              </div>

              <h2 className="mt-5 text-lg font-bold">
                {isVietnamese
                  ? "Đang chuẩn bị sự kiện..."
                  : "Preparing the event..."}
              </h2>

              <p
                className={`mt-2 text-sm ${mutedClass}`}
              >
                {isVietnamese
                  ? "Một tình huống mới đang được tạo."
                  : "A new situation is being prepared."}
              </p>

              <div className="mx-auto mt-6 h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
              </div>
            </section>
          )}

          {/* RESOLVING */}

          {isResolving && (
            <section
              className={`${cardClass} mt-4 rounded-[30px] p-10 text-center`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-3xl">
                🎲
              </div>

              <h2 className="mt-5 text-lg font-bold">
                {isVietnamese
                  ? "Đang xử lý lựa chọn..."
                  : "Resolving choices..."}
              </h2>

              <p
                className={`mt-2 text-sm leading-6 ${mutedClass}`}
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
              className={`${cardClass} mt-4 rounded-[30px] p-10 text-center`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-3xl">
                ✨
              </div>

              <h2 className="mt-5 text-lg font-bold">
                {isVietnamese
                  ? "Kết quả đang được cập nhật"
                  : "Result is being updated"}
              </h2>

              <p
                className={`mt-2 text-sm leading-6 ${mutedClass}`}
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
              className={`${cardClass} mt-4 rounded-[30px] p-10 text-center`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-3xl">
                🏁
              </div>

              <h2 className="mt-5 text-xl font-bold">
                {isVietnamese
                  ? "Trận đấu kết thúc"
                  : "Game finished"}
              </h2>

              <p
                className={`mt-2 text-sm ${mutedClass}`}
              >
                {isVietnamese
                  ? "Hành trình của bạn đã hoàn thành."
                  : "Your journey has ended."}
              </p>
            </section>
          )}

          {/* ERROR */}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-300/40 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {/* CONNECTION LOST */}

          {connectionLost &&
            !error && (
              <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted">
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