"use client";

import { useState } from "react";
import EndGameOverlay, {
  triggerEndGame,
} from "../../components/EndGameOverlay";

export default function DeveloperEndGameTestPage() {
  const [mode, setMode] = useState<"win" | "force" | null>(null);

  function testWin() {
    setMode("win");

    triggerEndGame({
      forced: false,
      reason: "developer_ui_test_win",
      message:
        "Bạn đã đạt mục tiêu tài sản và hoàn thành hành trình.",
      playerName: "Hoàng Đăng Khoa",
      money: 400000000,
      hp: 100,
      location: "TP. Hồ Chí Minh",
      rounds: 12,
      players: [
        {
          playerName: "Hoàng Đăng Khoa",
          money: 400000000,
          hp: 100,
          location: "TP. Hồ Chí Minh",
          rounds: 12,
        },
        {
          playerName: "Player 2",
          money: 18500000,
          hp: 76,
          location: "Đà Nẵng",
          rounds: 12,
        },
      ],
    });
  }

  function testForce() {
    setMode("force");

    triggerEndGame({
      forced: true,
      reason: "developer_force_end",
      message:
        "Trận đấu đã được kết thúc bởi Developer.",
      playerName: "Hoàng Đăng Khoa",
      money: 12500000,
      hp: 87,
      location: "Hà Nội",
      rounds: 8,
      players: [
        {
          playerName: "Hoàng Đăng Khoa",
          money: 12500000,
          hp: 87,
          location: "Hà Nội",
          rounds: 8,
        },
        {
          playerName: "Player 2",
          money: 7600000,
          hp: 65,
          location: "Đà Nẵng",
          rounds: 8,
        },
        {
          playerName: "Player 3",
          money: 42000000,
          hp: 91,
          location: "Huế",
          rounds: 8,
        },
      ],
    });
  }

  return (
    <main className="min-h-[100dvh] bg-background px-5 py-10 text-foreground">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            DEVELOPER
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            End Game UI Test
          </h1>

          <p className="mt-2 text-sm text-muted">
            Test cinematic thắng và force-end độc lập với game thật.
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={testWin}
            className="min-h-14 w-full rounded-2xl bg-primary px-5 text-left font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.99]"
          >
            <div className="text-base">
              🏆 Test Normal Win
            </div>

            <div className="mt-1 text-xs opacity-70">
              Giả lập người chơi đạt 400.000.000đ
            </div>
          </button>

          <button
            type="button"
            onClick={testForce}
            className="min-h-14 w-full rounded-2xl border border-border bg-card px-5 text-left font-semibold transition hover:bg-secondary active:scale-[0.99]"
          >
            <div className="text-base">
              ⚡ Test Developer Force End
            </div>

            <div className="mt-1 text-xs text-muted">
              Giả lập Developer kết thúc trận
            </div>
          </button>
        </div>

        {mode && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-sm">
            Đang test:{" "}
            <strong>
              {mode === "win"
                ? "Normal Win"
                : "Developer Force End"}
            </strong>
          </div>
        )}
      </div>

      <EndGameOverlay />
    </main>
  );
}