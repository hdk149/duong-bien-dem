import type {
  ItemDefinition,
  SidequestDefinition,
} from "./types";

import {
  ITEMS,
  SIDEQUESTS,
  getGameItem,
  getSidequest,
} from "./data";

/* =========================================================
   SIDEQUEST RUNTIME TYPES
========================================================= */

export type SidequestState =
  | "available"
  | "active"
  | "completed"
  | "failed";

export type SidequestTriggerResult = {
  success: boolean;
  sidequest?: SidequestDefinition;
  item?: ItemDefinition;
  message: string;
};

export type SidequestProgress = {
  sidequestId: string;
  state: SidequestState;
  progress: number;
  target: number;
};

/* =========================================================
   BASIC LOOKUPS
========================================================= */

/**
 * Lấy Sidequest mà một item có thể mở.
 */
export function getItemSidequest(
  itemId: string,
): SidequestDefinition | undefined {
  const item = getGameItem(itemId);

  if (!item?.sidequestUse) {
    return undefined;
  }

  return getSidequest(item.sidequestUse.sidequestId);
}

/**
 * Kiểm tra item có thể mở Sidequest hay không.
 */
export function canTriggerSidequest(
  itemId: string,
): boolean {
  return Boolean(getItemSidequest(itemId));
}

/**
 * Lấy tất cả item có chức năng mở Sidequest.
 */
export function getSidequestItems(): ItemDefinition[] {
  return ITEMS.filter(
    (item) => Boolean(item.sidequestUse),
  );
}

/**
 * Lấy tất cả Sidequest.
 */
export function getAllSidequests(): SidequestDefinition[] {
  return SIDEQUESTS;
}

/* =========================================================
   SIDEQUEST TRIGGER
========================================================= */

/**
 * Kiểm tra và chuẩn bị mở Sidequest từ item.
 *
 * Hàm này CHƯA thay đổi database.
 * Nó chỉ xác định item có mở được Sidequest hay không.
 */
export function prepareSidequestTrigger(
  itemId: string,
): SidequestTriggerResult {
  const item = getGameItem(itemId);

  if (!item) {
    return {
      success: false,
      message: `Không tìm thấy item: ${itemId}`,
    };
  }

  if (!item.sidequestUse) {
    return {
      success: false,
      item,
      message: `${item.name} không có chức năng mở Sidequest.`,
    };
  }

  const sidequest = getSidequest(
    item.sidequestUse.sidequestId,
  );

  if (!sidequest) {
    return {
      success: false,
      item,
      message:
        `Sidequest ${item.sidequestUse.sidequestId} không tồn tại.`,
    };
  }

  return {
    success: true,
    item,
    sidequest,
    message:
      `Có thể mở Sidequest "${sidequest.name}".`,
  };
}

/* =========================================================
   SIDEQUEST STATE
========================================================= */

/**
 * Tạo progress mặc định cho một Sidequest.
 *
 * Hiện tại Sidequest mới bắt đầu ở progress 0/1.
 * Sau này có thể mở rộng thành nhiều bước.
 */
export function createSidequestProgress(
  sidequestId: string,
): SidequestProgress | null {
  const sidequest = getSidequest(sidequestId);

  if (!sidequest) {
    return null;
  }

  return {
    sidequestId: sidequest.id,
    state: "available",
    progress: 0,
    target: 1,
  };
}

/**
 * Bắt đầu Sidequest.
 */
export function startSidequest(
  progress: SidequestProgress,
): SidequestProgress {
  if (progress.state !== "available") {
    return progress;
  }

  return {
    ...progress,
    state: "active",
  };
}

/**
 * Tăng tiến độ Sidequest.
 */
export function advanceSidequest(
  progress: SidequestProgress,
  amount = 1,
): SidequestProgress {
  if (progress.state !== "active") {
    return progress;
  }

  const nextProgress = Math.min(
    progress.progress + amount,
    progress.target,
  );

  return {
    ...progress,
    progress: nextProgress,
    state:
      nextProgress >= progress.target
        ? "completed"
        : "active",
  };
}

/**
 * Đánh dấu Sidequest thất bại.
 */
export function failSidequest(
  progress: SidequestProgress,
): SidequestProgress {
  if (
    progress.state === "completed" ||
    progress.state === "failed"
  ) {
    return progress;
  }

  return {
    ...progress,
    state: "failed",
  };
}

/* =========================================================
   SIDEQUEST VALIDATION
========================================================= */

/**
 * Kiểm tra Sidequest có tồn tại không.
 */
export function sidequestExists(
  sidequestId: string,
): boolean {
  return Boolean(getSidequest(sidequestId));
}

/**
 * Kiểm tra item có đúng là item kích hoạt Sidequest không.
 */
export function isCorrectTriggerItem(
  itemId: string,
  sidequestId: string,
): boolean {
  const sidequest = getSidequest(sidequestId);

  if (!sidequest) {
    return false;
  }

  return sidequest.triggerItemId === itemId;
}

/**
 * Kiểm tra Sidequest có được phép mở lại không.
 */
export function isSidequestRepeatable(
  sidequestId: string,
): boolean {
  const sidequest = getSidequest(sidequestId);

  if (!sidequest) {
    return false;
  }

  return sidequest.repeatable;
}

/* =========================================================
   SIDEQUEST DISPLAY
========================================================= */

/**
 * Lấy thông tin hiển thị Sidequest.
 */
export function getSidequestDisplay(
  sidequestId: string,
) {
  const sidequest = getSidequest(sidequestId);

  if (!sidequest) {
    return null;
  }

  const triggerItem = getGameItem(
    sidequest.triggerItemId,
  );

  return {
    id: sidequest.id,
    name: sidequest.name,
    name_en: sidequest.name_en,
    description: sidequest.description,
    description_en: sidequest.description_en,
    repeatable: sidequest.repeatable,
    triggerItemId: sidequest.triggerItemId,
    triggerItemName:
      triggerItem?.name ?? sidequest.triggerItemId,
    triggerItemIcon:
      triggerItem?.icon ?? "📜",
  };
}

/**
 * Lấy toàn bộ Sidequest kèm item kích hoạt.
 */
export function getSidequestCatalog() {
  return SIDEQUESTS.map((sidequest) => {
    const triggerItem = getGameItem(
      sidequest.triggerItemId,
    );

    return {
      ...sidequest,
      triggerItemName:
        triggerItem?.name ?? sidequest.triggerItemId,
      triggerItemIcon:
        triggerItem?.icon ?? "📜",
    };
  });
}