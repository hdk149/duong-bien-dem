"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

import { useLanguage } from "../../components/LanguageProvider";
import { useTheme } from "../../components/ThemeProvider";
import { supabase } from "../../../lib/supabase";

import EndGameOverlay, {
  triggerEndGame,
  type EndGameDetail,
} from "../../components/EndGameOverlay";

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
    endGame?: boolean;
    endGamePayload?: Record<string, unknown> | null;
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

function formatMoney(value: number | string | undefined) {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(number)) {
    return "0đ";
  }

  return `${new Intl.NumberFormat("vi-VN").format(number)}đ`;
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

function toNumber(
  value: unknown,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function getEndGamePlayers(
  players: RoomPlayer[],
  currentPlayer: CurrentPlayer | null,
  currentRounds: number,
  forcedMoney?: number | string
) {
  return players
    .filter(
      (player) =>
        player.role !== "spectator"
    )
    .map((player) => {
      const isCurrent =
        currentPlayer &&
        player.id === currentPlayer.id;

      return {
        playerName:
          player.player_name,

        money:
          isCurrent &&
          forcedMoney !== undefined
            ? forcedMoney
            : player.money ?? 0,

        hp:
          isCurrent &&
          currentPlayer
            ? currentPlayer.hp
            : player.hp ?? 0,

        location:
          isCurrent &&
          currentPlayer
            ? currentPlayer.location
            : player.location ??
              "Việt Nam",

        rounds:
          currentRounds,
      };
    });
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();

  const code = String(params.code);

  const { language } = useLanguage();
  const { theme } = useTheme();

  const isVietnamese =
    language === "vi";

  const isDark =
    theme === "dark";

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

  /*
   * --------------------------------------------------
   * DEVELOPER NOTIFICATION
   * --------------------------------------------------
   */

  const [
    developerNotification,
    setDeveloperNotification,
  ] = useState<string | null>(null);

  const [
    developerNotificationVisible,
    setDeveloperNotificationVisible,
  ] = useState(false);

  const developerNotificationTimeoutRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const developerNotificationHideRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  /*
   * --------------------------------------------------
   * REQUEST CONTROL
   * --------------------------------------------------
   */

  const requestIdRef =
    useRef(0);

  const submittingRef =
    useRef(false);

  /*
   * --------------------------------------------------
   * END GAME
   * --------------------------------------------------
   */

  const endGameTriggeredRef =
    useRef(false);

  const endGamePayloadRef =
    useRef<string | null>(null);

  const [
    developerWinOverlay,
    setDeveloperWinOverlay,
  ] = useState<EndGameDetail | null>(
    null
  );

  const devEndGameTestRef =
    useRef(false);

  /*
   * --------------------------------------------------
   * PLAYER TOKEN
   * --------------------------------------------------
   */

  const getPlayerToken =
    useCallback(() => {
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
   * --------------------------------------------------
   * END GAME TRIGGER
   * --------------------------------------------------
   */

  const triggerGameEnd =
    useCallback(
      (detail: EndGameDetail) => {
        if (
          endGameTriggeredRef.current
        ) {
          return;
        }

        endGameTriggeredRef.current =
          true;

        triggerEndGame(detail);
      },
      []
    );

  /*
   * --------------------------------------------------
   * DEVELOPER END GAME TEST
   * --------------------------------------------------
   */

  const runDeveloperEndGameTest =
    useCallback(() => {
      if (
        typeof window ===
        "undefined"
      ) {
        return;
      }

      if (
        devEndGameTestRef.current
      ) {
        return;
      }

      if (
        loading ||
        !game ||
        !game.currentPlayer
      ) {
        return;
      }

      const mode =
        new URLSearchParams(
          window.location.search
        ).get("devEndGame");

      if (
        mode !== "win" &&
        mode !== "force"
      ) {
        return;
      }

      devEndGameTestRef.current =
        true;

      const currentPlayer =
        game.currentPlayer;

      const rounds =
        Number.isFinite(
          Number(
            game.session?.round
          )
        )
          ? Number(
              game.session.round
            )
          : 0;

      const hp =
        Number.isFinite(
          Number(
            currentPlayer.hp
          )
        )
          ? Number(
              currentPlayer.hp
            )
          : 100;

      const players =
        game.players ?? [];

      /*
       * ----------------------------------------------
       * DEV WIN
       * ----------------------------------------------
       */

      if (mode === "win") {
        const winMoney =
          400_000_000;

        setDeveloperWinOverlay({
          forced: false,

          reason:
            "developer_ui_test_win",

          message:
            isVietnamese
              ? "Bạn đã đạt mục tiêu tài sản và hoàn thành hành trình."
              : "You reached the target wealth and completed the journey.",

          playerName:
            currentPlayer.playerName,

          money: winMoney,

          hp,

          location:
            currentPlayer.location,

          rounds,

          players:
            getEndGamePlayers(
              players,
              currentPlayer,
              rounds,
              winMoney
            ),
        });

        return;
      }

      /*
       * ----------------------------------------------
       * DEV FORCE END
       * ----------------------------------------------
       */

      triggerGameEnd({
        forced: true,

        reason:
          "developer_ui_test_force",

        message:
          isVietnamese
            ? "Trận đấu đã được kết thúc bởi Developer."
            : "The game was ended by the Developer.",

        playerName:
          currentPlayer.playerName,

        money:
          currentPlayer.money,

        hp,

        location:
          currentPlayer.location,

        rounds,

        players:
          getEndGamePlayers(
            players,
            currentPlayer,
            rounds
          ),
      });
    }, [
      game,
      isVietnamese,
      loading,
      triggerGameEnd,
    ]);

  /*
   * --------------------------------------------------
   * LOAD GAME
   * --------------------------------------------------
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

        /*
         * ----------------------------------------------
         * SERVER FORCE END
         * ----------------------------------------------
         */

        if (
          gameData.room?.endGame
        ) {
          const rawPayload =
            gameData.room
              .endGamePayload ?? {};

          const payloadString =
            JSON.stringify(
              rawPayload
            );

          if (
            endGamePayloadRef.current !==
            payloadString
          ) {
            endGamePayloadRef.current =
              payloadString;

            const currentPlayer =
              gameData.currentPlayer;

            const rounds =
              toNumber(
                gameData.session?.round,
                0
              );

            const players =
              gameData.players ?? [];

            let playerPayload:
              Record<
                string,
                unknown
              > | null = null;

            if (
              Array.isArray(
                rawPayload.players
              )
            ) {
              playerPayload =
                (
                  rawPayload.players as Array<
                    Record<
                      string,
                      unknown
                    >
                  >
                ).find(
                  (player) =>
                    String(
                      player.id ??
                        player.playerId ??
                        ""
                    ) ===
                    String(
                      currentPlayer?.id ??
                        ""
                    )
                ) ?? null;
            }

            /*
             * playerPayload is Record<string, unknown>
             * so money must be narrowed before
             * passing it to EndGameOverlay.
             */

            const rawMoney =
              playerPayload?.money ??
              currentPlayer?.money ??
              0;

            const money =
              typeof rawMoney ===
                "number" ||
              typeof rawMoney ===
                "string"
                ? rawMoney
                : 0;

            const hp =
              toNumber(
                playerPayload?.hp ??
                  currentPlayer?.hp ??
                  100,
                100
              );

            const location =
              String(
                playerPayload?.location ??
                  currentPlayer?.location ??
                  "Việt Nam"
              );

            const playerName =
              String(
                playerPayload?.playerName ??
                  playerPayload?.player_name ??
                  currentPlayer?.playerName ??
                  "Người chơi"
              );

            triggerGameEnd({
              forced: true,

              reason:
                String(
                  rawPayload.reason ??
                    "server_force_end"
                ),

              message:
                String(
                  rawPayload.message ??
                    (isVietnamese
                      ? "Trận đấu đã được kết thúc bởi Developer."
                      : "The game was ended by the Developer.")
                ),

              playerName,

              money,

              hp,

              location,

              rounds,

              players:
                getEndGamePlayers(
                  players,
                  currentPlayer,
                  rounds
                ),
            });
          }
        }

        /*
         * ----------------------------------------------
         * NORMAL VICTORY
         * ----------------------------------------------
         */

        if (
          !endGameTriggeredRef.current &&
          gameData.currentPlayer &&
          !gameData.room.endGame
        ) {
          const currentMoney =
            Number(
              gameData.currentPlayer
                .money
            );

          const goalMoney =
            Number(
              gameData.room.goalMoney
            );

          if (
            Number.isFinite(
              currentMoney
            ) &&
            Number.isFinite(
              goalMoney
            ) &&
            goalMoney > 0 &&
            currentMoney >=
              goalMoney
          ) {
            const currentPlayer =
              gameData.currentPlayer;

            const rounds =
              toNumber(
                gameData.session?.round,
                0
              );

            const players =
              gameData.players ?? [];

            triggerGameEnd({
              forced: false,

              reason:
                "goal_reached",

              message:
                isVietnamese
                  ? `Bạn đã đạt mục tiêu ${formatMoney(
                      goalMoney
                    )} và hoàn thành hành trình!`
                  : `You reached the ${formatMoney(
                      goalMoney
                    )} goal and completed the journey!`,

              playerName:
                currentPlayer.playerName,

              money:
                currentPlayer.money,

              hp: toNumber(
                currentPlayer.hp,
                100
              ),

              location:
                currentPlayer.location,

              rounds,

              players:
                getEndGamePlayers(
                  players,
                  currentPlayer,
                  rounds
                ),
            });
          }
        }

        /*
         * ----------------------------------------------
         * CHOICE STATE
         * ----------------------------------------------
         */

        if (
          gameData.choiceStatus
            ?.selected
        ) {
          setLocalChoice(
            gameData.choiceStatus
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
                ? "Không thể tải trạng thái game."
                : "Unable to load game state."
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
      triggerGameEnd,
    ]
  );

  /*
   * --------------------------------------------------
   * INITIAL LOAD
   * --------------------------------------------------
   */

  useEffect(() => {
    void loadGame(false);
  }, [loadGame]);

  /*
   * --------------------------------------------------
   * DEVELOPER TEST
   * --------------------------------------------------
   */

  useEffect(() => {
    if (
      loading ||
      !game?.currentPlayer
    ) {
      return;
    }

    runDeveloperEndGameTest();
  }, [
    game,
    loading,
    runDeveloperEndGameTest,
  ]);

  /*
   * --------------------------------------------------
   * MAIN GAME REALTIME CHANNEL
   * --------------------------------------------------
   *
   * Một channel theo room:
   *
   * game_sessions
   * game_states
   * room_players
   *
   * Sau mỗi thay đổi:
   * loadGame(true)
   *
   * Polling 5 giây là fallback.
   * --------------------------------------------------
   */

  useEffect(() => {
    const roomId =
      game?.room?.id;

    if (!roomId) {
      return;
    }

    let disposed = false;

    const refresh = () => {
      if (disposed) {
        return;
      }

      if (
        submittingRef.current
      ) {
        return;
      }

      void loadGame(true);
    };

    const channel =
      supabase.channel(
        `game-sync-${roomId}`
      );

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
          filter: `room_id=eq.${roomId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_states",
          filter: `room_id=eq.${roomId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        refresh
      )
      .subscribe(
        (status) => {
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

    const interval =
      window.setInterval(() => {
        if (
          submittingRef.current
        ) {
          return;
        }

        void loadGame(true);
      }, 5000);

    return () => {
      disposed = true;

      window.clearInterval(
        interval
      );

      void supabase.removeChannel(
        channel
      );
    };
  }, [
    game?.room?.id,
    loadGame,
  ]);

  /*
   * --------------------------------------------------
   * DEVELOPER NOTIFICATIONS
   * --------------------------------------------------
   *
   * Đây là channel riêng cho notification,
   * không phải game-sync channel.
   * --------------------------------------------------
   */

  useEffect(() => {
    const roomId =
      game?.room?.id;

    if (!roomId) {
      return;
    }

    let disposed = false;

    const showNotification = (
      message: string
    ) => {
      if (disposed) {
        return;
      }

      if (
        developerNotificationTimeoutRef.current
      ) {
        clearTimeout(
          developerNotificationTimeoutRef.current
        );
      }

      if (
        developerNotificationHideRef.current
      ) {
        clearTimeout(
          developerNotificationHideRef.current
        );
      }

      setDeveloperNotification(
        message
      );

      setDeveloperNotificationVisible(
        true
      );

      developerNotificationHideRef.current =
        setTimeout(() => {
          if (disposed) {
            return;
          }

          setDeveloperNotificationVisible(
            false
          );
        }, 5000);
    };

    const channel =
      supabase.channel(
        `developer-notifications-${roomId}`
      );

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_notifications",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row =
            payload.new as Record<
              string,
              unknown
            >;

          const type =
            String(
              row.type ?? ""
            );

          const sender =
            String(
              row.sender ?? ""
            );

          if (
            type !==
              "developer" &&
            sender !==
              "developer"
          ) {
            return;
          }

          const message =
            String(
              row.message ??
                row.content ??
                ""
            );

          if (!message) {
            return;
          }

          showNotification(
            message
          );
        }
      )
      .subscribe();

    return () => {
      disposed = true;

      if (
        developerNotificationTimeoutRef.current
      ) {
        clearTimeout(
          developerNotificationTimeoutRef.current
        );
      }

      if (
        developerNotificationHideRef.current
      ) {
        clearTimeout(
          developerNotificationHideRef.current
        );
      }

      void supabase.removeChannel(
        channel
      );
    };
  }, [game?.room?.id]);

  /*
   * --------------------------------------------------
   * NOTIFICATION CLEANUP
   * --------------------------------------------------
   */

  useEffect(() => {
    return () => {
      if (
        developerNotificationTimeoutRef.current
      ) {
        clearTimeout(
          developerNotificationTimeoutRef.current
        );
      }

      if (
        developerNotificationHideRef.current
      ) {
        clearTimeout(
          developerNotificationHideRef.current
        );
      }
    };
  }, []);

  /*
   * --------------------------------------------------
   * CHOOSE
   * --------------------------------------------------
   */

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

    submittingRef.current =
      true;

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
              event_id: eventId,
              choice_id:
                choiceId,
            }),

            cache: "no-store",
          }
        );

      let data:
        | Record<
            string,
            unknown
          >
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
      submittingRef.current =
        false;

      setSubmitting(false);

      void loadGame(true);
    }
  }

  /*
   * --------------------------------------------------
   * DERIVED STATE
   * --------------------------------------------------
   */

  const phase =
    game?.session?.phase ??
    "";

  const isChoosing =
    phase === "choosing";

  const isGenerating =
    phase === "generating";

  const isResolving =
    phase === "resolving";

  const isResult =
    phase === "result";

  const isFinished =
    phase === "finished" ||
    game?.session?.status ===
      "finished";

  const hasSelected =
    Boolean(
      game?.choiceStatus
        ?.selected
    ) || submitting;

  const selectedChoiceId =
    game?.choiceStatus
      ?.selectedChoiceId ??
    localChoice;

  const chosenPlayers =
    toNumber(
      game?.choiceStatus
        ?.chosenPlayers,
      0
    );

  const totalPlayers =
    toNumber(
      game?.choiceStatus
        ?.totalPlayers,
      0
    );

  const progressText =
    `${chosenPlayers}/${totalPlayers}`;

  const currentPlayer =
    game?.currentPlayer ??
    null;

  const currentPlayerHp =
    Math.max(
      0,
      Math.min(
        100,
        toNumber(
          currentPlayer?.hp,
          0
        )
      )
    );

  const currentPlayerMoney =
    formatMoney(
      currentPlayer?.money
    );

  const goalMoney =
    formatMoney(
      game?.room?.goalMoney
    );

  /*
   * IMPORTANT:
   *
   * spectator không được tính là player.
   * host vẫn là player.
   */

  const otherPlayers =
    (game?.players ?? [])
      .filter(
        (player) =>
          player.role !==
            "spectator" &&
          player.id !==
            currentPlayer?.id
      );

  const choiceProgressPercent =
    totalPlayers > 0
      ? Math.min(
          100,
          Math.round(
            (chosenPlayers /
              totalPlayers) *
              100
          )
        )
      : 0;

  const phaseLabel =
    isChoosing
      ? isVietnamese
        ? "LỰA CHỌN"
        : "CHOICE"
      : isGenerating
        ? isVietnamese
          ? "ĐANG TẠO"
          : "GENERATING"
        : isResolving
          ? isVietnamese
            ? "ĐANG XỬ LÝ"
            : "RESOLVING"
          : isResult
            ? isVietnamese
              ? "KẾT QUẢ"
              : "RESULT"
            : isFinished
              ? isVietnamese
                ? "HOÀN TẤT"
                : "FINISHED"
              : phase.toUpperCase();

  const pageClass =
    isDark
      ? "bg-[#12110f] text-[#eee7d9]"
      : "bg-[#eee9df] text-[#27241f]";

  const cardClass =
    isDark
      ? "border-[#39352e] bg-[#1b1916]"
      : "border-[#d0c8ba] bg-[#f8f4ec]";

  const mutedClass =
    isDark
      ? "text-[#938c80]"
      : "text-[#746e64]";

  /*
   * --------------------------------------------------
   * LOADING
   * --------------------------------------------------
   */

  if (loading && !game) {
    return (
      <main
        className={`flex min-h-[100dvh] items-center justify-center px-4 ${pageClass}`}
      >
        <div className="w-full max-w-xs text-center">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />

          <p className="text-sm font-bold tracking-wide">
            {isVietnamese
              ? "ĐANG TẢI HÀNH TRÌNH..."
              : "LOADING JOURNEY..."}
          </p>
        </div>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * ERROR WITHOUT GAME
   * --------------------------------------------------
   */

  if (!game) {
    return (
      <main
        className={`flex min-h-[100dvh] items-center justify-center px-4 ${pageClass}`}
      >
        <div
          className={`w-full max-w-md rounded-3xl border p-5 text-center shadow-xl sm:p-6 ${cardClass}`}
        >
          <div className="mb-4 text-4xl">
            ⚠️
          </div>

          <h1 className="text-xl font-black">
            {isVietnamese
              ? "Không thể vào trận"
              : "Unable to enter game"}
          </h1>

          <p
            className={`mt-3 text-sm leading-6 ${mutedClass}`}
          >
            {error ||
              (isVietnamese
                ? "Không thể tải trạng thái trận đấu."
                : "Unable to load game state.")}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
            className="mt-6 min-h-12 w-full rounded-2xl bg-[#eee7d9] px-5 text-sm font-black text-[#171613] transition hover:bg-white active:scale-[0.985]"
          >
            BACK HOME
          </button>
        </div>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * MAIN
   * --------------------------------------------------
   */

  return (
    <>
      <main
        className={`min-h-[100dvh] overflow-x-hidden transition-colors ${pageClass}`}
      >
        {/* ==================================================
            MOBILE
            ================================================== */}

        <div className="md:hidden">
          {/* MOBILE TOP HEADER */}

          <header
            className={[
              "fixed inset-x-0 top-0 z-50",
              "border-b backdrop-blur-xl",
              isDark
                ? "border-[#37342e] bg-[#12110f]/95"
                : "border-[#d7d0c4] bg-[#eee9df]/95",
            ].join(" ")}
          >
            <div className="mx-auto flex h-16 w-full max-w-lg items-center justify-between px-3 sm:px-4">
              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    (value) => !value
                  )
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl active:scale-95"
                aria-label="Players"
              >
                ☰
              </button>

              <div className="min-w-0 px-3 text-center">
                <p
                  className={`text-[8px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                >
                  ĐƯỜNG BIÊN ĐÊM
                </p>

                <p className="mt-0.5 truncate font-mono text-sm font-black tracking-widest">
                  {code}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/settings"
                  )
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg active:scale-95"
                aria-label="Settings"
              >
                ⚙️
              </button>
            </div>
          </header>

          {/* MOBILE CONTENT */}

          <div className="mx-auto w-full max-w-lg px-3 pb-28 pt-20 sm:px-4">
            {/* CONNECTION */}

            {connectionLost && (
              <div className="mb-3 rounded-2xl border border-[#795f3c] bg-[#292219] px-4 py-3 text-xs leading-5 text-[#d5c7ae]">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#c8945b]" />

                  <span className="min-w-0">
                    {isVietnamese
                      ? "Kết nối không ổn định. Game vẫn đang tự đồng bộ."
                      : "Connection is unstable. The game is still syncing."}
                  </span>
                </div>
              </div>
            )}

            {/* PLAYER STATUS */}

            <section
              className={[
                "overflow-hidden rounded-[24px] border",
                cardClass,
              ].join(" ")}
            >
              <div className="grid grid-cols-2">
                <div className="min-w-0 border-r border-current/10 px-4 py-4">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    NGƯỜI CHƠI
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {currentPlayer?.playerName ||
                      "—"}
                  </p>
                </div>

                <div className="px-4 py-4">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    VÒNG
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {String(
                      game.session.round
                    ).padStart(2, "0")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 border-t border-current/10">
                <div className="min-w-0 border-r border-current/10 px-4 py-4">
                  <p className="truncate text-sm font-black">
                    💰{" "}
                    {currentPlayerMoney}
                  </p>

                  <p
                    className={`mt-1 text-[9px] font-bold ${mutedClass}`}
                  >
                    {isVietnamese
                      ? "TÀI SẢN"
                      : "MONEY"}
                  </p>
                </div>

                <div className="px-4 py-4">
                  <p className="text-sm font-black">
                    ❤️{" "}
                    {currentPlayerHp}
                  </p>

                  <p
                    className={`mt-1 text-[9px] font-bold ${mutedClass}`}
                  >
                    HP
                  </p>
                </div>
              </div>

              <div className="border-t border-current/10 px-4 py-3">
                <p
                  className={`truncate text-xs font-bold ${mutedClass}`}
                >
                  📍{" "}
                  {currentPlayer?.location ||
                    "Việt Nam"}
                </p>
              </div>
            </section>

            {/* ROUND */}

            <div className="py-5 text-center">
              <p
                className={`text-[9px] font-black uppercase tracking-[0.3em] ${mutedClass}`}
              >
                {phaseLabel}
              </p>

              <p className="mt-1 text-3xl font-black tracking-tight">
                LƯỢT{" "}
                {String(
                  game.session.round
                ).padStart(2, "0")}
              </p>
            </div>

            {/* EVENT */}

            <section
              className={[
                "overflow-hidden rounded-[26px] border",
                cardClass,
              ].join(" ")}
            >
              {game.event ? (
                <>
                  {/* EVENT HEADER */}

                  <div className="px-4 pb-5 pt-5 sm:px-5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#d6bd72]/15 text-base">
                        🌙
                      </span>

                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#b69c57]">
                          {isVietnamese
                            ? "SỰ KIỆN"
                            : "EVENT"}
                        </p>

                        <p
                          className={`text-[9px] font-bold ${mutedClass}`}
                        >
                          ROUND{" "}
                          {
                            game.event
                              .round
                          }
                        </p>
                      </div>
                    </div>

                    <h1 className="mt-5 break-words text-[23px] font-black leading-tight sm:text-2xl">
                      {game.event.title}
                    </h1>

                    <p
                      className={`mt-4 whitespace-pre-line break-words text-sm leading-7 ${mutedClass}`}
                    >
                      {
                        game.event
                          .description
                      }
                    </p>

                    <div className="mt-6">
                      <p className="text-base font-black">
                        {isVietnamese
                          ? "Bạn sẽ làm gì?"
                          : "What will you do?"}
                      </p>
                    </div>
                  </div>

                  {/* CHOICES */}

                  {game.event.choices
                    ?.length > 0 && (
                    <div className="border-t border-current/10 p-2.5 sm:p-3">
                      <div className="space-y-2">
                        {game.event.choices.map(
                          (
                            choice,
                            index
                          ) => {
                            const isSelected =
                              selectedChoiceId ===
                              choice.id;

                            return (
                              <button
                                key={
                                  choice.id
                                }
                                type="button"
                                disabled={
                                  !isChoosing ||
                                  hasSelected ||
                                  submitting
                                }
                                onClick={() =>
                                  choose(
                                    choice.id
                                  )
                                }
                                className={[
                                  "flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                                  "active:scale-[0.985]",
                                  isSelected
                                    ? "border-[#d6bd72] bg-[#d6bd72]/10"
                                    : "border-current/10",
                                  !isChoosing ||
                                  hasSelected
                                    ? "cursor-default opacity-80"
                                    : "cursor-pointer",
                                ].join(
                                  " "
                                )}
                              >
                                <span
                                  className={[
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black",
                                    isSelected
                                      ? "border-[#d6bd72] bg-[#d6bd72] text-[#171613]"
                                      : "border-current/10",
                                  ].join(
                                    " "
                                  )}
                                >
                                  {getChoiceLetter(
                                    index
                                  )}
                                </span>

                                <span className="min-w-0 flex-1">
                                  <span className="block break-words text-sm font-black leading-6">
                                    {getChoiceText(
                                      choice
                                    )}
                                  </span>

                                  {typeof choice.description ===
                                    "string" &&
                                    choice.text &&
                                    choice.description !==
                                      choice.text && (
                                      <span
                                        className={`mt-1 block break-words text-xs leading-5 ${mutedClass}`}
                                      >
                                        {
                                          choice.description
                                        }
                                      </span>
                                    )}
                                </span>

                                {isSelected && (
                                  <span className="shrink-0 text-lg font-black">
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          }
                        )}
                      </div>

                      {/* PROGRESS */}

                      {isChoosing && (
                        <div className="px-1 pb-1 pt-5">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span
                              className={`min-w-0 text-[9px] font-black uppercase tracking-[0.12em] ${mutedClass}`}
                            >
                              {isVietnamese
                                ? "TIẾN ĐỘ"
                                : "PROGRESS"}
                            </span>

                            <span className="shrink-0 text-xs font-black">
                              {
                                progressText
                              }
                            </span>
                          </div>

                          <div className="h-1.5 overflow-hidden rounded-full bg-current/10">
                            <div
                              className="h-full rounded-full bg-[#d6bd72] transition-all duration-300"
                              style={{
                                width: `${choiceProgressPercent}%`,
                              }}
                            />
                          </div>

                          {hasSelected && (
                            <p
                              className={`mt-3 text-center text-[11px] leading-5 ${mutedClass}`}
                            >
                              {isVietnamese
                                ? "Đã ghi nhận lựa chọn. Đang chờ người chơi còn lại..."
                                : "Choice recorded. Waiting for the other players..."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="px-5 py-14 text-center">
                  <div className="mb-4 text-4xl">
                    {isGenerating
                      ? "🎲"
                      : isResolving
                        ? "⚙️"
                        : isResult
                          ? "📜"
                          : "🌙"}
                  </div>

                  <h2 className="text-xl font-black">
                    {isGenerating
                      ? isVietnamese
                        ? "Đang tạo sự kiện..."
                        : "Generating event..."
                      : isResolving
                        ? isVietnamese
                          ? "Đang xử lý lựa chọn..."
                          : "Resolving choices..."
                        : isResult
                          ? isVietnamese
                            ? "Đang chuẩn bị kết quả..."
                            : "Preparing result..."
                          : isFinished
                            ? isVietnamese
                              ? "Trận đấu đã hoàn tất"
                              : "Game finished"
                            : isVietnamese
                              ? "Đang chờ..."
                              : "Waiting..."}
                  </h2>

                  <p
                    className={`mt-3 text-sm leading-6 ${mutedClass}`}
                  >
                    {isGenerating ||
                    isResolving
                      ? isVietnamese
                        ? "Hệ thống đang đồng bộ trạng thái giữa những người chơi."
                        : "The system is synchronizing the game state between players."
                      : ""}
                  </p>

                  {(isGenerating ||
                    isResolving) && (
                    <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden rounded-full bg-current/10">
                      <div className="h-full w-1/2 animate-pulse rounded-full bg-[#d6bd72]" />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* GOAL */}

            <section
              className={`mt-4 rounded-2xl border px-4 py-4 ${cardClass}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    {isVietnamese
                      ? "MỤC TIÊU"
                      : "GOAL"}
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {goalMoney}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    ROOM
                  </p>

                  <p className="mt-1 font-mono text-xs font-black tracking-widest">
                    {code}
                  </p>
                </div>
              </div>
            </section>

            {/* PLAYERS */}

            <section
              className={`mt-4 overflow-hidden rounded-2xl border ${cardClass}`}
            >
              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    (value) =>
                      !value
                  )
                }
                className="flex min-h-[64px] w-full items-center justify-between gap-4 px-4 text-left"
              >
                <div className="min-w-0">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                  >
                    NGƯỜI CHƠI
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {totalPlayers}{" "}
                    {isVietnamese
                      ? "người tham gia"
                      : "players"}
                  </p>
                </div>

                <span className="shrink-0 text-lg">
                  {playersOpen
                    ? "⌃"
                    : "⌄"}
                </span>
              </button>

              {playersOpen && (
                <div className="border-t border-current/10">
                  {otherPlayers.length ===
                  0 ? (
                    <div
                      className={`px-4 py-6 text-center text-sm ${mutedClass}`}
                    >
                      {isVietnamese
                        ? "Chưa có người chơi khác."
                        : "No other players."}
                    </div>
                  ) : (
                    <div className="divide-y divide-current/10">
                      {otherPlayers.map(
                        (player) => (
                          <div
                            key={
                              player.id
                            }
                            className="flex items-center justify-between gap-3 px-4 py-4"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-black">
                                  {
                                    player.player_name
                                  }
                                </p>

                                <span
                                  className={[
                                    "h-2 w-2 shrink-0 rounded-full",
                                    player.is_connected
                                      ? "bg-[#8c9363]"
                                      : "bg-[#777166]",
                                  ].join(
                                    " "
                                  )}
                                />
                              </div>

                              <p
                                className={`mt-1 truncate text-xs ${mutedClass}`}
                              >
                                📍{" "}
                                {player.location ||
                                  "Việt Nam"}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs font-black">
                                {formatMoney(
                                  player.money
                                )}
                              </p>

                              <p
                                className={`mt-1 text-[10px] ${mutedClass}`}
                              >
                                ❤️{" "}
                                {toNumber(
                                  player.hp,
                                  0
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ERROR */}

            {error && (
              <div className="mt-4 rounded-2xl border border-[#795047] bg-[#291d1a] px-4 py-3 text-sm leading-6 text-[#d7bbb1]">
                <div className="flex items-start gap-3">
                  <span>⚠️</span>

                  <p className="min-w-0 flex-1 break-words">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setError("")
                    }
                    className="shrink-0 opacity-60 transition hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* MOBILE BOTTOM NAV */}

          <nav
            className={[
              "fixed inset-x-0 bottom-0 z-50",
              "border-t backdrop-blur-xl",
              isDark
                ? "border-[#37342e] bg-[#12110f]/95"
                : "border-[#d7d0c4] bg-[#eee9df]/95",
            ].join(" ")}
          >
            <div className="mx-auto grid h-[68px] max-w-lg grid-cols-3">
              <button
                type="button"
                className="flex flex-col items-center justify-center gap-1 opacity-70 active:scale-95"
              >
                <span className="text-lg">
                  🎒
                </span>

                <span
                  className={`text-[9px] font-black uppercase tracking-wider ${mutedClass}`}
                >
                  {isVietnamese
                    ? "Đồ"
                    : "Items"}
                </span>
              </button>

              <button
                type="button"
                className="flex flex-col items-center justify-center gap-1 opacity-70 active:scale-95"
              >
                <span className="text-lg">
                  📜
                </span>

                <span
                  className={`text-[9px] font-black uppercase tracking-wider ${mutedClass}`}
                >
                  Quest
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    true
                  )
                }
                className={[
                  "flex flex-col items-center justify-center gap-1 active:scale-95",
                  playersOpen
                    ? "opacity-100"
                    : "opacity-70",
                ].join(" ")}
              >
                <span className="text-lg">
                  👥
                </span>

                <span
                  className={`text-[9px] font-black uppercase tracking-wider ${mutedClass}`}
                >
                  {isVietnamese
                    ? "Phòng"
                    : "Room"}
                </span>
              </button>
            </div>
          </nav>
        </div>

        {/* ==================================================
            DESKTOP
            ================================================== */}

        <div className="hidden md:block">
          <div className="mx-auto w-full max-w-5xl px-6 pb-28 pt-6 lg:px-8">
            {/* TOP BAR */}

            <header className="mb-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    (value) =>
                      !value
                  )
                }
                className={`rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${cardClass}`}
              >
                <p
                  className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                >
                  ROOM
                </p>

                <p className="mt-0.5 font-mono text-sm font-black tracking-widest">
                  {code}
                </p>
              </button>

              <div className="text-right">
                <p
                  className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                >
                  ROUND
                </p>

                <p className="text-lg font-black">
                  {game.session.round}
                </p>
              </div>
            </header>

            {/* GAME HEADER */}

            <section
              className={`overflow-hidden rounded-[28px] border ${cardClass}`}
            >
              <div className="border-b border-current/10 px-7 py-6">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      className={`text-[10px] font-black uppercase tracking-[0.3em] ${mutedClass}`}
                    >
                      ĐƯỜNG BIÊN ĐÊM
                    </p>

                    <h1 className="mt-2 truncate text-4xl font-black tracking-tight">
                      {game.event?.title ||
                        (isGenerating
                          ? "Đang tạo sự kiện..."
                          : isResolving
                            ? "Đang xử lý..."
                            : "Hành trình")}
                    </h1>
                  </div>

                  <div className="shrink-0 rounded-full border border-current/10 px-4 py-2">
                    <span className="text-[10px] font-black tracking-[0.2em]">
                      {phaseLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 border-b border-current/10">
                <div className="min-w-0 border-r border-current/10 px-4 py-5">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    NGƯỜI CHƠI
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {currentPlayer?.playerName ||
                      "—"}
                  </p>
                </div>

                <div className="min-w-0 border-r border-current/10 px-4 py-5">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    TIỀN
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {currentPlayerMoney}
                  </p>
                </div>

                <div className="border-r border-current/10 px-4 py-5">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    HP
                  </p>

                  <p className="mt-1 text-sm font-black">
                    ❤️ {currentPlayerHp}
                  </p>
                </div>

                <div className="min-w-0 px-4 py-5">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    VỊ TRÍ
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    📍{" "}
                    {currentPlayer?.location ||
                      "Việt Nam"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between px-7 py-4">
                <div>
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    MỤC TIÊU
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {goalMoney}
                  </p>
                </div>

                <div className="text-right">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    VÒNG
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {game.session.round}
                  </p>
                </div>
              </div>
            </section>

            {/* DESKTOP EVENT */}

            <section
              className={`mt-5 overflow-hidden rounded-[28px] border ${cardClass}`}
            >
              {game.event ? (
                <>
                  <div className="px-7 pb-5 pt-6">
                    <div className="mb-4 flex items-center gap-2">
                      <span className="rounded-full bg-[#d6bd72]/15 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#b69c57]">
                        {game.event.event_type ||
                          "EVENT"}
                      </span>

                      <span
                        className={`text-[10px] font-bold ${mutedClass}`}
                      >
                        ROUND{" "}
                        {
                          game.event
                            .round
                        }
                      </span>
                    </div>

                    <h2 className="text-3xl font-black leading-tight">
                      {game.event.title}
                    </h2>

                    <p
                      className={`mt-4 whitespace-pre-line text-sm leading-7 ${mutedClass}`}
                    >
                      {
                        game.event
                          .description
                      }
                    </p>
                  </div>

                  <div className="border-t border-current/10 p-5">
                    <div className="space-y-3">
                      {game.event.choices.map(
                        (
                          choice,
                          index
                        ) => {
                          const isSelected =
                            selectedChoiceId ===
                            choice.id;

                          return (
                            <button
                              key={
                                choice.id
                              }
                              type="button"
                              disabled={
                                !isChoosing ||
                                hasSelected ||
                                submitting
                              }
                              onClick={() =>
                                choose(
                                  choice.id
                                )
                              }
                              className={[
                                "group w-full rounded-2xl border p-4 text-left transition",
                                "active:scale-[0.99]",
                                isSelected
                                  ? "border-[#d6bd72] bg-[#d6bd72]/10"
                                  : "border-current/10 hover:border-[#d6bd72]/50",
                              ].join(
                                " "
                              )}
                            >
                              <div className="flex gap-4">
                                <div
                                  className={[
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black",
                                    isSelected
                                      ? "border-[#d6bd72] bg-[#d6bd72] text-[#171613]"
                                      : "border-current/10",
                                  ].join(
                                    " "
                                  )}
                                >
                                  {getChoiceLetter(
                                    index
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black leading-6">
                                    {getChoiceText(
                                      choice
                                    )}
                                  </p>

                                  {typeof choice.description ===
                                    "string" &&
                                    choice.text &&
                                    choice.description !==
                                      choice.text && (
                                      <p
                                        className={`mt-1 text-xs leading-5 ${mutedClass}`}
                                      >
                                        {
                                          choice.description
                                        }
                                      </p>
                                    )}
                                </div>

                                {isSelected && (
                                  <span className="text-lg">
                                    ✓
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>

                    {isChoosing && (
                      <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between">
                          <span
                            className={`text-[10px] font-black uppercase tracking-[0.15em] ${mutedClass}`}
                          >
                            TIẾN ĐỘ LỰA CHỌN
                          </span>

                          <span className="text-xs font-black">
                            {
                              progressText
                            }
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-current/10">
                          <div
                            className="h-full rounded-full bg-[#d6bd72] transition-all"
                            style={{
                              width: `${choiceProgressPercent}%`,
                            }}
                          />
                        </div>

                        {hasSelected && (
                          <p
                            className={`mt-3 text-center text-xs ${mutedClass}`}
                          >
                            {isVietnamese
                              ? "Đã ghi nhận lựa chọn. Đang chờ người chơi còn lại..."
                              : "Choice recorded. Waiting for the other players..."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="px-6 py-14 text-center">
                  <div className="mb-4 text-4xl">
                    {isGenerating
                      ? "🎲"
                      : isResolving
                        ? "⚙️"
                        : isResult
                          ? "📜"
                          : "🌙"}
                  </div>

                  <h2 className="text-xl font-black">
                    {isGenerating
                      ? isVietnamese
                        ? "Đang tạo sự kiện..."
                        : "Generating event..."
                      : isResolving
                        ? isVietnamese
                          ? "Đang xử lý lựa chọn..."
                          : "Resolving choices..."
                        : isResult
                          ? isVietnamese
                            ? "Đang chuẩn bị kết quả..."
                            : "Preparing result..."
                          : isFinished
                            ? isVietnamese
                              ? "Trận đấu đã hoàn tất"
                              : "Game finished"
                            : isVietnamese
                              ? "Đang chờ..."
                              : "Waiting..."}
                  </h2>
                </div>
              )}
            </section>

            {/* DESKTOP PLAYERS */}

            <section
              className={`mt-5 overflow-hidden rounded-[28px] border ${cardClass}`}
            >
              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    (value) =>
                      !value
                  )
                }
                className="flex w-full items-center justify-between px-7 py-5 text-left"
              >
                <div>
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                  >
                    NGƯỜI CHƠI
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {totalPlayers} người tham gia
                  </p>
                </div>

                <span className="text-lg">
                  {playersOpen
                    ? "⌃"
                    : "⌄"}
                </span>
              </button>

              {playersOpen && (
                <div className="border-t border-current/10">
                  {otherPlayers.length ===
                  0 ? (
                    <div
                      className={`px-7 py-6 text-center text-sm ${mutedClass}`}
                    >
                      Chưa có người chơi khác.
                    </div>
                  ) : (
                    <div className="divide-y divide-current/10">
                      {otherPlayers.map(
                        (player) => (
                          <div
                            key={
                              player.id
                            }
                            className="flex items-center justify-between gap-4 px-7 py-4"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black">
                                {
                                  player.player_name
                                }
                              </p>

                              <p
                                className={`mt-1 truncate text-xs ${mutedClass}`}
                              >
                                📍{" "}
                                {player.location ||
                                  "Việt Nam"}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs font-black">
                                {formatMoney(
                                  player.money
                                )}
                              </p>

                              <p
                                className={`mt-1 text-[10px] ${mutedClass}`}
                              >
                                ❤️{" "}
                                {toNumber(
                                  player.hp,
                                  0
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {error && (
              <div className="mt-5 rounded-2xl border border-[#795047] bg-[#291d1a] px-4 py-3 text-sm leading-6 text-[#d7bbb1]">
                <div className="flex items-start gap-3">
                  <span>⚠️</span>

                  <p className="min-w-0 flex-1 break-words">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setError("")
                    }
                    className="shrink-0"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ==================================================
          DEVELOPER NOTIFICATION
          ================================================== */}

      {developerNotificationVisible &&
        developerNotification && (
          <div className="pointer-events-none fixed inset-x-3 top-4 z-[9000] flex justify-center sm:inset-x-4">
            <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-[#6b5b39] bg-[#211e18]/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d6bd72] text-[#171613]">
                ⚙
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#d6bd72]">
                  DEVELOPER
                </p>

                <p className="mt-1 break-words text-sm font-bold leading-5 text-[#eee7d9]">
                  {
                    developerNotification
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setDeveloperNotificationVisible(
                    false
                  )
                }
                className="shrink-0 px-1 text-xl leading-none text-[#aaa397] hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        )}

      {/* ==================================================
          END GAME OVERLAY
          ================================================== */}

      <EndGameOverlay
        visible={
          developerWinOverlay !==
          null
            ? true
            : undefined
        }
        forced={
          developerWinOverlay !==
          null
            ? false
            : undefined
        }
        message={
          developerWinOverlay?.message
        }
        playerName={
          developerWinOverlay?.playerName
        }
        money={
          developerWinOverlay?.money
        }
        hp={
          developerWinOverlay?.hp
        }
        location={
          developerWinOverlay?.location
        }
        rounds={
          developerWinOverlay?.rounds
        }
      />
    </>
  );
}