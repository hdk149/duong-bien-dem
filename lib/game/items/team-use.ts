/* =========================================================
   TEAM / PLAYER ITEM USE
   Đường Biên Đêm

   Chức năng:
   🤝 Dùng item cho một người chơi khác

   Không xử lý:
   🧍 Dùng cho bản thân
   📜 Mở Sidequest
   💾 Database / Supabase
========================================================= */

import type {
  ItemDefinition,
  ItemPlayerUse,
  ItemStatEffect,
  ItemTravelEffect,
  ItemRelationshipEffect,
  ItemUseContext,
  ItemUseResult,
} from "./types";

import {
  getGameItem,
} from "./data";

/* =========================================================
   TYPES
========================================================= */

export type PlayerUseResult = ItemUseResult & {
  target: "player";
};

/* =========================================================
   VALIDATION
========================================================= */

/**
 * Kiểm tra item có chức năng dùng cho player khác hay không.
 */
export function canUseItemOnPlayer(
  itemId: string,
): boolean {
  const item = getGameItem(itemId);

  if (!item) {
    return false;
  }

  return Boolean(item.playerUse);
}

/**
 * Lấy player-use definition của item.
 */
export function getPlayerUseDefinition(
  itemId: string,
): ItemPlayerUse | undefined {
  const item = getGameItem(itemId);

  return item?.playerUse;
}

/**
 * Kiểm tra targetPlayerId có tồn tại trong context.
 *
 * Việc kiểm tra target có thật sự tồn tại trong room
 * sẽ được thực hiện ở API / database layer sau.
 */
export function hasTargetPlayer(
  context: ItemUseContext,
): boolean {
  return Boolean(
    context.targetPlayerId &&
      context.targetPlayerId.trim().length > 0,
  );
}

/**
 * Không cho player tự target chính mình.
 */
export function isSelfTarget(
  context: ItemUseContext,
): boolean {
  if (!context.targetPlayerId) {
    return false;
  }

  return (
    context.playerId ===
    context.targetPlayerId
  );
}

/* =========================================================
   EFFECT HELPERS
========================================================= */

/**
 * Lấy stat effect khi dùng cho player khác.
 */
export function getPlayerStatEffect(
  item: ItemDefinition,
): ItemStatEffect | undefined {
  return item.playerUse?.statEffect;
}

/**
 * Lấy travel effect khi dùng cho player khác.
 */
export function getPlayerTravelEffect(
  item: ItemDefinition,
): ItemTravelEffect | undefined {
  return item.playerUse?.travelEffect;
}

/**
 * Lấy relationship effect khi dùng cho player khác.
 */
export function getPlayerRelationshipEffect(
  item: ItemDefinition,
): ItemRelationshipEffect | undefined {
  return item.playerUse?.relationshipEffect;
}

/* =========================================================
   EFFECT VALIDATION
========================================================= */

/**
 * Kiểm tra item có gameplay effect khi dùng
 * cho player khác hay không.
 */
export function hasPlayerEffect(
  item: ItemDefinition,
): boolean {
  const playerUse = item.playerUse;

  if (!playerUse) {
    return false;
  }

  return Boolean(
    playerUse.statEffect ||
      playerUse.travelEffect ||
      playerUse.relationshipEffect,
  );
}

/**
 * Kiểm tra item có hiệu ứng HP.
 */
export function hasPlayerHpEffect(
  item: ItemDefinition,
): boolean {
  return Boolean(
    item.playerUse?.statEffect?.hp,
  );
}

/**
 * Kiểm tra item có hiệu ứng tiền.
 */
export function hasPlayerMoneyEffect(
  item: ItemDefinition,
): boolean {
  return Boolean(
    item.playerUse?.statEffect?.money,
  );
}

/**
 * Kiểm tra item có hiệu ứng travel.
 */
export function hasPlayerTravelEffect(
  item: ItemDefinition,
): boolean {
  return Boolean(
    item.playerUse?.travelEffect,
  );
}

/**
 * Kiểm tra item có relationship effect.
 */
export function hasPlayerRelationshipEffect(
  item: ItemDefinition,
): boolean {
  return Boolean(
    item.playerUse?.relationshipEffect,
  );
}

/* =========================================================
   RESULT BUILDER
========================================================= */

/**
 * Tạo kết quả dùng item cho player khác.
 *
 * Chỉ tạo gameplay result.
 * Chưa thay đổi database.
 */
