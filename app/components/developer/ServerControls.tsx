"use client";

import { useState } from "react";

type ServerAction = "pause" | "resume" | "force-close";

type Props = {
  roomCode: string;
};

export default function ServerControls({
  roomCode,
}: Props) {
  const [loading, setLoading] =
    useState<ServerAction | null>(null);

  const runAction = async (
    action: ServerAction
  ) => {
    if (loading) return;

    if (action === "force-close") {
      const confirmed = window.confirm(
        `Force Close room ${roomCode}?\n\nHành động này sẽ kết thúc room.`
      );

      if (!confirmed) return;
    }

    setLoading(action);

    try {
      const response = await fetch(
        `/api/developer/rooms/${roomCode}/server/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Server action failed."
        );
      }

      alert(
        data?.message ||
          `Server action "${action}" thành công.`
      );
    } catch (error) {
      console.error(
        "SERVER CONTROL UI ERROR:",
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : "Có lỗi xảy ra."
      );
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-white/10 bg-black/20 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          🖥️ Server Controls
        </h2>

        <p className="mt-1 text-sm text-gray-400">
          Điều khiển trạng thái server của room {roomCode}.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => runAction("pause")}
          disabled={loading !== null}
          className="rounded-lg bg-yellow-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "pause"
            ? "Pausing..."
            : "⏸ Pause Server"}
        </button>

        <button
          type="button"
          onClick={() => runAction("resume")}
          disabled={loading !== null}
          className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "resume"
            ? "Resuming..."
            : "▶ Resume Server"}
        </button>

        <button
          type="button"
          onClick={() => runAction("force-close")}
          disabled={loading !== null}
          className="rounded-lg bg-red-700 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading === "force-close"
            ? "Closing..."
            : "⛔ Force Close Server"}
        </button>
      </div>
    </section>
  );
}