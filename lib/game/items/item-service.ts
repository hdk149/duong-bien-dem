/* =========================================================
   ITEM SERVICE
   Đường Biên Đêm

   Nhiệm vụ:
   - Kiểm tra inventory
   - Chạy Item Engine
   - Apply stat effects
   - Apply travel effects
   - Apply relationship effects nếu có
   - Consume item
   - Ghi inventory log
   - Trigger sidequest

   3 chức năng độc lập:
   🧍 self
   🤝 player
   📜 sidequest
========================================================= */

import { createClient } from "@supabase/supabase-js";

import type {
  ItemStatEffect,
  ItemTravelEffect,
  ItemRelationshipEffect,
  ItemUseTarget,
  ItemUseResult,
  UseItemInput,
} from "./types";

import {
  getGameItem,
} from "./data";

import {
  useItem,
} from "./use-items";

import {
  getInventoryItem,
  consumeItem,
  logItemUse,
} from "@/lib/game/inventory";

/* =========================================================
   SUPABASE
========================================================= */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL",
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY",
  );
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

/* =========================================================
   TYPES
========================================================= */

export type ItemServiceInput =
  UseItemInput;

export type ItemServiceResult =
  ItemUseResult & {
    inventoryQuantityBefore: number;
    inventoryQuantityAfter: number;
  };

/* =========================================================
   INTERNAL HELPERS
========================================================= */

function clampNumber(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

/* =========================================================
   PLAYER STATE
========================================================= */

/**
 * Lấy player state hiện tại.
 *
 * room_players hiện đang chứa:
 * hp
 * money
 * location
 * legal_risk
 */
async function getPlayerState(
  roomId: string,
  playerId: string,
) {
  const { data, error } =
    await supabase
      .from("room_players")
      .select(
        `
          id,
          room_id,
          hp,
          money,
          location,
          legal_risk
        `,
      )
      .eq("room_id", roomId)
      .eq("id", playerId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to get player state: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Player not found in this room.",
    );
  }

  return data;
}

/**
 * Update player state.
 *
 * Chỉ update những field thật sự có effect.
 */
async function updatePlayerState(
  roomId: string,
  playerId: string,
  effect?: ItemStatEffect,
  travelEffect?: ItemTravelEffect,
) {
  if (!effect && !travelEffect) {
    return;
  }

  const current =
    await getPlayerState(
      roomId,
      playerId,
    );

  const update: Record<
    string,
    unknown
  > = {};

  /* -------------------------
     HP
  ------------------------- */

  if (
    effect?.hp !== undefined
  ) {
    update.hp = clampNumber(
      Number(current.hp ?? 0) +
        effect.hp,
      0,
      100,
    );
  }

  /* -------------------------
     MONEY
  ------------------------- */

  if (
    effect?.money !== undefined
  ) {
    update.money =
      Math.max(
        0,
        Number(current.money ?? 0) +
          effect.money,
      );
  }

  /* -------------------------
     LEGAL RISK
  ------------------------- */

  if (
    effect?.legalRisk !== undefined
  ) {
    update.legal_risk =
      clampNumber(
        Number(
          current.legal_risk ?? 0,
        ) + effect.legalRisk,
        0,
        100,
      );
  }

  /* -------------------------
     LOCATION
  ------------------------- */

  if (
    travelEffect?.locationId
  ) {
    update.location =
      travelEffect.locationId;
  }

  if (
    Object.keys(update).length === 0
  ) {
    return;
  }

  const { error } =
    await supabase
      .from("room_players")
      .update(update)
      .eq("room_id", roomId)
      .eq("id", playerId);

  if (error) {
    throw new Error(
      `Failed to update player state: ${error.message}`,
    );
  }
}

/* =========================================================
   RELATIONSHIP
========================================================= */

/**
 * Relationship hiện tại chưa có field cố định
 * trong room_players.
 *
 * Vì vậy tạm thời không ghi DB ở đây.
 *
 * Khi project có relationship table,
 * chỉ cần nối function này vào table đó.
 */
async function applyRelationshipEffect(
  _roomId: string,
  _playerId: string,
  _targetPlayerId: string | undefined,
  effect?: ItemRelationshipEffect,
) {
  if (
    !effect ||
    effect.relationship === undefined
  ) {
    return;
  }

  // Relationship chưa có persistence layer riêng.
  // Không silently ghi vào room_players.
}

/* =========================================================
   EFFECT TARGET
========================================================= */

