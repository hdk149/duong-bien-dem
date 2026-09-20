"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "../../components/ThemeProvider";
import EmergencyControls from "../../components/EmergencyControls";

type AnyRecord = Record<string, any>;

const DEVELOPER_SESSION_KEY = "developer_session_token";

function formatMoney(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return new Intl.NumberFormat("vi-VN").format(number) + " đ";
}

function formatDate(value: unknown) {
  if (!value) {
    return "—";
  }

  const date = new Date(String(value));

  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("vi-VN");
}

function getValue(
  object: AnyRecord | null | undefined,
  ...keys: string[]
) {
  if (!object) {
    return undefined;
  }

  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) {
      return object[key];
    }
  }

  return undefined;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function DeveloperDashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();

  const roomCode = searchParams.get("room")?.trim() ?? "";

  const [developerToken, setDeveloperToken] = useState("");
  const [data, setData] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  /* =========================================================
     PLAYER INSPECTOR
     ========================================================= */

  const [selectedPlayer, setSelectedPlayer] =
    useState<AnyRecord | null>(null);

  const [moderationAction, setModerationAction] =
    useState<"kick" | "ban" | null>(null);

  const [moderationReason, setModerationReason] =
    useState("");

  const [moderationLoading, setModerationLoading] =
    useState(false);

  const [moderationError, setModerationError] =
    useState("");
  /* =========================================================
     DEV CUSTOM MESSAGE
     ========================================================= */

  const [customMessage, setCustomMessage] = useState("");
  const [customMessageLoading, setCustomMessageLoading] =
    useState(false);
  const [customMessageStatus, setCustomMessageStatus] =
    useState("");

  /* =========================================================
     THEME
     ========================================================= */

    const sendCustomMessage = async () => {
    const message = customMessage.trim();

    if (!message || !roomCode || !developerToken) {
      return;
    }

    setCustomMessageLoading(true);
    setCustomMessageStatus("");

    try {
      const response = await fetch(
        `/api/developer/rooms/${roomCode}/notifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-developer-session": developerToken,
          },
          body: JSON.stringify({
            message,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Không thể gửi lời nhắn."
        );
      }

      setCustomMessage("");
      setCustomMessageStatus("✓ Đã gửi lời nhắn.");

      window.setTimeout(() => {
        setCustomMessageStatus("");
      }, 3000);
    } catch (err) {
      setCustomMessageStatus(
        err instanceof Error
          ? `✕ ${err.message}`
          : "✕ Không thể gửi lời nhắn."
      );
    } finally {
      setCustomMessageLoading(false);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* =========================================================
     NAVIGATION
     ========================================================= */

  function backToControlCenter() {
    router.push("/developer/control");
  }

  /* =========================================================
     LOAD SESSION
     ========================================================= */

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(
        DEVELOPER_SESSION_KEY
      );

      if (saved) {
        setDeveloperToken(saved);
      }
    } catch {
      // Ignore sessionStorage errors.
    }
  }, []);

  /* =========================================================
     SESSION TRANSFER
     ========================================================= */

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (
        window.opener &&
        event.source !== window.opener
      ) {
        return;
      }

      if (
        event.data?.type !==
        "developer-session-transfer"
      ) {
        return;
      }

      const incomingToken =
        typeof event.data?.developerToken === "string"
          ? event.data.developerToken.trim()
          : "";

      if (!incomingToken) {
        return;
      }

      const incomingRoomCode =
        typeof event.data?.roomCode === "string"
          ? event.data.roomCode.trim()
          : "";

      if (
        incomingRoomCode &&
        roomCode &&
        incomingRoomCode !== roomCode
      ) {
        return;
      }

      try {
        window.sessionStorage.setItem(
          DEVELOPER_SESSION_KEY,
          incomingToken
        );
      } catch {
        // Ignore sessionStorage errors.
      }

      setDeveloperToken(incomingToken);
      setError("");
      setLoading(true);
    }

    window.addEventListener(
      "message",
      handleMessage
    );

    return () => {
      window.removeEventListener(
        "message",
        handleMessage
      );
    };
  }, [roomCode]);

  /* =========================================================
     DASHBOARD READY
     ========================================================= */

  useEffect(() => {
    if (!window.opener) {
      return;
    }

    window.opener.postMessage(
      {
        type: "developer-dashboard-ready",
      },
      window.location.origin
    );
  }, []);

  /* =========================================================
     LOAD DEVELOPER DATA
     ========================================================= */

  const loadDeveloperData =
    useCallback(async () => {
      if (
        !roomCode ||
        !/^\d{6}$/.test(roomCode)
      ) {
        setLoading(false);
        setError(
          "Room code không hợp lệ hoặc bị thiếu."
        );
        return;
      }

      if (!developerToken) {
        setLoading(false);
        setError(
          "Chưa nhận được Developer Session. Hãy mở Dashboard từ Settings → Developer Tools."
        );
        return;
      }

      try {
        const response =
          await fetch(
            `/api/rooms/${roomCode}/dev-data`,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",

                "x-developer-session":
                  developerToken,
              },
            }
          );

        let result: AnyRecord | null =
          null;

        try {
          result = await response.json();
        } catch {
          result = null;
        }

        if (!response.ok) {
          if (
            response.status === 401 ||
            response.status === 403
          ) {
            try {
              window.sessionStorage.removeItem(
                DEVELOPER_SESSION_KEY
              );
            } catch {}

            setDeveloperToken("");
          }

          throw new Error(
            result?.error ||
              "Không thể tải Developer Data."
          );
        }

        if (
          result?.success === false
        ) {
          throw new Error(
            result?.error ||
              "Developer API trả về lỗi."
          );
        }

        setData(result);
        setError("");
        setLastUpdated(new Date());
      } catch (requestError) {
        console.error(
          "[DEVELOPER DASHBOARD]",
          requestError
        );

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Không thể tải Developer Data."
        );
      } finally {
        setLoading(false);
      }
    }, [
      roomCode,
      developerToken,
    ]);

  /* =========================================================
     AUTO REFRESH
     ========================================================= */

  useEffect(() => {
    if (!developerToken) {
      return;
    }

    loadDeveloperData();

    const interval =
      window.setInterval(
        loadDeveloperData,
        1500
      );

    return () => {
      window.clearInterval(interval);
    };
  }, [
    loadDeveloperData,
    developerToken,
  ]);

  /* =========================================================
     DATA
     ========================================================= */

  const room =
    data?.room ?? null;

  const session =
    data?.session ?? null;

  const gameState =
    getValue(
      data,
      "gameState",
      "game_state"
    ) ?? null;

  const event =
    getValue(
      data,
      "event",
      "currentEvent",
      "current_event"
    ) ?? null;

  const currentPlayer =
    getValue(
      data,
      "currentPlayer",
      "current_player"
    ) ?? null;

  const players =
    getArray(data?.players);

  const choiceStatus =
    getValue(
      data,
      "choiceStatus",
      "choice_status"
    ) ?? null;

  const developer =
    data?.developer ?? null;

  const quest =
    data?.quest ?? null;

  const dice =
    data?.dice ?? null;

  const location =
    data?.location ?? null;

  const eventChoices =
    getArray(
      getValue(
        event,
        "choices"
      )
    );

  const selectedChoice =
    getValue(
      choiceStatus,
      "selectedChoiceId",
      "selected_choice_id"
    );

  const chosenPlayers =
    Number(
      getValue(
        choiceStatus,
        "chosenPlayers",
        "chosen_players"
      ) ?? 0
    );

  const totalPlayers =
    Number(
      getValue(
        choiceStatus,
        "totalPlayers",
        "total_players"
      ) ??
        players.filter(
          (player) =>
            player?.role === "host" ||
            player?.role === "player"
        ).length
    );

  const allPlayersChosen =
    Boolean(
      getValue(
        choiceStatus,
        "allPlayersChosen",
        "all_players_chosen"
      )
    );

  const currentRound =
    getValue(
      gameState,
      "round"
    ) ??
    getValue(
      session,
      "round"
    ) ??
    0;

  const currentPhase =
    getValue(
      gameState,
      "phase"
    ) ??
    getValue(
      session,
      "phase"
    ) ??
    "—";

  const roomStatus =
    getValue(
      room,
      "status"
    ) ??
    "—";

  const developerExpiry =
    getValue(
      developer,
      "expiresAt",
      "expires_at"
    );

  const playerLocation =
    getValue(
      currentPlayer,
      "location"
    ) ??
    getValue(
      location,
      "location"
    ) ??
    "—";

  const playerLocationId =
    getValue(
      currentPlayer,
      "locationId",
      "location_id"
    ) ??
    getValue(
      location,
      "locationId",
      "location_id"
    ) ??
    "—";

  const eventTitle =
    getValue(
      event,
      "title"
    ) ??
    "—";

  const eventDescription =
    getValue(
      event,
      "description"
    ) ??
    "—";

  const eventQuestion =
    getValue(
      event,
      "question"
    ) ??
    "—";

  const developerPlayerName =
    getValue(
      currentPlayer,
      "playerName",
      "player_name"
    ) ??
    "—";

  const developerPlayerHp =
    getValue(
      currentPlayer,
      "hp"
    );

  const developerPlayerMoney =
    getValue(
      currentPlayer,
      "money"
    );

  const developerPlayerRole =
    getValue(
      currentPlayer,
      "role"
    ) ??
    "—";

  const connectionStatus =
    Boolean(
      getValue(
        currentPlayer,
        "isConnected",
        "is_connected"
      )
    );

  const roomRules =
    getValue(
      room,
      "rules"
    );

  const roomCodeDisplay =
    getValue(
      room,
      "code"
    ) ??
    roomCode;

  const sessionNumber =
    getValue(
      session,
      "session_number",
      "sessionNumber"
    ) ??
    "—";

  const gameStateId =
    getValue(
      gameState,
      "id"
    ) ??
    "—";

  const currentEventId =
    getValue(
      gameState,
      "current_event_id",
      "currentEventId"
    ) ??
    getValue(
      event,
      "id"
    ) ??
    "—";

  const roomPlayerCount =
    players.length;

  const activePlayerCount =
    players.filter(
      (player) =>
        (
          player?.role === "host" ||
          player?.role === "player"
        ) &&
        (
          getValue(
            player,
            "moderationStatus",
            "moderation_status"
          ) ??
          "active"
        ) === "active"
    ).length;

  const voterCount =
    players.filter(
      (player) =>
        (
          player?.role === "host" ||
          player?.role === "player"
        ) &&
        (
          getValue(
            player,
            "moderationStatus",
            "moderation_status"
          ) ??
          "active"
        ) === "active"
    ).length;

  const choiceProgressText =
    totalPlayers > 0
      ? `${chosenPlayers}/${totalPlayers}`
      : "0/0";

  const statusLabel =
    allPlayersChosen
      ? "ALL CHOSEN"
      : "WAITING";

  const eventType =
    getValue(
      event,
      "event_type",
      "eventType"
    ) ??
    "—";

  const diceSystem =
    getValue(
      dice,
      "system"
    ) ??
    getValue(
      room,
      "diceSystem",
      "dice_system"
    ) ??
    "—";

  const currentEventRound =
    getValue(
      event,
      "round"
    ) ??
    currentRound;

  const serverTime =
    getValue(
      data,
      "serverTimeMs",
      "server_time_ms"
    );

  const serverTimeText =
    serverTime
      ? formatDate(
          Number(serverTime)
        )
      : "—";

  const rawData =
    useMemo(
      () =>
        prettyJson(data),
      [data]
    );

  /* =========================================================
     PLAYER INSPECTOR
     ========================================================= */

  function openPlayerInspector(
    player: AnyRecord
  ) {
    setSelectedPlayer(player);
    setModerationAction(null);
    setModerationReason("");
    setModerationError("");
  }

  function closePlayerInspector() {
    if (moderationLoading) {
      return;
    }

    setSelectedPlayer(null);
    setModerationAction(null);
    setModerationReason("");
    setModerationError("");
  }

  function beginModeration(
    action: "kick" | "ban"
  ) {
    if (!selectedPlayer) {
      return;
    }

    setModerationError("");
    setModerationAction(action);

    setModerationReason(
      action === "kick"
        ? "Kicked by Developer"
        : "Banned by Developer"
    );
  }

  async function executeModeration() {
    if (
      !selectedPlayer ||
      !moderationAction ||
      moderationLoading
    ) {
      return;
    }

    const playerId =
      getValue(
        selectedPlayer,
        "id"
      );

    if (!playerId) {
      setModerationError(
        "Player ID không tồn tại."
      );
      return;
    }

    const action =
      moderationAction;

    setModerationLoading(true);
    setModerationError("");

    try {
      const response =
        await fetch(
          `/api/developer/rooms/${roomCode}/players/${playerId}/${action}`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",

              "x-developer-session":
                developerToken,
            },

            body: JSON.stringify({
              reason:
                moderationReason.trim() ||
                (
                  action === "kick"
                    ? "Kicked by Developer"
                    : "Banned by Developer"
                ),
            }),
          }
        );

      let result:
        AnyRecord | null = null;

      try {
        result =
          await response.json();
      } catch {
        result = null;
      }

      if (
        !response.ok ||
        result?.success === false
      ) {
        throw new Error(
          result?.error ||
            `Không thể ${
              action === "kick"
                ? "kick"
                : "ban"
            } player.`
        );
      }

      /*
       * ROOM DELETED
       */

      if (
        result?.roomDeleted === true
      ) {
        setSelectedPlayer(null);
        setModerationAction(null);
        setModerationReason("");

        setData(null);

        setError(
          `Room ${roomCode} đã bị xóa vì không còn player active.`
        );

        return;
      }

      /*
       * UPDATE INSPECTOR
       */

      if (result?.player) {
        setSelectedPlayer(
          result.player
        );
      }

      setModerationAction(null);
      setModerationReason("");

      await loadDeveloperData();
    } catch (requestError) {
      console.error(
        `[DEVELOPER ${action.toUpperCase()}]`,
        requestError
      );

      setModerationError(
        requestError instanceof Error
          ? requestError.message
          : `Không thể ${
              action === "kick"
                ? "kick"
                : "ban"
            } player.`
      );
    } finally {
      setModerationLoading(false);
    }
  }

  /* =========================================================
     INVALID ROOM
     ========================================================= */

  if (
    !roomCode ||
    !/^\d{6}$/.test(roomCode)
  ) {
    return (
      <main className="min-h-screen bg-[var(--background)] px-4 py-5 text-[var(--foreground)] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-6xl">
          <button
            type="button"
            onClick={
              backToControlCenter
            }
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--muted)] shadow-[var(--shadow-theme)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] active:scale-95"
          >
            <span className="text-base">
              ←
            </span>

            <span>
              Control Center
            </span>
          </button>

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-theme)]">
            <div className="text-4xl">
              🛠️
            </div>

            <h1 className="mt-4 text-2xl font-black">
              Developer Dashboard
            </h1>

            <p className="mt-3 text-sm text-[var(--muted)]">
              Không tìm thấy room code hợp lệ.
            </p>

            <p className="mt-2 text-xs text-[var(--muted)]">
              Mở Dashboard từ Settings → Developer Tools.
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* =========================================================
     DASHBOARD
     ========================================================= */

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-5 text-[var(--foreground)] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">

        {/* BACK */}

        <button
          type="button"
          onClick={
            backToControlCenter
          }
          className="mb-4 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--muted)] shadow-[var(--shadow-theme)] transition hover:bg-[var(--secondary)] hover:text-[var(--foreground)] active:scale-95"
        >
          <span className="text-base">
            ←
          </span>

          <span>
            Control Center
          </span>
        </button>

        {/* HEADER */}

        <header className="mb-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme-lg)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--input)] text-2xl">
                  🛠️
                </div>

                <div>
                  <h1 className="text-2xl font-black tracking-tight">
                    Developer Dashboard
                  </h1>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Đường Biên Đêm
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  ROOM
                </p>

                <p className="mt-1 font-black tracking-widest">
                  {roomCodeDisplay}
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  ROUND
                </p>

                <p className="mt-1 font-black">
                  {currentRound}
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  PHASE
                </p>

                <p className="mt-1 font-black">
                  {currentPhase}
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  STATUS
                </p>

                <p className="mt-1 font-black">
                  {roomStatus}
                </p>
              </div>
            </div>
          </div>

          {lastUpdated && (
            <div className="mt-4 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
              Last update:{" "}
              {lastUpdated.toLocaleTimeString(
                "vi-VN"
              )}
            </div>
          )}
        </header>

        {/* ERROR */}

        {error && (
          <div className="mb-6 rounded-3xl border border-red-500/30 bg-red-500/10 p-5">
            <div className="flex items-start gap-3">
              <div className="text-xl">
                ⚠️
              </div>

              <div>
                <p className="font-bold text-red-500">
                  Developer API Error
                </p>

                <p className="mt-1 text-sm leading-6 text-red-600 dark:text-red-300">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={
                    loadDeveloperData
                  }
                  className="mt-4 rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-300"
                >
                  Thử lại
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LOADING */}

        {loading && !data && (
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-[var(--shadow-theme)]">
            <div className="text-4xl">
              🛠️
            </div>

            <p className="mt-4 font-bold">
              Đang tải Developer Data...
            </p>

            <p className="mt-2 text-sm text-[var(--muted)]">
              Room {roomCode}
            </p>
          </div>
        )}

        {data && (
  <div className="space-y-6">
    <EmergencyControls roomCode={roomCode} />

    {/* DEV CUSTOM MESSAGE */}
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-black">
            💬 Custom lời chào / lời nhắn
          </h2>

          <p className="mt-1 text-sm text-[var(--muted)]">
            Gửi một lời nhắn trực tiếp tới room {roomCode}.
          </p>
        </div>

        <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-600 dark:text-purple-400">
          DEVELOPER
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={customMessage}
          onChange={(e) => {
            setCustomMessage(e.target.value);
            setCustomMessageStatus("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void sendCustomMessage();
            }
          }}
          maxLength={500}
          placeholder="Nhập lời chào / lời nhắn..."
          disabled={customMessageLoading}
          className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition focus:border-purple-500 disabled:opacity-50"
        />

        <button
          type="button"
          onClick={() => void sendCustomMessage()}
          disabled={
            customMessageLoading ||
            !customMessage.trim()
          }
          className="rounded-2xl bg-purple-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {customMessageLoading ? "Đang gửi..." : "Gửi"}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p
          className={`text-sm ${
            customMessageStatus.startsWith("✕")
              ? "text-red-500"
              : "text-green-500"
          }`}
        >
          {customMessageStatus}
        </p>

        <span className="text-xs text-[var(--muted)]">
          {customMessage.length}/500
        </span>
      </div>
    </section>

    {/* TOP GRID */}

            <div className="grid gap-6 lg:grid-cols-3">

              {/* DEVELOPER */}

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
                <div className="flex items-center justify-between">
                  <h2 className="font-black">
                    Developer
                  </h2>

                  <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-bold text-green-600 dark:text-green-400">
                    VERIFIED
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  <InfoRow
                    label="Player"
                    value={
                      developerPlayerName
                    }
                  />

                  <InfoRow
                    label="Role"
                    value={
                      developerPlayerRole
                    }
                  />

                  <InfoRow
                    label="Connection"
                    value={
                      connectionStatus
                        ? "ONLINE"
                        : "OFFLINE"
                    }
                  />

                  <InfoRow
                    label="Session"
                    value={
                      getValue(
                        developer,
                        "sessionId",
                        "session_id"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Expires"
                    value={
                      formatDate(
                        developerExpiry
                      )
                    }
                  />
                </div>
              </section>

              {/* CURRENT PLAYER */}

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
                <h2 className="font-black">
                  Current Player
                </h2>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <StatBox
                    label="HP"
                    value={
                      developerPlayerHp ??
                      "—"
                    }
                  />

                  <StatBox
                    label="MONEY"
                    value={
                      formatMoney(
                        developerPlayerMoney
                      )
                    }
                  />

                  <StatBox
                    label="ROLE"
                    value={
                      developerPlayerRole
                    }
                  />

                  <StatBox
                    label="ROUND"
                    value={
                      currentRound
                    }
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    LOCATION
                  </p>

                  <p className="mt-2 font-bold">
                    {playerLocation}
                  </p>

                  <p className="mt-1 text-xs text-[var(--muted)]">
                    ID:{" "}
                    {playerLocationId}
                  </p>
                </div>
              </section>

              {/* ROOM */}

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
                <h2 className="font-black">
                  Room
                </h2>

                <div className="mt-5 space-y-4">
                  <InfoRow
                    label="Host"
                    value={
                      getValue(
                        room,
                        "hostName",
                        "host_name"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Max players"
                    value={
                      getValue(
                        room,
                        "maxPlayers",
                        "max_players"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Players"
                    value={
                      `${roomPlayerCount} / ${
                        getValue(
                          room,
                          "maxPlayers",
                          "max_players"
                        ) ?? "—"
                      }`
                    }
                  />

                  <InfoRow
                    label="Active"
                    value={
                      activePlayerCount
                    }
                  />

                  <InfoRow
                    label="Voters"
                    value={
                      voterCount
                    }
                  />

                  <InfoRow
                    label="Starting money"
                    value={
                      formatMoney(
                        getValue(
                          room,
                          "startingMoney",
                          "starting_money"
                        )
                      )
                    }
                  />

                  <InfoRow
                    label="Goal money"
                    value={
                      formatMoney(
                        getValue(
                          room,
                          "goalMoney",
                          "goal_money"
                        )
                      )
                    }
                  />

                  <InfoRow
                    label="Dice"
                    value={
                      diceSystem
                    }
                  />
                </div>
              </section>
            </div>

            {/* EVENT */}

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--secondary)] px-3 py-1 text-xs font-bold text-[var(--muted)]">
                      EVENT
                    </span>

                    <span className="rounded-full bg-[var(--secondary)] px-3 py-1 text-xs font-bold text-[var(--muted)]">
                      ROUND{" "}
                      {currentEventRound}
                    </span>

                    <span className="rounded-full bg-[var(--secondary)] px-3 py-1 text-xs font-bold text-[var(--muted)]">
                      {eventType}
                    </span>
                  </div>

                  <h2 className="mt-4 text-2xl font-black">
                    {eventTitle}
                  </h2>

                  <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--muted)]">
                    {eventDescription}
                  </p>
                </div>

                <div className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    EVENT ID
                  </p>

                  <p className="mt-1 max-w-[220px] break-all text-xs font-semibold">
                    {currentEventId}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  QUESTION
                </p>

                <p className="mt-2 text-sm font-semibold leading-6">
                  {eventQuestion}
                </p>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-bold">
                    Choices
                  </p>

                  <p className="text-xs text-[var(--muted)]">
                    {eventChoices.length} choices
                  </p>
                </div>

                {eventChoices.length ===
                0 ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--input)] p-5 text-sm text-[var(--muted)]">
                    Chưa có choices.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {eventChoices.map(
                      (
                        choice,
                        index
                      ) => {
                        const choiceId =
                          getValue(
                            choice,
                            "id",
                            "choice_id"
                          ) ??
                          `choice-${index + 1}`;

                        const choiceTitle =
                          getValue(
                            choice,
                            "title",
                            "label",
                            "text"
                          ) ?? "—";

                        const choiceDescription =
                          getValue(
                            choice,
                            "description"
                          ) ?? "";

                        const isSelected =
                          String(
                            selectedChoice ??
                              ""
                          ) ===
                          String(
                            choiceId
                          );

                        return (
                          <div
                            key={`${choiceId}-${index}`}
                            className={`rounded-2xl border p-4 ${
                              isSelected
                                ? "border-green-500/50 bg-green-500/10"
                                : "border-[var(--border)] bg-[var(--input)]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                                  {String(
                                    choiceId
                                  )}
                                </p>

                                <p className="mt-2 font-bold">
                                  {String(
                                    choiceTitle
                                  )}
                                </p>

                                {choiceDescription && (
                                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                                    {String(
                                      choiceDescription
                                    )}
                                  </p>
                                )}
                              </div>

                              {isSelected && (
                                <span className="shrink-0 rounded-full bg-green-500/10 px-3 py-1 text-xs font-bold text-green-600 dark:text-green-400">
                                  SELECTED
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* QUEST / DICE / LOCATION */}

            <div className="grid gap-6 lg:grid-cols-3">

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
                <h2 className="font-black">
                  Quest
                </h2>

                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4">
                  {quest ? (
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-[var(--muted)]">
                      {prettyJson(
                        quest
                      )}
                    </pre>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      Chưa có quest.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
                <h2 className="font-black">
                  Dice
                </h2>

                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4">
                  <p className="text-2xl font-black">
                    {diceSystem}
                  </p>

                  <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-[var(--muted)]">
                    {prettyJson(
                      dice
                    )}
                  </pre>
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
                <h2 className="font-black">
                  Location
                </h2>

                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    CURRENT
                  </p>

                  <p className="mt-2 text-xl font-black">
                    {playerLocation}
                  </p>

                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Location ID:{" "}
                    {String(
                      playerLocationId
                    )}
                  </p>

                  <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-[var(--muted)]">
                    {prettyJson(
                      location
                    )}
                  </pre>
                </div>
              </section>
            </div>

            {/* CHOICE STATUS */}

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-black">
                    Choice Status
                  </h2>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Tiến độ vote của room hiện tại.
                  </p>
                </div>

                <span
                  className={`rounded-full px-4 py-2 text-xs font-black ${
                    allPlayersChosen
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                  }`}
                >
                  {statusLabel}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <StatBox
                  label="CHOSEN"
                  value={
                    choiceProgressText
                  }
                />

                <StatBox
                  label="SELECTED"
                  value={
                    selectedChoice ??
                    "NONE"
                  }
                />

                <StatBox
                  label="EVENT CHOICES"
                  value={
                    eventChoices.length
                  }
                />

                <StatBox
                  label="TOTAL VOTERS"
                  value={
                    voterCount
                  }
                />
              </div>
            </section>

            {/* PLAYERS */}

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-black">
                    Players
                  </h2>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Advanced developer-only player data.
                  </p>
                </div>

                <span className="rounded-full bg-[var(--secondary)] px-3 py-1 text-xs font-bold text-[var(--muted)]">
                  {players.length}
                </span>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--border)]">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-[var(--input)] text-xs uppercase tracking-wider text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3">
                        Player
                      </th>

                      <th className="px-4 py-3">
                        Role
                      </th>

                      <th className="px-4 py-3">
                        HP
                      </th>

                      <th className="px-4 py-3">
                        Money
                      </th>

                      <th className="px-4 py-3">
                        Location
                      </th>

                      <th className="px-4 py-3">
                        Online
                      </th>

                      <th className="px-4 py-3">
                        Last Choice
                      </th>

                      <th className="px-4 py-3">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[var(--border)]">
                    {players.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-8 text-center text-[var(--muted)]"
                        >
                          Chưa có player.
                        </td>
                      </tr>
                    ) : (
                      players.map(
                        (
                          player,
                          index
                        ) => {
                          const playerName =
                            getValue(
                              player,
                              "playerName",
                              "player_name"
                            ) ??
                            `Player ${
                              index + 1
                            }`;

                          const role =
                            getValue(
                              player,
                              "role"
                            ) ??
                            "—";

                          const hp =
                            getValue(
                              player,
                              "hp"
                            ) ??
                            "—";

                          const money =
                            getValue(
                              player,
                              "money"
                            );

                          const playerLocation =
                            getValue(
                              player,
                              "location"
                            ) ??
                            "—";

                          const online =
                            Boolean(
                              getValue(
                                player,
                                "isConnected",
                                "is_connected"
                              )
                            );

                          const lastChoice =
                            getValue(
                              player,
                              "lastChoice",
                              "last_choice"
                            ) ??
                            "—";

                          const playerId =
                            getValue(
                              player,
                              "id"
                            );

                          const moderationStatus =
                            getValue(
                              player,
                              "moderationStatus",
                              "moderation_status"
                            ) ??
                            "active";

                          const isHost =
                            role ===
                              "host" ||
                            String(
                              playerName
                            ) ===
                              String(
                                getValue(
                                  room,
                                  "hostName",
                                  "host_name"
                                ) ?? ""
                              );

                          return (
                            <tr
                              key={
                                String(
                                  playerId ??
                                    `${playerName}-${index}`
                                )
                              }
                              className="bg-[var(--card)] transition hover:bg-[var(--secondary)]"
                            >
                              <td className="px-4 py-4 font-semibold">
                                <div>
                                  {String(
                                    playerName
                                  )}

                                  {isHost && (
                                    <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-600 dark:text-blue-400">
                                      HOST
                                    </span>
                                  )}
                                </div>

                                {moderationStatus !==
                                  "active" && (
                                  <span className="mt-1 inline-block text-[10px] font-bold uppercase text-red-500">
                                    {String(
                                      moderationStatus
                                    )}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-4">
                                <span className="rounded-full bg-[var(--secondary)] px-2.5 py-1 text-xs font-bold">
                                  {String(
                                    role
                                  )}
                                </span>
                              </td>

                              <td className="px-4 py-4 font-bold">
                                {String(
                                  hp
                                )}
                              </td>

                              <td className="px-4 py-4 font-semibold">
                                {formatMoney(
                                  money
                                )}
                              </td>

                              <td className="max-w-[180px] px-4 py-4">
                                <div className="truncate">
                                  {String(
                                    playerLocation
                                  )}
                                </div>
                              </td>

                              <td className="px-4 py-4">
                                <span
                                  className={
                                    online
                                      ? "font-bold text-green-600 dark:text-green-400"
                                      : "font-bold text-[var(--muted)]"
                                  }
                                >
                                  {online
                                    ? "ONLINE"
                                    : "OFFLINE"}
                                </span>
                              </td>

                              <td className="px-4 py-4 text-[var(--muted)]">
                                {String(
                                  lastChoice
                                )}
                              </td>

                              <td className="px-4 py-4">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openPlayerInspector(
                                      player
                                    )
                                  }
                                  className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs font-bold transition hover:bg-[var(--secondary)] active:scale-95"
                                >
                                  🔎 Inspect
                                </button>
                              </td>
                            </tr>
                          );
                        }
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* SESSION / GAME STATE */}

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
                <h2 className="font-black">
                  Session
                </h2>

                <div className="mt-5 space-y-4">
                  <InfoRow
                    label="Session number"
                    value={
                      sessionNumber
                    }
                  />

                  <InfoRow
                    label="Status"
                    value={
                      getValue(
                        session,
                        "status"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Round"
                    value={
                      getValue(
                        session,
                        "round"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Phase"
                    value={
                      getValue(
                        session,
                        "phase"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Started"
                    value={
                      formatDate(
                        getValue(
                          session,
                          "started_at",
                          "startedAt"
                        )
                      )
                    }
                  />

                  <InfoRow
                    label="Finished"
                    value={
                      formatDate(
                        getValue(
                          session,
                          "finished_at",
                          "finishedAt"
                        )
                      )
                    }
                  />
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
                <h2 className="font-black">
                  Game State
                </h2>

                <div className="mt-5 space-y-4">
                  <InfoRow
                    label="Game state ID"
                    value={
                      gameStateId
                    }
                  />

                  <InfoRow
                    label="Round"
                    value={
                      currentRound
                    }
                  />

                  <InfoRow
                    label="Phase"
                    value={
                      currentPhase
                    }
                  />

                  <InfoRow
                    label="Current event"
                    value={
                      currentEventId
                    }
                  />

                  <InfoRow
                    label="Started"
                    value={
                      formatDate(
                        getValue(
                          gameState,
                          "started_at",
                          "startedAt"
                        )
                      )
                    }
                  />

                  <InfoRow
                    label="Updated"
                    value={
                      formatDate(
                        getValue(
                          gameState,
                          "updated_at",
                          "updatedAt"
                        )
                      )
                    }
                  />
                </div>
              </section>
            </div>

            {/* ROOM RULES */}

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
              <h2 className="font-black">
                Room Rules
              </h2>

              <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4 text-xs leading-6 text-[var(--muted)]">
                {prettyJson(
                  roomRules
                )}
              </pre>
            </section>

            {/* SERVER */}

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-black">
                    Server
                  </h2>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Developer endpoint status.
                  </p>
                </div>

                <span className="rounded-full bg-green-500/10 px-4 py-2 text-xs font-black text-green-600 dark:text-green-400">
                  CONNECTED
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <InfoRow
                  label="Server time"
                  value={
                    serverTimeText
                  }
                />

                <InfoRow
                  label="Poll interval"
                  value="1500 ms"
                />

                <InfoRow
                  label="Endpoint"
                  value={`/api/rooms/${roomCode}/dev-data`}
                />
              </div>
            </section>

            {/* RAW JSON */}

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-theme)]">
              <button
                type="button"
                onClick={() =>
                  setRawOpen(
                    (current) =>
                      !current
                  )
                }
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <h2 className="font-black">
                    Raw Developer Data
                  </h2>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    JSON response trực tiếp từ Developer API.
                  </p>
                </div>

                <span className="text-xl">
                  {rawOpen
                    ? "⌃"
                    : "⌄"}
                </span>
              </button>

              {rawOpen && (
                <pre className="mt-5 max-h-[700px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4 text-xs leading-6 text-[var(--muted)]">
                  {rawData}
                </pre>
              )}
            </section>
          </div>
        )}
      </div>

      {/* =========================================================
          PLAYER INSPECTOR MODAL
          ========================================================= */}

      {selectedPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !moderationLoading
            ) {
              closePlayerInspector();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Player Inspector"
            className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
          >
            {/* HEADER */}

            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    🔎
                  </span>

                  <h2 className="text-lg font-black">
                    Player Inspector
                  </h2>
                </div>

                <p className="mt-1 truncate text-sm font-semibold text-[var(--muted)]">
                  {String(
                    getValue(
                      selectedPlayer,
                      "playerName",
                      "player_name"
                    ) ??
                      "Unknown Player"
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closePlayerInspector
                }
                disabled={
                  moderationLoading
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-lg font-bold transition hover:bg-[var(--secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close inspector"
              >
                ×
              </button>
            </div>

            {/* BODY */}

            <div className="min-h-0 overflow-y-auto p-5 sm:p-6">

              {/* PLAYER ID */}

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  PLAYER ID
                </p>

                <p className="mt-2 break-all font-mono text-xs font-semibold">
                  {String(
                    getValue(
                      selectedPlayer,
                      "id"
                    ) ?? "—"
                  )}
                </p>
              </div>

              {/* STATS */}

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatBox
                  label="HP"
                  value={
                    getValue(
                      selectedPlayer,
                      "hp"
                    ) ?? "—"
                  }
                />

                <StatBox
                  label="MONEY"
                  value={
                    formatMoney(
                      getValue(
                        selectedPlayer,
                        "money"
                      )
                    )
                  }
                />

                <StatBox
                  label="ROLE"
                  value={
                    getValue(
                      selectedPlayer,
                      "role"
                    ) ?? "—"
                  }
                />

                <StatBox
                  label="ONLINE"
                  value={
                    Boolean(
                      getValue(
                        selectedPlayer,
                        "isConnected",
                        "is_connected"
                      )
                    )
                      ? "YES"
                      : "NO"
                  }
                />
              </div>

              {/* DETAILS */}

              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4">
                <h3 className="font-black">
                  Player Details
                </h3>

                <div className="mt-4 space-y-4">
                  <InfoRow
                    label="Name"
                    value={
                      getValue(
                        selectedPlayer,
                        "playerName",
                        "player_name"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Role"
                    value={
                      getValue(
                        selectedPlayer,
                        "role"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Location"
                    value={
                      getValue(
                        selectedPlayer,
                        "location"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Location ID"
                    value={
                      getValue(
                        selectedPlayer,
                        "locationId",
                        "location_id"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Country"
                    value={
                      getValue(
                        selectedPlayer,
                        "country"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Last choice"
                    value={
                      getValue(
                        selectedPlayer,
                        "lastChoice",
                        "last_choice"
                      ) ?? "—"
                    }
                  />

                  <InfoRow
                    label="Moderation"
                    value={
                      getValue(
                        selectedPlayer,
                        "moderationStatus",
                        "moderation_status"
                      ) ??
                      "active"
                    }
                  />

                  <InfoRow
                    label="Reason"
                    value={
                      getValue(
                        selectedPlayer,
                        "moderationReason",
                        "moderation_reason"
                      ) ??
                      "—"
                    }
                  />

                  <InfoRow
                    label="Moderated at"
                    value={
                      formatDate(
                        getValue(
                          selectedPlayer,
                          "moderatedAt",
                          "moderated_at"
                        )
                      )
                    }
                  />

                  <InfoRow
                    label="Created"
                    value={
                      formatDate(
                        getValue(
                          selectedPlayer,
                          "createdAt",
                          "created_at"
                        )
                      )
                    }
                  />
                </div>
              </div>

              {/* =================================================
                  MODERATION ERROR
                  ================================================= */}

              {moderationError && (
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-sm font-semibold text-red-600 dark:text-red-300">
                    ⚠️{" "}
                    {moderationError}
                  </p>
                </div>
              )}

              {/* =================================================
                  CONFIRMATION
                  ================================================= */}

              {moderationAction ? (
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">
                      ⚠️
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-black">
                        Confirm{" "}
                        {moderationAction ===
                        "kick"
                          ? "Kick"
                          : "Ban"}
                      </p>

                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                        Player{" "}
                        <strong>
                          {String(
                            getValue(
                              selectedPlayer,
                              "playerName",
                              "player_name"
                            ) ??
                              "Unknown"
                          )}
                        </strong>{" "}
                        sẽ bị{" "}
                        {moderationAction ===
                        "kick"
                          ? "kick khỏi room."
                          : "ban khỏi room."}
                      </p>

                      {(
                        getValue(
                          selectedPlayer,
                          "role"
                        ) === "host"
                      ) && (
                        <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                          <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                            🛠️ DEVELOPER OVERRIDE
                          </p>

                          <p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-300">
                            Đây là Host. Developer vẫn có quyền moderation Host.
                          </p>
                        </div>
                      )}

                      <label className="mt-4 block">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                          Reason
                        </span>

                        <textarea
                          value={
                            moderationReason
                          }
                          onChange={(
                            event
                          ) =>
                            setModerationReason(
                              event.target
                                .value
                            )
                          }
                          disabled={
                            moderationLoading
                          }
                          rows={3}
                          className="mt-2 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm outline-none transition focus:border-red-500 disabled:opacity-50"
                          placeholder="Lý do moderation..."
                        />
                      </label>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setModerationAction(
                              null
                            );

                            setModerationReason(
                              ""
                            );

                            setModerationError(
                              ""
                            );
                          }}
                          disabled={
                            moderationLoading
                          }
                          className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold transition hover:bg-[var(--secondary)] disabled:opacity-50"
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={
                            executeModeration
                          }
                          disabled={
                            moderationLoading
                          }
                          className="min-h-11 rounded-xl bg-red-600 px-5 py-2 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {moderationLoading
                            ? "Processing..."
                            : `Confirm ${
                                moderationAction ===
                                "kick"
                                  ? "Kick"
                                  : "Ban"
                              }`}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* =================================================
                   ACTIONS
                   ================================================= */

                <div className="mt-4">
                  <h3 className="font-black">
                    Moderation
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    Developer có quyền moderation tất cả player, bao gồm Host.
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        beginModeration(
                          "kick"
                        )
                      }
                      disabled={
                        moderationLoading
                      }
                      className="min-h-12 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm font-black text-yellow-700 transition hover:bg-yellow-500/20 dark:text-yellow-300 disabled:opacity-50"
                    >
                      👢 Kick Player
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        beginModeration(
                          "ban"
                        )
                      }
                      disabled={
                        moderationLoading
                      }
                      className="min-h-12 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-500/20 dark:text-red-300 disabled:opacity-50"
                    >
                      🚫 Ban Player
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* FOOTER */}

            <div className="shrink-0 border-t border-[var(--border)] bg-[var(--input)] px-5 py-3 text-xs text-[var(--muted)] sm:px-6">
              Developer-only controls · Room{" "}
              {roomCode}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* =========================================================
   INFO ROW
   ========================================================= */

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-3 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>

      <span className="max-w-[65%] break-words text-right text-sm font-semibold text-[var(--foreground)]">
        {String(
          value ?? "—"
        )}
      </span>
    </div>
  );
}

/* =========================================================
   STAT BOX
   ========================================================= */

function StatBox({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--input)] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-2 break-words text-lg font-black text-[var(--foreground)]">
        {String(
          value ?? "—"
        )}
      </p>
    </div>
  );
}