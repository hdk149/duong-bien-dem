"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import { useLanguage } from "../../components/LanguageProvider";
import { useTheme } from "../../components/ThemeProvider";
import { supabase } from "../../../lib/supabase";

import ShopItemGrid, {
  type ShopStockItem,
} from "../../components/shop/ShopItemGrid";

import {
  SHOP_CATEGORIES,
  type ShopCategory,
  type ShopItem,
} from "../../components/shop/shopItems";

type CurrentPlayer = {
  id: string;
  playerName: string;
  hp: number;
  money: number | string;
  location: string;
  role: string;
  isConnected: boolean;
};

type GameData = {
  success: boolean;

  room: {
    id: string;
    code: string;
    hostName: string;
    maxPlayers: number;
    status: string;
    startingMoney?: number | string;
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
    startedAt?: string | null;
    finishedAt?: string | null;
    createdAt?: string | null;

    shopStartedAt?: string | null;
    shop_started_at?: string | null;
  };

  currentPlayer: CurrentPlayer | null;

  shopStartedAt?: string | null;
  shop_started_at?: string | null;
  serverNow?: string;
};

type ShopSessionResponse = {
  ok?: boolean;
  created?: boolean;

  session?: {
    id: string;
    room_id: string;
    round: number;
    started_at: string;
    expires_at: string;
  };

  stock?: Array<{
    id: string;
    shop_session_id: string;
    item_id: string;
    initial_stock: number;
    remaining_stock: number;
  }>;

  serverNow?: string;

  error?: string;
  details?: string;
};

type ShopBuyResponse = {
  ok?: boolean;
  purchased?: boolean;

  message?: string;
  error?: string;

  player?: {
    id: string;
    name: string | null;
    money: number;
  };

  item?: {
    id: string;
    name: string;
    name_en?: string;
    price: number;
    category: string;
  };

  stock?: {
    remainingStock: number;
  };

  shopSession?: {
    id: string;
    round: number;
    startedAt: string;
    expiresAt: string | number;
  };

  serverNow?: string;

  expired?: boolean;
};

