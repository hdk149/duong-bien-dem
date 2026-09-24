/* =========================================================
   ITEM USE ENGINE
   Đường Biên Đêm

   3 chức năng độc lập:

   🧍 self
   🤝 player
   📜 sidequest

   File này là bộ điều phối.
   Chưa trực tiếp thao tác Supabase.
========================================================= */

import type {
  ItemUseTarget,
  ItemUseContext,
  ItemUseResult,
  UseItemInput,
} from "./types";

import {
  getGameItem,
} from "./data";

import {
  useItemOnSelf,
} from "./self-use";

import {
  useItemOnPlayer,
} from "./team-use";

import {
  prepareSidequestTrigger,
} from "./sidequests";

/* =========================================================
   TYPES
========================================================= */

export type UseItemEngineResult = ItemUseResult & {
  target: ItemUseTarget;
};

/* =========================================================
   TARGET VALIDATION
========================================================= */

/**
 * Kiểm tra target có phải target hợp lệ không.
 */
export function isValidItemTarget(
  target: string,
): target is ItemUseTarget {
  return (
    target === "self" ||
    target === "player" ||
    target === "sidequest"
  );
}

/**
 * Kiểm tra item có hỗ trợ target tương ứng không.
 */
export function itemSupportsTarget(
  itemId: string,
  target: ItemUseTarget,
): boolean {
  const item = getGameItem(itemId);

  if (!item) {
    return false;
  }

  switch (target) {
    case "self":
      return Boolean(item.selfUse);

    case "player":
      return Boolean(item.playerUse);

    case "sidequest":
      return Boolean(item.sidequestUse);

    default:
      return false;
  }
}

/* =========================================================
   CONTEXT BUILDER
========================================================= */

/**
 * Chuyển UseItemInput thành ItemUseContext.
 */
export function buildItemUseContext(
  input: UseItemInput,
): ItemUseContext {
  return {
    roomId: input.roomId,

    playerId: input.playerId,

    targetPlayerId:
      input.targetPlayerId,

    round: input.round,

    source: input.source,

    referenceId:
      input.referenceId,
  };
}

/* =========================================================
   SIDEQUEST RESULT
========================================================= */

/**
 * Xử lý riêng target = sidequest.
 */
function useItemForSidequest(
  input: UseItemInput,
): UseItemEngineResult {
  const result =
    prepareSidequestTrigger(
      input.itemId,
    );

  if (!result.success) {
    return {
      success: false,

      itemId: input.itemId,

      target: "sidequest",

      playerId: input.playerId,

      consumed: false,

      message: result.message,
    };
  }

  const item = result.item!;
  const sidequest = result.sidequest!;

  return {
    success: true,

    itemId: item.id,

    target: "sidequest",

    playerId: input.playerId,

    consumed:
      item.sidequestUse?.consume ?? false,

    sidequestId: sidequest.id,

    message:
      `Đã kích hoạt Sidequest "${sidequest.name}".`,
  };
}

/* =========================================================
   SELF
========================================================= */

/**
 * Xử lý target = self.
 */
function useItemForSelf(
  input: UseItemInput,
): UseItemEngineResult {
  const context =
    buildItemUseContext(input);

  return useItemOnSelf(
    input.itemId,
    context,
  );
}

/* =========================================================
   PLAYER
========================================================= */

/**
 * Xử lý target = player.
 */
function useItemForPlayer(
  input: UseItemInput,
): UseItemEngineResult {
  const context =
    buildItemUseContext(input);

  return useItemOnPlayer(
    input.itemId,
    context,
  );
}

/* =========================================================
   MAIN ENGINE
========================================================= */

/**
 * Hàm chính của Item Engine.
 *
 * Đây là entry point mà API sau này sẽ gọi.
 *
 * Ví dụ:
 *
 * useItem({
 *   itemId: "first_aid_kit",
 *   target: "self",
 *   roomId,
 *   playerId,
 * });
 *
 * hoặc:
 *
 * useItem({
 *   itemId: "first_aid_kit",
 *   target: "player",
 *   targetPlayerId: "player-2",
 *   roomId,
 *   playerId,
 * });
 *
 * hoặc:
 *
 * useItem({
 *   itemId: "old_map",
 *   target: "sidequest",
 *   roomId,
 *   playerId,
 * });
 */
