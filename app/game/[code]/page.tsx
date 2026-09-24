"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";

import { useLanguage } from "../../components/LanguageProvider";
import { useTheme } from "../../components/ThemeProvider";
import { supabase } from "../../../lib/supabase";

import EndGameOverlay, {
  triggerEndGame,
  type EndGameDetail,
} from "../../components/EndGameOverlay";
import RoomChat from "../../components/game/RoomChat";

type Choice = {
  id: string;
  text?: string;
  label?: string;
  description?: string;
  [key: string]: unknown;
};

type EventData = {
  id: string;
  round: number;
  title: string;
  description: string;
  event_type: string;
  choices: Choice[];
};

type RoomPlayer = {
  id: string;
  player_name: string;
  role: string;
  hp?: number;
  money?: number | string;
  location?: string;
  is_connected: boolean;
};

type CurrentPlayer = {
  id: string;
  playerName: string;
  hp: number;
  money: number | string;
  location: string;
  role: string;
  isConnected: boolean;
  lastChoice: string | null;
};

type GameData = {
  success: boolean;

  room: {
    id: string;
    code: string;
    hostName: string;
    maxPlayers: number;
    status: string;
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
  };

  currentPlayer: CurrentPlayer | null;

  event: EventData | null;

  choiceStatus: {
    selected: boolean;
    selectedChoiceId: string | null;
    chosenPlayers: number;
    totalPlayers: number;
    allPlayersChosen: boolean;
  };

  players?: RoomPlayer[];
};

type ApiError = {
  error?: string;
};


type InventoryItem = {
  id?: string;
  item_id?: string;

  quantity: number;

  acquired_at?: string;
  updated_at?: string;

  item?: {
    id?: string;
    category?: string;
    name?: string;
    name_en?: string;
    description?: string;
    description_en?: string;
    price?: number | string;
    icon?: string;
    stackable?: boolean;
  };

  item_id_data?: {
    id?: string;
    category?: string;
    name?: string;
    name_en?: string;
    description?: string;
    description_en?: string;
    price?: number | string;
    icon?: string;
    stackable?: boolean;
  };

  [key: string]: unknown;
};

type InventoryResponse = {
  success: boolean;

  player?: {
    id: string;
    name: string;
    role: string;
  };

  inventory: InventoryItem[];
};

type SideQuestChoice = {
  id: string;
  text?: string;
  text_en?: string;
};

type SideQuestResult = {
  money?: number;
  hp?: number;
  location?: string;
  item_id?: string;
  item_quantity?: number;
  message?: string;
  message_en?: string;
};

type SideQuest = {
  id: string;
  room_id: string;
  player_id: string;
  item_id: string;

  title: string;
  title_en?: string;

  description: string;
  description_en?: string;

  choices: SideQuestChoice[];

  status:
    | "choosing"
    | "resolving"
    | "resolved"
    | "cancelled";

  selected_choice?: string | null;

  result?: SideQuestResult | null;

  created_at?: string;
  resolved_at?: string | null;
};

function formatMoney(value: number | string | undefined) {
  const number =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(number)) {
    return "0đ";
  }

  return `${new Intl.NumberFormat("vi-VN").format(number)}đ`;
}

function getChoiceText(choice: Choice) {
  return (
    choice.text ||
    choice.label ||
    choice.description ||
    choice.id
  );
}

