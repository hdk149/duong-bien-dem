import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/* =========================================================
   TYPES
========================================================= */

export type ItemDefinition = {
  id: string;
  category: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  price: number;
  icon: string;
  stackable: boolean;
  spawn_weight: number;
  created_at: string;
};

export type InventoryItem = {
  id: string;
  room_id: string;
  player_id: string;
  item_id: string;
  quantity: number;
  acquired_at: string;
  updated_at: string;
  item: ItemDefinition | null;
};

export type InventoryLogAction =
  | "purchase"
  | "use"
  | "consume"
  | "reward"
  | "remove"
  | "admin_add"
  | "admin_remove";

export type InventoryLogInput = {
  roomId: string;
  playerId: string;
  itemId: string;
  action: InventoryLogAction;
  quantity: number;
  source?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AddItemInput = {
  roomId: string;
  playerId: string;
  itemId: string;
  quantity?: number;

  /**
   * What caused the item to enter inventory.
   */
  action?: "purchase" | "reward" | "admin_add";

  source?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type RemoveItemInput = {
  roomId: string;
  playerId: string;
  itemId: string;
  quantity?: number;

  action?: "use" | "consume" | "remove" | "admin_remove";

  source?: string | null;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
};

/* =========================================================
   INTERNAL HELPERS
========================================================= */

function assertPositiveInteger(
  value: number,
  name: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `${name} must be a positive integer.`,
    );
  }
}

/* =========================================================
   ITEM DEFINITIONS
========================================================= */

/**
 * Get one item definition.
 */
export async function getItemDefinition(
  itemId: string,
): Promise<ItemDefinition | null> {
  const { data, error } = await supabase
    .from("item_definitions")
    .select(
      `
        id,
        category,
        name,
        name_en,
        description,
        description_en,
        price,
        icon,
        stackable,
        spawn_weight,
        created_at
      `,
    )
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to get item definition: ${error.message}`,
    );
  }

  return data as ItemDefinition | null;
}

/**
 * Get all item definitions.
 *
 * Useful for Shop.
 */
export async function getItemDefinitions(): Promise<
  ItemDefinition[]
> {
  const { data, error } = await supabase
    .from("item_definitions")
    .select(
      `
        id,
        category,
        name,
        name_en,
        description,
        description_en,
        price,
        icon,
        stackable,
        spawn_weight,
        created_at
      `,
    )
    .order("category", { ascending: true })
    .order("price", { ascending: true });

  if (error) {
    throw new Error(
      `Failed to get item definitions: ${error.message}`,
    );
  }

  return (data ?? []) as ItemDefinition[];
}

/* =========================================================
   INVENTORY QUERIES
========================================================= */

/**
 * Get complete inventory for one player in one room.
 */
export async function getInventory(
  roomId: string,
  playerId: string,
): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("player_inventory")
    .select(
      `
        id,
        room_id,
        player_id,
        item_id,
        quantity,
        acquired_at,
        updated_at,
        item_definitions (
          id,
          category,
          name,
          name_en,
          description,
          description_en,
          price,
          icon,
          stackable,
          spawn_weight,
          created_at
        )
      `,
    )
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .order("acquired_at", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Failed to get inventory: ${error.message}`,
    );
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    room_id: row.room_id,
    player_id: row.player_id,
    item_id: row.item_id,
    quantity: row.quantity,
    acquired_at: row.acquired_at,
    updated_at: row.updated_at,
    item: row.item_definitions ?? null,
  }));
}

/**
 * Get one specific inventory row.
 */
export async function getInventoryItem(
  roomId: string,
  playerId: string,
  itemId: string,
): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from("player_inventory")
    .select(
      `
        id,
        room_id,
        player_id,
        item_id,
        quantity,
        acquired_at,
        updated_at,
        item_definitions (
          id,
          category,
          name,
          name_en,
          description,
          description_en,
          price,
          icon,
          stackable,
          spawn_weight,
          created_at
        )
      `,
    )
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to get inventory item: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  const row: any = data;

  return {
    id: row.id,
    room_id: row.room_id,
    player_id: row.player_id,
    item_id: row.item_id,
    quantity: row.quantity,
    acquired_at: row.acquired_at,
    updated_at: row.updated_at,
    item: row.item_definitions ?? null,
  };
}

/**
 * Get quantity of one item.
 */
export async function getItemQuantity(
  roomId: string,
  playerId: string,
  itemId: string,
): Promise<number> {
  const item = await getInventoryItem(
    roomId,
    playerId,
    itemId,
  );

  return item?.quantity ?? 0;
}

/**
 * Check whether player owns at least one of an item.
 */
export async function hasItem(
  roomId: string,
  playerId: string,
  itemId: string,
): Promise<boolean> {
  return (
    (await getItemQuantity(
      roomId,
      playerId,
      itemId,
    )) > 0
  );
}

/* =========================================================
   INVENTORY LOG
========================================================= */

/**
 * Write an inventory history record.
 */
export async function logInventoryAction(
  input: InventoryLogInput,
): Promise<void> {
  assertPositiveInteger(
    input.quantity,
    "Inventory log quantity",
  );

  const { error } = await supabase
    .from("player_inventory_log")
    .insert({
      room_id: input.roomId,
      player_id: input.playerId,
      item_id: input.itemId,
      action: input.action,
      quantity: input.quantity,
      source: input.source ?? null,
      reference_id: input.referenceId ?? null,
      metadata: input.metadata ?? {},
    });

  if (error) {
    throw new Error(
      `Failed to write inventory log: ${error.message}`,
    );
  }
}

/**
 * Get inventory history.
 */
