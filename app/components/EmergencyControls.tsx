"use client";

import { useState } from "react";

type Props = {
  roomCode: string;
};

const actions = [
  {
    id: "pause_room",
    title: "Pause",
    description: "Tạm dừng room.",
    danger: false,
    icon: "⏸️",
  },
  {
    id: "resume_room",
    title: "Resume",
    description: "Tiếp tục room.",
    danger: false,
    icon: "▶️",
  },
  {
    id: "reset_round",
    title: "Reset Round",
    description: "Reset round hiện tại.",
    danger: false,
    icon: "🔄",
  },
  {
    id: "clear_votes",
    title: "Clear Votes",
    description: "Xóa vote đang chờ.",
    danger: false,
    icon: "🧹",
  },
  {
    id: "force_stop_round",
    title: "Force Stop",
    description: "Dừng round ngay.",
    danger: true,
    icon: "⛔",
  },
  {
    id: "unlock_room",
    title: "Unlock",
    description: "Gỡ trạng thái stuck.",
    danger: true,
    icon: "🔓",
  },
  {
    id: "force_end_game",
    title: "End Game",
    description: "Kết thúc game ngay.",
    danger: true,
    icon: "🏁",
  },
];

export default function EmergencyControls({
  roomCode,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function executeAction(
    action: string,
    danger: boolean
  ) {
    if (loading) return;

    if (danger) {
      const confirmed = window.confirm(
        `⚠️ Developer Override\n\nBạn chắc chắn muốn "${action}" cho room ${roomCode}?`
      );

      if (!confirmed) return;
    }

    setLoading(action);
    setMessage("");

    try {
      let developerToken = "";

      try {
        developerToken =
          window.sessionStorage.getItem(
            "developer_session_token"
          )?.trim() ?? "";
      } catch {
        // Ignore storage errors.
      }

      if (!developerToken) {
        throw new Error(
          "Không tìm thấy Developer Session."
        );
      }

      const response = await fetch(
        `/api/developer/rooms/${roomCode}/emergency`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-developer-session":
              developerToken,
          },
          body: JSON.stringify({
            action,
          }),
        }
      );

      let data: any = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Emergency action failed."
        );
      }

      setMessage(
        data?.message ||
          `Đã thực hiện ${action}.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {/* =====================================================
          FLOATING EMERGENCY BUTTON
          ===================================================== */}

      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => {
            setOpen((current) => !current);
            setMessage("");
          }}
          className={`flex h-14 items-center gap-2 rounded-2xl border px-5 text-sm font-black shadow-2xl backdrop-blur-xl transition active:scale-95 ${
            open
              ? "border-red-500/50 bg-red-600 text-white"
              : "border-red-500/40 bg-red-500 text-white hover:bg-red-600"
          }`}
        >
          <span className="text-xl">
            ⚠️
          </span>

          <span>
            Emergency
          </span>

          <span className="text-xs opacity-80">
            {open ? "▲" : "▼"}
          </span>
        </button>
      </div>

      {/* =====================================================
          EMERGENCY PANEL
          ===================================================== */}

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[calc(100vw-3rem)] max-w-sm overflow-hidden rounded-3xl border border-red-500/30 bg-[var(--card)] shadow-2xl backdrop-blur-xl">
          {/* HEADER */}

          <div className="border-b border-[var(--border)] bg-red-500/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    🚨
                  </span>

                  <h2 className="font-black">
                    Emergency Controls
                  </h2>
                </div>

                <p className="mt-1 text-xs text-[var(--muted)]">
                  Developer Override · Room{" "}
                  <span className="font-black">
                    {roomCode}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpen(false)
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--input)] font-bold transition hover:bg-[var(--secondary)]"
              >
                ×
              </button>
            </div>
          </div>

          {/* ACTIONS */}

          <div className="max-h-[65vh] overflow-y-auto p-3">
            <div className="grid gap-2">
              {actions.map((action) => {
                const isLoading =
                  loading === action.id;

                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={
                      loading !== null
                    }
                    onClick={() =>
                      executeAction(
                        action.id,
                        action.danger
                      )
                    }
                    className={`w-full rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                      action.danger
                        ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                        : "border-[var(--border)] bg-[var(--input)] hover:bg-[var(--secondary)]"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--card)] text-lg">
                        {action.icon}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black">
                            {action.title}
                          </span>

                          {isLoading && (
                            <span className="text-[10px] font-bold text-[var(--muted)]">
                              PROCESSING...
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {action.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* RESULT */}

            {message && (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--input)] p-3">
                <p className="text-xs leading-5">
                  {message}
                </p>
              </div>
            )}
          </div>

          {/* FOOTER */}

          <div className="border-t border-[var(--border)] bg-[var(--input)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Developer-only · Highest authority
            </p>
          </div>
        </div>
      )}
    </>
  );
}