async function applyEffects(
  input: ItemServiceInput,
  result: ItemUseResult,
) {
  const targetPlayerId =
    input.target === "self"
      ? input.playerId
      : input.targetPlayerId;

  if (
    input.target === "sidequest"
  ) {
    return;
  }

  if (!targetPlayerId) {
    throw new Error(
      "Target player is required.",
    );
  }

  await updatePlayerState(
    input.roomId,
    targetPlayerId,
    result.statEffect,
    result.travelEffect,
  );

  await applyRelationshipEffect(
    input.roomId,
    input.playerId,
    targetPlayerId,
    result.relationshipEffect,
  );
}

/* =========================================================
   MAIN SERVICE
========================================================= */

export async function useItemService(
  input: ItemServiceInput,
): Promise<ItemServiceResult> {
  /* -------------------------------------------------------
     1. Validate item
  ------------------------------------------------------- */

  const item =
    getGameItem(input.itemId);

  if (!item) {
    throw new Error(
      `Không tìm thấy item "${input.itemId}".`,
    );
  }

  /* -------------------------------------------------------
     2. Check inventory
  ------------------------------------------------------- */

  const inventoryItem =
    await getInventoryItem(
      input.roomId,
      input.playerId,
      input.itemId,
    );

  if (!inventoryItem) {
    throw new Error(
      `Player không sở hữu ${item.name}.`,
    );
  }

  const quantityBefore =
    inventoryItem.quantity;

  if (quantityBefore <= 0) {
    throw new Error(
      `Không còn ${item.name} trong inventory.`,
    );
  }

  /* -------------------------------------------------------
     3. Run pure Item Engine
  ------------------------------------------------------- */

  const result =
    useItem(input);

  if (!result.success) {
    return {
      ...result,
      inventoryQuantityBefore:
        quantityBefore,
      inventoryQuantityAfter:
        quantityBefore,
    };
  }

  /* -------------------------------------------------------
     4. Apply effects
  ------------------------------------------------------- */

  await applyEffects(
    input,
    result,
  );

  /* -------------------------------------------------------
     5. Consume item
  ------------------------------------------------------- */

  if (result.consumed) {
    await consumeItem(
      input.roomId,
      input.playerId,
      input.itemId,
      1,
      {
        source:
          input.source ??
          "item_use",
        referenceId:
          input.referenceId ??
          null,
        metadata: {
          target:
            input.target,
          targetPlayerId:
            input.targetPlayerId ??
            null,
          round:
            input.round ??
            null,
          sidequestId:
            result.sidequestId ??
            null,
        },
      },
    );
  } else {
    /*
     * Item không consume.
     * Vẫn ghi action "use".
     */
    await logItemUse(
      input.roomId,
      input.playerId,
      input.itemId,
      {
        quantity: 1,
        source:
          input.source ??
          "item_use",
        referenceId:
          input.referenceId ??
          null,
        metadata: {
          target:
            input.target,
          targetPlayerId:
            input.targetPlayerId ??
            null,
          round:
            input.round ??
            null,
          consumed: false,
          sidequestId:
            result.sidequestId ??
            null,
        },
      },
    );
  }

  /* -------------------------------------------------------
     6. Get final inventory quantity
  ------------------------------------------------------- */

  const finalInventory =
    await getInventoryItem(
      input.roomId,
      input.playerId,
      input.itemId,
    );

  const quantityAfter =
    finalInventory?.quantity ?? 0;

  /* -------------------------------------------------------
     7. Return
  ------------------------------------------------------- */

  return {
    ...result,
    inventoryQuantityBefore:
      quantityBefore,
    inventoryQuantityAfter:
      quantityAfter,
  };
}

/* =========================================================
   CONVENIENCE FUNCTIONS
========================================================= */

export async function useItemOnSelfService(
  input: Omit<
    ItemServiceInput,
    "target"
  >,
): Promise<ItemServiceResult> {
  return useItemService({
    ...input,
    target: "self",
  });
}

export async function useItemOnPlayerService(
  input: Omit<
    ItemServiceInput,
    "target"
  >,
): Promise<ItemServiceResult> {
  return useItemService({
    ...input,
    target: "player",
  });
}

export async function useItemSidequestService(
  input: Omit<
    ItemServiceInput,
    "target"
  >,
): Promise<ItemServiceResult> {
  return useItemService({
    ...input,
    target: "sidequest",
  });
}

/* =========================================================
   TARGET VALIDATION
========================================================= */

export function validateItemTarget(
  target: ItemUseTarget,
  targetPlayerId?: string,
): void {
  if (
    target === "player" &&
    !targetPlayerId
  ) {
    throw new Error(
      "Phải chọn người chơi mục tiêu.",
    );
  }
}

/* =========================================================
   SAFE PUBLIC ENTRY
========================================================= */

export async function executeItemUse(
  input: ItemServiceInput,
): Promise<ItemServiceResult> {
  validateItemTarget(
    input.target,
    input.targetPlayerId,
  );

  return useItemService(input);
}