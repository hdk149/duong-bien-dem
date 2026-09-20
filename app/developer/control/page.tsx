"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../../components/LanguageProvider";
import { useTheme } from "../../components/ThemeProvider";

const DEVELOPER_SESSION_KEY =
  "developer_session_token";

type Room = {
  id: string;
  code: string;
  host_name: string;
  max_players: number;
  status: string;
  starting_money?: number;
  goal_money?: number;
  starting_location?: string;
  created_at?: string;
};

type ApiResponse = {
  success?: boolean;
  rooms?: Room[];
  error?: string;
};

export default function DeveloperControlPage() {
  const router = useRouter();

  const { language } = useLanguage();
  const { theme } = useTheme();

  const isVietnamese = language === "vi";

  const [developerToken, setDeveloperToken] =
    useState("");

  const [rooms, setRooms] = useState<Room[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [ready, setReady] =
    useState(false);

  // ==========================================
  // RECEIVE DEVELOPER TOKEN
  // ==========================================

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function getStoredToken() {
      const token =
        sessionStorage.getItem(
          DEVELOPER_SESSION_KEY
        );

      if (token) {
        setDeveloperToken(token);
        return token;
      }

      return "";
    }

    function sendReady() {
      try {
        if (
          window.opener &&
          !window.opener.closed
        ) {
          window.opener.postMessage(
            {
              type:
                "developer-control-ready",
            },
            window.location.origin
          );
        }
      } catch (error) {
        console.error(
          "[DEVELOPER CONTROL] Ready error:",
          error
        );
      }
    }

    function handleMessage(
      event: MessageEvent
    ) {
      if (
        event.origin !==
        window.location.origin
      ) {
        return;
      }

      if (
        event.data?.type !==
        "developer-session-transfer"
      ) {
        return;
      }

      const token =
        typeof event.data
          ?.developerToken ===
        "string"
          ? event.data.developerToken.trim()
          : "";

      if (!token) {
        return;
      }

      console.log(
        "[DEVELOPER CONTROL] Token received"
      );

      sessionStorage.setItem(
        DEVELOPER_SESSION_KEY,
        token
      );

      setDeveloperToken(token);
      setReady(true);
    }

    window.addEventListener(
      "message",
      handleMessage
    );

    /*
     * Gửi READY ngay.
     */
    sendReady();

    /*
     * Gửi READY thêm vài lần để xử lý
     * trường hợp Settings load chậm.
     */
    const readyInterval =
      window.setInterval(() => {
        sendReady();
      }, 500);

    /*
     * Nếu token đã có sẵn thì dùng luôn.
     */
    const storedToken =
      getStoredToken();

    if (storedToken) {
      setReady(true);
    }

    const timeout =
      window.setTimeout(() => {
        window.clearInterval(
          readyInterval
        );
      }, 5000);

    return () => {
      window.removeEventListener(
        "message",
        handleMessage
      );

      window.clearInterval(
        readyInterval
      );

      window.clearTimeout(timeout);
    };
  }, []);

  // ==========================================
  // LOAD ROOMS
  // ==========================================

  async function loadRooms(
    token: string
  ) {
    if (!token) {
      setLoading(false);
      setError(
        isVietnamese
          ? "Không tìm thấy Developer Session."
          : "Developer Session not found."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      /*
       * API global Developer.
       *
       * Nếu chưa có endpoint này,
       * backend sẽ trả 404.
       *
       * Endpoint dự kiến:
       *
       * GET /api/developer/control
       */

      const response = await fetch(
        "/api/developer/control",
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept:
              "application/json",
            "x-developer-session":
              token,
          },
        }
      );

      const data: ApiResponse =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            (isVietnamese
              ? "Không thể tải danh sách phòng."
              : "Could not load rooms.")
        );
      }

      setRooms(
        Array.isArray(data.rooms)
          ? data.rooms
          : []
      );
    } catch (error) {
      console.error(
        "[DEVELOPER CONTROL] Load rooms error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : isVietnamese
            ? "Không thể tải danh sách phòng."
            : "Could not load rooms."
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // START LOADING AFTER TOKEN
  // ==========================================

  useEffect(() => {
    if (!developerToken) {
      return;
    }

    loadRooms(developerToken);
  }, [developerToken]);

  // ==========================================
  // REFRESH
  // ==========================================

  async function refreshRooms() {
    if (!developerToken) {
      return;
    }

    await loadRooms(
      developerToken
    );
  }

  // ==========================================
  // OPEN ROOM
  // ==========================================

  function openRoom(
    roomCode: string
  ) {
    if (
      !/^\d{6}$/.test(roomCode)
    ) {
      return;
    }

    router.push(
      `/developer/dashboard?room=${encodeURIComponent(
        roomCode
      )}`
    );
  }

  // ==========================================
  // FORMAT MONEY
  // ==========================================

  function formatMoney(
    value?: number
  ) {
    if (
      typeof value !==
      "number"
    ) {
      return "—";
    }

    return new Intl.NumberFormat(
      isVietnamese
        ? "vi-VN"
        : "en-US"
    ).format(value);
  }

  // ==========================================
  // ROOM STATUS
  // ==========================================

  function getStatusLabel(
    status: string
  ) {
    switch (
      status
        .toLowerCase()
        .trim()
    ) {
      case "lobby":
        return isVietnamese
          ? "Phòng chờ"
          : "Lobby";

      case "playing":
        return isVietnamese
          ? "Đang chơi"
          : "Playing";

      case "finished":
        return isVietnamese
          ? "Đã kết thúc"
          : "Finished";

      case "closed":
        return isVietnamese
          ? "Đã đóng"
          : "Closed";

      default:
        return status || "—";
    }
  }

  function getStatusClass(
    status: string
  ) {
    switch (
      status
        .toLowerCase()
        .trim()
    ) {
      case "playing":
        return "bg-green-500/10 text-green-500 border-green-500/20";

      case "lobby":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";

      case "finished":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";

      case "closed":
        return "bg-red-500/10 text-red-500 border-red-500/20";

      default:
        return "bg-black/5 text-muted border-border dark:bg-white/5";
    }
  }

  // ==========================================
  // UI
  // ==========================================

  return (
    <main className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <div className="mx-auto w-full max-w-5xl px-5 py-6">

        {/* HEADER */}

        <header className="mb-8">
          <div className="flex items-center justify-between gap-4">

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() =>
                  router.back()
                }
                className="
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  bg-black/5
                  text-xl
                  transition
                  hover:bg-black/10
                  active:scale-95
                  dark:bg-white/10
                  dark:hover:bg-white/20
                "
                aria-label={
                  isVietnamese
                    ? "Quay lại"
                    : "Back"
                }
              >
                ←
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    🛠️
                  </span>

                  <h1 className="text-2xl font-black">
                    Developer Control Center
                  </h1>
                </div>

                <p className="mt-1 text-sm text-muted">
                  {isVietnamese
                    ? "Quản lý tất cả phòng chơi"
                    : "Manage all game rooms"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={refreshRooms}
              disabled={loading}
              className="
                rounded-xl
                border
                border-border
                bg-card
                px-4
                py-2.5
                text-sm
                font-semibold
                transition
                hover:bg-black/5
                dark:hover:bg-white/5
                disabled:opacity-50
              "
            >
              ↻{" "}
              {isVietnamese
                ? "Làm mới"
                : "Refresh"}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">

            <div className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted">
              {theme === "dark"
                ? "🌙 Dark"
                : "☀️ Light"}
            </div>

            <div className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-500">
              ●{" "}
              {isVietnamese
                ? "Developer đã xác minh"
                : "Developer verified"}
            </div>

            {ready && (
              <div className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted">
                Session active
              </div>
            )}
          </div>
        </header>

        {/* ERROR */}

        {error && (
          <section className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
            <div className="flex gap-3">
              <div className="text-xl">
                ⚠️
              </div>

              <div>
                <p className="font-bold text-red-500">
                  {isVietnamese
                    ? "Không thể tải Control Center"
                    : "Unable to load Control Center"}
                </p>

                <p className="mt-1 text-sm leading-6 text-red-500/90">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={refreshRooms}
                  className="
                    mt-4
                    rounded-xl
                    border
                    border-red-500/30
                    px-4
                    py-2
                    text-sm
                    font-semibold
                    text-red-500
                    transition
                    hover:bg-red-500/10
                  "
                >
                  {isVietnamese
                    ? "Thử lại"
                    : "Try again"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* STATS */}

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted">
              {isVietnamese
                ? "Tổng phòng"
                : "Total rooms"}
            </p>

            <p className="mt-2 text-3xl font-black">
              {rooms.length}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted">
              {isVietnamese
                ? "Đang chơi"
                : "Playing"}
            </p>

            <p className="mt-2 text-3xl font-black">
              {
                rooms.filter(
                  (room) =>
                    room.status ===
                    "playing"
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted">
              {isVietnamese
                ? "Phòng chờ"
                : "Lobby"}
            </p>

            <p className="mt-2 text-3xl font-black">
              {
                rooms.filter(
                  (room) =>
                    room.status ===
                    "lobby"
                ).length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted">
              {isVietnamese
                ? "Session"
                : "Session"}
            </p>

            <p className="mt-2 text-sm font-bold">
              {developerToken
                ? "ACTIVE"
                : "—"}
            </p>
          </div>
        </section>

        {/* ROOM LIST */}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black">
                {isVietnamese
                  ? "Tất cả phòng"
                  : "All rooms"}
              </h2>

              <p className="mt-1 text-sm text-muted">
                {isVietnamese
                  ? "Chọn một phòng để mở Developer Dashboard."
                  : "Select a room to open its Developer Dashboard."}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <div className="text-3xl">
                🛠️
              </div>

              <p className="mt-3 font-semibold">
                {isVietnamese
                  ? "Đang tải danh sách phòng..."
                  : "Loading rooms..."}
              </p>

              <p className="mt-1 text-sm text-muted">
                {isVietnamese
                  ? "Đang xác thực Developer Session."
                  : "Validating Developer Session."}
              </p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <div className="text-4xl">
                🏠
              </div>

              <p className="mt-4 text-lg font-bold">
                {isVietnamese
                  ? "Chưa có phòng nào"
                  : "No rooms found"}
              </p>

              <p className="mt-1 text-sm text-muted">
                {isVietnamese
                  ? "Hiện chưa có room nào trong hệ thống."
                  : "There are currently no rooms in the system."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">

              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() =>
                    openRoom(
                      room.code
                    )
                  }
                  className="
                    group
                    w-full
                    rounded-2xl
                    border
                    border-border
                    bg-card
                    p-5
                    text-left
                    shadow-sm
                    transition
                    hover:border-foreground/30
                    hover:shadow-md
                    active:scale-[0.995]
                  "
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                    {/* LEFT */}

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">

                        <span className="text-xs font-bold uppercase tracking-wider text-muted">
                          ROOM
                        </span>

                        <span className="text-2xl font-black tracking-[0.18em]">
                          {room.code}
                        </span>

                        <span
                          className={`
                            rounded-full
                            border
                            px-2.5
                            py-1
                            text-xs
                            font-semibold
                            ${getStatusClass(
                              room.status
                            )}
                          `}
                        >
                          {getStatusLabel(
                            room.status
                          )}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">

                        <div>
                          <span className="text-muted">
                            {isVietnamese
                              ? "Host:"
                              : "Host:"}{" "}
                          </span>

                          <span className="font-semibold">
                            {room.host_name ||
                              "—"}
                          </span>
                        </div>

                        <div>
                          <span className="text-muted">
                            {isVietnamese
                              ? "Tối đa:"
                              : "Max:"}{" "}
                          </span>

                          <span className="font-semibold">
                            {room.max_players}
                          </span>
                        </div>

                        <div>
                          <span className="text-muted">
                            {isVietnamese
                              ? "Vốn đầu:"
                              : "Starting:"}{" "}
                          </span>

                          <span className="font-semibold">
                            {formatMoney(
                              room.starting_money
                            )}
                          </span>
                        </div>

                        <div>
                          <span className="text-muted">
                            {isVietnamese
                              ? "Mục tiêu:"
                              : "Goal:"}{" "}
                          </span>

                          <span className="font-semibold">
                            {formatMoney(
                              room.goal_money
                            )}
                          </span>
                        </div>

                      </div>
                    </div>

                    {/* RIGHT */}

                    <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">

                      <div className="text-right">
                        <p className="text-xs font-semibold text-muted">
                          {isVietnamese
                            ? "Developer"
                            : "Developer"}
                        </p>

                        <p className="mt-1 text-sm font-bold">
                          Control
                        </p>
                      </div>

                      <span className="text-2xl text-muted transition group-hover:translate-x-1 group-hover:text-foreground">
                        →
                      </span>

                    </div>

                  </div>
                </button>
              ))}

            </div>
          )}
        </section>

        {/* FOOTER */}

        <footer className="mt-10 border-t border-border pt-5 text-center">
          <p className="text-xs text-muted">
            Developer Control Center
          </p>

          <p className="mt-1 text-[11px] text-muted/70">
            {isVietnamese
              ? "Global Developer Session • Không cần tham gia phòng"
              : "Global Developer Session • No room membership required"}
          </p>
        </footer>

      </div>
    </main>
  );
}