const SHOP_DURATION_MS = 85_000;

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
  ).format(number)}đ`;
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

function formatTimer(
  milliseconds: number
) {
  const safe = Math.max(
    0,
    milliseconds
  );

  const totalSeconds = Math.ceil(
    safe / 1000
  );

  const minutes = Math.floor(
    totalSeconds / 60
  );

  const seconds =
    totalSeconds % 60;

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

export default function ShopPage() {
  const params = useParams();
  const router = useRouter();

  const code = String(params.code);

  const { language } =
    useLanguage();

  const { theme } =
    useTheme();

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

  /*
   * --------------------------------------------------
   * CONNECTION #2
   * SHOP SESSION + STOCK
   * --------------------------------------------------
   */

  const [shopStock, setShopStock] =
    useState<ShopStockItem[]>([]);

  const [shopSessionId, setShopSessionId] =
    useState<string | null>(null);

  const [shopExpiresAt, setShopExpiresAt] =
    useState<string | null>(null);

  /*
   * --------------------------------------------------
   * CONNECTION #3
   * SERVER TIMER
   * --------------------------------------------------
   */

  const [remainingMs, setRemainingMs] =
    useState(SHOP_DURATION_MS);

  const [shopExpired, setShopExpired] =
    useState(false);

  const [serverOffsetMs, setServerOffsetMs] =
    useState(0);

  /*
   * --------------------------------------------------
   * CONNECTION #4
   * SHOP UI STATE
   * --------------------------------------------------
   */

  const [selectedCategory, setSelectedCategory] =
    useState<ShopCategory | null>(null);

  const [selectedItem, setSelectedItem] =
    useState<ShopItem | null>(null);

  /*
   * --------------------------------------------------
   * CONNECTION #5
   * BUY API STATE
   * --------------------------------------------------
   */

  const [buying, setBuying] =
    useState(false);

  const [buyError, setBuyError] =
    useState("");

  const [buySuccess, setBuySuccess] =
    useState(false);

  const [buySuccessMessage, setBuySuccessMessage] =
    useState("");

  /*
   * --------------------------------------------------
   * THEME
   * --------------------------------------------------
   */

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
   * LOAD GAME STATE
   * --------------------------------------------------
   */

  const loadGame = useCallback(
    async () => {
      try {
        setError("");

        const playerId =
          typeof window !== "undefined"
            ? sessionStorage.getItem(
                "player_id"
              )
            : null;

        const playerToken =
          typeof window !== "undefined"
            ? sessionStorage.getItem(
                "player_token"
              )
            : null;

        const headers: Record<
          string,
          string
        > = {};

        if (playerId) {
          headers["x-player-id"] =
            playerId;
        }

        if (playerToken) {
          headers["x-player-token"] =
            playerToken;
        }

        const response = await fetch(
          `/api/rooms/${code}/game-state`,
          {
            method: "GET",
            headers,
            cache: "no-store",
          }
        );

        const data =
          (await response.json()) as GameData & {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Không thể tải thông tin phòng."
          );
        }

        if (data.serverNow) {
          const serverTime =
            new Date(
              data.serverNow
            ).getTime();

          if (
            Number.isFinite(
              serverTime
            )
          ) {
            setServerOffsetMs(
              serverTime -
                Date.now()
            );
          }
        }

        setGame(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : isVietnamese
              ? "Không thể tải cửa hàng."
              : "Unable to load shop."
        );
      } finally {
        setLoading(false);
      }
    },
    [
      code,
      isVietnamese,
    ]
  );

  /*
   * --------------------------------------------------
   * LOAD SHOP SESSION + STOCK
   * --------------------------------------------------
   */

  const loadShopSession =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              `/api/rooms/${code}/shop/session`,
              {
                method: "POST",
                cache: "no-store",
              }
            );

          const data =
            (await response.json()) as ShopSessionResponse;

          if (!response.ok) {
            throw new Error(
              data.error ||
                data.details ||
                "Không thể tải Shop session."
            );
          }

          if (data.session?.id) {
            setShopSessionId(
              data.session.id
            );
          }

          if (
            data.session?.expires_at
          ) {
            setShopExpiresAt(
              data.session.expires_at
            );
          }

          const normalizedStock: ShopStockItem[] =
            Array.isArray(
              data.stock
            )
              ? data.stock.map(
                  (entry) => ({
                    itemId:
                      entry.item_id,
                    remainingStock:
                      Math.max(
                        0,
                        Number(
                          entry.remaining_stock
                        )
                      ),
                  })
                )
              : [];

          setShopStock(
            normalizedStock
          );

          if (data.serverNow) {
            const serverTime =
              new Date(
                data.serverNow
              ).getTime();

            if (
              Number.isFinite(
                serverTime
              )
            ) {
              setServerOffsetMs(
                serverTime -
                  Date.now()
              );
            }
          }
        } catch (err) {
          console.error(
            "Failed to load Shop session:",
            err
          );

          setError(
            err instanceof Error
              ? err.message
              : isVietnamese
                ? "Không thể tải hàng hóa."
                : "Unable to load shop stock."
          );
        }
      },
      [
        code,
        isVietnamese,
      ]
    );

  /*
   * --------------------------------------------------
   * INITIAL LOAD
   * --------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    async function initialLoad() {
      if (!mounted) {
        return;
      }

      await loadGame();
    }

    void initialLoad();

    return () => {
      mounted = false;
    };
  }, [loadGame]);

  /*
   * --------------------------------------------------
   * LOAD SHOP SESSION WHEN PHASE = SHOP
   * --------------------------------------------------
   */

  useEffect(() => {
    if (
      !game ||
      game.session?.phase !==
        "shop"
    ) {
      return;
    }

    void loadShopSession();
  }, [
    game,
    loadShopSession,
  ]);

  /*
   * --------------------------------------------------
   * REALTIME
   * --------------------------------------------------
   */

  useEffect(() => {
    const channel =
      supabase.channel(
        `shop-${code}`
      );

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
        },
        () => {
          void loadGame();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_states",
        },
        () => {
          void loadGame();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shop_stock",
        },
        () => {
          void loadShopSession();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        channel
      );
    };
  }, [
    code,
    loadGame,
    loadShopSession,
  ]);

  /*
   * --------------------------------------------------
   * FALLBACK POLLING
   * --------------------------------------------------
   */

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        void loadGame();
      }, 5000);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [loadGame]);

  /*
   * --------------------------------------------------
   * DERIVED STATE
   * --------------------------------------------------
   */

  const currentRound =
    toNumber(
      game?.session?.round,
      0
    );

  const currentPhase =
    game?.session?.phase ??
    "";

  const isShopPhase =
    currentPhase === "shop";

  const currentPlayer =
    game?.currentPlayer ?? null;

  /*
   * --------------------------------------------------
   * SHOP START TIMESTAMP
   * --------------------------------------------------
   */

  const shopStartedAt =
    game?.shopStartedAt ??
    game?.shop_started_at ??
    game?.session?.shopStartedAt ??
    game?.session?.shop_started_at ??
    null;

  const closeShopOnServer = useCallback(async () => {
    const playerToken =
      typeof window !== "undefined"
        ? sessionStorage.getItem("player_token")
        : null;

    if (!playerToken) {
      return false;
    }

    try {
      const response = await fetch(
        `/api/rooms/${code}/shop/close`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "x-player-token": playerToken,
          },
        }
      );

      if (!response.ok) {
        return false;
      }

      return true;
    } catch (err) {
      console.error("Failed to close Shop:", err);
      return false;
    }
  }, [code]);

  /*
   * --------------------------------------------------
   * TIMER
   * --------------------------------------------------
   */

  useEffect(() => {
    if (!isShopPhase) {
      setShopExpired(false);

      setRemainingMs(
        SHOP_DURATION_MS
      );

      return;
    }

    if (!shopStartedAt) {
      setRemainingMs(
        SHOP_DURATION_MS
      );

      setShopExpired(false);

      return;
    }

    const startedAtMs =
      new Date(
        shopStartedAt
      ).getTime();

    if (
      !Number.isFinite(
        startedAtMs
      )
    ) {
      setRemainingMs(
        SHOP_DURATION_MS
      );

      return;
    }

    let expiredHandled =
      false;

    const updateTimer = () => {
      const serverNowMs =
        Date.now() +
        serverOffsetMs;

      const elapsed =
        serverNowMs -
        startedAtMs;

      const remaining =
        Math.max(
          0,
          SHOP_DURATION_MS -
            elapsed
        );

      setRemainingMs(
        remaining
      );

      if (
        remaining <= 0 &&
        !expiredHandled
      ) {
        expiredHandled = true;

        setShopExpired(true);

        setSelectedItem(null);
        setSelectedCategory(null);

        void (async () => {
          const closed = await closeShopOnServer();

          if (closed) {
            router.push(`/game/${code}`);
          } else {
            // Retry shortly in case the first request raced with the
            // server-side expiry boundary.
            window.setTimeout(async () => {
              const retryClosed =
                await closeShopOnServer();

              if (retryClosed) {
                router.push(`/game/${code}`);
              }
            }, 500);
          }
        })();
      }
    };

    updateTimer();

    const interval =
      window.setInterval(
        updateTimer,
        250
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    isShopPhase,
    shopStartedAt,
    serverOffsetMs,
  ]);

  /*
   * --------------------------------------------------
   * TIMER DISPLAY
   * --------------------------------------------------
   */

  const timerText =
    useMemo(
      () =>
        formatTimer(
          remainingMs
        ),
      [remainingMs]
    );

  const timerPercent =
    Math.max(
      0,
      Math.min(
        100,
        (remainingMs /
          SHOP_DURATION_MS) *
          100
      )
    );

  /*
   * --------------------------------------------------
   * SELECTED CATEGORY
   * --------------------------------------------------
   */

  const selectedCategoryData =
    selectedCategory
      ? SHOP_CATEGORIES.find(
          (category) =>
            category.id ===
            selectedCategory
        ) ?? null
      : null;

  /*
   * --------------------------------------------------
   * CATEGORY ACTIONS
   * --------------------------------------------------
   */

  const openCategory =
    useCallback(
      (category: ShopCategory) => {
        setSelectedItem(null);
        setBuyError("");
        setBuySuccess(false);

        setSelectedCategory(
          category
        );
      },
      []
    );

  const closeCategory =
    useCallback(() => {
      setSelectedItem(null);
      setBuyError("");
      setBuySuccess(false);

      setSelectedCategory(null);
    }, []);

  /*
   * --------------------------------------------------
   * BUY FLOW
   *
   * Product BUY
   *    ↓
   * Confirmation popup
   * --------------------------------------------------
   */

  const handleBuy =
    useCallback(
      (item: ShopItem) => {
        if (
          shopExpired ||
          buying
        ) {
          return;
        }

        setBuyError("");
        setBuySuccess(false);

        setSelectedItem(item);
      },
      [
        shopExpired,
        buying,
      ]
    );

  /*
   * --------------------------------------------------
   * CANCEL PURCHASE
   * --------------------------------------------------
   */

  const handleCancelPurchase =
    useCallback(() => {
      if (buying) {
        return;
      }

      setBuyError("");
      setBuySuccess(false);
      setSelectedItem(null);
    }, [buying]);

  /*
   * --------------------------------------------------
   * CONFIRM PURCHASE
   *
   * CONNECTION #5
   *
   * MUA
   * ↓
   * /api/rooms/[code]/shop/buy
   * ↓
   * server validation
   * ↓
   * atomic purchase
   * ↓
   * money - price
   * stock - 1
   * --------------------------------------------------
   */

  const handleConfirmPurchase =
    useCallback(
      async () => {
        if (
          !selectedItem ||
          buying ||
          shopExpired
        ) {
          return;
        }

        setBuying(true);
        setBuyError("");
        setBuySuccess(false);
        setBuySuccessMessage("");

        try {
          const playerToken =
            sessionStorage.getItem(
              "player_token"
            );

          if (!playerToken) {
            throw new Error(
              isVietnamese
                ? "Không tìm thấy player token. Vui lòng quay lại phòng game."
                : "Player token not found. Please return to the game."
            );
          }

          const response =
            await fetch(
              `/api/rooms/${code}/shop/buy`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  "x-player-token":
                    playerToken,
                },
                body: JSON.stringify({
                  itemId:
                    selectedItem.id,
                }),
                cache: "no-store",
              }
            );

          const data =
            (await response.json()) as ShopBuyResponse;

          if (!response.ok || !data.ok) {
            throw new Error(
              data.error ||
                (isVietnamese
                  ? "Không thể mua vật phẩm."
                  : "Unable to buy item.")
            );
          }

          /*
           * --------------------------------------------------
           * PURCHASE SUCCESS
           * --------------------------------------------------
           *
           * Server đã:
           * - trừ tiền
           * - giảm stock
           *
           * UI cập nhật ngay lập tức.
           */

          setBuySuccess(true);

          setBuySuccessMessage(
            data.message ||
              (isVietnamese
                ? "Mua vật phẩm thành công."
                : "Purchase successful.")
          );

          /*
           * --------------------------------------------------
           * UPDATE PLAYER MONEY
           * --------------------------------------------------
           */

          if (data.player) {
            setGame((prev) => {
              if (!prev) {
                return prev;
              }

              return {
                ...prev,
                currentPlayer:
                  prev.currentPlayer
                    ? {
                        ...prev.currentPlayer,
                        money:
                          data.player?.money ??
                          0,
                      }
                    : prev.currentPlayer,
              };
            });
          }

          /*
           * --------------------------------------------------
           * UPDATE SHOP STOCK
           * --------------------------------------------------
           */

          if (
            data.stock &&
            selectedItem
          ) {
            setShopStock((prev) =>
              prev.map(
                (entry) =>
                  entry.itemId ===
                  selectedItem.id
                    ? {
                        ...entry,
                        remainingStock:
                          Math.max(
                            0,
                            Number(
                              data.stock
                                ?.remainingStock ??
                                0
                            )
                          ),
                      }
                    : entry
              )
            );
          }
        } catch (err) {
          console.error(
            "Shop purchase failed:",
            err
          );

          setBuyError(
            err instanceof Error
              ? err.message
              : isVietnamese
                ? "Không thể mua vật phẩm."
                : "Unable to buy item."
          );
        } finally {
          setBuying(false);
        }
      },
      [
        selectedItem,
        buying,
        shopExpired,
        code,
        isVietnamese,
      ]
    );

  /*
   * --------------------------------------------------
   * LOADING
   * --------------------------------------------------
   */

  if (loading && !game) {
    return (
      <main
        className={`flex min-h-[100dvh] items-center justify-center px-5 ${pageClass}`}
      >
        <div
          className={`w-full max-w-md rounded-[28px] border p-8 text-center shadow-xl ${cardClass}`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#b69c57]/30 bg-[#b69c57]/10 text-2xl">
            🛒
          </div>

          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
            SHOP
          </p>

          <h1 className="mt-2 text-2xl font-black">
            {isVietnamese
              ? "Đang mở cửa hàng..."
              : "Opening shop..."}
          </h1>

          <p
            className={`mt-3 text-sm ${mutedClass}`}
          >
            {isVietnamese
              ? "Đang tải thông tin phòng."
              : "Loading room information."}
          </p>
        </div>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * ERROR
   * --------------------------------------------------
   */

  if (error || !game) {
    return (
      <main
        className={`flex min-h-[100dvh] items-center justify-center px-5 ${pageClass}`}
      >
        <div
          className={`w-full max-w-md rounded-[28px] border p-6 text-center shadow-xl ${cardClass}`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-2xl">
            !
          </div>

          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-red-400">
            ERROR
          </p>

          <h1 className="mt-2 text-2xl font-black">
            {isVietnamese
              ? "Không thể mở cửa hàng"
              : "Unable to open shop"}
          </h1>

          <p
            className={`mt-3 text-sm leading-6 ${mutedClass}`}
          >
            {error ||
              (isVietnamese
                ? "Không tìm thấy dữ liệu game."
                : "Game data was not found.")}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/game/${code}`
              )
            }
            className="mt-6 w-full rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-5 py-3 text-xs font-black uppercase tracking-[0.15em] text-[#b69c57] transition active:scale-[0.98]"
          >
            {isVietnamese
              ? "QUAY LẠI TRÒ CHƠI"
              : "BACK TO GAME"}
          </button>
        </div>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * SHOP CLOSED BY SERVER
   * --------------------------------------------------
   */

  if (!isShopPhase) {
    return (
      <main
        className={`flex min-h-[100dvh] items-center justify-center px-5 ${pageClass}`}
      >
        <div
          className={`w-full max-w-md rounded-[28px] border p-6 text-center shadow-xl ${cardClass}`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#b69c57]/10 text-2xl">
            🕐
          </div>

          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
            SHOP
          </p>

          <h1 className="mt-2 text-2xl font-black">
            {isVietnamese
              ? "Cửa hàng đang đóng"
              : "Shop is closed"}
          </h1>

          <p
            className={`mx-auto mt-3 max-w-sm text-sm leading-6 ${mutedClass}`}
          >
            {isVietnamese
              ? "Vui lòng quay lại tab trò chơi."
              : "Please return to the game tab."}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/game/${code}`
              )
            }
            className="mt-6 w-full rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-5 py-3 text-xs font-black uppercase tracking-[0.15em] text-[#b69c57] transition active:scale-[0.98]"
          >
            {isVietnamese
              ? "QUAY LẠI TRÒ CHƠI"
              : "BACK TO GAME"}
          </button>
        </div>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * TIMER EXPIRED
   * --------------------------------------------------
   */

  if (shopExpired) {
    return (
      <main
        className={`flex min-h-[100dvh] items-center justify-center px-5 ${pageClass}`}
      >
        <div
          className={`w-full max-w-md rounded-[30px] border p-7 text-center shadow-xl ${cardClass}`}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#b69c57]/10 text-3xl">
            ⏱️
          </div>

          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.28em] text-[#b69c57]">
            SHOP CLOSED
          </p>

          <h1 className="mt-2 text-2xl font-black">
            {isVietnamese
              ? "Hết thời gian mua hàng"
              : "Shopping time is over"}
          </h1>

          <p
            className={`mx-auto mt-3 max-w-sm text-sm leading-6 ${mutedClass}`}
          >
            {isVietnamese
              ? "Vui lòng quay lại tab trò chơi."
              : "Please return to the game tab."}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/game/${code}`
              )
            }
            className="mt-6 w-full rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#b69c57] transition active:scale-[0.98]"
          >
            {isVietnamese
              ? "QUAY LẠI TAB TRÒ CHƠI"
              : "RETURN TO GAME"}
          </button>
        </div>
      </main>
    );
  }

  /*
   * --------------------------------------------------
   * SHOP OPEN
   * --------------------------------------------------
   */

  return (
    <main
      className={`min-h-[100dvh] px-4 py-5 sm:px-6 sm:py-8 ${pageClass}`}
    >
      <div className="mx-auto w-full max-w-3xl">

        {/* HEADER */}

        <header className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/game/${code}`
              )
            }
            className={`flex h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black uppercase tracking-[0.12em] transition active:scale-[0.98] ${cardClass}`}
          >
            <span className="text-base">
              ←
            </span>

            <span>
              {isVietnamese
                ? "TRÒ CHƠI"
                : "GAME"}
            </span>
          </button>

          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#b69c57]">
              ROUND
            </p>

            <p className="text-lg font-black">
              {String(
                currentRound
              ).padStart(2, "0")}
            </p>
          </div>
        </header>

        {/* TIMER */}

        <section
          className={`mt-5 overflow-hidden rounded-[26px] border ${cardClass}`}
        >
          <div className="px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#b69c57]">
                  {isVietnamese
                    ? "THỜI GIAN CÒN LẠI"
                    : "TIME REMAINING"}
                </p>

                <p className="mt-1 text-3xl font-black tabular-nums tracking-tight">
                  {timerText}
                </p>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#b69c57]/10 text-xl">
                ⏱️
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-current/10">
              <div
                className="h-full rounded-full bg-[#b69c57] transition-[width] duration-200"
                style={{
                  width: `${timerPercent}%`,
                }}
              />
            </div>

            <p
              className={`mt-3 text-[10px] leading-5 ${mutedClass}`}
            >
              {isVietnamese
                ? "Thời gian được tính từ timestamp phía server."
                : "Time is calculated from the server timestamp."}
            </p>
          </div>
        </section>

        {/* SHOP HERO */}

        <section
          className={`mt-4 overflow-hidden rounded-[30px] border ${cardClass}`}
        >
          <div className="px-5 py-8 text-center sm:px-8 sm:py-10">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-[#b69c57]/30 bg-[#b69c57]/10 text-4xl">
              🛒
            </div>

            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-[#b69c57]">
              SHOP PHASE
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              {isVietnamese
                ? "CỬA HÀNG"
                : "SHOP"}
            </h1>

            <p
              className={`mx-auto mt-3 max-w-lg text-sm leading-6 ${mutedClass}`}
            >
              {isVietnamese
                ? "Chọn một danh mục để xem các sản phẩm đang được cung cấp."
                : "Choose a category to view the available products."}
            </p>
          </div>
        </section>

        {/* PLAYER INFO */}

        <section
          className={`mt-4 overflow-hidden rounded-[26px] border ${cardClass}`}
        >
          <div className="grid grid-cols-2 divide-x divide-[#b69c57]/10">
            <div className="px-4 py-4 sm:px-5">
              <p
                className={`text-[9px] font-black uppercase tracking-[0.18em] ${mutedClass}`}
              >
                {isVietnamese
                  ? "NGƯỜI CHƠI"
                  : "PLAYER"}
              </p>

              <p className="mt-1 truncate text-sm font-black">
                {currentPlayer?.playerName ||
                  (isVietnamese
                    ? "Người chơi"
                    : "Player")}
              </p>
            </div>

            <div className="px-4 py-4 sm:px-5">
              <p
                className={`text-[9px] font-black uppercase tracking-[0.18em] ${mutedClass}`}
              >
                {isVietnamese
                  ? "TIỀN HIỆN TẠI"
                  : "CURRENT MONEY"}
              </p>

              <p className="mt-1 text-sm font-black text-[#b69c57]">
                {formatMoney(
                  currentPlayer?.money
                )}
              </p>
            </div>
          </div>
        </section>

        {/* ALL CATEGORIES */}

        <section
          className={`mt-4 overflow-hidden rounded-[26px] border ${cardClass}`}
        >
          <div className="border-b border-[#b69c57]/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#b69c57]">
              {isVietnamese
                ? "DANH MỤC"
                : "CATEGORIES"}
            </p>

            <h2 className="mt-1 text-xl font-black">
              {isVietnamese
                ? "Chọn loại vật phẩm"
                : "Choose a category"}
            </h2>

            <p
              className={`mt-1 text-xs leading-5 ${mutedClass}`}
            >
              {isVietnamese
                ? "Bấm vào một mục để xem các sản phẩm bên trong."
                : "Tap a category to view its products."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {SHOP_CATEGORIES.map(
              (category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    openCategory(
                      category.id
                    )
                  }
                  className={`group rounded-[22px] border p-4 text-left transition active:scale-[0.985] ${cardClass}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#b69c57]/20 bg-[#b69c57]/10 text-2xl transition group-active:scale-95">
                      {category.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-black">
                          {isVietnamese
                            ? category.name
                            : category.nameEn}
                        </h3>

                        <span className="text-lg text-[#b69c57]">
                          →
                        </span>
                      </div>

                      <p
                        className={`mt-1 text-xs leading-5 ${mutedClass}`}
                      >
                        {isVietnamese
                          ? category.description
                          : category.descriptionEn}
                      </p>
                    </div>
                  </div>
                </button>
              )
            )}
          </div>
        </section>

        {/* SHOP RULE */}

        <section
          className={`mt-4 rounded-[26px] border px-5 py-5 ${cardClass}`}
        >
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#b69c57]/10">
              ⓘ
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em]">
                SHOP PHASE
              </p>

              <p
                className={`mt-1 text-xs leading-5 ${mutedClass}`}
              >
                {isVietnamese
                  ? "Cửa hàng xuất hiện sau mỗi 6 lượt. Bạn có 1 phút 25 giây để mua hàng."
                  : "The shop appears after every 6 completed rounds. You have 1 minute 25 seconds to shop."}
              </p>
            </div>
          </div>
        </section>

        {/* BACK BUTTON */}

        <button
          type="button"
          onClick={() =>
            router.push(
              `/game/${code}`
            )
          }
          className="mt-5 w-full rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#b69c57] transition active:scale-[0.98]"
        >
          {isVietnamese
            ? "QUAY LẠI TAB TRÒ CHƠI"
            : "RETURN TO GAME"}
        </button>

        <p
          className={`pb-6 pt-4 text-center text-[10px] leading-5 ${mutedClass}`}
        >
          © 2026 Khoa Hoàng · Đường Biên Đêm
        </p>
      </div>

      {/* ==================================================
          CATEGORY POPUP
          ================================================== */}

      {selectedCategory &&
        selectedCategoryData && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-[2px] sm:items-center sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label={
              isVietnamese
                ? selectedCategoryData.name
                : selectedCategoryData.nameEn
            }
          >
            <div
              className={`relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border shadow-2xl ${cardClass}`}
            >
              <div className="flex shrink-0 items-center gap-3 border-b border-[#b69c57]/10 px-5 py-4 sm:px-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#b69c57]/10 text-xl">
                  {selectedCategoryData.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#b69c57]">
                    {isVietnamese
                      ? "DANH MỤC"
                      : "CATEGORY"}
                  </p>

                  <h2 className="mt-0.5 truncate text-xl font-black">
                    {isVietnamese
                      ? selectedCategoryData.name
                      : selectedCategoryData.nameEn}
                  </h2>
                </div>

                <button
                  type="button"
                  aria-label={
                    isVietnamese
                      ? "Đóng danh mục"
                      : "Close category"
                  }
                  onClick={
                    closeCategory
                  }
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xl font-black transition active:scale-95 ${cardClass}`}
                >
                  ×
                </button>
              </div>

              <div
                className={`shrink-0 px-5 pt-4 text-xs leading-5 ${mutedClass}`}
              >
                {isVietnamese
                  ? selectedCategoryData.description
                  : selectedCategoryData.descriptionEn}
              </div>

              <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
                <ShopItemGrid
                  category={
                    selectedCategory
                  }
                  money={toNumber(
                    currentPlayer?.money
                  )}
                  isVietnamese={
                    isVietnamese
                  }
                  isDark={isDark}
                  stock={shopStock}
                  onBuy={handleBuy}
                />
              </div>
            </div>
          </div>
        )}

      {/* ==================================================
          PURCHASE CONFIRMATION
          ================================================== */}

      {selectedItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-5 backdrop-blur-[3px]"
          role="dialog"
          aria-modal="true"
          aria-label={
            isVietnamese
              ? "Xác nhận mua hàng"
              : "Confirm purchase"
          }
        >
          <div
            className={`w-full max-w-md rounded-[30px] border p-6 shadow-2xl ${cardClass}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-[#b69c57]/20 bg-[#b69c57]/10 text-3xl">
                {selectedItem.icon}
              </div>

              {!buying && (
                <button
                  type="button"
                  aria-label={
                    isVietnamese
                      ? "Hủy"
                      : "Cancel"
                  }
                  onClick={
                    handleCancelPurchase
                  }
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xl font-black transition active:scale-95 ${cardClass}`}
                >
                  ×
                </button>
              )}
            </div>

            {!buySuccess ? (
              <>
                <p className="mt-6 text-[9px] font-black uppercase tracking-[0.22em] text-[#b69c57]">
                  {isVietnamese
                    ? "XÁC NHẬN"
                    : "CONFIRM"}
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  {isVietnamese
                    ? selectedItem.name
                    : selectedItem.nameEn}
                </h2>

                <p
                  className={`mt-3 text-sm leading-6 ${mutedClass}`}
                >
                  {isVietnamese
                    ? selectedItem.description
                    : selectedItem.descriptionEn}
                </p>

                <div
                  className={`mt-5 rounded-2xl border px-4 py-4 ${cardClass}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.16em] ${mutedClass}`}
                    >
                      {isVietnamese
                        ? "GIÁ"
                        : "PRICE"}
                    </span>

                    <span className="text-lg font-black text-[#b69c57]">
                      {formatMoney(
                        selectedItem.price
                      )}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.16em] ${mutedClass}`}
                    >
                      {isVietnamese
                        ? "TIỀN CỦA BẠN"
                        : "YOUR MONEY"}
                    </span>

                    <span className="text-sm font-black">
                      {formatMoney(
                        currentPlayer?.money
                      )}
                    </span>
                  </div>
                </div>

                {buyError && (
                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                    <p className="text-xs font-bold leading-5 text-red-400">
                      {buyError}
                    </p>
                  </div>
                )}

                <p
                  className={`mt-4 text-center text-xs leading-5 ${mutedClass}`}
                >
                  {isVietnamese
                    ? "Bạn chắc chắn muốn mua vật phẩm này?"
                    : "Are you sure you want to buy this item?"}
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={buying}
                    onClick={
                      handleCancelPurchase
                    }
                    className={`rounded-2xl border px-4 py-4 text-xs font-black uppercase tracking-[0.14em] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${cardClass}`}
                  >
                    {isVietnamese
                      ? "HỦY"
                      : "CANCEL"}
                  </button>

                  <button
                    type="button"
                    disabled={buying}
                    onClick={
                      handleConfirmPurchase
                    }
                    className="rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-[#b69c57] transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
                  >
                    {buying
                      ? isVietnamese
                        ? "ĐANG MUA..."
                        : "PURCHASING..."
                      : isVietnamese
                        ? "MUA"
                        : "BUY"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 text-3xl">
                  ✓
                </div>

                <p className="mt-5 text-[9px] font-black uppercase tracking-[0.22em] text-green-500">
                  {isVietnamese
                    ? "MUA THÀNH CÔNG"
                    : "PURCHASE SUCCESSFUL"}
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  {isVietnamese
                    ? "Đã mua vật phẩm"
                    : "Item purchased"}
                </h2>

                <p
                  className={`mt-3 text-sm leading-6 ${mutedClass}`}
                >
                  {buySuccessMessage}
                </p>

                <div
                  className={`mt-5 rounded-2xl border px-4 py-4 ${cardClass}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.16em] ${mutedClass}`}
                    >
                      {isVietnamese
                        ? "VẬT PHẨM"
                        : "ITEM"}
                    </span>

                    <span className="text-right text-sm font-black">
                      {isVietnamese
                        ? selectedItem.name
                        : selectedItem.nameEn}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.16em] ${mutedClass}`}
                    >
                      {isVietnamese
                        ? "GIÁ"
                        : "PRICE"}
                    </span>

                    <span className="text-sm font-black text-[#b69c57]">
                      {formatMoney(
                        selectedItem.price
                      )}
                    </span>
                  </div>

                
                </div>

                <p
                  className={`mt-4 text-center text-xs leading-5 ${mutedClass}`}
                >
                  {isVietnamese
                    ? "Tiền đã được trừ và số lượng vật phẩm trong Shop đã được cập nhật."
                    : "Your money has been deducted and the shop stock has been updated."}
                </p>

                <button
                  type="button"
                  onClick={
                    handleCancelPurchase
                  }
                  className="mt-5 w-full rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-[#b69c57] transition active:scale-[0.98]"
                >
                  {isVietnamese
                    ? "ĐÓNG"
                    : "CLOSE"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}