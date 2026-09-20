"use client";

import { useEffect, useMemo, useState } from "react";

type EndGameDetail = {
  playerName?: string;
  money?: number;
  hp?: number;
  location?: string;
  rounds?: number;
  message?: string;
};

type ConfettiPiece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  rotation: number;
  size: number;
  drift: number;
  shape: "rect" | "circle";
};

const DEV_FORCE_PARAM = "devEndGame";

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN").format(
    Math.max(0, Math.round(value))
  );
}

function createConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    delay: Math.random() * 2.2,
    duration: 3.2 + Math.random() * 2.4,
    rotation: Math.random() * 360,
    size: 6 + Math.random() * 8,
    drift: -140 + Math.random() * 280,
    shape: Math.random() > 0.25 ? "rect" : "circle",
  }));
}

const DEFAULT_DETAIL: EndGameDetail = {
  playerName: "Người sống sót",
  money: 400_000_000,
  hp: 100,
  location: "Việt Nam",
  rounds: 0,
};

export default function EndGameOverlay() {
  const [visible, setVisible] = useState(false);
  const [detail, setDetail] =
    useState<EndGameDetail>(DEFAULT_DETAIL);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [burstKey, setBurstKey] = useState(0);

  const devMessage = useMemo(
    () =>
      "Chúc mừng! Bạn đã đi đến tận cùng của Đường Biên Đêm. Cảm ơn bạn đã chơi — hành trình này là do chính bạn viết nên.",
    []
  );

  function showEndGame(incoming?: EndGameDetail) {
    setDetail({
      ...DEFAULT_DETAIL,
      ...incoming,
      message: incoming?.message ?? devMessage,
    });

    setConfetti(createConfetti(150));
    setBurstKey((value) => value + 1);
    setVisible(true);
  }

  function closeOverlay() {
    setVisible(false);
  }

  useEffect(() => {
  function handleEndGame(event: Event) {
    const customEvent =
      event as CustomEvent<EndGameDetail>;

    showEndGame(customEvent.detail);
  }

  // ============================================
  // NORMAL END GAME EVENT
  // ============================================

  window.addEventListener(
    "duongbien:end-game",
    handleEndGame
  );

  // ============================================
  // PENDING END GAME
  //
  // Nếu GamePage gọi triggerEndGame()
  // trước khi Overlay mount thì payload vẫn
  // được giữ lại và xử lý ở đây.
  // ============================================

  const pending = consumePendingEndGame();

  if (pending) {
    showEndGame(pending);
  }

  // ============================================
  // DEV FORCE END GAME TEST
  //
  // /game/123456?devEndGame=1
  // ============================================

  const params = new URLSearchParams(
    window.location.search
  );

  const forceEndGame =
    params.get(DEV_FORCE_PARAM) === "1";

  let frame: number | null = null;

  if (forceEndGame) {
    frame = window.requestAnimationFrame(() => {
      showEndGame({
        playerName: "DEV TEST",
        money: 400_000_000,
        hp: 100,
        location: "Đà Lạt",
        rounds: 12,
        message:
          "DEV TEST — End Game Overlay đang hoạt động!",
      });
    });
  }

  // ============================================
  // CLEANUP
  // ============================================

  return () => {
    window.removeEventListener(
      "duongbien:end-game",
      handleEndGame
    );

    if (frame !== null) {
      window.cancelAnimationFrame(frame);
    }
  };
}, [showEndGame, devMessage]);

  return (
    <>
      <style jsx global>{`
        @keyframes dbd-confetti-fall {
          0% {
            transform: translate3d(0, -12vh, 0) rotate(0deg);
            opacity: 1;
          }

          85% {
            opacity: 1;
          }

          100% {
            transform:
              translate3d(var(--dbd-drift), 115vh, 0)
              rotate(900deg);
            opacity: 0;
          }
        }

        @keyframes dbd-side-burst-left {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 1;
          }

          100% {
            transform:
              translate(42vw, -76vh)
              rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes dbd-side-burst-right {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 1;
          }

          100% {
            transform:
              translate(-42vw, -76vh)
              rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes dbd-victory-pop {
          0% {
            transform: scale(.35) rotate(-5deg);
            opacity: 0;
          }

          55% {
            transform: scale(1.08) rotate(1deg);
            opacity: 1;
          }

          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        @keyframes dbd-glow {
          0%,
          100% {
            opacity: .35;
            transform: scale(.9);
          }

          50% {
            opacity: .8;
            transform: scale(1.12);
          }
        }

        @keyframes dbd-fade-up {
          from {
            opacity: 0;
            transform: translateY(22px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dbd-endgame-piece {
          position: absolute;
          top: -5vh;
          pointer-events: none;
          animation:
            dbd-confetti-fall
            var(--dbd-duration)
            var(--dbd-delay)
            linear
            forwards;
          will-change: transform, opacity;
        }

        .dbd-left-piece {
          position: absolute;
          left: 0;
          bottom: 18%;
          width: 9px;
          height: 15px;
          pointer-events: none;
          animation:
            dbd-side-burst-left
            2.6s
            var(--dbd-delay)
            cubic-bezier(.15,.75,.25,1)
            forwards;
        }

        .dbd-right-piece {
          position: absolute;
          right: 0;
          bottom: 18%;
          width: 9px;
          height: 15px;
          pointer-events: none;
          animation:
            dbd-side-burst-right
            2.6s
            var(--dbd-delay)
            cubic-bezier(.15,.75,.25,1)
            forwards;
        }

        .dbd-endgame-card {
          animation:
            dbd-victory-pop
            .8s
            cubic-bezier(.16,1,.3,1)
            both;
        }

        .dbd-endgame-glow {
          animation:
            dbd-glow
            2.2s
            ease-in-out
            infinite;
        }

        .dbd-endgame-stat {
          animation:
            dbd-fade-up
            .65s
            cubic-bezier(.16,1,.3,1)
            both;
        }

        @media (prefers-reduced-motion: reduce) {
          .dbd-endgame-piece,
          .dbd-left-piece,
          .dbd-right-piece,
          .dbd-endgame-card,
          .dbd-endgame-glow,
          .dbd-endgame-stat {
            animation: none !important;
          }
        }
      `}</style>

      <div
        key={burstKey}
        className="fixed inset-0 z-[99999] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Màn hình chiến thắng"
        style={{
          background:
            "radial-gradient(circle at center, rgba(255,255,255,.98) 0%, rgba(255,248,225,.97) 28%, rgba(16,16,16,.98) 100%)",
        }}
      >
        {/* Glow */}

        <div
          className="dbd-endgame-glow absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background: "rgba(255,190,60,.42)",
          }}
        />

        {/* Top confetti */}

        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          {confetti.map((piece) => (
            <span
              key={piece.id}
              className="dbd-endgame-piece"
              style={{
                left: `${piece.left}%`,
                width: `${piece.size}px`,
                height:
                  piece.shape === "circle"
                    ? `${piece.size}px`
                    : `${piece.size * 1.65}px`,
                borderRadius:
                  piece.shape === "circle"
                    ? "999px"
                    : "2px",
                background:
                  piece.id % 5 === 0
                    ? "#facc15"
                    : piece.id % 5 === 1
                      ? "#ef4444"
                      : piece.id % 5 === 2
                        ? "#22c55e"
                        : piece.id % 5 === 3
                          ? "#3b82f6"
                          : "#ec4899",
                transform:
                  `rotate(${piece.rotation}deg)`,
                ["--dbd-delay" as string]:
                  `${piece.delay}s`,
                ["--dbd-duration" as string]:
                  `${piece.duration}s`,
                ["--dbd-drift" as string]:
                  `${piece.drift}px`,
              }}
            />
          ))}
        </div>

        {/* Left cannon */}

        <div
          className="pointer-events-none absolute bottom-[16%] left-[-4px] hidden sm:block"
          aria-hidden="true"
        >
          {Array.from({ length: 32 }).map(
            (_, index) => (
              <span
                key={`left-${index}`}
                className="dbd-left-piece"
                style={{
                  ["--dbd-delay" as string]:
                    `${index * 0.018}s`,
                  background:
                    index % 4 === 0
                      ? "#facc15"
                      : index % 4 === 1
                        ? "#ef4444"
                        : index % 4 === 2
                          ? "#22c55e"
                          : "#3b82f6",
                  transform:
                    `rotate(${index * 17}deg)`,
                }}
              />
            )
          )}
        </div>

        {/* Right cannon */}

        <div
          className="pointer-events-none absolute bottom-[16%] right-[-4px] hidden sm:block"
          aria-hidden="true"
        >
          {Array.from({ length: 32 }).map(
            (_, index) => (
              <span
                key={`right-${index}`}
                className="dbd-right-piece"
                style={{
                  ["--dbd-delay" as string]:
                    `${index * 0.018}s`,
                  background:
                    index % 4 === 0
                      ? "#facc15"
                      : index % 4 === 1
                        ? "#ef4444"
                        : index % 4 === 2
                          ? "#22c55e"
                          : "#3b82f6",
                  transform:
                    `rotate(${index * 17}deg)`,
                }}
              />
            )
          )}
        </div>

        {/* Main card */}

        <div className="relative flex min-h-full items-center justify-center px-4 py-8">
          <div className="dbd-endgame-card relative w-full max-w-2xl">
            <div className="rounded-[32px] border-4 border-black bg-[#f7edcf] px-5 py-7 text-center shadow-[10px_12px_0_rgba(0,0,0,.85)] sm:px-10 sm:py-10">
              <div
                className="mb-3 text-6xl sm:text-7xl"
                aria-hidden="true"
              >
                🏆
              </div>

              <div className="mb-2 text-sm font-black uppercase tracking-[.3em] text-neutral-600">
                ĐƯỜNG BIÊN ĐÊM
              </div>

              <h1 className="text-4xl font-black uppercase leading-none tracking-tight text-black sm:text-6xl">
                CHIẾN THẮNG!
              </h1>

              <p className="mt-3 text-base font-bold text-neutral-700 sm:text-lg">
                Bạn đã chạm mốc tài sản
              </p>

              {/* Money */}

              <div className="my-5 rounded-2xl border-4 border-black bg-black px-4 py-5 shadow-[5px_5px_0_rgba(0,0,0,.25)]">
                <div className="text-xs font-black uppercase tracking-[.25em] text-yellow-300">
                  TÀI SẢN CUỐI CÙNG
                </div>

                <div className="mt-1 break-words text-4xl font-black text-white sm:text-6xl">
                  {formatMoney(
                    detail.money ??
                      400_000_000
                  )}
                  ₫
                </div>
              </div>

              <div className="text-2xl font-black text-black sm:text-3xl">
                {detail.playerName}
              </div>

              {/* Stats */}

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div
                  className="dbd-endgame-stat rounded-xl border-2 border-black bg-white p-3"
                  style={{
                    animationDelay: ".15s",
                  }}
                >
                  <div className="text-xs font-bold text-neutral-500">
                    HP
                  </div>

                  <div className="mt-1 text-xl font-black">
                    {detail.hp ?? 100}
                  </div>
                </div>

                <div
                  className="dbd-endgame-stat rounded-xl border-2 border-black bg-white p-3"
                  style={{
                    animationDelay: ".25s",
                  }}
                >
                  <div className="text-xs font-bold text-neutral-500">
                    ĐỊA ĐIỂM
                  </div>

                  <div className="mt-1 truncate text-sm font-black">
                    {detail.location ?? "Việt Nam"}
                  </div>
                </div>

                <div
                  className="dbd-endgame-stat rounded-xl border-2 border-black bg-white p-3"
                  style={{
                    animationDelay: ".35s",
                  }}
                >
                  <div className="text-xs font-bold text-neutral-500">
                    VÒNG
                  </div>

                  <div className="mt-1 text-xl font-black">
                    {detail.rounds ?? 0}
                  </div>
                </div>

                <div
                  className="dbd-endgame-stat rounded-xl border-2 border-black bg-white p-3"
                  style={{
                    animationDelay: ".45s",
                  }}
                >
                  <div className="text-xs font-bold text-neutral-500">
                    TRẠNG THÁI
                  </div>

                  <div className="mt-1 text-sm font-black text-green-700">
                    SURVIVED
                  </div>
                </div>
              </div>

              {/* Dev message */}

              <div
                className="dbd-endgame-stat mt-6 rounded-2xl border-2 border-black bg-[#fff8df] px-4 py-4 text-left"
                style={{
                  animationDelay: ".55s",
                }}
              >
                <div className="mb-1 text-xs font-black uppercase tracking-widest text-neutral-500">
                  💬 Lời nhắn từ Dev
                </div>

                <p className="text-sm font-semibold leading-6 text-neutral-800 sm:text-base">
                  {detail.message ?? devMessage}
                </p>

                <div className="mt-3 text-right text-xs font-black text-neutral-500">
                  — Hoàng Đăng Khoa
                </div>
              </div>

              <button
                type="button"
                onClick={closeOverlay}
                className="mt-7 min-h-12 w-full rounded-xl border-2 border-black bg-black px-6 py-3 text-base font-black text-white shadow-[4px_4px_0_rgba(0,0,0,.25)] transition-transform active:translate-x-[2px] active:translate-y-[2px]"
              >
                VỀ LẠI GAME
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =====================================================
   PROGRAMMATIC END-GAME TRIGGER
   ===================================================== */

let pendingEndGameDetail: EndGameDetail | null = null;

export function triggerEndGame(detail?: EndGameDetail) {
  if (typeof window === "undefined") return;

  const payload: EndGameDetail = {
    playerName: detail?.playerName ?? "Người sống sót",
    money: detail?.money ?? 400_000_000,
    hp: detail?.hp ?? 100,
    location: detail?.location ?? "Việt Nam",
    rounds: detail?.rounds ?? 0,
    message:
      detail?.message ??
      "Chúc mừng! Bạn đã hoàn thành hành trình Đường Biên Đêm.",
  };

  // QUAN TRỌNG:
  // Lưu trước khi dispatch để không bao giờ mất event
  // nếu EndGameOverlay chưa kịp mount.
  pendingEndGameDetail = payload;

  window.dispatchEvent(
    new CustomEvent("duongbien:end-game", {
      detail: payload,
    })
  );
}

export function consumePendingEndGame(): EndGameDetail | null {
  const detail = pendingEndGameDetail;
  pendingEndGameDetail = null;
  return detail;
}