export function useItem(
  input: UseItemInput,
): UseItemEngineResult {
  /* -------------------------------------------------------
     BASIC VALIDATION
  ------------------------------------------------------- */

  if (!input.itemId) {
    return {
      success: false,

      itemId: "",

      target: input.target,

      playerId: input.playerId,

      consumed: false,

      message:
        "Thiếu itemId.",
    };
  }

  if (!input.roomId) {
    return {
      success: false,

      itemId: input.itemId,

      target: input.target,

      playerId: input.playerId,

      consumed: false,

      message:
        "Thiếu roomId.",
    };
  }

  if (!input.playerId) {
    return {
      success: false,

      itemId: input.itemId,

      target: input.target,

      playerId: "",

      consumed: false,

      message:
        "Thiếu playerId.",
    };
  }

  /* -------------------------------------------------------
     TARGET VALIDATION
  ------------------------------------------------------- */

  if (!isValidItemTarget(input.target)) {
    return {
      success: false,

      itemId: input.itemId,

      target: input.target as ItemUseTarget,

      playerId: input.playerId,

      consumed: false,

      message:
        `Target "${input.target}" không hợp lệ.`,
    };
  }

  /* -------------------------------------------------------
     ITEM VALIDATION
  ------------------------------------------------------- */

  const item =
    getGameItem(input.itemId);

  if (!item) {
    return {
      success: false,

      itemId: input.itemId,

      target: input.target,

      playerId: input.playerId,

      consumed: false,

      message:
        `Không tìm thấy item "${input.itemId}".`,
    };
  }

  /* -------------------------------------------------------
     TARGET SUPPORT VALIDATION
  ------------------------------------------------------- */

  if (
    !itemSupportsTarget(
      item.id,
      input.target,
    )
  ) {
    return {
      success: false,

      itemId: item.id,

      target: input.target,

      playerId: input.playerId,

      consumed: false,

      message:
        `${item.name} không hỗ trợ chức năng "${input.target}".`,
    };
  }

  /* -------------------------------------------------------
     ROUTE TO CORRECT ENGINE
  ------------------------------------------------------- */

  switch (input.target) {
    case "self":
      return useItemForSelf(input);

    case "player":
      return useItemForPlayer(input);

    case "sidequest":
      return useItemForSidequest(input);

    default:
      return {
        success: false,

        itemId: item.id,

        target: input.target,

        playerId: input.playerId,

        consumed: false,

        message:
          "Không xác định được cách sử dụng item.",
      };
  }
}

/* =========================================================
   CONVENIENCE FUNCTIONS
========================================================= */

/**
 * Dùng item cho bản thân.
 */
export function useItemSelf(
  input: Omit<
    UseItemInput,
    "target"
  >,
): UseItemEngineResult {
  return useItem({
    ...input,
    target: "self",
  });
}

/**
 * Dùng item cho player khác.
 */
export function useItemPlayer(
  input: Omit<
    UseItemInput,
    "target"
  >,
): UseItemEngineResult {
  return useItem({
    ...input,
    target: "player",
  });
}

/**
 * Dùng item để mở Sidequest.
 */
export function useItemSidequest(
  input: Omit<
    UseItemInput,
    "target"
  >,
): UseItemEngineResult {
  return useItem({
    ...input,
    target: "sidequest",
  });
}

/* =========================================================
   TARGET LIST
========================================================= */

/**
 * Lấy các chức năng mà item hỗ trợ.
 *
 * UI inventory có thể dùng hàm này để biết
 * nên hiển thị nút nào.
 */
export function getAvailableItemTargets(
  itemId: string,
): ItemUseTarget[] {
  const item =
    getGameItem(itemId);

  if (!item) {
    return [];
  }

  const targets: ItemUseTarget[] = [];

  if (item.selfUse) {
    targets.push("self");
  }

  if (item.playerUse) {
    targets.push("player");
  }

  if (item.sidequestUse) {
    targets.push("sidequest");
  }

  return targets;
}

/* =========================================================
   UI HELPERS
========================================================= */

/**
 * Tên hiển thị của target.
 */
export function getItemTargetLabel(
  target: ItemUseTarget,
): string {
  switch (target) {
    case "self":
      return "Dùng cho bản thân";

    case "player":
      return "Dùng cho người chơi khác";

    case "sidequest":
      return "Mở Sidequest";

    default:
      return "Không xác định";
  }
}

/**
 * Icon của target.
 */
export function getItemTargetIcon(
  target: ItemUseTarget,
): string {
  switch (target) {
    case "self":
      return "🧍";

    case "player":
      return "🤝";

    case "sidequest":
      return "📜";

    default:
      return "❔";
  }
}

/**
 * Lấy danh sách action hoàn chỉnh cho UI.
 */
export function getItemActions(
  itemId: string,
) {
  return getAvailableItemTargets(
    itemId,
  ).map((target) => ({
    target,

    label:
      getItemTargetLabel(target),

    icon:
      getItemTargetIcon(target),
  }));
}