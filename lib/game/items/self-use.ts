/* =========================================================
   SELF ITEM USE
   Đường Biên Đêm

   Chức năng:
   🧍 Dùng item cho chính mình

   Không xử lý:
   🤝 Dùng cho player khác
   📜 Mở Sidequest
   💾 Database / Supabase
========================================================= */

import type {
  ItemDefinition,
  ItemSelfUse,
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

export type SelfUseResult = ItemUseResult & {
  target: "self";
};

/* =========================================================
   VALIDATION
========================================================= */

/**
 * Kiểm tra item có tồn tại và có chức năng self-use hay không.
 */
export function canUseItemOnSelf(
  itemId: string,
): boolean {
  const item = getGameItem(itemId);

  if (!item) {
    return false;
  }

  return Boolean(item.selfUse);
}

/**
 * Lấy self-use definition của item.
 */
export function getSelfUseDefinition(
  itemId: string,
): ItemSelfUse | undefined {
  const item = getGameItem(itemId);

  return item?.selfUse;
}

/* =========================================================
   EFFECT HELPERS
========================================================= */

/**
 * Lấy stat effect của self-use.
 */
export function getSelfStatEffect(
  item: ItemDefinition,
): ItemStatEffect | undefined {
  return item.selfUse?.statEffect;
}

/**
 * Lấy travel effect của self-use.
 */
export function getSelfTravelEffect(
  item: ItemDefinition,
): ItemTravelEffect | undefined {
  return item.selfUse?.travelEffect;
}

/**
 * Lấy relationship effect của self-use.
 */
export function getSelfRelationshipEffect(
  item: ItemDefinition,
): ItemRelationshipEffect | undefined {
  return item.selfUse?.relationshipEffect;
}

/* =========================================================
   EFFECT VALIDATION
========================================================= */

/**
 * Kiểm tra item có tạo ra bất kỳ gameplay effect nào không.
 */
export function hasSelfEffect(
  item: ItemDefinition,
): boolean {
  const selfUse = item.selfUse;

  if (!selfUse) {
    return false;
  }

  return Boolean(
    selfUse.statEffect ||
      selfUse.travelEffect ||
      selfUse.relationshipEffect,
  );
}

/**
 * Kiểm tra item có hiệu ứng HP hay không.
 */
export function hasSelfHpEffect(
  item: ItemDefinition,
): boolean {
  return Boolean(
    item.selfUse?.statEffect?.hp,
  );
}

/**
 * Kiểm tra item có hiệu ứng tiền hay không.
 */
export function hasSelfMoneyEffect(
  item: ItemDefinition,
): boolean {
  return Boolean(
    item.selfUse?.statEffect?.money,
  );
}

/**
 * Kiểm tra item có hiệu ứng di chuyển hay không.
 */
export function hasSelfTravelEffect(
  item: ItemDefinition,
): boolean {
  return Boolean(
    item.selfUse?.travelEffect,
  );
}

/**
 * Kiểm tra item có hiệu ứng relationship hay không.
 */
export function hasSelfRelationshipEffect(
  item: ItemDefinition,
): boolean {
  return Boolean(
    item.selfUse?.relationshipEffect,
  );
}

/* =========================================================
   RESULT BUILDER
========================================================= */

/**
 * Tạo kết quả dùng item cho bản thân.
 *
 * Hàm này chưa thay đổi player.
 * Nó chỉ tạo "gameplay instruction" để tầng phía trên
 * thực hiện thay đổi thật vào database.
 */
export function buildSelfUseResult(
  item: ItemDefinition,
  context: ItemUseContext,
): SelfUseResult {
  const selfUse = item.selfUse;

  return {
    success: true,

    itemId: item.id,

    target: "self",

    playerId: context.playerId,

    consumed: selfUse.consume,

    statEffect: selfUse.statEffect,

    travelEffect: selfUse.travelEffect,

    relationshipEffect:
      selfUse.relationshipEffect,

    message: selfUse.description,
  };
}

/* =========================================================
   MAIN SELF-USE FUNCTION
========================================================= */

/**
 * Dùng item cho chính mình.
 *
 * Đây là hàm chính mà use-items.ts sẽ gọi sau này.
 *
 * Hiện tại:
 * - kiểm tra item
 * - kiểm tra selfUse
 * - tạo kết quả
 *
 * Chưa:
 * - remove inventory
 * - update HP
 * - update money
 * - update location
 * - update DB
 */
export function useItemOnSelf(
  itemId: string,
  context: ItemUseContext,
): SelfUseResult {
  const item = getGameItem(itemId);

  /* -------------------------------------------------------
     ITEM NOT FOUND
  ------------------------------------------------------- */

  if (!item) {
    return {
      success: false,

      itemId,

      target: "self",

      playerId: context.playerId,

      consumed: false,

      message:
        `Không tìm thấy item "${itemId}".`,
    };
  }

  /* -------------------------------------------------------
     SELF USE NOT AVAILABLE
  ------------------------------------------------------- */

  if (!item.selfUse) {
    return {
      success: false,

      itemId: item.id,

      target: "self",

      playerId: context.playerId,

      consumed: false,

      message:
        `${item.name} không thể sử dụng cho bản thân.`,
    };
  }

  /* -------------------------------------------------------
     BUILD RESULT
  ------------------------------------------------------- */

  return buildSelfUseResult(
    item,
    context,
  );
}

/* =========================================================
   DISPLAY HELPERS
========================================================= */

/**
 * Lấy mô tả self-use để UI hiển thị.
 */
export function getSelfUseDescription(
  itemId: string,
): string | null {
  const item = getGameItem(itemId);

  if (!item?.selfUse) {
    return null;
  }

  return item.selfUse.description;
}

/**
 * Kiểm tra item có cần consume sau khi self-use hay không.
 */
export function shouldConsumeSelfUse(
  itemId: string,
): boolean {
  const item = getGameItem(itemId);

  if (!item?.selfUse) {
    return false;
  }

  return item.selfUse.consume;
}

/* =========================================================
   EFFECT SUMMARY
========================================================= */

/**
 * Tạo summary để UI/API có thể dùng.
 *
 * Ví dụ:
 *
 * {
 *   hp: 20,
 *   money: 0,
 *   travelCostReduction: 0,
 *   travelRiskReduction: 0,
 *   relationship: 0
 * }
 */
export function getSelfEffectSummary(
  itemId: string,
) {
  const item = getGameItem(itemId);

  if (!item?.selfUse) {
    return null;
  }

  const stat = item.selfUse.statEffect;
  const travel = item.selfUse.travelEffect;
  const relationship =
    item.selfUse.relationshipEffect;

  return {
    hp: stat?.hp ?? 0,

    money: stat?.money ?? 0,

    legalRisk: stat?.legalRisk ?? 0,

    locationId:
      travel?.locationId ?? null,

    travelCostReduction:
      travel?.travelCostReduction ?? 0,

    travelRiskReduction:
      travel?.travelRiskReduction ?? 0,

    relationship:
      relationship?.relationship ?? 0,

    consume: item.selfUse.consume,
  };
}

/* =========================================================
   ITEM LIST
========================================================= */

/**
 * Lấy tất cả item có thể self-use.
 */
export function getSelfUseItems(): ItemDefinition[] {
  const {
    ITEMS,
  } = require("./data") as typeof import("./data");

  return ITEMS.filter(
    (item) => Boolean(item.selfUse),
  );
}