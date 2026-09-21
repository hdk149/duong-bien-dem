"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

export type EndGamePlayer = {
  playerName?: string;
  player_name?: string;
  money?: number | string;
  hp?: number;
  location?: string;
  rounds?: number;
  role?: string;
};

export type EndGameDetail = {
  forced?: boolean;
  reason?: string;
  message?: string;

  playerName?: string;
  money?: number | string;
  hp?: number;
  location?: string;
  rounds?: number;

  players?: EndGamePlayer[];

  /*
   * Một số payload server có thể dùng timestamp
   * hoặc triggered_at.
   */
  timestamp?: string;
  triggered_at?: string;
};

type EndGameOverlayProps = {
  visible?: boolean;
  forced?: boolean;
  message?: string;
  playerName?: string;
  money?: number | string;
  hp?: number;
  location?: string;
  rounds?: number;
};

/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const END_GAME_EVENT = "duongbien:end-game";

const DEV_FORCE_PARAM = "devEndGame";

/*
 * ============================================================
 * CONTENT
 * ============================================================
 */

const NORMAL_WIN_CONTENT = {
  eyebrow: "ĐƯỜNG BIÊN ĐÊM",
  title: "HÀNH TRÌNH HOÀN TẤT",
  subtitle:
    "Bạn đã đạt mục tiêu tài sản và hoàn thành hành trình!",
  statLabel: "TÀI SẢN CUỐI CÙNG",
  status: "",
};

const FORCED_END_CONTENT = {
  eyebrow: "DEVELOPER FORCE END",
  title: "TRẬN ĐẤU KẾT THÚC",
  subtitle:
    "Trận đấu đã được kết thúc bởi Developer.",
  statLabel: "TRẠNG THÁI",
  status: "FORCED",
};

/*
 * ============================================================
 * PENDING END GAME
 * ============================================================
 *
 * Nếu GamePage gọi triggerEndGame() trước khi
 * EndGameOverlay mount thì payload vẫn được giữ lại.
 */

let pendingEndGameDetail: EndGameDetail | null = null;

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function formatMoney(
  value: number | string | undefined
) {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(number)) {
    return "0đ";
  }

  return `${new Intl.NumberFormat(
    "vi-VN"
  ).format(Math.round(number))}đ`;
}

/*
 * ============================================================
 * SHARED TRIGGER
 * ============================================================
 */

export function triggerEndGame(
  detail?: EndGameDetail
) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: EndGameDetail = {
    ...detail,

    playerName:
      detail?.playerName ??
      "Người sống sót",

    money:
      detail?.money ??
      400_000_000,

    hp:
      detail?.hp ??
      100,

    location:
      detail?.location ??
      "Việt Nam",

    rounds:
      detail?.rounds ??
      0,

    message:
      detail?.message ??
      "Chúc mừng! Bạn đã hoàn thành hành trình Đường Biên Đêm.",
  };

  /*
   * QUAN TRỌNG:
   *
   * Lưu trước khi dispatch để tránh trường hợp
   * Overlay chưa mount kịp và event bị mất.
   */
  pendingEndGameDetail = payload;

  window.dispatchEvent(
    new CustomEvent<EndGameDetail>(
      END_GAME_EVENT,
      {
        detail: payload,
      }
    )
  );
}

/*
 * ============================================================
 * CONSUME PENDING EVENT
 * ============================================================
 */

export function consumePendingEndGame():
  | EndGameDetail
  | null {
  const detail =
    pendingEndGameDetail;

  pendingEndGameDetail = null;

  return detail;
}

/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