export async function getInventoryLog(
  roomId: string,
  playerId: string,
  limit = 100,
) {
  const safeLimit = Math.min(
    Math.max(Math.floor(limit), 1),
    500,
  );

  const { data, error } = await supabase
    .from("player_inventory_log")
    .select(
      `
        id,
        room_id,
        player_id,
        item_id,
        action,
        quantity,
        source,
        reference_id,
        metadata,
        created_at
      `,
    )
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .order("created_at", {
      ascending: false,
    })
    .limit(safeLimit);

  if (error) {
    throw new Error(
      `Failed to get inventory log: ${error.message}`,
    );
  }

  return data ?? [];
}

/* =========================================================
   ADD ITEM
========================================================= */

/**
 * Add an item to inventory.
 *
 * Stackable:
 *   existing quantity + requested quantity
 *
 * Non-stackable:
 *   quantity is kept at 1
 */
export async function addItem(
  input: AddItemInput,
): Promise<InventoryItem> {
  const quantity = input.quantity ?? 1;

  assertPositiveInteger(
    quantity,
    "Item quantity",
  );

  const definition = await getItemDefinition(
    input.itemId,
  );

  if (!definition) {
    throw new Error(
      `Item not found: ${input.itemId}`,
    );
  }

  const existing = await getInventoryItem(
    input.roomId,
    input.playerId,
    input.itemId,
  );

  let inventoryItem: InventoryItem;

  if (existing) {
    const newQuantity = definition.stackable
      ? existing.quantity + quantity
      : 1;

    const { data, error } = await supabase
      .from("player_inventory")
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(
        `
          id,
          room_id,
          player_id,
          item_id,
          quantity,
          acquired_at,
          updated_at
        `,
      )
      .single();

    if (error) {
      throw new Error(
        `Failed to update inventory: ${error.message}`,
      );
    }

    inventoryItem = {
      ...(data as Omit<InventoryItem, "item">),
      item: definition,
    };
  } else {
    const newQuantity = definition.stackable
      ? quantity
      : 1;

    const { data, error } = await supabase
      .from("player_inventory")
      .insert({
        room_id: input.roomId,
        player_id: input.playerId,
        item_id: input.itemId,
        quantity: newQuantity,
      })
      .select(
        `
          id,
          room_id,
          player_id,
          item_id,
          quantity,
          acquired_at,
          updated_at
        `,
      )
      .single();

    if (error) {
      throw new Error(
        `Failed to add item to inventory: ${error.message}`,
      );
    }

    inventoryItem = {
      ...(data as Omit<InventoryItem, "item">),
      item: definition,
    };
  }

  await logInventoryAction({
    roomId: input.roomId,
    playerId: input.playerId,
    itemId: input.itemId,
    action: input.action ?? "reward",
    quantity,
    source: input.source ?? null,
    referenceId: input.referenceId ?? null,
    metadata: input.metadata ?? {},
  });

  return inventoryItem;
}

/* =========================================================
   REMOVE ITEM
========================================================= */

/**
 * Remove an item from inventory.
 *
 * If quantity reaches 0, the inventory row is deleted.
 */
export async function removeItem(
  input: RemoveItemInput,
): Promise<void> {
  const quantity = input.quantity ?? 1;

  assertPositiveInteger(
    quantity,
    "Remove quantity",
  );

  const existing = await getInventoryItem(
    input.roomId,
    input.playerId,
    input.itemId,
  );

  if (!existing) {
    throw new Error(
      "Player does not own this item.",
    );
  }

  if (existing.quantity < quantity) {
    throw new Error(
      "Not enough items in inventory.",
    );
  }

  const remaining =
    existing.quantity - quantity;

  if (remaining === 0) {
    const { error } = await supabase
      .from("player_inventory")
      .delete()
      .eq("id", existing.id);

    if (error) {
      throw new Error(
        `Failed to remove item from inventory: ${error.message}`,
      );
    }
  } else {
    const { error } = await supabase
      .from("player_inventory")
      .update({
        quantity: remaining,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(
        `Failed to update inventory quantity: ${error.message}`,
      );
    }
  }

  await logInventoryAction({
    roomId: input.roomId,
    playerId: input.playerId,
    itemId: input.itemId,
    action: input.action ?? "remove",
    quantity,
    source: input.source ?? null,
    referenceId: input.referenceId ?? null,
    metadata: input.metadata ?? {},
  });
}

/* =========================================================
   CONSUME ITEM
========================================================= */

/**
 * Consume an item.
 *
 * Removes the item and creates a "consume" log.
 */
export async function consumeItem(
  roomId: string,
  playerId: string,
  itemId: string,
  quantity = 1,
  options?: {
    source?: string | null;
    referenceId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await removeItem({
    roomId,
    playerId,
    itemId,
    quantity,
    action: "consume",
    source: options?.source ?? null,
    referenceId: options?.referenceId ?? null,
    metadata: options?.metadata ?? {},
  });
}

/* =========================================================
   REUSABLE ITEM
========================================================= */

/**
 * Record that an item was used without removing it.
 *
 * Useful for reusable equipment such as:
 * flashlight, backpack, compass, etc.
 */
export async function logItemUse(
  roomId: string,
  playerId: string,
  itemId: string,
  options?: {
    quantity?: number;
    source?: string | null;
    referenceId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const quantity = options?.quantity ?? 1;

  assertPositiveInteger(
    quantity,
    "Use quantity",
  );

  const owned = await hasItem(
    roomId,
    playerId,
    itemId,
  );

  if (!owned) {
    throw new Error(
      "Player does not own this item.",
    );
  }

  await logInventoryAction({
    roomId,
    playerId,
    itemId,
    action: "use",
    quantity,
    source: options?.source ?? null,
    referenceId: options?.referenceId ?? null,
    metadata: options?.metadata ?? {},
  });
}