export function buildPlayerUseResult(
  item: ItemDefinition,
  context: ItemUseContext,
): PlayerUseResult {
  const playerUse = item.playerUse;

  return {
    success: true,

    itemId: item.id,

    target: "player",

    playerId: context.playerId,

    targetPlayerId:
      context.targetPlayerId,

    consumed: playerUse.consume,

    statEffect: playerUse.statEffect,

    travelEffect:
      playerUse.travelEffect,

    relationshipEffect:
      playerUse.relationshipEffect,

    message: playerUse.description,
  };
}

/* =========================================================
   MAIN PLAYER-USE FUNCTION
========================================================= */

/**
 * Dùng item cho một người chơi khác.
 *
 * Flow:
 *
 * player A
 *   ↓
 * chọn item
 *   ↓
 * chọn player B
 *   ↓
 * validate
 *   ↓
 * trả gameplay result
 *
 * Chưa:
 * - kiểm tra inventory DB
 * - update player B
 * - consume item
 * - ghi log
 */
export function useItemOnPlayer(
  itemId: string,
  context: ItemUseContext,
): PlayerUseResult {
  const item = getGameItem(itemId);

  /* -------------------------------------------------------
     ITEM NOT FOUND
  ------------------------------------------------------- */

  if (!item) {
    return {
      success: false,

      itemId,

      target: "player",

      playerId: context.playerId,

      targetPlayerId:
        context.targetPlayerId,

      consumed: false,

      message:
        `Không tìm thấy item "${itemId}".`,
    };
  }

  /* -------------------------------------------------------
     PLAYER USE NOT AVAILABLE
  ------------------------------------------------------- */

  if (!item.playerUse) {
    return {
      success: false,

      itemId: item.id,

      target: "player",

      playerId: context.playerId,

      targetPlayerId:
        context.targetPlayerId,

      consumed: false,

      message:
        `${item.name} không thể sử dụng cho người chơi khác.`,
    };
  }

  /* -------------------------------------------------------
     TARGET REQUIRED
  ------------------------------------------------------- */

  if (!hasTargetPlayer(context)) {
    return {
      success: false,

      itemId: item.id,

      target: "player",

      playerId: context.playerId,

      consumed: false,

      message:
        "Bạn phải chọn một người chơi khác.",
    };
  }

  /* -------------------------------------------------------
     SELF TARGET BLOCK
  ------------------------------------------------------- */

  if (isSelfTarget(context)) {
    return {
      success: false,

      itemId: item.id,

      target: "player",

      playerId: context.playerId,

      targetPlayerId:
        context.targetPlayerId,

      consumed: false,

      message:
        "Không thể dùng chức năng player để target chính mình.",
    };
  }

  /* -------------------------------------------------------
     BUILD RESULT
  ------------------------------------------------------- */

  return buildPlayerUseResult(
    item,
    context,
  );
}

/* =========================================================
   DISPLAY HELPERS
========================================================= */

/**
 * Lấy mô tả player-use để UI hiển thị.
 */
export function getPlayerUseDescription(
  itemId: string,
): string | null {
  const item = getGameItem(itemId);

  if (!item?.playerUse) {
    return null;
  }

  return item.playerUse.description;
}

/**
 * Kiểm tra item có consume khi dùng cho player khác.
 */
export function shouldConsumePlayerUse(
  itemId: string,
): boolean {
  const item = getGameItem(itemId);

  if (!item?.playerUse) {
    return false;
  }

  return item.playerUse.consume;
}

/* =========================================================
   EFFECT SUMMARY
========================================================= */

/**
 * Tạo summary effect cho UI/API.
 */
export function getPlayerEffectSummary(
  itemId: string,
) {
  const item = getGameItem(itemId);

  if (!item?.playerUse) {
    return null;
  }

  const stat =
    item.playerUse.statEffect;

  const travel =
    item.playerUse.travelEffect;

  const relationship =
    item.playerUse.relationshipEffect;

  return {
    hp: stat?.hp ?? 0,

    money: stat?.money ?? 0,

    legalRisk:
      stat?.legalRisk ?? 0,

    locationId:
      travel?.locationId ?? null,

    travelCostReduction:
      travel?.travelCostReduction ?? 0,

    travelRiskReduction:
      travel?.travelRiskReduction ?? 0,

    relationship:
      relationship?.relationship ?? 0,

    consume:
      item.playerUse.consume,
  };
}

/* =========================================================
   ITEM LIST
========================================================= */

/**
 * Lấy tất cả item có thể dùng cho player khác.
 */
export function getPlayerUseItems(): ItemDefinition[] {
  const {
    ITEMS,
  } = require("./data") as typeof import("./data");

  return ITEMS.filter(
    (item) => Boolean(item.playerUse),
  );
}