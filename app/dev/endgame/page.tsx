"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TestMode = "win" | "forced";

type EndGamePlayer = {
  playerName: string;
  money: number;
  hp: number;
  location: string;
  rounds: number;
};

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(
    value
  )}đ`;
}

export default function DevEndGamePage() {
  const router = useRouter();

  const [mode, setMode] =
    useState<TestMode>("win");

  const [visible, setVisible] =
    useState(false);

  const player: EndGamePlayer = {
    playerName: "Khoa",
    money:
      mode === "win"
        ? 400000000
        : 18750000,
    hp: 87,
    location:
      mode === "win"
        ? "Hà Nội"
        : "Đà Nẵng",
    rounds: 18,
  };

  const confetti = useMemo(() => {
    return Array.from(
      { length: 120 },
      (_, index) => ({
        id: index,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 1.8}s`,
        duration: `${2.8 + Math.random() * 2.8}s`,
        rotation: `${Math.floor(
          Math.random() * 360
        )}deg`,
        size: `${
          6 + Math.floor(Math.random() * 7)
        }px`,
      })
    );
  }, [visible]);

  function open(modeValue: TestMode) {
    setMode(modeValue);
    setVisible(false);

    requestAnimationFrame(() => {
      setVisible(true);
    });
  }

  function close() {
    setVisible(false);
  }

  function backHome() {
    setVisible(false);
    router.push("/");
  }

  return (
    <main className="min-h-[100dvh] bg-[#e9e2d5] px-4 py-10 text-[#171613]">
      {/* ==================================================
          TEST PANEL
          ================================================== */}

      <div className="mx-auto w-full max-w-md rounded-[28px] border border-[#cfc6b7] bg-[#f8f4ec] p-5 shadow-[0_20px_60px_rgba(75,55,35,0.12)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#9b7f43]">
          ĐƯỜNG BIÊN ĐÊM
        </p>

        <h1 className="mt-2 text-2xl font-black">
          End Game UI Test
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#766f64]">
          Trang test độc lập. Không cần vào
          room và không gọi API game.
        </p>

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={() => open("win")}
            className="min-h-14 rounded-2xl bg-[#171613] px-5 text-sm font-black text-[#eee7d9] transition hover:bg-[#292722] active:scale-[0.98]"
          >
            🏆 TEST WIN 400M
          </button>

          <button
            type="button"
            onClick={() => open("forced")}
            className="min-h-14 rounded-2xl border border-[#4b463d] bg-[#eee7d9] px-5 text-sm font-black text-[#171613] transition hover:bg-white active:scale-[0.98]"
          >
            ⚡ TEST DEVELOPER FORCE END
          </button>
        </div>

        <button
          type="button"
          onClick={backHome}
          className="mt-3 min-h-12 w-full rounded-2xl border border-[#d7d0c4] bg-transparent px-5 text-sm font-bold text-[#766f64] transition hover:bg-[#ebe4d8]"
        >
          BACK HOME
        </button>
      </div>

      {/* ==================================================
          END GAME OVERLAY
          ================================================== */}

      {visible && (
        <div
          className="fixed inset-0 z-[99999] overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label={
            mode === "forced"
              ? "Developer ended game"
              : "Game finished"
          }
        >
          {/* BACKDROP */}

          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

          {/* CONFETTI */}

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {confetti.map((piece) => (
              <span
                key={piece.id}
                className="absolute top-[-30px] block animate-[endgame-confetti_linear_forwards]"
                style={{
                  left: piece.left,
                  width: piece.size,
                  height: piece.size,
                  animationDelay:
                    piece.delay,
                  animationDuration:
                    piece.duration,
                  transform:
                    `rotate(${piece.rotation})`,
                  background:
                    piece.id % 5 === 0
                      ? "#d6bd72"
                      : piece.id % 5 === 1
                        ? "#b9a16a"
                        : piece.id % 5 === 2
                          ? "#eee7d9"
                          : piece.id % 5 === 3
                            ? "#8c9363"
                            : "#a85f55",
                }}
              />
            ))}
          </div>

          {/* LEFT CANNON */}

          <div className="pointer-events-none absolute left-[-25px] top-1/2 h-32 w-32 -translate-y-1/2">
            <div className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-[#eee7d9] shadow-[0_0_30px_10px_rgba(238,231,217,0.35)]" />
          </div>

          {/* RIGHT CANNON */}

          <div className="pointer-events-none absolute right-[-25px] top-1/2 h-32 w-32 -translate-y-1/2">
            <div className="absolute right-1/2 top-1/2 h-3 w-3 rounded-full bg-[#eee7d9] shadow-[0_0_30px_10px_rgba(238,231,217,0.35)]" />
          </div>

          {/* MAIN */}

          <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8">
            <div className="relative w-full max-w-lg animate-[endgame-pop_500ms_cubic-bezier(.16,1,.3,1)]">

              {/* TOP ICON */}

              <div className="mb-[-28px] text-center">
                <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#d6bd72]/50 bg-[#1a1815] text-5xl shadow-[0_0_60px_rgba(214,189,114,0.25)]">
                  {mode === "forced"
                    ? "⚡"
                    : "🏆"}
                </div>
              </div>

              {/* CARD */}

              <div className="overflow-hidden rounded-[32px] border border-[#4b463d] bg-[#171613] text-[#eee7d9] shadow-[0_30px_100px_rgba(0,0,0,0.6)]">

                {/* HEADER */}

                <div className="px-6 pb-6 pt-16 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#a49678]">
                    {mode === "forced"
                      ? "DEVELOPER FORCE END"
                      : "ĐƯỜNG BIÊN ĐÊM"}
                  </p>

                  <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                    {mode === "forced"
                      ? "TRẬN ĐẤU KẾT THÚC"
                      : "HÀNH TRÌNH HOÀN TẤT"}
                  </h1>

                  <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#aaa397]">
                    {mode === "forced"
                      ? "Trận đấu đã được kết thúc bởi Developer."
                      : "Bạn đã đạt mục tiêu tài sản và hoàn thành hành trình."}
                  </p>
                </div>

                {/* MONEY */}

                <div className="border-y border-[#37342e] bg-[#1d1b18] px-6 py-7 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#8e8678]">
                    {mode === "forced"
                      ? "TRẠNG THÁI"
                      : "TÀI SẢN CUỐI CÙNG"}
                  </p>

                  <p className="mt-2 text-4xl font-black tracking-tight text-[#d6bd72] sm:text-5xl">
                    {mode === "forced"
                      ? "FORCED"
                      : formatMoney(
                          player.money
                        )}
                  </p>
                </div>

                {/* PLAYER INFO */}

                <div className="grid grid-cols-2 gap-px border-b border-[#37342e] bg-[#37342e]">

                  <div className="bg-[#171613] px-4 py-5 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-[#777166]">
                      Người chơi
                    </p>

                    <p className="mt-1 truncate text-sm font-bold">
                      {player.playerName}
                    </p>
                  </div>

                  <div className="bg-[#171613] px-4 py-5 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-[#777166]">
                      HP
                    </p>

                    <p className="mt-1 text-sm font-bold">
                      ❤️ {player.hp}
                    </p>
                  </div>

                  <div className="bg-[#171613] px-4 py-5 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-[#777166]">
                      Vị trí
                    </p>

                    <p className="mt-1 truncate text-sm font-bold">
                      📍 {player.location}
                    </p>
                  </div>

                  <div className="bg-[#171613] px-4 py-5 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-[#777166]">
                      Số vòng
                    </p>

                    <p className="mt-1 text-sm font-bold">
                      {player.rounds}
                    </p>
                  </div>

                </div>

                {/* FORCED MESSAGE */}

                {mode === "forced" && (
                  <div className="mx-5 mt-5 rounded-2xl border border-[#5a4b32] bg-[#252019] px-4 py-4 text-center">
                    <p className="text-xs leading-5 text-[#c7bdab]">
                      Đây là lần kết thúc cưỡng
                      chế từ Developer. Không
                      có kết quả thắng 400 triệu
                      được ghi nhận.
                    </p>
                  </div>
                )}

                {/* BUTTONS */}

                <div className="grid gap-2 p-5">

                  <button
                    type="button"
                    onClick={close}
                    className="min-h-14 w-full rounded-2xl border border-[#4b463d] bg-[#25231f] px-5 text-sm font-bold text-[#eee7d9] transition hover:bg-[#302d28] active:scale-[0.985]"
                  >
                    ĐÓNG PREVIEW
                  </button>

                  <button
                    type="button"
                    onClick={backHome}
                    className="min-h-14 w-full rounded-2xl bg-[#eee7d9] px-5 text-sm font-black tracking-wide text-[#171613] transition hover:bg-white active:scale-[0.985]"
                  >
                    BACK HOME
                  </button>

                </div>
              </div>
            </div>
          </div>

          <style jsx global>{`
            @keyframes endgame-pop {
              0% {
                opacity: 0;
                transform: scale(0.86)
                  translateY(24px);
              }

              100% {
                opacity: 1;
                transform: scale(1)
                  translateY(0);
              }
            }

            @keyframes endgame-confetti {
              0% {
                opacity: 0;
                transform:
                  translate3d(0, -30px, 0)
                  rotate(0deg);
              }

              10% {
                opacity: 1;
              }

              100% {
                opacity: 0;
                transform:
                  translate3d(0, 110vh, 0)
                  rotate(720deg);
              }
            }

            @media (
              prefers-reduced-motion: reduce
            ) {
              [aria-label="Game finished"],
              [aria-label="Developer ended game"] {
                animation: none !important;
              }

              [aria-label="Game finished"] span,
              [aria-label="Developer ended game"] span {
                animation: none !important;
              }
            }
          `}</style>
        </div>
      )}
    </main>
  );
}