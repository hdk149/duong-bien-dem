"use client";

import { useEffect, useMemo, useState } from "react";

import SideQuestConfirm from "./SideQuestConfirm";

type ItemTarget =
  | "self"
  | "player"
  | "sidequest";

type InventoryItem = {
  id: string;
  item_id: string;
  quantity: number;
  acquired_at?: string;
  updated_at?: string;
};

type ItemDefinition = {
  id: string;
  category: string;
  name: string;
  name_en?: string | null;
  description?: string | null;
  description_en?: string | null;
  icon?: string | null;
};

type InventoryEntry = InventoryItem & {
  item: ItemDefinition | null;
};

type RoomPlayer = {
  id: string;
  player_name: string;
  role?: string | null;
  moderation_status?: string | null;
  is_self?: boolean;
  is_connected?: boolean;
};

type InventoryModalProps = {
  code: string;
  playerToken: string;
  open: boolean;
  onClose: () => void;
  onQuestCreated?: (quest: unknown) => void;
};

type ActionItem = {
  target: ItemTarget;
  label: string;
  icon: string;
};

export default function InventoryModal({
  code,
  playerToken,
  open,
  onClose,
  onQuestCreated,
}: InventoryModalProps) {
  const [items, setItems] = useState<
    InventoryEntry[]
  >([]);

  const [players, setPlayers] =
    useState<RoomPlayer[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [loadingPlayers, setLoadingPlayers] =
    useState(false);

  const [usingItemId, setUsingItemId] =
    useState<string | null>(null);

  const [selectedItem, setSelectedItem] =
    useState<InventoryEntry | null>(null);

  const [selectedTarget, setSelectedTarget] =
    useState<ItemTarget | null>(null);

  const [selectedPlayerId, setSelectedPlayerId] =
    useState<string | null>(null);

  const [confirmItem, setConfirmItem] =
    useState<InventoryEntry | null>(null);

  const [error, setError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  /* =========================================================
     LOAD INVENTORY
  ========================================================= */

  async function loadInventory() {
    if (!code || !playerToken) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/rooms/" +
          encodeURIComponent(code) +
          "/inventory",
        {
          method: "GET",
          headers: {
            "x-player-token": playerToken,
          },
          cache: "no-store",
        },
      );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Không thể tải túi đồ.",
        );
      }

      const rawItems =
        Array.isArray(data?.inventory)
          ? data.inventory
          : Array.isArray(data?.items)
            ? data.items
            : [];

      const normalized: InventoryEntry[] =
        rawItems.map(
          (entry: any) => ({
            id: entry.id,
            item_id: entry.item_id,
            quantity:
              entry.quantity ?? 1,
            acquired_at:
              entry.acquired_at,
            updated_at:
              entry.updated_at,
            item:
              entry.item ??
              entry.item_definition ??
              entry.item_definitions ??
              null,
          }),
        );

      setItems(normalized);
    } catch (err) {
      console.error(
        "Inventory load error:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải túi đồ.",
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     LOAD ROOM PLAYERS
  ========================================================= */

  async function loadPlayers() {
    if (!code || !playerToken) {
      return;
    }

    setLoadingPlayers(true);

    try {
      const response = await fetch(
        "/api/rooms/" +
          encodeURIComponent(code) +
          "/players",
        {
          method: "GET",
          headers: {
            "x-player-token":
              playerToken,
          },
          cache: "no-store",
        },
      );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Không thể tải danh sách người chơi.",
        );
      }

      const rawPlayers =
        Array.isArray(data?.players)
          ? data.players
          : [];

      const normalized: RoomPlayer[] =
        rawPlayers.filter(
          (player: any) =>
            player?.id &&
            player?.player_name,
        );

      setPlayers(normalized);
    } catch (err) {
      console.error(
        "Players load error:",
        err,
      );

      /*
       * Không âm thầm biến lỗi API thành
       * "không có người chơi".
       */
      setPlayers([]);

      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách người chơi.",
      );
    } finally {
      setLoadingPlayers(false);
    }
  }

  /* =========================================================
     OPEN
  ========================================================= */

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadInventory();
    void loadPlayers();

    setSelectedItem(null);
    setSelectedTarget(null);
    setSelectedPlayerId(null);
    setConfirmItem(null);
    setError("");
    setSuccessMessage("");
  }, [
    open,
    code,
    playerToken,
  ]);

  /* =========================================================
     OTHER ACTIVE PLAYERS
     
     IMPORTANT:
     - Không lấy chính mình.
     - Không lấy spectator.
     - Không lấy kicked / banned.
  ========================================================= */

  const otherPlayers = useMemo(() => {
    return players.filter(
      (player) => {
        if (!player.id) {
          return false;
        }

        if (player.is_self) {
          return false;
        }

        if (
          player.role ===
          "spectator"
        ) {
          return false;
        }

        if (
          player.moderation_status ===
            "banned" ||
          player.moderation_status ===
            "kicked"
        ) {
          return false;
        }

        return true;
      },
    );
  }, [players]);

  /* =========================================================
     ITEM ACTIONS
     
     Có 3 action độc lập:
     
     🧍 self
     🤝 player
     📜 sidequest
  ========================================================= */

  function getItemActions(
    item: InventoryEntry,
  ): ActionItem[] {
    const actions: ActionItem[] = [
      {
        target: "self",
        label: "Dùng cho bản thân",
        icon: "🧍",
      },
      {
        target: "player",
        label: "Dùng cho người khác",
        icon: "🤝",
      },
    ];

    /*
     * Các item hiện có sidequest.
     *
     * Server vẫn là nơi validation cuối cùng.
     */
    if (
      [
        "first_aid_kit",
        "old_map",
        "old_key",
        "old_radio",
        "old_envelope",
      ].includes(
        item.item_id,
      )
    ) {
      actions.push({
        target: "sidequest",
        label: "Mở Sidequest",
        icon: "📜",
      });
    }

    return actions;
  }

  /* =========================================================
     SELECT ITEM
  ========================================================= */

  function requestUseItem(
    item: InventoryEntry,
  ) {
    if (usingItemId) {
      return;
    }

    setError("");
    setSuccessMessage("");

    setSelectedItem(item);
    setSelectedTarget(null);
    setSelectedPlayerId(null);
    setConfirmItem(null);
  }

  /* =========================================================
     SELECT TARGET
  ========================================================= */

  function selectTarget(
    target: ItemTarget,
  ) {
    if (!selectedItem) {
      return;
    }

    setError("");
    setSuccessMessage("");

    if (target === "player") {
      /*
       * Reload player list ngay lúc mở selector.
       * Điều này giúp room 2 người realtime hơn
       * nếu người thứ hai vừa join.
       */
      setSelectedTarget(
        "player",
      );

      setSelectedPlayerId(null);
      setConfirmItem(null);

      void loadPlayers();

      return;
    }

    if (target === "sidequest") {
      setSelectedTarget(
        "sidequest",
      );

      setSelectedPlayerId(null);

      setConfirmItem(
        selectedItem,
      );

      return;
    }

    setSelectedTarget("self");
    setSelectedPlayerId(null);

    setConfirmItem(
      selectedItem,
    );
  }

  /* =========================================================
     SELECT PLAYER
  ========================================================= */

  function selectPlayer(
    playerId: string,
  ) {
    if (!selectedItem) {
      return;
    }

    /*
     * Không cho phép chọn chính mình.
     */
    const targetPlayer =
      otherPlayers.find(
        (player) =>
          player.id ===
          playerId,
      );

    if (!targetPlayer) {
      setError(
        "Người chơi này không thể nhận vật phẩm.",
      );

      return;
    }

    setError("");

    setSelectedPlayerId(
      playerId,
    );

    setSelectedTarget(
      "player",
    );

    setConfirmItem(
      selectedItem,
    );
  }

  /* =========================================================
     EXECUTE ITEM
  ========================================================= */

  async function confirmUseItem() {
    if (!selectedItem) {
      return;
    }

    if (!selectedTarget) {
      return;
    }

    if (
      selectedTarget ===
        "player" &&
      !selectedPlayerId
    ) {
      setError(
        "Hãy chọn người chơi mục tiêu.",
      );

      return;
    }

    /*
     * Double-check target player
     * trước khi gửi request.
     */
    if (
      selectedTarget ===
        "player"
    ) {
      const targetExists =
        otherPlayers.some(
          (player) =>
            player.id ===
            selectedPlayerId,
        );

      if (!targetExists) {
        setError(
          "Người chơi mục tiêu không còn khả dụng.",
        );

        return;
      }
    }

    const item =
      selectedItem;

    setUsingItemId(
      item.item_id,
    );

    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        "/api/rooms/" +
          encodeURIComponent(code) +
          "/items/use",
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
              item.item_id,

            target:
              selectedTarget,

            targetPlayerId:
              selectedPlayerId,
          }),
        },
      );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.result?.message ||
            "Không thể sử dụng vật phẩm.",
        );
      }

      const result =
        data?.result;

      if (
        !result?.success
      ) {
        throw new Error(
          result?.message ||
            "Không thể sử dụng vật phẩm.",
        );
      }

      /* -----------------------------------------------------
         SIDEQUEST
      ----------------------------------------------------- */

      if (
        selectedTarget ===
          "sidequest" &&
        result.sidequestId
      ) {
        onQuestCreated?.({
          id:
            result.sidequestId,
        });

        setSuccessMessage(
          result.message ||
            "Sidequest đã được kích hoạt.",
        );
      } else if (
        selectedTarget ===
        "player"
      ) {
        const targetName =
          otherPlayers.find(
            (player) =>
              player.id ===
              selectedPlayerId,
          )?.player_name;

        setSuccessMessage(
          result.message ||
            (
              targetName
                ? `Đã sử dụng vật phẩm cho ${targetName}.`
                : "Đã sử dụng vật phẩm cho người chơi."),
        );
      } else {
        setSuccessMessage(
          result.message ||
            "Đã sử dụng vật phẩm.",
        );
      }

      /* -----------------------------------------------------
         REFRESH INVENTORY
      ----------------------------------------------------- */

      await loadInventory();

      /*
       * Close selection/confirmation UI.
       */
      setConfirmItem(null);
      setSelectedItem(null);
      setSelectedTarget(null);
      setSelectedPlayerId(null);

      /*
       * Sidequest page.
       */
      if (
        selectedTarget ===
        "sidequest"
      ) {
        window.setTimeout(() => {
          window.location.href =
            "/game/" +
            code +
            "/side-quest";
        }, 250);
      }
    } catch (err) {
      console.error(
        "Inventory use error:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Không thể sử dụng vật phẩm.",
      );
    } finally {
      setUsingItemId(null);
    }
  }

  /* =========================================================
     CANCEL
  ========================================================= */

  function cancelSelection() {
    if (usingItemId) {
      return;
    }

    setSelectedItem(null);
    setSelectedTarget(null);
    setSelectedPlayerId(null);
    setConfirmItem(null);
    setError("");
  }

  function cancelConfirm() {
    if (usingItemId) {
      return;
    }

    setConfirmItem(null);
  }

  /* =========================================================
     SELECTED ITEM
  ========================================================= */

  const selectedItemDefinition =
    selectedItem?.item ??
    null;

  const selectedPlayer =
    useMemo(
      () =>
        otherPlayers.find(
          (player) =>
            player.id ===
            selectedPlayerId,
        ) ?? null,
      [
        otherPlayers,
        selectedPlayerId,
      ],
    );

  /* =========================================================
     CLOSED
  ========================================================= */

  if (!open) {
    return null;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <>
      {/* =====================================================
          INVENTORY MODAL
      ===================================================== */}

      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#171411] shadow-2xl"
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          {/* -------------------------------------------------
              HEADER
          ------------------------------------------------- */}

          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-lg font-bold text-white">
                🎒 Túi đồ
              </h2>

              <p className="mt-0.5 text-xs text-white/45">
                Vật phẩm bạn đang mang theo
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-lg text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Đóng"
            >
              ×
            </button>
          </div>

          {/* -------------------------------------------------
              BODY
          ------------------------------------------------- */}

          <div className="max-h-[70vh] overflow-y-auto p-3 sm:max-h-[600px]">
            {loading ? (
              <div className="flex min-h-[180px] items-center justify-center text-sm text-white/45">
                Đang mở túi đồ...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
                <p>
                  {error}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    void loadInventory();
                    void loadPlayers();
                  }}
                  className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/15"
                >
                  Thử lại
                </button>
              </div>
            ) : items.length ===
              0 ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
                <div className="text-4xl">
                  🎒
                </div>

                <p className="mt-3 text-sm font-medium text-white/70">
                  Túi đồ đang trống
                </p>

                <p className="mt-1 max-w-xs text-xs text-white/35">
                  Bạn có thể tìm hoặc mua thêm vật phẩm trong
                  hành trình.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {items.map(
                  (entry) => {
                    const item =
                      entry.item;

                    const name =
                      item?.name ||
                      entry.item_id;

                    const description =
                      item?.description ||
                      "Một vật phẩm có thể được sử dụng trong hành trình.";

                    const icon =
                      item?.icon ||
                      "📦";

                    const isUsing =
                      usingItemId ===
                      entry.item_id;

                    return (
                      <div
                        key={
                          entry.id ||
                          entry.item_id
                        }
                        className="rounded-xl border border-white/10 bg-white/[0.035] p-3"
                      >
                        <div className="flex gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/25 text-2xl">
                            {icon}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-semibold text-white">
                                  {name}
                                </h3>

                                {item?.category && (
                                  <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-white/35">
                                    {
                                      item.category
                                    }
                                  </span>
                                )}
                              </div>

                              <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/65">
                                ×
                                {
                                  entry.quantity
                                }
                              </span>
                            </div>

                            <p className="mt-1.5 text-xs leading-relaxed text-white/45">
                              {
                                description
                              }
                            </p>

                            <button
                              type="button"
                              disabled={
                                isUsing
                              }
                              onClick={() =>
                                requestUseItem(
                                  entry,
                                )
                              }
                              className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-white/[0.12] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isUsing
                                ? "Đang sử dụng..."
                                : "USE"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================
          ACTION SELECTOR
      ===================================================== */}

      {selectedItem && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0"
          onClick={
            cancelSelection
          }
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#171411] shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="border-b border-white/10 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/30 text-2xl">
                  {
                    selectedItemDefinition?.icon ||
                    "📦"
                  }
                </div>

                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-white">
                    {
                      selectedItemDefinition?.name ||
                      selectedItem.item_id
                    }
                  </h3>

                  <p className="mt-0.5 text-xs text-white/40">
                    Chọn cách sử dụng
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 p-3">
              {getItemActions(
                selectedItem,
              ).map(
                (action) => (
                  <button
                    key={
                      action.target
                    }
                    type="button"
                    disabled={
                      Boolean(
                        usingItemId,
                      )
                    }
                    onClick={() =>
                      selectTarget(
                        action.target,
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.09] active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="text-xl">
                      {
                        action.icon
                      }
                    </span>

                    <span className="text-sm font-semibold text-white">
                      {
                        action.label
                      }
                    </span>
                  </button>
                ),
              )}

              <button
                type="button"
                onClick={
                  cancelSelection
                }
                className="mt-2 w-full rounded-xl bg-white/5 px-4 py-3 text-xs font-semibold text-white/55 transition hover:bg-white/10 hover:text-white"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          PLAYER SELECTOR
      ===================================================== */}

      {selectedItem &&
        selectedTarget ===
          "player" &&
        !confirmItem && (
          <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0"
            onClick={
              cancelSelection
            }
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#171411] shadow-2xl"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <div className="border-b border-white/10 px-4 py-4">
                <h3 className="text-base font-bold text-white">
                  🤝 Chọn người chơi
                </h3>

                <p className="mt-1 text-xs text-white/40">
                  Chọn người nhận vật phẩm.
                </p>
              </div>

              <div className="max-h-[55vh] overflow-y-auto p-3">
                {loadingPlayers ? (
                  <div className="py-10 text-center text-sm text-white/40">
                    Đang tìm người chơi...
                  </div>
                ) : otherPlayers.length ===
                  0 ? (
                  <div className="py-10 text-center">
                    <div className="text-3xl">
                      👥
                    </div>

                    <p className="mt-3 text-sm text-white/60">
                      Không có người chơi khác.
                    </p>

                    <p className="mt-1 text-xs text-white/30">
                      Cần ít nhất 2 người chơi trong phòng.
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        void loadPlayers()
                      }
                      className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                    >
                      Làm mới
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {otherPlayers.map(
                      (player) => (
                        <button
                          key={
                            player.id
                          }
                          type="button"
                          onClick={() =>
                            selectPlayer(
                              player.id,
                            )
                          }
                          className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.09] active:scale-[0.99]"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm">
                            👤
                          </div>

                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-white">
                              {
                                player.player_name
                              }
                            </span>

                            {player.role ===
                              "host" && (
                              <span className="mt-0.5 block text-[10px] text-white/35">
                                Host
                              </span>
                            )}
                          </div>

                          {player.is_connected ===
                            false && (
                            <span className="text-[10px] text-white/30">
                              Offline
                            </span>
                          )}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 p-3">
                <button
                  type="button"
                  onClick={
                    cancelSelection
                  }
                  className="w-full rounded-xl bg-white/5 px-4 py-3 text-xs font-semibold text-white/55 transition hover:bg-white/10 hover:text-white"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}

      {/* =====================================================
          CONFIRM SELF / PLAYER
      ===================================================== */}

      {confirmItem &&
        selectedTarget !==
          "sidequest" && (
          <div
            className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 px-3 pb-3 sm:items-center sm:px-4 sm:pb-0"
            onClick={
              cancelConfirm
            }
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#171411] shadow-2xl"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <div className="p-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-black/30 text-3xl">
                  {
                    selectedItemDefinition?.icon ||
                    "📦"
                  }
                </div>

                <h3 className="mt-3 text-base font-bold text-white">
                  Xác nhận sử dụng
                </h3>

                <p className="mt-2 text-sm text-white/55">
                  {
                    selectedItemDefinition?.name ||
                    selectedItem?.item_id
                  }
                </p>

                {selectedTarget ===
                  "player" &&
                  selectedPlayer && (
                    <p className="mt-2 text-xs text-white/40">
                      Gửi cho{" "}
                      <span className="font-semibold text-white/70">
                        {
                          selectedPlayer.player_name
                        }
                      </span>
                    </p>
                  )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={
                      Boolean(
                        usingItemId,
                      )
                    }
                    onClick={
                      cancelConfirm
                    }
                    className="rounded-xl bg-white/5 px-4 py-3 text-xs font-semibold text-white/60 transition hover:bg-white/10"
                  >
                    Hủy
                  </button>

                  <button
                    type="button"
                    disabled={
                      Boolean(
                        usingItemId,
                      )
                    }
                    onClick={() =>
                      void confirmUseItem()
                    }
                    className="rounded-xl bg-white/10 px-4 py-3 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50"
                  >
                    {usingItemId
                      ? "Đang dùng..."
                      : "Xác nhận"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* =====================================================
          SIDEQUEST CONFIRM
      ===================================================== */}

      <SideQuestConfirm
        open={
          Boolean(
            confirmItem &&
              selectedTarget ===
                "sidequest",
          )
        }
        itemName={
          selectedItemDefinition?.name ||
          confirmItem?.item_id ||
          "vật phẩm"
        }
        itemIcon={
          selectedItemDefinition?.icon
        }
        loading={
          Boolean(
            usingItemId,
          )
        }
        onCancel={
          cancelConfirm
        }
        onConfirm={() =>
          void confirmUseItem()
        }
      />
    </>
  );
}