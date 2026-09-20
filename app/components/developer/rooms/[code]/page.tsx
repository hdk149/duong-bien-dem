"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

const actions = [
  {
    id: "pause_room",
    label: "Pause Room",
    description: "Tạm dừng toàn bộ hoạt động của room.",
  },
  {
    id: "resume_room",
    label: "Resume Room",
    description: "Tiếp tục room đang bị pause.",
  },
  {
    id: "reset_round",
    label: "Reset Current Round",
    description: "Reset round hiện tại và xóa lựa chọn/vote.",
  },
  {
    id: "clear_votes",
    label: "Clear Pending Votes",
    description: "Xóa toàn bộ vote đang chờ.",
  },
  {
    id: "force_stop_round",
    label: "Force Stop Round",
    description: "Buộc dừng round hiện tại.",
  },
  {
    id: "unlock_room",
    label: "Unlock Stuck Room",
    description: "Gỡ trạng thái lock của room.",
  },
  {
    id: "force_end_game",
    label: "Force End Game",
    description: "Kết thúc game ngay lập tức.",
    danger: true,
  },
];

export default function EmergencyControlsPage() {
  const params = useParams();
  const code = params.code as string;

  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function executeAction(action: string, danger = false) {
    if (danger) {
      const confirmed = window.confirm(
        "⚠️ Bạn chắc chắn muốn thực hiện thao tác nguy hiểm này?"
      );

      if (!confirmed) return;
    }

    setLoading(action);
    setMessage("");

    try {
      const res = await fetch(`/api/dev/rooms/${code}/emergency`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Action failed");
      }

      setMessage(data.message || "Action completed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="text-sm text-red-400 font-semibold">
            DEVELOPER CONTROL
          </p>

          <h1 className="text-3xl font-bold mt-1">
            Emergency Controls
          </h1>

          <p className="text-gray-400 mt-2">
            Room:{" "}
            <span className="text-white font-mono">
              {code}
            </span>
          </p>
        </div>

        <div className="grid gap-3">
          {actions.map((item) => (
            <button
              key={item.id}
              disabled={loading !== null}
              onClick={() =>
                executeAction(item.id, item.danger)
              }
              className={`w-full rounded-xl border p-4 text-left transition
                ${
                  item.danger
                    ? "border-red-800 bg-red-950/30 hover:bg-red-900/40"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }
                disabled:opacity-50`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {item.label}
                </span>

                {loading === item.id && (
                  <span className="text-sm text-gray-400">
                    Processing...
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-400 mt-1">
                {item.description}
              </p>
            </button>
          ))}
        </div>

        {message && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}