function getChoiceLetter(index: number) {
  return String.fromCharCode(65 + index);
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

function getEndGamePlayers(
  players: RoomPlayer[],
  currentPlayer: CurrentPlayer | null,
  currentRounds: number,
  forcedMoney?: number | string
) {
  return players
    .filter(
      (player) =>
        player.role !== "spectator"
    )
    .map((player) => {
      const isCurrent =
        currentPlayer &&
        player.id === currentPlayer.id;

      return {
        playerName:
          player.player_name,

        money:
          isCurrent &&
          forcedMoney !== undefined
            ? forcedMoney
            : player.money ?? 0,

        hp:
          isCurrent &&
          currentPlayer
            ? currentPlayer.hp
            : player.hp ?? 0,

        location:
          isCurrent &&
          currentPlayer
            ? currentPlayer.location
            : player.location ??
              "Việt Nam",

        rounds:
          currentRounds,
      };
    });
}

function getInventoryItemData(
  item: InventoryItem
) {
  return (
    item.item ||
    item.item_id_data ||
    {}
  );
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();

  const code = String(params.code);

  const { language } = useLanguage();
  const { theme } = useTheme();

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

  const [submitting, setSubmitting] =
    useState(false);

  const [localChoice, setLocalChoice] =
    useState<string | null>(null);

  const [connectionLost, setConnectionLost] =
    useState(false);

  const [playersOpen, setPlayersOpen] =
    useState(false);

  /*
   * ---
   * INVENTORY
   * ---
   */

  const [inventoryOpen, setInventoryOpen] =
    useState(false);

  const [inventory, setInventory] =
    useState<InventoryItem[]>([]);

  const [inventoryLoading, setInventoryLoading] =
    useState(false);

  const [inventoryError, setInventoryError] =
    useState("");

  const [usingItemId, setUsingItemId] =
    useState<string | null>(null);

  /*
   * ---
   * ITEM TARGET
   * ---
   */

  const [itemTargetOpen, setItemTargetOpen] =
    useState(false);

  const [selectedItemId, setSelectedItemId] =
    useState<string | null>(null);

  const [selectedItemName, setSelectedItemName] =
    useState("");

  const [selectedTargetPlayerId, setSelectedTargetPlayerId] =
    useState<string | null>(null);

  const [itemActionLoading, setItemActionLoading] =
    useState(false);

  /*
   * ---
   * TEAM CHAT
   * ---
   */

  const [chatOpen, setChatOpen] =
    useState(true);

  /*
   * ---
   * SIDE QUEST
   * ---
   */

  const [sideQuestOpen, setSideQuestOpen] =
    useState(false);

  const [sideQuest, setSideQuest] =
    useState<SideQuest | null>(null);

  const [sideQuestLoading, setSideQuestLoading] =
    useState(false);

  const [sideQuestError, setSideQuestError] =
    useState("");

  const [sideQuestResult, setSideQuestResult] =
    useState<SideQuestResult | null>(null);

  const [sideQuestChoice, setSideQuestChoice] =
    useState<string | null>(null);

  /*
   * ---
   * DEVELOPER NOTIFICATION
   * ---
   */

  const [
    developerNotification,
    setDeveloperNotification,
  ] = useState<string | null>(null);

  const [
    developerNotificationVisible,
    setDeveloperNotificationVisible,
  ] = useState(false);

  const developerNotificationTimeoutRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const developerNotificationHideRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  /*
   * ---
   * REQUEST CONTROL
   * ---
   */

  const requestIdRef =
    useRef(0);

  const submittingRef =
    useRef(false);

  /*
   * ---
   * END GAME
   * ---
   */

  const endGameTriggeredRef =
    useRef(false);

  const endGamePayloadRef =
    useRef<string | null>(null);

  const [
    developerWinOverlay,
    setDeveloperWinOverlay,
  ] = useState<EndGameDetail | null>(
    null
  );

  const devEndGameTestRef =
    useRef(false);

  /*
   * ---
   * PLAYER TOKEN
   * ---
   */

  const getPlayerToken =
    useCallback(() => {
      if (
        typeof window ===
        "undefined"
      ) {
        return null;
      }

      return (
        sessionStorage.getItem(
          "player_token"
        ) ||
        localStorage.getItem(
          "player_token"
        )
      );
    }, []);

  /*
   * ---
   * END GAME TRIGGER
   * ---
   */

  const triggerGameEnd =
    useCallback(
      (detail: EndGameDetail) => {
        if (
          endGameTriggeredRef.current
        ) {
          return;
        }

        endGameTriggeredRef.current =
          true;

        triggerEndGame(detail);
      },
      []
    );

  /*
   * ---
   * INVENTORY LOAD
   * ---
   */

  const loadInventory =
    useCallback(
      async (silent = false) => {
        const token =
          getPlayerToken();

        if (!token) {
          if (!silent) {
            setInventoryError(
              isVietnamese
                ? "Không tìm thấy phiên người chơi."
                : "Player session not found."
            );
          }

          return;
        }

        if (!silent) {
          setInventoryLoading(true);
        }

        try {
          const response =
            await fetch(
              `/api/rooms/${code}/inventory`,
              {
                method: "GET",
                cache: "no-store",
                headers: {
                  "x-player-token":
                    token,
                },
              }
            );

          let data:
            | InventoryResponse
            | ApiError = {};

          try {
            data =
              (await response.json()) as
                | InventoryResponse
                | ApiError;
          } catch {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              "error" in data &&
              typeof data.error ===
                "string"
                ? data.error
                : isVietnamese
                  ? "Không thể tải túi đồ."
                  : "Unable to load inventory."
            );
          }

          const inventoryData =
            data as InventoryResponse;

          setInventory(
            Array.isArray(
              inventoryData.inventory
            )
              ? inventoryData.inventory
              : []
          );

          setInventoryError("");
        } catch (err) {
          console.error(
            "INVENTORY LOAD ERROR:",
            err
          );

          if (!silent) {
            setInventoryError(
              err instanceof Error
                ? err.message
                : isVietnamese
                  ? "Không thể tải túi đồ."
                  : "Unable to load inventory."
            );
          }
        } finally {
          if (!silent) {
            setInventoryLoading(false);
          }
        }
      },
      [
        code,
        getPlayerToken,
        isVietnamese,
      ]
    );

  /*
   * ---
   * OPEN INVENTORY
   * ---
   */

  const openInventory =
    useCallback(() => {
      setInventoryOpen(true);

      void loadInventory(false);
    }, [loadInventory]);

  /*
   * ---
   * SIDE QUEST LOAD
   * ---
   */

  const loadActiveSideQuest =
    useCallback(
      async (silent = false) => {
        const token =
          getPlayerToken();

        if (!token) {
          return;
        }

        try {
          const response =
            await fetch(
              `/api/rooms/${code}/side-quests/active`,
              {
                method: "GET",
                cache: "no-store",
                headers: {
                  "x-player-token":
                    token,
                },
              }
            );

          if (!response.ok) {
            return;
          }

          const data =
            (await response.json()) as {
              sideQuest?: SideQuest | null;
            };

          if (data.sideQuest) {
            setSideQuest(
              data.sideQuest
            );

            if (
              data.sideQuest.status ===
                "choosing" ||
              data.sideQuest.status ===
                "resolving"
            ) {
              if (!silent) {
                setSideQuestOpen(
                  true
                );
              }
            }
          }
        } catch (err) {
          console.error(
            "[SIDE QUEST] LOAD ERROR:",
            err
          );
        }
      },
      [
        code,
        getPlayerToken,
      ]
    );

  /*
   * ---
   * ITEM TARGET / ITEM ENGINE
   * ---
   */

  const useItem =
    useCallback(
      async (itemId: string) => {
        if (usingItemId || itemActionLoading) {
          return;
        }

        const inventoryEntry =
          inventory.find(
            (entry) =>
              String(
                entry.item_id ??
                  entry.id ??
                  ""
              ) === itemId
          );

        const item =
          inventoryEntry
            ? getInventoryItemData(
                inventoryEntry
              )
            : {};

        setSelectedItemId(itemId);
        setSelectedItemName(
          isVietnamese
            ? String(
                item.name ??
                  item.name_en ??
                  "Vật phẩm"
              )
            : String(
                item.name_en ??
                  item.name ??
                  "Item"
              )
        );
        setSelectedTargetPlayerId(null);
        setItemTargetOpen(true);
      },
      [
        inventory,
        isVietnamese,
        itemActionLoading,
        usingItemId,
      ]
    );

  const executeItemUse =
    useCallback(
      async (
        target: "self" | "player" | "sidequest",
        targetPlayerId?: string | null
      ) => {
        const token = getPlayerToken();

        if (!token || !selectedItemId) {
          setInventoryError(
            isVietnamese
              ? "Không tìm thấy phiên hoặc vật phẩm."
              : "Player session or item not found."
          );
          return;
        }

        if (
          target === "player" &&
          !(targetPlayerId ?? selectedTargetPlayerId)
        ) {
          setInventoryError(
            isVietnamese
              ? "Hãy chọn người chơi mục tiêu."
              : "Choose a target player first."
          );
          return;
        }

        setItemActionLoading(true);
        setUsingItemId(selectedItemId);
        setInventoryError("");

        try {
          const endpoint =
            target === "sidequest"
              ? `/api/rooms/${code}/side-quests/use`
              : `/api/rooms/${code}/items/use`;

          const body =
            target === "sidequest"
              ? { itemId: selectedItemId }
              : {
                  itemId: selectedItemId,
                  target,
                  targetPlayerId:
                    targetPlayerId ??
                    selectedTargetPlayerId,
                };

          const response =
            await fetch(endpoint, {
              method: "POST",
              cache: "no-store",
              headers: {
                "Content-Type":
                  "application/json",
                "x-player-token":
                  token,
              },
              body: JSON.stringify(body),
            });

          const data =
            (await response
              .json()
              .catch(() => null)) as
              | {
                  result?: {
                    success?: boolean;
                    message?: string;
                    sidequestId?: string;
                  };
                  sideQuest?: SideQuest;
                  error?: string;
                }
              | null;

          if (!response.ok) {
            throw new Error(
              data?.error ||
                data?.result?.message ||
                (isVietnamese
                  ? "Không thể sử dụng vật phẩm."
                  : "Unable to use item.")
            );
          }

          if (data?.result?.success === false) {
            throw new Error(
              data.result.message ||
                (isVietnamese
                  ? "Không thể sử dụng vật phẩm."
                  : "Unable to use item.")
            );
          }

          setInventoryOpen(false);
          setItemTargetOpen(false);
          setSelectedItemId(null);
          setSelectedTargetPlayerId(null);

          if (target === "sidequest") {
            setSideQuestError("");

            if (data?.sideQuest) {
              setSideQuest(data.sideQuest);
            } else {
              await loadActiveSideQuest(false);
            }

            setSideQuestOpen(true);
          }

          await loadInventory(true);
          window.setTimeout(() => {
            void loadGame(true);
          }, 0);
        } catch (err) {
          console.error(
            "[ITEM] USE ERROR:",
            err
          );

          setInventoryError(
            err instanceof Error
              ? err.message
              : isVietnamese
                ? "Không thể sử dụng vật phẩm."
                : "Unable to use item."
          );
        } finally {
          setItemActionLoading(false);
          setUsingItemId(null);
        }
      },
      [
        code,
        getPlayerToken,
        isVietnamese,
        loadActiveSideQuest,
        loadInventory,
        selectedItemId,
        selectedTargetPlayerId,
      ]
    );

  const selectedItemCanSideQuest =
    selectedItemId
      ? [
          "first_aid_kit",
          "old_map",
          "old_key",
          "old_radio",
          "old_envelope",
        ].includes(selectedItemId)
      : false;

  /*
   * ---
   * CHOOSE SIDE QUEST
   * ---
   */

  const chooseSideQuest =
    useCallback(
      async (choiceId: string) => {
        if (
          !sideQuest ||
          sideQuestLoading ||
          sideQuest.status !==
            "choosing"
        ) {
          return;
        }

        const token =
          getPlayerToken();

        if (!token) {
          setSideQuestError(
            isVietnamese
              ? "Không tìm thấy phiên người chơi."
              : "Player session not found."
          );

          return;
        }

        setSideQuestChoice(
          choiceId
        );

        setSideQuestLoading(
          true
        );

        setSideQuestError(
          ""
        );

        try {
          const response =
            await fetch(
              `/api/rooms/${code}/side-quests/choose`,
              {
                method: "POST",
                cache: "no-store",
                headers: {
                  "Content-Type":
                    "application/json",
                  "x-player-token":
                    token,
                },
                body: JSON.stringify({
                  questId:
                    sideQuest.id,
                  choiceId,
                }),
              }
            );

          let data:
            | {
                ok?: boolean;
                sideQuest?: SideQuest;
                result?: SideQuestResult;
                player?: CurrentPlayer;
                inventory?: InventoryItem[];
                error?: string;
              }
            | ApiError = {};

          try {
            data =
              await response.json();
          } catch {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              "error" in data &&
              typeof data.error ===
                "string"
                ? data.error
                : isVietnamese
                  ? "Không thể xử lý Side Quest."
                  : "Unable to resolve side quest."
            );
          }

          const resultData =
            data as {
              sideQuest?: SideQuest;
              result?: SideQuestResult;
              player?: CurrentPlayer;
              inventory?: InventoryItem[];
            };

          if (
            resultData.sideQuest
          ) {
            setSideQuest(
              resultData.sideQuest
            );
          }

          if (
            resultData.result
          ) {
            setSideQuestResult(
              resultData.result
            );
          }

          if (
            Array.isArray(
              resultData.inventory
            )
          ) {
            setInventory(
              resultData.inventory
            );
          } else {
            void loadInventory(
              true
            );
          }

          /*
           * Đồng bộ money / HP / location
           * ngay sau Side Quest.
           */
          if (
            resultData.player
          ) {
            setGame(
              (previous) => {
                if (
                  !previous
                ) {
                  return previous;
                }

                return {
                  ...previous,

                  currentPlayer: {
                    ...previous.currentPlayer!,
                    hp:
                      toNumber(
                        resultData
                          .player
                          ?.hp,
                        previous
                          .currentPlayer
                          ?.hp ?? 0
                      ),
                    money:
                      resultData
                        .player
                        ?.money ??
                      previous
                        .currentPlayer
                        ?.money ??
                      0,
                    location:
                      resultData
                        .player
                        ?.location ??
                      previous
                        .currentPlayer
                        ?.location ??
                      "Việt Nam",
                  },
                };
              }
            );
          }

          /*
           * Giữ kết quả mở ra để người chơi
           * đọc xong mới đóng.
           */
          await loadInventory(
            true
          );
        } catch (err) {
          console.error(
            "[SIDE QUEST] CHOOSE ERROR:",
            err
          );

          setSideQuestChoice(
            null
          );

          setSideQuestError(
            err instanceof Error
              ? err.message
              : isVietnamese
                ? "Không thể xử lý Side Quest."
                : "Unable to resolve side quest."
          );
        } finally {
          setSideQuestLoading(
            false
          );
        }
      },
      [
        code,
        getPlayerToken,
        isVietnamese,
        loadInventory,
        sideQuest,
        sideQuestLoading,
      ]
    );

  /*
   * ---
   * CLOSE SIDE QUEST
   * ---
   */

  const closeSideQuest =
    useCallback(() => {
      setSideQuestOpen(
        false
      );

      setSideQuestError(
        ""
      );

      /*
       * Reload inventory để số lượng
       * item luôn chính xác sau resolve.
       */
      void loadInventory(
        true
      );

      /*
       * Reload game để đồng bộ
       * money / HP / location.
       */
      void loadGame(true);
    }, [loadInventory]);

  /*
   * ---
   * QUEST BUTTON
   * ---
   */

  const openQuest =
    useCallback(async () => {
      setSideQuestError("");

      /*
       * Nếu đã có quest trong state,
       * mở ngay.
       */
      if (sideQuest) {
        setSideQuestOpen(
          true
        );

        return;
      }

      /*
       * Nếu chưa có thì thử lấy quest
       * đang active từ server.
       */
      await loadActiveSideQuest(
        false
      );

      setSideQuestOpen(
        true
      );
    }, [
      loadActiveSideQuest,
      sideQuest,
    ]);

  /*
   * ---
   * SHOP OPEN
   * ---
   */

  const openShop =
    useCallback(
      async () => {
        const token =
          getPlayerToken();

        if (!token) {
          setError(
            isVietnamese
              ? "Không tìm thấy phiên người chơi."
              : "Player session not found."
          );

          return;
        }

        try {
          const response =
            await fetch(
              `/api/rooms/${code}/shop/session`,
              {
                method: "POST",
                cache: "no-store",
                headers: {
                  "x-player-token":
                    token,
                },
              }
            );

          let data:
            | Record<string, unknown>
            | ApiError = {};

          try {
            data =
              await response.json();
          } catch {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              "error" in data &&
              typeof data.error ===
                "string"
                ? data.error
                : isVietnamese
                  ? "Không thể mở Shop."
                  : "Unable to open shop."
            );
          }

          router.push(
            `/shop/${code}`
          );
        } catch (err) {
          console.error(
            "[SHOP] OPEN ERROR:",
            err
          );

          setError(
            err instanceof Error
              ? err.message
              : isVietnamese
                ? "Không thể mở Shop."
                : "Unable to open shop."
          );
        }
      },
      [
        code,
        getPlayerToken,
        isVietnamese,
        router,
      ]
    );

  /*
   * ---
   * LOAD GAME
   * ---
   */

  const loadGame = useCallback(
    async (silent = false) => {
      const requestId =
        ++requestIdRef.current;

      try {
        const token =
          getPlayerToken();

        if (!token) {
          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          setError(
            isVietnamese
              ? "Không tìm thấy phiên người chơi."
              : "Player session not found."
          );

          setLoading(false);

          return;
        }

        const response =
          await fetch(
            `/api/rooms/${code}/game-state`,
            {
              method: "GET",

              headers: {
                "x-player-token":
                  token,
              },

              cache: "no-store",
            }
          );

        let data:
          | GameData
          | ApiError;

        try {
          data =
            (await response.json()) as
              | GameData
              | ApiError;
        } catch {
          throw new Error(
            isVietnamese
              ? "Server trả về dữ liệu không hợp lệ."
              : "Server returned invalid data."
          );
        }

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            data &&
            "error" in data &&
            data.error
              ? data.error
              : isVietnamese
                ? "Không thể tải trạng thái game."
                : "Unable to load game state."
          );
        }

        const gameData =
          data as GameData;

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        setGame(gameData);

        setError("");

        setConnectionLost(false);

        /*
         * ----------------------------------------------
         * SERVER FORCE END
         * ----------------------------------------------
         */

        if (
          gameData.room?.endGame
        ) {
          const rawPayload =
            gameData.room
              .endGamePayload ?? {};

          const payloadString =
            JSON.stringify(
              rawPayload
            );

          if (
            endGamePayloadRef.current !==
            payloadString
          ) {
            endGamePayloadRef.current =
              payloadString;

            const currentPlayer =
              gameData.currentPlayer;

            const rounds =
              toNumber(
                gameData.session?.round,
                0
              );

            const players =
              gameData.players ?? [];

            let playerPayload:
              Record<
                string,
                unknown
              > | null = null;

            if (
              Array.isArray(
                rawPayload.players
              )
            ) {
              playerPayload =
                (
                  rawPayload.players as Array<
                    Record<
                      string,
                      unknown
                    >
                  >
                ).find(
                  (player) =>
                    String(
                      player.id ??
                        player.playerId ??
                        ""
                    ) ===
                    String(
                      currentPlayer?.id ??
                        ""
                    )
                ) ?? null;
            }

            const rawMoney =
              playerPayload?.money ??
              currentPlayer?.money ??
              0;

            const money =
              typeof rawMoney ===
                "number" ||
              typeof rawMoney ===
                "string"
                ? rawMoney
                : 0;

            const hp =
              toNumber(
                playerPayload?.hp ??
                  currentPlayer?.hp ??
                  100,
                100
              );

            const location =
              String(
                playerPayload?.location ??
                  currentPlayer?.location ??
                  "Việt Nam"
              );

            const playerName =
              String(
                playerPayload?.playerName ??
                  playerPayload?.player_name ??
                  currentPlayer?.playerName ??
                  "Người chơi"
              );

            triggerGameEnd({
              forced: true,

              reason:
                String(
                  rawPayload.reason ??
                    "server_force_end"
                ),

              message:
                String(
                  rawPayload.message ??
                    (isVietnamese
                      ? "Trận đấu đã được kết thúc bởi Developer."
                      : "The game was ended by the Developer.")
                ),

              playerName,

              money,

              hp,

              location,

              rounds,

              players:
                getEndGamePlayers(
                  players,
                  currentPlayer,
                  rounds
                ),
            });
          }
        }

        /*
         * ----------------------------------------------
         * NORMAL VICTORY
         * ----------------------------------------------
         */

        if (
          !endGameTriggeredRef.current &&
          gameData.currentPlayer &&
          !gameData.room.endGame
        ) {
          const currentMoney =
            Number(
              gameData.currentPlayer
                .money
            );

          const goalMoney =
            Number(
              gameData.room.goalMoney
            );

          if (
            Number.isFinite(
              currentMoney
            ) &&
            Number.isFinite(
              goalMoney
            ) &&
            goalMoney > 0 &&
            currentMoney >=
              goalMoney
          ) {
            const currentPlayer =
              gameData.currentPlayer;

            const rounds =
              toNumber(
                gameData.session?.round,
                0
              );

            const players =
              gameData.players ?? [];

            triggerGameEnd({
              forced: false,

              reason:
                "goal_reached",

              message:
                isVietnamese
                  ? `Bạn đã đạt mục tiêu ${formatMoney(
                      goalMoney
                    )} và hoàn thành hành trình!`
                  : `You reached the ${formatMoney(
                      goalMoney
                    )} goal and completed the journey!`,

              playerName:
                currentPlayer.playerName,

              money:
                currentPlayer.money,

              hp: toNumber(
                currentPlayer.hp,
                100
              ),

              location:
                currentPlayer.location,

              rounds,

              players:
                getEndGamePlayers(
                  players,
                  currentPlayer,
                  rounds
                ),
            });
          }
        }

        /*
         * ----------------------------------------------
         * CHOICE STATE
         * ----------------------------------------------
         */

        if (
          gameData.choiceStatus
            ?.selected
        ) {
          setLocalChoice(
            gameData.choiceStatus
              .selectedChoiceId
          );
        } else if (
          !submittingRef.current &&
          gameData.session?.phase !==
            "shop"
        ) {
          setLocalChoice(null);
        }
      } catch (err) {
        console.error(
          "GAME PAGE LOAD ERROR:",
          err
        );

        if (
          requestId !==
          requestIdRef.current
        ) {
          return;
        }

        setConnectionLost(true);

        if (!silent) {
          setError(
            err instanceof Error
              ? err.message
              : isVietnamese
                ? "Không thể tải trạng thái game."
                : "Unable to load game state."
          );
        }
      } finally {
        if (
          requestId ===
          requestIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [
      code,
      getPlayerToken,
      isVietnamese,
      triggerGameEnd,
    ]
  );

  /*
   * ---
   * INITIAL LOAD
   * ---
   */

  useEffect(() => {
    void loadGame(false);
  }, [loadGame]);

  /*
   * ---
   * INITIAL SIDE QUEST CHECK
   * ---
   */

  useEffect(() => {
    void loadActiveSideQuest(
      true
    );
  }, [
    loadActiveSideQuest,
  ]);

  /*
   * ---
   * DEVELOPER TEST
   * ---
   */

  const runDeveloperEndGameTest =
    useCallback(() => {
      if (
        typeof window ===
        "undefined"
      ) {
        return;
      }

      if (
        devEndGameTestRef.current
      ) {
        return;
      }

      if (
        loading ||
        !game ||
        !game.currentPlayer
      ) {
        return;
      }

      const mode =
        new URLSearchParams(
          window.location.search
        ).get("devEndGame");

      if (
        mode !== "win" &&
        mode !== "force"
      ) {
        return;
      }

      devEndGameTestRef.current =
        true;

      const currentPlayer =
        game.currentPlayer;

      const rounds =
        Number.isFinite(
          Number(
            game.session?.round
          )
        )
          ? Number(
              game.session.round
            )
          : 0;

      const hp =
        Number.isFinite(
          Number(
            currentPlayer.hp
          )
        )
          ? Number(
              currentPlayer.hp
            )
          : 100;

      const players =
        game.players ?? [];

      if (mode === "win") {
        const winMoney =
          400_000_000;

        setDeveloperWinOverlay({
          forced: false,

          reason:
            "developer_ui_test_win",

          message:
            isVietnamese
              ? "Bạn đã đạt mục tiêu tài sản và hoàn thành hành trình."
              : "You reached the target wealth and completed the journey.",

          playerName:
            currentPlayer.playerName,

          money: winMoney,

          hp,

          location:
            currentPlayer.location,

          rounds,

          players:
            getEndGamePlayers(
              players,
              currentPlayer,
              rounds,
              winMoney
            ),
        });

        return;
      }

      triggerGameEnd({
        forced: true,

        reason:
          "developer_ui_test_force",

        message:
          isVietnamese
            ? "Trận đấu đã được kết thúc bởi Developer."
            : "The game has been ended by the Developer.",

        playerName:
          currentPlayer.playerName,

        money:
          currentPlayer.money,

        hp,

        location:
          currentPlayer.location,

        rounds,

        players:
          getEndGamePlayers(
            players,
            currentPlayer,
            rounds
          ),
      });
    }, [
      game,
      isVietnamese,
      loading,
      triggerGameEnd,
    ]);

  useEffect(() => {
    if (
      loading ||
      !game?.currentPlayer
    ) {
      return;
    }

    runDeveloperEndGameTest();
  }, [
    game,
    loading,
    runDeveloperEndGameTest,
  ]);

  /*
   * ---
   * MAIN GAME REALTIME CHANNEL
   * ---
   */

  useEffect(() => {
    const roomId =
      game?.room?.id;

    if (!roomId) {
      return;
    }

    let disposed = false;

    const refresh = () => {
      if (disposed) {
        return;
      }

      if (
        submittingRef.current
      ) {
        return;
      }

      void loadGame(true);
    };

    const channel =
      supabase.channel(
        `game-sync-${roomId}`
      );

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_sessions",
          filter: `room_id=eq.${roomId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_states",
          filter: `room_id=eq.${roomId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        refresh
      )
      .subscribe(
        (status) => {
          if (
            status ===
            "SUBSCRIBED"
          ) {
            setConnectionLost(
              false
            );
          }

          if (
            status ===
              "CHANNEL_ERROR" ||
            status ===
              "TIMED_OUT" ||
            status ===
              "CLOSED"
          ) {
            setConnectionLost(
              true
            );
          }
        }
      );

    const interval =
      window.setInterval(() => {
        if (
          submittingRef.current
        ) {
          return;
        }

        void loadGame(true);
      }, 5000);

    return () => {
      disposed = true;

      window.clearInterval(
        interval
      );

      void supabase.removeChannel(
        channel
      );

    };
  }, [
    game?.room?.id,
    loadGame,
  ]);

  /*
   * ---
   * DEVELOPER NOTIFICATIONS
   * ---
   */

  useEffect(() => {
    const roomId =
      game?.room?.id;

    if (!roomId) {
      return;
    }

    let disposed = false;

    const showNotification = (
      message: string
    ) => {
      if (disposed) {
        return;
      }

      if (
        developerNotificationTimeoutRef.current
      ) {
        clearTimeout(
          developerNotificationTimeoutRef.current
        );
      }

      if (
        developerNotificationHideRef.current
      ) {
        clearTimeout(
          developerNotificationHideRef.current
        );
      }

      setDeveloperNotification(
        message
      );

      setDeveloperNotificationVisible(
        true
      );

      developerNotificationHideRef.current =
        setTimeout(() => {
          if (disposed) {
            return;
          }

          setDeveloperNotificationVisible(
            false
          );
        }, 5000);
    };

    const channel =
      supabase.channel(
        `developer-notifications-${roomId}`
      );

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_notifications",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row =
            payload.new as Record<
              string,
              unknown
            >;

          const type =
            String(
              row.type ?? ""
            );

          const sender =
            String(
              row.sender ?? ""
            );

          if (
            type !==
              "developer" &&
            sender !==
              "developer"
          ) {
            return;
          }

          const message =
            String(
              row.message ??
                row.content ??
                ""
            );

          if (!message) {
            return;
          }

          showNotification(
            message
          );
        }
      )
      .subscribe();

    return () => {
      disposed = true;

      if (
        developerNotificationTimeoutRef.current
      ) {
        clearTimeout(
          developerNotificationTimeoutRef.current
        );
      }

      if (
        developerNotificationHideRef.current
      ) {
        clearTimeout(
          developerNotificationHideRef.current
        );
      }

      void supabase.removeChannel(
        channel
      );
    };
  }, [game?.room?.id]);

  /*
   * ---
   * NOTIFICATION CLEANUP
   * ---
   */

  useEffect(() => {
    return () => {
      if (
        developerNotificationTimeoutRef.current
      ) {
        clearTimeout(
          developerNotificationTimeoutRef.current
        );
      }

      if (
        developerNotificationHideRef.current
      ) {
        clearTimeout(
          developerNotificationHideRef.current
        );
      }
    };
  }, []);

  /*
   * ---
   * CHOOSE MAIN EVENT
   * ---
   */

  async function choose(
    choiceId: string
  ) {
    if (
      submitting ||
      isShopRound ||
      !game?.event ||
      !game?.choiceStatus ||
      game.choiceStatus.selected
    ) {
      return;
    }

    const token =
      getPlayerToken();

    if (!token) {
      setError(
        isVietnamese
          ? "Không tìm thấy phiên người chơi."
          : "Player session not found."
      );

      return;
    }

    const eventId =
      game.event.id;

    submittingRef.current =
      true;

    ++requestIdRef.current;

    setSubmitting(true);
    setLocalChoice(choiceId);
    setError("");

    try {
      const response =
        await fetch(
          `/api/rooms/${code}/choose`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-player-token":
                token,
            },

            body: JSON.stringify({
              event_id: eventId,
              choice_id:
                choiceId,
            }),

            cache: "no-store",
          }
        );

      let data:
        | Record<
            string,
            unknown
          >
        | ApiError = {};

      try {
        data =
          await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          "error" in data &&
          typeof data.error ===
            "string"
            ? data.error
            : isVietnamese
              ? "Không thể gửi lựa chọn."
              : "Unable to submit choice."
        );
      }

      await loadGame(true);
    } catch (err) {
      console.error(
        "CHOOSE ERROR:",
        err
      );

      setLocalChoice(null);

      setError(
        err instanceof Error
          ? err.message
          : isVietnamese
            ? "Không thể gửi lựa chọn."
            : "Unable to submit choice."
      );
    } finally {
      submittingRef.current =
        false;

      setSubmitting(false);

      void loadGame(true);
    }
  }

  /*
   * ---
   * DERIVED STATE
   * ---
   */

  const phase =
    game?.session?.phase ??
    "";

  const currentRound = toNumber(
    game?.session?.round,
    0
  );

  const isShopRound =
    phase === "shop";

  const isChoosing =
    phase === "choosing";

  const isGenerating =
    phase === "generating";

  const isResolving =
    phase === "resolving";

  const isResult =
    phase === "result";

  const isShop =
    phase === "shop";

  const isFinished =
    phase === "finished" ||
    game?.session?.status ===
      "finished";

  const hasSelected =
    Boolean(
      game?.choiceStatus
        ?.selected
    ) || submitting;

  const selectedChoiceId =
    game?.choiceStatus
      ?.selectedChoiceId ??
    localChoice;

  const chosenPlayers =
    toNumber(
      game?.choiceStatus
        ?.chosenPlayers,
      0
    );

  const totalPlayers =
    toNumber(
      game?.choiceStatus
        ?.totalPlayers,
      0
    );

  const progressText =
    `${chosenPlayers}/${totalPlayers}`;

  const currentPlayer =
    game?.currentPlayer ??
    null;

  const currentPlayerHp =
    Math.max(
      0,
      Math.min(
        100,
        toNumber(
          currentPlayer?.hp,
          0
        )
      )
    );

  const currentPlayerMoney =
    formatMoney(
      currentPlayer?.money
    );

  const goalMoney =
    formatMoney(
      game?.room?.goalMoney
    );

  const otherPlayers =
    (game?.players ?? [])
      .filter(
        (player) =>
          player.role !==
            "spectator" &&
          player.id !==
            currentPlayer?.id
      );

  const choiceProgressPercent =
    totalPlayers > 0
      ? Math.min(
          100,
          Math.round(
            (chosenPlayers /
              totalPlayers) *
              100
          )
        )
      : 0;

  const phaseLabel =
    isChoosing
      ? isVietnamese
        ? "LỰA CHỌN"
        : "CHOICE"
      : isGenerating
        ? isVietnamese
          ? "ĐANG TẠO"
          : "GENERATING"
        : isResolving
          ? isVietnamese
            ? "ĐANG XỬ LÝ"
            : "RESOLVING"
          : isResult
            ? isVietnamese
              ? "KẾT QUẢ"
              : "RESULT"
            : isShop
              ? isVietnamese
                ? "CỬA HÀNG"
                : "SHOP"
              : isFinished
                ? isVietnamese
                  ? "HOÀN TẤT"
                  : "FINISHED"
                : phase.toUpperCase();

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

  const sideQuestTitle =
    sideQuest
      ? isVietnamese
        ? sideQuest.title
        : sideQuest.title_en ||
          sideQuest.title
      : "";

  const sideQuestDescription =
    sideQuest
      ? isVietnamese
        ? sideQuest.description
        : sideQuest.description_en ||
          sideQuest.description
      : "";

  const sideQuestMessage =
    sideQuestResult
      ? isVietnamese
        ? sideQuestResult.message
        : sideQuestResult.message_en ||
          sideQuestResult.message
      : "";

  /*
   * ---
   * LOADING
   * ---
   */

  if (loading && !game) {
    return (
      <main
        className={`flex min-h-[100dvh] items-center justify-center px-4 ${pageClass}`}
      >
        <div className="w-full max-w-xs text-center">
          <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />

          <p className="text-sm font-bold tracking-wide">
            {isVietnamese
              ? "ĐANG TẢI HÀNH TRÌNH..."
              : "LOADING JOURNEY..."}
          </p>
        </div>
      </main>
    );
  }

  /*
   * ---
   * ERROR WITHOUT GAME
   * ---
   */

  if (!game) {
    return (
      <main
        className={`flex min-h-[100dvh] items-center justify-center px-4 ${pageClass}`}
      >
        <div
          className={`w-full max-w-md rounded-3xl border p-5 text-center shadow-xl sm:p-6 ${cardClass}`}
        >
          <div className="mb-4 text-4xl">
            ⚠️
          </div>

          <h1 className="text-xl font-black">
            {isVietnamese
              ? "Không thể vào trận"
              : "Unable to enter game"}
          </h1>

          <p
            className={`mt-3 text-sm leading-6 ${mutedClass}`}
          >
            {error ||
              (isVietnamese
                ? "Không thể tải trạng thái trận đấu."
                : "Unable to load game state.")}
          </p>

          <button
            type="button"
            onClick={() =>
              router.push("/")
            }
            className="mt-6 min-h-12 w-full rounded-2xl bg-[#eee7d9] px-5 text-sm font-black text-[#171613] transition hover:bg-white active:scale-[0.985]"
          >
            BACK HOME
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <main
        className={`min-h-[100dvh] overflow-x-hidden transition-colors ${pageClass}`}
      >
        {/* ==================================================
            MOBILE
            ================================================== */}

        <div className="md:hidden">
          <header
            className={[
              "fixed inset-x-0 top-0 z-50",
              "border-b backdrop-blur-xl",
              isDark
                ? "border-[#37342e] bg-[#12110f]/95"
                : "border-[#d7d0c4] bg-[#eee9df]/95",
            ].join(" ")}
          >
            <div className="mx-auto flex h-16 w-full max-w-lg items-center justify-between px-3 sm:px-4">
              <div className="h-11 w-11 shrink-0" />

              <div className="min-w-0 px-3 text-center">
                <p
                  className={`text-[8px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                >
                  ĐƯỜNG BIÊN ĐÊM
                </p>

                <p className="mt-0.5 truncate font-mono text-sm font-black tracking-widest">
                  {code}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/settings"
                  )
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg active:scale-95"
                aria-label="Settings"
              >
                ⚙️
              </button>
            </div>
          </header>

          <div className="mx-auto w-full max-w-lg px-3 pb-28 pt-20 sm:px-4">
            {connectionLost && (
              <div className="mb-3 rounded-2xl border border-[#795f3c] bg-[#292219] px-4 py-3 text-xs leading-5 text-[#d5c7ae]">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#c8945b]" />

                  <span className="min-w-0">
                    {isVietnamese
                      ? "Kết nối không ổn định. Game vẫn đang tự đồng bộ."
                      : "Connection is unstable. The game is still syncing."}
                  </span>
                </div>
              </div>
            )}

            {/* PLAYER STATUS */}

            <section
              className={[
                "overflow-hidden rounded-[24px] border",
                cardClass,
              ].join(" ")}
            >
              <div className="grid grid-cols-2">
                <div className="min-w-0 border-r border-current/10 px-4 py-4">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    NGƯỜI CHƠI
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {currentPlayer?.playerName ||
                      "—"}
                  </p>
                </div>

                <div className="px-4 py-4">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    VÒNG
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {String(
                      game.session.round
                    ).padStart(2, "0")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 border-t border-current/10">
                <div className="min-w-0 border-r border-current/10 px-4 py-4">
                  <p className="truncate text-sm font-black">
                    💰{" "}
                    {currentPlayerMoney}
                  </p>

                  <p
                    className={`mt-1 text-[9px] font-bold ${mutedClass}`}
                  >
                    {isVietnamese
                      ? "TÀI SẢN"
                      : "MONEY"}
                  </p>
                </div>

                <div className="px-4 py-4">
                  <p className="text-sm font-black">
                    ❤️{" "}
                    {currentPlayerHp}
                  </p>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-current/10">
                    <div
                      className="h-full rounded-full bg-[#8c9363] transition-all duration-300"
                      style={{
                        width: `${currentPlayerHp}%`,
                      }}
                    />
                  </div>

                  <p
                    className={`mt-1 text-[9px] font-bold ${mutedClass}`}
                  >
                    HP
                  </p>
                </div>
              </div>

              <div className="border-t border-current/10 px-4 py-3">
                <p
                  className={`truncate text-xs font-bold ${mutedClass}`}
                >
                  📍{" "}
                  {currentPlayer?.location ||
                    "Việt Nam"}
                </p>
              </div>
            </section>

            {/* ROUND */}

            <div className="py-5 text-center">
              <p
                className={`text-[9px] font-black uppercase tracking-[0.3em] ${mutedClass}`}
              >
                {phaseLabel}
              </p>

              <p className="mt-1 text-3xl font-black tracking-tight">
                LƯỢT{" "}
                {String(
                  game.session.round
                ).padStart(2, "0")}
              </p>
            </div>

            {/* EVENT / SHOP */}

            <section
              className={[
                "overflow-hidden rounded-[26px] border",
                cardClass,
              ].join(" ")}
            >
              {isShopRound ? (
                <div className="px-5 py-10 text-center">
                  <div className="mb-4 text-5xl">
                    🛒
                  </div>

                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
                    SHOP
                  </p>

                  <h2 className="mt-2 text-2xl font-black">
                    {isVietnamese
                      ? "CỬA HÀNG SẴN SÀNG"
                      : "SHOP READY"}
                  </h2>

                  <p
                    className={`mt-3 text-sm leading-6 ${mutedClass}`}
                  >
                    {isVietnamese
                      ? "Cửa hàng chưa bắt đầu. Bấm vào nút bên dưới để mở Shop và bắt đầu 85 giây mua sắm."
                      : "The shop has not started yet. Enter the shop below to start the 85-second shopping timer."}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      void openShop()
                    }
                    className="mt-7 w-full rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-6 py-4 text-xs font-black uppercase tracking-[0.15em] text-[#b69c57] transition active:scale-[0.98]"
                  >
                    {isVietnamese
                      ? "VÀO CỬA HÀNG"
                      : "ENTER SHOP"}
                  </button>

                  <p
                    className={`mt-4 text-[10px] leading-5 ${mutedClass}`}
                  >
                    {isVietnamese
                      ? `Vòng ${currentRound} · Đồng hồ chỉ bắt đầu khi bạn bấm Vào cửa hàng.`
                      : `Round ${currentRound} · The timer starts only when you enter the shop.`}
                  </p>
                </div>
              ) : game.event ? (
                <>
                  <div className="px-4 pb-5 pt-5 sm:px-5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#d6bd72]/15 text-base">
                        🌙
                      </span>

                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#b69c57]">
                          {isVietnamese
                            ? "SỰ KIỆN"
                            : "EVENT"}
                        </p>

                        <p
                          className={`text-[9px] font-bold ${mutedClass}`}
                        >
                          ROUND{" "}
                          {
                            game.event
                              .round
                          }
                        </p>
                      </div>
                    </div>

                    <h1 className="mt-5 break-words text-[23px] font-black leading-tight sm:text-2xl">
                      {game.event.title}
                    </h1>

                    <p
                      className={`mt-4 whitespace-pre-line break-words text-sm leading-7 ${mutedClass}`}
                    >
                      {
                        game.event
                          .description
                      }
                    </p>

                    <div className="mt-6">
                      <p className="text-base font-black">
                        {isVietnamese
                          ? "Bạn sẽ làm gì?"
                          : "What will you do?"}
                      </p>
                    </div>
                  </div>

                  {game.event.choices
                    ?.length > 0 && (
                    <div className="border-t border-current/10 p-2.5 sm:p-3">
                      <div className="space-y-2">
                        {game.event.choices.map(
                          (
                            choice,
                            index
                          ) => {
                            const isSelected =
                              selectedChoiceId ===
                              choice.id;

                            return (
                              <button
                                key={
                                  choice.id
                                }
                                type="button"
                                disabled={
                                  !isChoosing ||
                                  hasSelected ||
                                  submitting
                                }
                                onClick={() =>
                                  choose(
                                    choice.id
                                  )
                                }
                                className={[
                                  "flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                                  "active:scale-[0.985]",
                                  isSelected
                                    ? "border-[#d6bd72] bg-[#d6bd72]/10"
                                    : "border-current/10",
                                  !isChoosing ||
                                  hasSelected
                                    ? "cursor-default opacity-80"
                                    : "cursor-pointer",
                                ].join(
                                  " "
                                )}
                              >
                                <span
                                  className={[
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black",
                                    isSelected
                                      ? "border-[#d6bd72] bg-[#d6bd72] text-[#171613]"
                                      : "border-current/10",
                                  ].join(
                                    " "
                                  )}
                                >
                                  {getChoiceLetter(
                                    index
                                  )}
                                </span>

                                <span className="min-w-0 flex-1">
                                  <span className="block break-words text-sm font-black leading-6">
                                    {getChoiceText(
                                      choice
                                    )}
                                  </span>

                                  {typeof choice.description ===
                                    "string" &&
                                    choice.text &&
                                    choice.description !==
                                      choice.text && (
                                      <span
                                        className={`mt-1 block break-words text-xs leading-5 ${mutedClass}`}
                                      >
                                        {
                                          choice.description
                                        }
                                      </span>
                                    )}
                                </span>

                                {isSelected && (
                                  <span className="shrink-0 text-lg font-black">
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          }
                        )}
                      </div>

                      {isChoosing && (
                        <div className="px-1 pb-1 pt-5">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span
                              className={`min-w-0 text-[9px] font-black uppercase tracking-[0.12em] ${mutedClass}`}
                            >
                              {isVietnamese
                                ? "TIẾN ĐỘ"
                                : "PROGRESS"}
                            </span>

                            <span className="shrink-0 text-xs font-black">
                              {
                                progressText
                              }
                            </span>
                          </div>

                          <div className="h-1.5 overflow-hidden rounded-full bg-current/10">
                            <div
                              className="h-full rounded-full bg-[#d6bd72] transition-all duration-300"
                              style={{
                                width: `${choiceProgressPercent}%`,
                              }}
                            />
                          </div>

                          {hasSelected && (
                            <p
                              className={`mt-3 text-center text-[11px] leading-5 ${mutedClass}`}
                            >
                              {isVietnamese
                                ? "Đã ghi nhận lựa chọn. Đang chờ người chơi còn lại..."
                                : "Choice recorded. Waiting for the other players..."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="px-5 py-14 text-center">
                  <div className="mb-4 text-4xl">
                    {isGenerating
                      ? "🎲"
                      : isResolving
                        ? "⚙️"
                        : isResult
                          ? "📜"
                          : "🌙"}
                  </div>

                  <h2 className="text-xl font-black">
                    {isGenerating
                      ? isVietnamese
                        ? "Đang tạo sự kiện..."
                        : "Generating event..."
                      : isResolving
                        ? isVietnamese
                          ? "Đang xử lý lựa chọn..."
                          : "Resolving choices..."
                        : isResult
                          ? isVietnamese
                            ? "Đang chuẩn bị kết quả..."
                            : "Preparing result..."
                          : isFinished
                            ? isVietnamese
                              ? "Trận đấu đã hoàn tất"
                              : "Game finished"
                            : isVietnamese
                              ? "Đang chờ..."
                              : "Waiting..."}
                  </h2>

                  <p
                    className={`mt-3 text-sm leading-6 ${mutedClass}`}
                  >
                    {isGenerating ||
                    isResolving
                      ? isVietnamese
                        ? "Hệ thống đang đồng bộ trạng thái giữa những người chơi."
                        : "The system is synchronizing the game state between players."
                      : ""}
                  </p>

                  {(isGenerating ||
                    isResolving) && (
                    <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden rounded-full bg-current/10">
                      <div className="h-full w-1/2 animate-pulse rounded-full bg-[#d6bd72]" />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* GOAL */}

            <section
              className={`mt-4 rounded-2xl border px-4 py-4 ${cardClass}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    {isVietnamese
                      ? "MỤC TIÊU"
                      : "GOAL"}
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {goalMoney}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    ROOM
                  </p>

                  <p className="mt-1 font-mono text-xs font-black tracking-widest">
                    {code}
                  </p>
                </div>
              </div>
            </section>

            {/* PLAYERS */}

            <section
              className={`mt-4 overflow-hidden rounded-2xl border ${cardClass}`}
            >
              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(true)
                }
                className="flex min-h-[64px] w-full items-center justify-between gap-4 px-4 text-left"
              >
                <div className="min-w-0">
                  <p
                    className={`text-[8px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                  >
                    NGƯỜI CHƠI
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {totalPlayers}{" "}
                    {isVietnamese
                      ? "người tham gia"
                      : "players"}
                  </p>
                </div>

                <span className="shrink-0 text-lg">
                  →
                </span>
              </button>
            </section>

            {error && (
              <div className="mt-4 rounded-2xl border border-[#795047] bg-[#291d1a] px-4 py-3 text-sm leading-6 text-[#d7bbb1]">
                <div className="flex items-start gap-3">
                  <span>⚠️</span>

                  <p className="min-w-0 flex-1 break-words">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setError("")
                    }
                    className="shrink-0 opacity-60 transition hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* MOBILE PLAYERS BOTTOM SHEET */}

          {playersOpen && (
            <div className="fixed inset-0 z-[80] md:hidden">
              <button
                type="button"
                aria-label="Close players"
                onClick={() =>
                  setPlayersOpen(false)
                }
                className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              />

              <div
                className={`absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-hidden rounded-t-[28px] border-t ${cardClass} shadow-2xl`}
              >
                <div className="mx-auto w-full max-w-lg">
                  <div className="flex items-center justify-between px-5 pb-3 pt-4">
                    <div>
                      <p
                        className={`text-[8px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                      >
                        PLAYERS
                      </p>

                      <p className="mt-1 text-base font-black">
                        {totalPlayers}{" "}
                        {isVietnamese
                          ? "người tham gia"
                          : "players"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setPlayersOpen(
                          false
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/10 text-xl"
                    >
                      ×
                    </button>
                  </div>

                  <div className="max-h-[calc(75dvh-84px)] overflow-y-auto border-t border-current/10">
                    {otherPlayers.length ===
                    0 ? (
                      <div
                        className={`px-5 py-8 text-center text-sm ${mutedClass}`}
                      >
                        {isVietnamese
                          ? "Chưa có người chơi khác."
                          : "No other players."}
                      </div>
                    ) : (
                      <div className="divide-y divide-current/10">
                        {otherPlayers.map(
                          (player) => (
                            <div
                              key={
                                player.id
                              }
                              className="flex items-center justify-between gap-3 px-5 py-4"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-black">
                                    {
                                      player.player_name
                                    }
                                  </p>

                                  <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${
                                      player.is_connected
                                        ? "bg-[#8c9363]"
                                        : "bg-[#777166]"
                                    }`}
                                  />
                                </div>

                                <p
                                  className={`mt-1 truncate text-xs ${mutedClass}`}
                                >
                                  📍{" "}
                                  {player.location ||
                                    "Việt Nam"}
                                </p>
                              </div>

                              <div className="shrink-0 text-right">
                                <p className="text-xs font-black">
                                  {formatMoney(
                                    player.money
                                  )}
                                </p>

                                <p
                                  className={`mt-1 text-[10px] ${mutedClass}`}
                                >
                                  ❤️{" "}
                                  {toNumber(
                                    player.hp,
                                    0
                                  )}
                                </p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MOBILE INVENTORY BOTTOM SHEET */}

          {inventoryOpen && (
            <div className="fixed inset-0 z-[90] md:hidden">
              <button
                type="button"
                aria-label="Close inventory"
                onClick={() =>
                  setInventoryOpen(false)
                }
                className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
              />

              <div
                className={`absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-[28px] border-t ${cardClass} shadow-2xl`}
              >
                <div className="mx-auto w-full max-w-lg">
                  <div className="flex items-center justify-between px-5 pb-4 pt-5">
                    <div className="min-w-0">
                      <p
                        className={`text-[8px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                      >
                        INVENTORY
                      </p>

                      <p className="mt-1 text-lg font-black">
                        {isVietnamese
                          ? "Túi đồ"
                          : "Inventory"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setInventoryOpen(
                          false
                        )
                      }
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/10 text-xl"
                    >
                      ×
                    </button>
                  </div>

                  <div className="max-h-[calc(82dvh-92px)] overflow-y-auto border-t border-current/10 px-4 py-4">
                    {inventoryLoading ? (
                      <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
                        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />

                        <p
                          className={`text-sm ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Đang mở túi đồ..."
                            : "Loading inventory..."}
                        </p>
                      </div>
                    ) : inventoryError ? (
                      <div className="rounded-2xl border border-[#795047] bg-[#291d1a] px-4 py-4 text-sm leading-6 text-[#d7bbb1]">
                        <div className="flex items-start gap-3">
                          <span>
                            ⚠️
                          </span>

                          <p className="min-w-0 flex-1">
                            {
                              inventoryError
                            }
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void loadInventory(
                              false
                            )
                          }
                          className="mt-4 rounded-xl border border-current/10 px-4 py-2 text-xs font-black"
                        >
                          {isVietnamese
                            ? "THỬ LẠI"
                            : "RETRY"}
                        </button>
                      </div>
                    ) : inventory.length ===
                      0 ? (
                      <div className="px-5 py-14 text-center">
                        <div className="mb-4 text-5xl">
                          🎒
                        </div>

                        <h3 className="text-base font-black">
                          {isVietnamese
                            ? "Túi đồ đang trống"
                            : "Inventory is empty"}
                        </h3>

                        <p
                          className={`mt-2 text-sm leading-6 ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Những vật phẩm bạn mua hoặc nhận được sẽ xuất hiện ở đây."
                            : "Items you buy or receive will appear here."}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {inventory.map(
                          (
                            inventoryItem,
                            index
                          ) => {
                            const item =
                              getInventoryItemData(
                                inventoryItem
                              );

                            const itemId =
                              String(
                                inventoryItem.item_id ??
                                  inventoryItem.id ??
                                  `inventory-${index}`
                              );

                            const itemName =
                              isVietnamese
                                ? String(
                                    item.name ??
                                      item.name_en ??
                                      "Vật phẩm"
                                  )
                                : String(
                                    item.name_en ??
                                      item.name ??
                                      "Item"
                                  );

                            const description =
                              isVietnamese
                                ? String(
                                    item.description ??
                                      item.description_en ??
                                      ""
                                  )
                                : String(
                                    item.description_en ??
                                      item.description ??
                                      ""
                                  );

                            const icon =
                              String(
                                item.icon ??
                                  "📦"
                              );

                            const isUsing =
                              usingItemId ===
                              itemId;

                            return (
                              <div
                                key={`${itemId}-${index}`}
                                className="rounded-2xl border border-current/10 px-3 py-3"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-current/5 text-2xl">
                                    {
                                      icon
                                    }
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="min-w-0 break-words text-sm font-black">
                                        {
                                          itemName
                                        }
                                      </p>

                                      <span className="shrink-0 rounded-lg border border-current/10 px-2 py-1 text-[10px] font-black">
                                        ×
                                        {
                                          inventoryItem.quantity
                                        }
                                      </span>
                                    </div>

                                    {description && (
                                      <p
                                        className={`mt-1 break-words text-xs leading-5 ${mutedClass}`}
                                      >
                                        {
                                          description
                                        }
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={
                                    isUsing ||
                                    sideQuestLoading
                                  }
                                  onClick={() =>
                                    void useItem(
                                      itemId
                                    )
                                  }
                                  className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] text-[#b69c57] transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isUsing ? (
                                    <>
                                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b69c57] border-t-transparent" />
                                      {isVietnamese
                                        ? "ĐANG SỬ DỤNG..."
                                        : "USING..."}
                                    </>
                                  ) : (
                                    <>
                                      ⚡{" "}
                                      {isVietnamese
                                        ? "SỬ DỤNG"
                                        : "USE"}
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MOBILE SIDE QUEST */}

          {sideQuestOpen && (
            <div className="fixed inset-0 z-[100] md:hidden">
              <button
                type="button"
                aria-label="Close side quest"
                disabled={
                  sideQuestLoading
                }
                onClick={() =>
                  closeSideQuest()
                }
                className="absolute inset-0 bg-black/65 backdrop-blur-[3px]"
              />

              <div
                className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-[30px] border-t ${cardClass} shadow-2xl`}
              >
                <div className="mx-auto w-full max-w-lg">
                  <div className="flex items-center justify-between px-5 pb-4 pt-5">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
                        SIDE QUEST
                      </p>

                      <p className="mt-1 text-lg font-black">
                        {sideQuestResult
                          ? isVietnamese
                            ? "Kết quả"
                            : "Result"
                          : isVietnamese
                            ? "Gặp gỡ bất ngờ"
                            : "Unexpected Encounter"}
                      </p>
                    </div>

                    {!sideQuestLoading && (
                      <button
                        type="button"
                        onClick={() =>
                          closeSideQuest()
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/10 text-xl"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="max-h-[calc(88dvh-92px)] overflow-y-auto border-t border-current/10 px-4 py-5">
                    {!sideQuest ? (
                      <div className="px-5 py-12 text-center">
                        <div className="mb-4 text-4xl">
                          📜
                        </div>

                        <p
                          className={`text-sm ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Không có Side Quest đang hoạt động."
                            : "No active side quest."}
                        </p>
                      </div>
                    ) : sideQuestResult ? (
                      <div className="text-center">
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#b69c57]/10 text-4xl">
                          ✦
                        </div>

                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
                          {isVietnamese
                            ? "SIDE QUEST HOÀN TẤT"
                            : "SIDE QUEST COMPLETE"}
                        </p>

                        <h2 className="mt-2 text-2xl font-black leading-tight">
                          {sideQuestTitle}
                        </h2>

                        <div
                          className={`mt-5 rounded-2xl border border-current/10 px-4 py-5 text-left`}
                        >
                          <p className="text-sm font-bold leading-7">
                            {sideQuestMessage ||
                              (isVietnamese
                                ? "Mọi chuyện đã kết thúc."
                                : "The encounter is over.")}
                          </p>

                          <div className="mt-5 grid grid-cols-2 gap-2">
                            {typeof sideQuestResult.money ===
                              "number" &&
                              sideQuestResult.money !==
                                0 && (
                                <div className="rounded-xl border border-current/10 px-3 py-3">
                                  <p
                                    className={`text-[8px] font-black uppercase tracking-[0.15em] ${mutedClass}`}
                                  >
                                    MONEY
                                  </p>

                                  <p className="mt-1 text-sm font-black">
                                    {sideQuestResult.money >
                                    0
                                      ? "+"
                                      : ""}
                                    {formatMoney(
                                      sideQuestResult.money
                                    )}
                                  </p>
                                </div>
                              )}

                            {typeof sideQuestResult.hp ===
                              "number" &&
                              sideQuestResult.hp !==
                                0 && (
                                <div className="rounded-xl border border-current/10 px-3 py-3">
                                  <p
                                    className={`text-[8px] font-black uppercase tracking-[0.15em] ${mutedClass}`}
                                  >
                                    HP
                                  </p>

                                  <p className="mt-1 text-sm font-black">
                                    {sideQuestResult.hp >
                                    0
                                      ? "+"
                                      : ""}
                                    {
                                      sideQuestResult.hp
                                    }
                                  </p>
                                </div>
                              )}

                            {sideQuestResult.location && (
                              <div className="col-span-2 rounded-xl border border-current/10 px-3 py-3">
                                <p
                                  className={`text-[8px] font-black uppercase tracking-[0.15em] ${mutedClass}`}
                                >
                                  LOCATION
                                </p>

                                <p className="mt-1 text-sm font-black">
                                  📍{" "}
                                  {
                                    sideQuestResult.location
                                  }
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            closeSideQuest()
                          }
                          className="mt-5 min-h-12 w-full rounded-2xl bg-[#eee7d9] px-5 text-xs font-black uppercase tracking-[0.15em] text-[#171613] active:scale-[0.985]"
                        >
                          {isVietnamese
                            ? "TIẾP TỤC HÀNH TRÌNH"
                            : "CONTINUE JOURNEY"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="mb-5 text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#b69c57]/10 text-3xl">
                            📜
                          </div>

                          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
                            SIDE QUEST
                          </p>

                          <h2 className="mt-2 text-2xl font-black leading-tight">
                            {sideQuestTitle}
                          </h2>

                          <p
                            className={`mt-4 text-sm leading-7 ${mutedClass}`}
                          >
                            {
                              sideQuestDescription
                            }
                          </p>
                        </div>

                        {sideQuestError && (
                          <div className="mb-4 rounded-2xl border border-[#795047] bg-[#291d1a] px-4 py-3 text-sm leading-6 text-[#d7bbb1]">
                            ⚠️{" "}
                            {
                              sideQuestError
                            }
                          </div>
                        )}

                        <div className="space-y-2.5">
                          {sideQuest.choices.map(
                            (
                              choice,
                              index
                            ) => {
                              const selected =
                                sideQuestChoice ===
                                choice.id;

                              const choiceText =
                                isVietnamese
                                  ? choice.text ??
                                    choice.text_en ??
                                    choice.id
                                  : choice.text_en ??
                                    choice.text ??
                                    choice.id;

                              return (
                                <button
                                  key={
                                    choice.id
                                  }
                                  type="button"
                                  disabled={
                                    sideQuestLoading
                                  }
                                  onClick={() =>
                                    void chooseSideQuest(
                                      choice.id
                                    )
                                  }
                                  className={[
                                    "flex min-h-[66px] w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                                    "active:scale-[0.985]",
                                    selected
                                      ? "border-[#d6bd72] bg-[#d6bd72]/10"
                                      : "border-current/10",
                                    sideQuestLoading
                                      ? "opacity-70"
                                      : "",
                                  ].join(
                                    " "
                                  )}
                                >
                                  <span
                                    className={[
                                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black",
                                      selected
                                        ? "border-[#d6bd72] bg-[#d6bd72] text-[#171613]"
                                        : "border-current/10",
                                    ].join(
                                      " "
                                    )}
                                  >
                                    {getChoiceLetter(
                                      index
                                    )}
                                  </span>

                                  <span className="min-w-0 flex-1 break-words text-sm font-black leading-6">
                                    {
                                      choiceText
                                    }
                                  </span>

                                  {selected &&
                                    sideQuestLoading && (
                                      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    )}
                                </button>
                              );
                            }
                          )}
                        </div>

                        <p
                          className={`mt-5 text-center text-[10px] leading-5 ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Vật phẩm chỉ bị tiêu hao sau khi bạn hoàn tất lựa chọn."
                            : "The item is consumed only after your choice is resolved."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MOBILE BOTTOM NAV */}

          <nav
            className={[
              "fixed inset-x-0 bottom-0 z-50",
              "border-t backdrop-blur-xl",
              isDark
                ? "border-[#37342e] bg-[#12110f]/95"
                : "border-[#d7d0c4] bg-[#eee9df]/95",
            ].join(" ")}
          >
            <div className="mx-auto grid h-[68px] max-w-lg grid-cols-4">
              <button
                type="button"
                onClick={
                  openInventory
                }
                className={[
                  "flex flex-col items-center justify-center gap-1 active:scale-95",
                  inventoryOpen
                    ? "opacity-100"
                    : "opacity-70",
                ].join(" ")}
              >
                <span className="text-lg">
                  🎒
                </span>

                <span
                  className={`text-[9px] font-black uppercase tracking-wider ${mutedClass}`}
                >
                  {isVietnamese
                    ? "Đồ"
                    : "Items"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  void openQuest()
                }
                className={[
                  "relative flex flex-col items-center justify-center gap-1 active:scale-95",
                  sideQuestOpen
                    ? "opacity-100"
                    : "opacity-70",
                ].join(" ")}
              >
                {sideQuest &&
                  !sideQuestResult && (
                    <span className="absolute right-[calc(50%-22px)] top-2 h-2 w-2 rounded-full bg-[#b69c57]" />
                  )}

                <span className="text-lg">
                  📜
                </span>

                <span
                  className={`text-[9px] font-black uppercase tracking-wider ${mutedClass}`}
                >
                  Quest
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setChatOpen(true)
                }
                className={[
                  "flex flex-col items-center justify-center gap-1 active:scale-95",
                  chatOpen ? "opacity-100" : "opacity-70",
                ].join(" ")}
              >
                <span className="text-lg">💬</span>
                <span className={`text-[9px] font-black uppercase tracking-wider ${mutedClass}`}>
                  Chat
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    true
                  )
                }
                className={[
                  "flex flex-col items-center justify-center gap-1 active:scale-95",
                  playersOpen
                    ? "opacity-100"
                    : "opacity-70",
                ].join(" ")}
              >
                <span className="text-lg">
                  👥
                </span>

                <span
                  className={`text-[9px] font-black uppercase tracking-wider ${mutedClass}`}
                >
                  {isVietnamese
                    ? "Phòng"
                    : "Room"}
                </span>
              </button>
            </div>
          </nav>
        </div>

        {/* ==================================================
            SHARED TEAM CHAT
            Kept outside the mobile wrapper so it works on
            both mobile and desktop.
            ================================================== */}

        {chatOpen && game?.room?.id && game?.currentPlayer && (
          <div
            className="pointer-events-none fixed inset-x-0 bottom-[68px] z-[110] px-3 pb-3 md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:w-[390px] md:p-4"
          >
            <div
              className={[
                "pointer-events-auto h-[42dvh] min-h-[320px] overflow-hidden rounded-[24px] border shadow-2xl",
                "md:h-full md:min-h-0 md:w-full md:rounded-[28px]",
                cardClass,
              ].join(" ")}
            >
              <RoomChat
                roomId={game.room.id}
                playerId={game.currentPlayer.id}
                playerName={game.currentPlayer.playerName}
                canSend={game.currentPlayer.role !== "spectator"}
                isVietnamese={isVietnamese}
                onClose={() => setChatOpen(false)}
              />
            </div>
          </div>
        )}

        {/* ==================================================
            DESKTOP
            ================================================== */}

        <div className="hidden md:block">
          <div className="mx-auto w-full max-w-5xl px-6 pb-28 pt-6 lg:px-8">
            <header className="mb-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    (value) =>
                      !value
                  )
                }
                className={`rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${cardClass}`}
              >
                <p
                  className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                >
                  ROOM
                </p>

                <p className="mt-0.5 font-mono text-sm font-black tracking-widest">
                  {code}
                </p>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={
                    openInventory
                  }
                  className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${cardClass}`}
                >
                  <span className="text-lg">
                    🎒
                  </span>

                  <div>
                    <p
                      className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                    >
                      {isVietnamese
                        ? "TÚI ĐỒ"
                        : "INVENTORY"}
                    </p>

                    <p className="mt-0.5 text-sm font-black">
                      {inventory.length}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void openQuest()
                  }
                  className={`relative flex items-center gap-2 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${cardClass}`}
                >
                  {sideQuest &&
                    !sideQuestResult && (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#b69c57]" />
                    )}

                  <span className="text-lg">
                    📜
                  </span>

                  <div>
                    <p
                      className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                    >
                      QUEST
                    </p>

                    <p className="mt-0.5 text-sm font-black">
                      {sideQuest
                        ? "1"
                        : "0"}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${chatOpen ? "border-[#b69c57]/70 bg-[#b69c57]/10" : cardClass}`}
                >
                  <span className="text-lg">
                    💬
                  </span>

                  <div>
                    <p
                      className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                    >
                      CHAT
                    </p>

                    <p className="mt-0.5 text-sm font-black">
                      {isVietnamese ? "Phòng" : "Room"}
                    </p>
                  </div>
                </button>

                <div className="text-right">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    ROUND
                  </p>

                  <p className="text-lg font-black">
                    {game.session.round}
                  </p>
                </div>
              </div>
            </header>

            <section
              className={`overflow-hidden rounded-[28px] border ${cardClass}`}
            >
              <div className="border-b border-current/10 px-7 py-6">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      className={`text-[10px] font-black uppercase tracking-[0.3em] ${mutedClass}`}
                    >
                      ĐƯỜNG BIÊN ĐÊM
                    </p>

                    <h1 className="mt-2 truncate text-4xl font-black tracking-tight">
                      {game.event?.title ||
                        (isShopRound
                          ? isVietnamese
                            ? "Cửa hàng"
                            : "Shop"
                          : isGenerating
                            ? "Đang tạo sự kiện..."
                            : isResolving
                              ? "Đang xử lý..."
                              : "Hành trình")}
                    </h1>
                  </div>

                  <div className="shrink-0 rounded-full border border-current/10 px-4 py-2">
                    <span className="text-[10px] font-black tracking-[0.2em]">
                      {phaseLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 border-b border-current/10">
                <div className="min-w-0 border-r border-current/10 px-4 py-5">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    NGƯỜI CHƠI
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {currentPlayer?.playerName ||
                      "—"}
                  </p>
                </div>

                <div className="min-w-0 border-r border-current/10 px-4 py-5">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    TIỀN
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    {currentPlayerMoney}
                  </p>
                </div>

                <div className="border-r border-current/10 px-4 py-5">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    HP
                  </p>

                  <p className="mt-1 text-sm font-black">
                    ❤️ {currentPlayerHp}
                  </p>

                  <div className="mt-2 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-current/10">
                    <div
                      className="h-full rounded-full bg-[#8c9363] transition-all duration-300"
                      style={{
                        width: `${currentPlayerHp}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="min-w-0 px-4 py-5">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    VỊ TRÍ
                  </p>

                  <p className="mt-1 truncate text-sm font-black">
                    📍{" "}
                    {currentPlayer?.location ||
                      "Việt Nam"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between px-7 py-4">
                <div>
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    MỤC TIÊU
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {goalMoney}
                  </p>
                </div>

                <div className="text-right">
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}
                  >
                    VÒNG
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {game.session.round}
                  </p>
                </div>
              </div>
            </section>

            {/* DESKTOP EVENT / SHOP */}

            <section
              className={`mt-5 overflow-hidden rounded-[28px] border ${cardClass}`}
            >
              {isShopRound ? (
                <div className="px-7 py-16 text-center">
                  <div className="mb-4 text-6xl">
                    🛒
                  </div>

                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#b69c57]">
                    SHOP
                  </p>

                  <h2 className="mt-2 text-3xl font-black">
                    {isVietnamese
                      ? "CỬA HÀNG SẴN SÀNG"
                      : "SHOP READY"}
                  </h2>

                  <p
                    className={`mx-auto mt-3 max-w-lg text-sm leading-7 ${mutedClass}`}
                  >
                    {isVietnamese
                      ? "Cửa hàng chưa bắt đầu. Bấm vào nút bên dưới để mở Shop và bắt đầu 85 giây mua sắm."
                      : "The shop has not started yet. Enter the shop below to start the 85-second shopping timer."}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      void openShop()
                    }
                    className="mt-8 rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-8 py-4 text-xs font-black uppercase tracking-[0.15em] text-[#b69c57] transition hover:bg-[#b69c57]/15 active:scale-[0.98]"
                  >
                    {isVietnamese
                      ? "VÀO CỬA HÀNG"
                      : "ENTER SHOP"}
                  </button>

                  <p
                    className={`mt-4 text-[10px] leading-5 ${mutedClass}`}
                  >
                    {isVietnamese
                      ? `Vòng ${currentRound} · Đồng hồ chỉ bắt đầu khi bạn bấm Vào cửa hàng.`
                      : `Round ${currentRound} · The timer starts only when you enter the shop.`}
                  </p>
                </div>
              ) : game.event ? (
                <>
                  <div className="px-7 pb-5 pt-6">
                    <div className="mb-4 flex items-center gap-2">
                      <span className="rounded-full bg-[#d6bd72]/15 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#b69c57]">
                        {game.event.event_type ||
                          "EVENT"}
                      </span>

                      <span
                        className={`text-[10px] font-bold ${mutedClass}`}
                      >
                        ROUND{" "}
                        {
                          game.event
                            .round
                        }
                      </span>
                    </div>

                    <h2 className="text-3xl font-black leading-tight">
                      {game.event.title}
                    </h2>

                    <p
                      className={`mt-4 whitespace-pre-line text-sm leading-7 ${mutedClass}`}
                    >
                      {
                        game.event
                          .description
                      }
                    </p>
                  </div>

                  <div className="border-t border-current/10 p-5">
                    <div className="space-y-3">
                      {game.event.choices.map(
                        (
                          choice,
                          index
                        ) => {
                          const isSelected =
                            selectedChoiceId ===
                            choice.id;

                          return (
                            <button
                              key={
                                choice.id
                              }
                              type="button"
                              disabled={
                                !isChoosing ||
                                hasSelected ||
                                submitting
                              }
                              onClick={() =>
                                choose(
                                  choice.id
                                )
                              }
                              className={[
                                "group w-full rounded-2xl border p-4 text-left transition",
                                "active:scale-[0.99]",
                                isSelected
                                  ? "border-[#d6bd72] bg-[#d6bd72]/10"
                                  : "border-current/10 hover:border-[#d6bd72]/50",
                              ].join(
                                " "
                              )}
                            >
                              <div className="flex gap-4">
                                <div
                                  className={[
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black",
                                    isSelected
                                      ? "border-[#d6bd72] bg-[#d6bd72] text-[#171613]"
                                      : "border-current/10",
                                  ].join(
                                    " "
                                  )}
                                >
                                  {getChoiceLetter(
                                    index
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black leading-6">
                                    {getChoiceText(
                                      choice
                                    )}
                                  </p>

                                  {typeof choice.description ===
                                    "string" &&
                                    choice.text &&
                                    choice.description !==
                                      choice.text && (
                                      <p
                                        className={`mt-1 text-xs leading-5 ${mutedClass}`}
                                      >
                                        {
                                          choice.description
                                        }
                                      </p>
                                    )}
                                </div>

                                {isSelected && (
                                  <span className="text-lg">
                                    ✓
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>

                    {isChoosing && (
                      <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between">
                          <span
                            className={`text-[10px] font-black uppercase tracking-[0.15em] ${mutedClass}`}
                          >
                            TIẾN ĐỘ LỰA CHỌN
                          </span>

                          <span className="text-xs font-black">
                            {
                              progressText
                            }
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-current/10">
                          <div
                            className="h-full rounded-full bg-[#d6bd72] transition-all"
                            style={{
                              width: `${choiceProgressPercent}%`,
                            }}
                          />
                        </div>

                        {hasSelected && (
                          <p
                            className={`mt-3 text-center text-xs ${mutedClass}`}
                          >
                            {isVietnamese
                              ? "Đã ghi nhận lựa chọn. Đang chờ người chơi còn lại..."
                              : "Choice recorded. Waiting for the other players..."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="px-6 py-14 text-center">
                  <div className="mb-4 text-4xl">
                    {isGenerating
                      ? "🎲"
                      : isResolving
                        ? "⚙️"
                        : isResult
                          ? "📜"
                          : "🌙"}
                  </div>

                  <h2 className="text-xl font-black">
                    {isGenerating
                      ? isVietnamese
                        ? "Đang tạo sự kiện..."
                        : "Generating event..."
                      : isResolving
                        ? isVietnamese
                          ? "Đang xử lý lựa chọn..."
                          : "Resolving choices..."
                        : isResult
                          ? isVietnamese
                            ? "Đang chuẩn bị kết quả..."
                            : "Preparing result..."
                          : isFinished
                            ? isVietnamese
                              ? "Trận đấu đã hoàn tất"
                              : "Game finished"
                            : isVietnamese
                              ? "Đang chờ..."
                              : "Waiting..."}
                  </h2>
                </div>
              )}
            </section>

            {/* DESKTOP PLAYERS */}

            <section
              className={`mt-5 overflow-hidden rounded-[28px] border ${cardClass}`}
            >
              <button
                type="button"
                onClick={() =>
                  setPlayersOpen(
                    (value) =>
                      !value
                  )
                }
                className="flex w-full items-center justify-between px-7 py-5 text-left"
              >
                <div>
                  <p
                    className={`text-[9px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                  >
                    NGƯỜI CHƠI
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {totalPlayers} người tham gia
                  </p>
                </div>

                <span className="text-lg">
                  {playersOpen
                    ? "⌃"
                    : "⌄"}
                </span>
              </button>

              {playersOpen && (
                <div className="border-t border-current/10">
                  {otherPlayers.length ===
                  0 ? (
                    <div
                      className={`px-7 py-6 text-center text-sm ${mutedClass}`}
                    >
                      Chưa có người chơi khác.
                    </div>
                  ) : (
                    <div className="divide-y divide-current/10">
                      {otherPlayers.map(
                        (player) => (
                          <div
                            key={
                              player.id
                            }
                            className="flex items-center justify-between gap-4 px-7 py-4"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black">
                                {
                                  player.player_name
                                }
                              </p>

                              <p
                                className={`mt-1 truncate text-xs ${mutedClass}`}
                              >
                                📍{" "}
                                {player.location ||
                                  "Việt Nam"}
                              </p>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-xs font-black">
                                {formatMoney(
                                  player.money
                                )}
                              </p>

                              <p
                                className={`mt-1 text-[10px] ${mutedClass}`}
                              >
                                ❤️{" "}
                                {toNumber(
                                  player.hp,
                                  0
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {error && (
              <div className="mt-5 rounded-2xl border border-[#795047] bg-[#291d1a] px-4 py-3 text-sm leading-6 text-[#d7bbb1]">
                <div className="flex items-start gap-3">
                  <span>⚠️</span>

                  <p className="min-w-0 flex-1 break-words">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setError("")
                    }
                    className="shrink-0"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* DESKTOP INVENTORY PANEL */}

            {inventoryOpen && (
              <div className="fixed inset-0 z-[90]">
                <button
                  type="button"
                  aria-label="Close inventory"
                  onClick={() =>
                    setInventoryOpen(
                      false
                    )
                  }
                  className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                />

                <div
                  className={`absolute right-6 top-6 bottom-6 flex w-[390px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-[28px] border ${cardClass} shadow-2xl`}
                >
                  <div className="flex items-center justify-between px-6 pb-4 pt-5">
                    <div>
                      <p
                        className={`text-[9px] font-black uppercase tracking-[0.25em] ${mutedClass}`}
                      >
                        INVENTORY
                      </p>

                      <h2 className="mt-1 text-xl font-black">
                        {isVietnamese
                          ? "Túi đồ"
                          : "Inventory"}
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setInventoryOpen(
                          false
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/10 text-xl"
                    >
                      ×
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto border-t border-current/10 px-5 py-5">
                    {inventoryLoading ? (
                      <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
                        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />

                        <p
                          className={`text-sm ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Đang mở túi đồ..."
                            : "Loading inventory..."}
                        </p>
                      </div>
                    ) : inventoryError ? (
                      <div className="rounded-2xl border border-[#795047] bg-[#291d1a] px-4 py-4 text-sm leading-6 text-[#d7bbb1]">
                        <div className="flex items-start gap-3">
                          <span>
                            ⚠️
                          </span>

                          <p className="min-w-0 flex-1">
                            {
                              inventoryError
                            }
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void loadInventory(
                              false
                            )
                          }
                          className="mt-4 rounded-xl border border-current/10 px-4 py-2 text-xs font-black"
                        >
                          {isVietnamese
                            ? "THỬ LẠI"
                            : "RETRY"}
                        </button>
                      </div>
                    ) : inventory.length ===
                      0 ? (
                      <div className="px-5 py-16 text-center">
                        <div className="mb-4 text-5xl">
                          🎒
                        </div>

                        <h3 className="text-base font-black">
                          {isVietnamese
                            ? "Túi đồ đang trống"
                            : "Inventory is empty"}
                        </h3>

                        <p
                          className={`mt-2 text-sm leading-6 ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Những vật phẩm bạn mua hoặc nhận được sẽ xuất hiện ở đây."
                            : "Items you buy or receive will appear here."}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {inventory.map(
                          (
                            inventoryItem,
                            index
                          ) => {
                            const item =
                              getInventoryItemData(
                                inventoryItem
                              );

                            const itemId =
                              String(
                                inventoryItem.item_id ??
                                  inventoryItem.id ??
                                  `inventory-${index}`
                              );

                            const itemName =
                              isVietnamese
                                ? String(
                                    item.name ??
                                      item.name_en ??
                                      "Vật phẩm"
                                  )
                                : String(
                                    item.name_en ??
                                      item.name ??
                                      "Item"
                                  );

                            const description =
                              isVietnamese
                                ? String(
                                    item.description ??
                                      item.description_en ??
                                      ""
                                  )
                                : String(
                                    item.description_en ??
                                      item.description ??
                                      ""
                                  );

                            const icon =
                              String(
                                item.icon ??
                                  "📦"
                              );

                            const isUsing =
                              usingItemId ===
                              itemId;

                            return (
                              <div
                                key={`${itemId}-${index}`}
                                className="rounded-2xl border border-current/10 px-3 py-3"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-current/5 text-2xl">
                                    {
                                      icon
                                    }
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="min-w-0 break-words text-sm font-black">
                                        {
                                          itemName
                                        }
                                      </p>

                                      <span className="shrink-0 rounded-lg border border-current/10 px-2 py-1 text-[10px] font-black">
                                        ×
                                        {
                                          inventoryItem.quantity
                                        }
                                      </span>
                                    </div>

                                    {description && (
                                      <p
                                        className={`mt-1 break-words text-xs leading-5 ${mutedClass}`}
                                      >
                                        {
                                          description
                                        }
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={
                                    isUsing ||
                                    sideQuestLoading
                                  }
                                  onClick={() =>
                                    void useItem(
                                      itemId
                                    )
                                  }
                                  className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] text-[#b69c57] transition hover:bg-[#b69c57]/15 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isUsing ? (
                                    <>
                                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b69c57] border-t-transparent" />
                                      {isVietnamese
                                        ? "ĐANG SỬ DỤNG..."
                                        : "USING..."}
                                    </>
                                  ) : (
                                    <>
                                      ⚡{" "}
                                      {isVietnamese
                                        ? "SỬ DỤNG"
                                        : "USE"}
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* DESKTOP SIDE QUEST */}

            {sideQuestOpen && (
              <div className="fixed inset-0 z-[100]">
                <button
                  type="button"
                  aria-label="Close side quest"
                  disabled={
                    sideQuestLoading
                  }
                  onClick={() =>
                    closeSideQuest()
                  }
                  className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
                />

                <div
                  className={`absolute right-6 top-6 bottom-6 flex w-[440px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-[28px] border ${cardClass} shadow-2xl`}
                >
                  <div className="flex items-center justify-between px-6 pb-4 pt-5">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
                        SIDE QUEST
                      </p>

                      <h2 className="mt-1 text-xl font-black">
                        {sideQuestResult
                          ? isVietnamese
                            ? "Kết quả"
                            : "Result"
                          : isVietnamese
                            ? "Gặp gỡ bất ngờ"
                            : "Unexpected Encounter"}
                      </h2>
                    </div>

                    {!sideQuestLoading && (
                      <button
                        type="button"
                        onClick={() =>
                          closeSideQuest()
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-current/10 text-xl"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto border-t border-current/10 px-5 py-6">
                    {!sideQuest ? (
                      <div className="flex h-full min-h-[300px] flex-col items-center justify-center px-5 text-center">
                        <div className="mb-4 text-4xl">
                          📜
                        </div>

                        <p
                          className={`text-sm ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Không có Side Quest đang hoạt động."
                            : "No active side quest."}
                        </p>
                      </div>
                    ) : sideQuestResult ? (
                      <div className="text-center">
                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#b69c57]/10 text-4xl">
                          ✦
                        </div>

                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
                          {isVietnamese
                            ? "SIDE QUEST HOÀN TẤT"
                            : "SIDE QUEST COMPLETE"}
                        </p>

                        <h2 className="mt-2 text-2xl font-black leading-tight">
                          {sideQuestTitle}
                        </h2>

                        <div className="mt-5 rounded-2xl border border-current/10 px-4 py-5 text-left">
                          <p className="text-sm font-bold leading-7">
                            {sideQuestMessage ||
                              (isVietnamese
                                ? "Mọi chuyện đã kết thúc."
                                : "The encounter is over.")}
                          </p>

                          <div className="mt-5 grid grid-cols-2 gap-2">
                            {typeof sideQuestResult.money ===
                              "number" &&
                              sideQuestResult.money !==
                                0 && (
                                <div className="rounded-xl border border-current/10 px-3 py-3">
                                  <p
                                    className={`text-[8px] font-black uppercase tracking-[0.15em] ${mutedClass}`}
                                  >
                                    MONEY
                                  </p>

                                  <p className="mt-1 text-sm font-black">
                                    {sideQuestResult.money >
                                    0
                                      ? "+"
                                      : ""}
                                    {formatMoney(
                                      sideQuestResult.money
                                    )}
                                  </p>
                                </div>
                              )}

                            {typeof sideQuestResult.hp ===
                              "number" &&
                              sideQuestResult.hp !==
                                0 && (
                                <div className="rounded-xl border border-current/10 px-3 py-3">
                                  <p
                                    className={`text-[8px] font-black uppercase tracking-[0.15em] ${mutedClass}`}
                                  >
                                    HP
                                  </p>

                                  <p className="mt-1 text-sm font-black">
                                    {sideQuestResult.hp >
                                    0
                                      ? "+"
                                      : ""}
                                    {
                                      sideQuestResult.hp
                                    }
                                  </p>
                                </div>
                              )}

                            {sideQuestResult.location && (
                              <div className="col-span-2 rounded-xl border border-current/10 px-3 py-3">
                                <p
                                  className={`text-[8px] font-black uppercase tracking-[0.15em] ${mutedClass}`}
                                >
                                  LOCATION
                                </p>

                                <p className="mt-1 text-sm font-black">
                                  📍{" "}
                                  {
                                    sideQuestResult.location
                                  }
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            closeSideQuest()
                          }
                          className="mt-5 w-full rounded-2xl bg-[#eee7d9] px-5 py-4 text-xs font-black uppercase tracking-[0.15em] text-[#171613] transition hover:bg-white active:scale-[0.985]"
                        >
                          {isVietnamese
                            ? "TIẾP TỤC HÀNH TRÌNH"
                            : "CONTINUE JOURNEY"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="mb-6 text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#b69c57]/10 text-3xl">
                            📜
                          </div>

                          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#b69c57]">
                            SIDE QUEST
                          </p>

                          <h2 className="mt-2 text-2xl font-black leading-tight">
                            {sideQuestTitle}
                          </h2>

                          <p
                            className={`mx-auto mt-4 max-w-sm text-sm leading-7 ${mutedClass}`}
                          >
                            {
                              sideQuestDescription
                            }
                          </p>
                        </div>

                        {sideQuestError && (
                          <div className="mb-4 rounded-2xl border border-[#795047] bg-[#291d1a] px-4 py-3 text-sm leading-6 text-[#d7bbb1]">
                            ⚠️{" "}
                            {
                              sideQuestError
                            }
                          </div>
                        )}

                        <div className="space-y-3">
                          {sideQuest.choices.map(
                            (
                              choice,
                              index
                            ) => {
                              const selected =
                                sideQuestChoice ===
                                choice.id;

                              const choiceText =
                                isVietnamese
                                  ? choice.text ??
                                    choice.text_en ??
                                    choice.id
                                  : choice.text_en ??
                                    choice.text ??
                                    choice.id;

                              return (
                                <button
                                  key={
                                    choice.id
                                  }
                                  type="button"
                                  disabled={
                                    sideQuestLoading
                                  }
                                  onClick={() =>
                                    void chooseSideQuest(
                                      choice.id
                                    )
                                  }
                                  className={[
                                    "flex min-h-[70px] w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition",
                                    "active:scale-[0.985]",
                                    selected
                                      ? "border-[#d6bd72] bg-[#d6bd72]/10"
                                      : "border-current/10 hover:border-[#d6bd72]/50",
                                    sideQuestLoading
                                      ? "opacity-70"
                                      : "",
                                  ].join(
                                    " "
                                  )}
                                >
                                  <span
                                    className={[
                                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-black",
                                      selected
                                        ? "border-[#d6bd72] bg-[#d6bd72] text-[#171613]"
                                        : "border-current/10",
                                    ].join(
                                      " "
                                    )}
                                  >
                                    {getChoiceLetter(
                                      index
                                    )}
                                  </span>

                                  <span className="min-w-0 flex-1 break-words text-sm font-black leading-6">
                                    {
                                      choiceText
                                    }
                                  </span>

                                  {selected &&
                                    sideQuestLoading && (
                                      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    )}
                                </button>
                              );
                            }
                          )}
                        </div>

                        <p
                          className={`mt-6 text-center text-[10px] leading-5 ${mutedClass}`}
                        >
                          {isVietnamese
                            ? "Vật phẩm chỉ bị tiêu hao sau khi bạn hoàn tất lựa chọn."
                            : "The item is consumed only after your choice is resolved."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ==================================================
          DEVELOPER NOTIFICATION
          ================================================== */}

      {developerNotificationVisible &&
        developerNotification && (
          <div className="pointer-events-none fixed inset-x-3 top-4 z-[9000] flex justify-center sm:inset-x-4">
            <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-[#6b5b39] bg-[#211e18]/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d6bd72] text-[#171613]">
                ⚙
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#d6bd72]">
                  DEVELOPER
                </p>

                <p className="mt-1 break-words text-sm font-bold leading-5 text-[#eee7d9]">
                  {
                    developerNotification
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setDeveloperNotificationVisible(
                    false
                  )
                }
                className="shrink-0 px-1 text-xl leading-none text-[#aaa397] hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        )}

      {/* ==================================================
          ITEM TARGET MODAL
          ================================================== */}

      {itemTargetOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0">
          <div className={`w-full max-w-md rounded-[26px] border p-5 shadow-2xl ${cardClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[9px] font-black uppercase tracking-[0.25em] ${mutedClass}`}>ITEM</p>
                <h2 className="mt-1 break-words text-xl font-black">{selectedItemName || (isVietnamese ? "Sử dụng vật phẩm" : "Use item")}</h2>
              </div>
              <button type="button" onClick={() => { setItemTargetOpen(false); setSelectedItemId(null); setSelectedTargetPlayerId(null); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/10 text-xl">×</button>
            </div>

            {inventoryError && (
              <p className="mt-4 rounded-xl border border-[#795047] bg-[#291d1a] px-3 py-2 text-xs leading-5 text-[#d7bbb1]">{inventoryError}</p>
            )}

            <p className={`mt-5 text-sm ${mutedClass}`}>
              {isVietnamese ? "Bạn muốn dùng vật phẩm cho ai?" : "Who should receive the item effect?"}
            </p>

            <div className="mt-3 grid gap-2">
              <button type="button" disabled={itemActionLoading} onClick={() => void executeItemUse("self")} className="flex min-h-12 items-center gap-3 rounded-2xl border border-current/10 px-4 text-left font-black transition active:scale-[0.985] disabled:opacity-50">
                <span className="text-xl">🧍</span>
                <span>{isVietnamese ? "Dùng cho bản thân" : "Use on yourself"}</span>
              </button>

              <div className="rounded-2xl border border-current/10 p-3">
                <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${mutedClass}`}>{isVietnamese ? "DÙNG CHO NGƯỜI KHÁC" : "USE ON ANOTHER PLAYER"}</p>
                <div className="mt-2 grid gap-2">
                  {otherPlayers.length === 0 ? (
                    <p className={`py-2 text-xs ${mutedClass}`}>{isVietnamese ? "Không có người chơi khác." : "No other players."}</p>
                  ) : (
                    otherPlayers.map((player) => (
                      <button key={player.id} type="button" disabled={itemActionLoading} onClick={() => { setSelectedTargetPlayerId(player.id); void executeItemUse("player", player.id); }} className="flex min-h-11 items-center justify-between rounded-xl border border-current/10 px-3 text-left text-sm font-bold disabled:opacity-50">
                        <span className="truncate">🤝 {player.player_name}</span>
                        <span className={`text-[10px] ${mutedClass}`}>HP {toNumber(player.hp, 0)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedItemCanSideQuest && (
                <button type="button" disabled={itemActionLoading} onClick={() => void executeItemUse("sidequest")} className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#b69c57]/40 bg-[#b69c57]/10 px-4 text-left font-black text-[#b69c57] disabled:opacity-50">
                  <span className="text-xl">📜</span>
                  <span>{isVietnamese ? "Mở Side Quest" : "Open Side Quest"}</span>
                </button>
              )}
            </div>

            {itemActionLoading && (
              <div className={`mt-4 flex items-center justify-center gap-2 text-xs ${mutedClass}`}>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {isVietnamese ? "Đang xử lý..." : "Processing..."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================
          END GAME OVERLAY
          ================================================== */}

      <EndGameOverlay
        visible={
          developerWinOverlay !==
          null
            ? true
            : undefined
        }
        forced={
          developerWinOverlay !==
          null
            ? false
            : undefined
        }
        message={
          developerWinOverlay?.message
        }
        playerName={
          developerWinOverlay?.playerName
        }
        money={
          developerWinOverlay?.money
        }
        hp={
          developerWinOverlay?.hp
        }
        location={
          developerWinOverlay?.location
        }
        rounds={
          developerWinOverlay?.rounds
        }
      />
    </>
  );
}