export default function EndGameOverlay({
  visible: controlledVisible,
  forced: controlledForced,
  message: controlledMessage,
  playerName: controlledPlayerName,
  money: controlledMoney,
  hp: controlledHp,
  location: controlledLocation,
  rounds: controlledRounds,
}: EndGameOverlayProps) {
  const router = useRouter();

  /*
   * ----------------------------------------------------------
   * INTERNAL EVENT STATE
   * ----------------------------------------------------------
   */

  const [
    eventVisible,
    setEventVisible,
  ] = useState(false);

  const [
    eventDetail,
    setEventDetail,
  ] = useState<EndGameDetail>({});

  const [
    burstKey,
    setBurstKey,
  ] = useState(0);

  /*
   * ----------------------------------------------------------
   * DEV MESSAGE
   * ----------------------------------------------------------
   */

  const devMessage = useMemo(
    () =>
      "Chúc mừng! Bạn đã đi đến tận cùng của Đường Biên Đêm. Cảm ơn bạn đã chơi — hành trình này là do chính bạn viết nên.",
    []
  );

  /*
   * ----------------------------------------------------------
   * EFFECTIVE DATA
   * ----------------------------------------------------------
   */

  const effectiveVisible =
    controlledVisible !== undefined
      ? controlledVisible
      : eventVisible;

  const effectiveForced =
    controlledForced ??
    Boolean(eventDetail.forced);

  const content =
    effectiveForced
      ? FORCED_END_CONTENT
      : NORMAL_WIN_CONTENT;

  const effectiveMessage =
    controlledMessage ??
    eventDetail.message ??
    content.subtitle ??
    devMessage;

  const effectivePlayerName =
    controlledPlayerName ??
    eventDetail.playerName ??
    "Người chơi";

  const effectiveMoney =
    controlledMoney ??
    eventDetail.money ??
    400_000_000;

  const effectiveHp =
    controlledHp ??
    eventDetail.hp ??
    100;

  const effectiveLocation =
    controlledLocation ??
    eventDetail.location ??
    "Việt Nam";

  const effectiveRounds =
    controlledRounds ??
    eventDetail.rounds ??
    0;

  /*
   * ----------------------------------------------------------
   * CONFETTI
   * ----------------------------------------------------------
   */

  const confetti = useMemo(() => {
    return Array.from(
      { length: 120 },
      (_, index) => ({
        id: index,

        left:
          `${Math.random() * 100}%`,

        delay:
          `${Math.random() * 1.8}s`,

        duration:
          `${2.8 + Math.random() * 2.8}s`,

        rotation:
          `${Math.floor(
            Math.random() * 360
          )}deg`,

        size:
          `${
            6 +
            Math.floor(
              Math.random() * 7
            )
          }px`,
      })
    );
  }, [burstKey]);

  /*
   * ==========================================================
   * END GAME EVENT LISTENER
   * ==========================================================
   */

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    function handleEndGame(
      event: Event
    ) {
      const customEvent =
        event as CustomEvent<EndGameDetail>;

      const nextDetail =
        customEvent.detail ?? {};

      setEventDetail(
        nextDetail
      );

      setEventVisible(true);

      setBurstKey(
        (value) => value + 1
      );
    }

    window.addEventListener(
      END_GAME_EVENT,
      handleEndGame
    );

    /*
     * --------------------------------------------------------
     * PENDING END GAME
     * --------------------------------------------------------
     */

    const pending =
      consumePendingEndGame();

    if (pending) {
      setEventDetail(pending);
      setEventVisible(true);

      setBurstKey(
        (value) => value + 1
      );
    }

    /*
     * --------------------------------------------------------
     * DEV FORCE END GAME TEST
     *
     * /game/123456?devEndGame=1
     * --------------------------------------------------------
     */

    const params =
      new URLSearchParams(
        window.location.search
      );

    const forceEndGame =
      params.get(
        DEV_FORCE_PARAM
      ) === "1";

    let frame:
      | number
      | null = null;

    if (forceEndGame) {
      frame =
        window.requestAnimationFrame(
          () => {
            const devPayload: EndGameDetail =
              {
                forced: true,

                reason:
                  "developer_test",

                playerName:
                  "DEV TEST",

                money:
                  400_000_000,

                hp: 100,

                location:
                  "Đà Lạt",

                rounds: 12,

                message:
                  "DEV TEST — End Game Overlay đang hoạt động!",
              };

            setEventDetail(
              devPayload
            );

            setEventVisible(
              true
            );

            setBurstKey(
              (value) =>
                value + 1
            );
          }
        );
    }

    /*
     * --------------------------------------------------------
     * CLEANUP
     * --------------------------------------------------------
     */

    return () => {
      window.removeEventListener(
        END_GAME_EVENT,
        handleEndGame
      );

      if (
        frame !== null
      ) {
        window.cancelAnimationFrame(
          frame
        );
      }
    };
  }, []);

  /*
   * ==========================================================
   * BACK HOME
   * ==========================================================
   */

  function backHome() {
    setEventVisible(false);

    router.push("/");
  }

  /*
   * ==========================================================
   * DO NOT RENDER
   * ==========================================================
   */

  if (!effectiveVisible) {
    return null;
  }

  /*
   * ==========================================================
   * OVERLAY
   * ==========================================================
   */

  return (
    <>
      <style jsx global>{`
        @keyframes endgame-pop {
          0% {
            opacity: 0;
            transform:
              scale(0.86)
              translateY(24px);
          }

          100% {
            opacity: 1;
            transform:
              scale(1)
              translateY(0);
          }
        }

        @keyframes endgame-confetti {
          0% {
            opacity: 0;
            transform:
              translate3d(
                0,
                -30px,
                0
              )
              rotate(0deg);
          }

          10% {
            opacity: 1;
          }

          100% {
            opacity: 0;
            transform:
              translate3d(
                0,
                110vh,
                0
              )
              rotate(720deg);
          }
        }

        @keyframes endgame-glow {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.92);
          }

          50% {
            opacity: 0.55;
            transform: scale(1.08);
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

      <div
        key={burstKey}
        className="fixed inset-0 z-[99999] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={
          effectiveForced
            ? "Developer ended game"
            : "Game finished"
        }
      >
        {/* BACKDROP */}

        <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

        {/* AMBIENT GLOW */}

        <div
          className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background:
              "rgba(214,189,114,0.18)",
            animation:
              "endgame-glow 2.4s ease-in-out infinite",
          }}
        />

        {/* CONFETTI */}

        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          {confetti.map(
            (piece) => (
              <span
                key={piece.id}
                className="absolute top-[-30px] block"
                style={{
                  left:
                    piece.left,

                  width:
                    piece.size,

                  height:
                    piece.size,

                  animation:
                    "endgame-confetti linear forwards",

                  animationDelay:
                    piece.delay,

                  animationDuration:
                    piece.duration,

                  transform:
                    `rotate(${piece.rotation})`,

                  background:
                    piece.id % 5 ===
                    0
                      ? "#d6bd72"
                      : piece.id % 5 ===
                          1
                        ? "#b9a16a"
                        : piece.id % 5 ===
                            2
                          ? "#eee7d9"
                          : piece.id % 5 ===
                              3
                            ? "#8c9363"
                            : "#a85f55",
                }}
              />
            )
          )}
        </div>

        {/* LEFT CANNON */}

        <div
          className="pointer-events-none absolute left-[-25px] top-1/2 h-32 w-32 -translate-y-1/2"
          aria-hidden="true"
        >
          <div className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-[#eee7d9] shadow-[0_0_30px_10px_rgba(238,231,217,0.35)]" />
        </div>

        {/* RIGHT CANNON */}

        <div
          className="pointer-events-none absolute right-[-25px] top-1/2 h-32 w-32 -translate-y-1/2"
          aria-hidden="true"
        >
          <div className="absolute right-1/2 top-1/2 h-3 w-3 rounded-full bg-[#eee7d9] shadow-[0_0_30px_10px_rgba(238,231,217,0.35)]" />
        </div>

        {/* MAIN */}

        <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-8">
          <div
            className="relative w-full max-w-lg"
            style={{
              animation:
                "endgame-pop 500ms cubic-bezier(.16,1,.3,1)",
            }}
          >
            {/* TOP DECORATION */}

            <div className="mb-[-28px] text-center">
              <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#d6bd72]/50 bg-[#1a1815] text-5xl shadow-[0_0_60px_rgba(214,189,114,0.25)]">
                {effectiveForced
                  ? "⚡"
                  : "🏆"}
              </div>
            </div>

            {/* CARD */}

            <div className="overflow-hidden rounded-[32px] border border-[#4b463d] bg-[#171613] text-[#eee7d9] shadow-[0_30px_100px_rgba(0,0,0,0.6)]">
              {/* HEADER */}

              <div className="px-6 pb-6 pt-16 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#a49678]">
                  {content.eyebrow}
                </p>

                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  {content.title}
                </h1>

                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#aaa397]">
                  {effectiveMessage}
                </p>
              </div>

              {/* MONEY / STATUS */}

              <div className="border-y border-[#37342e] bg-[#1d1b18] px-6 py-7 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#8e8678]">
                  {content.statLabel}
                </p>

                <p className="mt-2 text-4xl font-black tracking-tight text-[#d6bd72] sm:text-5xl">
                  {effectiveForced
                    ? content.status
                    : formatMoney(
                        effectiveMoney
                      )}
                </p>
              </div>

              {/* PLAYER */}

              <div className="grid grid-cols-2 gap-px border-b border-[#37342e] bg-[#37342e]">
                <div className="bg-[#171613] px-4 py-5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#777166]">
                    Người chơi
                  </p>

                  <p className="mt-1 truncate text-sm font-bold">
                    {
                      effectivePlayerName
                    }
                  </p>
                </div>

                <div className="bg-[#171613] px-4 py-5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#777166]">
                    HP
                  </p>

                  <p className="mt-1 text-sm font-bold">
                    ❤️{" "}
                    {effectiveHp}
                  </p>
                </div>

                <div className="bg-[#171613] px-4 py-5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#777166]">
                    Vị trí
                  </p>

                  <p className="mt-1 truncate text-sm font-bold">
                    📍{" "}
                    {
                      effectiveLocation
                    }
                  </p>
                </div>

                <div className="bg-[#171613] px-4 py-5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#777166]">
                    Số vòng
                  </p>

                  <p className="mt-1 text-sm font-bold">
                    {
                      effectiveRounds
                    }
                  </p>
                </div>
              </div>

              {/* FORCE END MESSAGE */}

              {effectiveForced && (
                <div className="mx-5 mt-5 rounded-2xl border border-[#5a4b32] bg-[#252019] px-4 py-4 text-center">
                  <p className="text-xs leading-5 text-[#c7bdab]">
                    Đây là lần kết thúc
                    cưỡng chế từ
                    Developer. Không có
                    kết quả thắng 400
                    triệu được ghi nhận.
                  </p>
                </div>
              )}

              {/* BUTTON */}

              <div className="p-5">
                <button
                  type="button"
                  onClick={
                    backHome
                  }
                  className="min-h-14 w-full rounded-2xl bg-[#eee7d9] px-5 text-sm font-black tracking-wide text-[#171613] transition hover:bg-white active:scale-[0.985]"
                >
                  BACK HOME
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}