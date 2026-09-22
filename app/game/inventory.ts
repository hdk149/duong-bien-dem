import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

export type InventoryAction =
  | "purchase"
  | "use"
  | "consume"
  | "reward"
  | "remove"
  | "admin_add"
  | "admin_remove";

export interface InventoryItem {
  id: string;
  room_id: string;
  player_id: string;
  item_id: string;
  quantity: number;
  acquired_at: string;
  updated_at: string;
}

export interface AddItemOptions {
  roomId: string;
  playerId: string;
  itemId: string;
  quantity?: number;
  action?: InventoryAction;
  source?: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RemoveItemOptions {
  roomId: string;
  playerId: string;
  itemId: string;
  quantity?: number;
  action?: InventoryAction;
  source?: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface InventoryLogOptions {
  roomId: string;
  playerId: string;
  itemId: string;
  action: InventoryAction;
  quantity: number;
  source?: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Get the complete inventory of a player in a room.
 */
export async function getInventory(
  playerId: string,
  roomId?: string
): Promise<InventoryItem[]> {
  let query = supabase
    .from("player_inventory")
    .select(
      "id, room_id, player_id, item_id, quantity, acquired_at, updated_at"
    )
    .eq("player_id", playerId)
    .gt("quantity", 0)
    .order("updated_at", { ascending: false });

  if (roomId) {
    query = query.eq("room_id", roomId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("GET INVENTORY ERROR:", error);
    throw new Error(`Failed to get inventory: ${error.message}`);
  }

  return (data ?? []) as InventoryItem[];
}

/**
 * Get one inventory entry.
 */
export async function getInventoryItem(
  playerId: string,
  itemId: string,
  roomId?: string
): Promise<InventoryItem | null> {
  let query = supabase
    .from("player_inventory")
    .select(
      "id, room_id, player_id, item_id, quantity, acquired_at, updated_at"
    )
    .eq("player_id", playerId)
    .eq("item_id", itemId)
    .limit(1);

  if (roomId) {
    query = query.eq("room_id", roomId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("GET INVENTORY ITEM ERROR:", error);
    throw new Error(`Failed to get inventory item: ${error.message}`);
  }

  return data as InventoryItem | null;
}

/**
 * Get the quantity of a specific item.
 */
export async function getItemQuantity(
  playerId: string,
  itemId: string,
  roomId?: string
): Promise<number> {
  const item = await getInventoryItem(playerId, itemId, roomId);

  if (!item) {
    return 0;
  }

  return Math.max(0, item.quantity);
}

/**
 * Check whether a player owns at least the requested quantity of an item.
 */
export async function hasItem(
  playerId: string,
  itemId: string,
  requiredQuantity = 1,
  roomId?: string
): Promise<boolean> {
  if (requiredQuantity <= 0) {
    return true;
  }

  const quantity = await getItemQuantity(playerId, itemId, roomId);

  return quantity >= requiredQuantity;
}

/**
 * Add an item to a player's inventory.
 *
 * If the player already owns the item, its quantity is increased.
 * The item definition must already exist.
 */
export async function addItem(
  options: AddItemOptions
): Promise<InventoryItem> {
  const {
    roomId,
    playerId,
    itemId,
    quantity = 1,
    action = "reward",
    source = "game",
    referenceId = null,
    metadata = {},
  } = options;

  if (!roomId) {
    throw new Error("roomId is required");
  }

  if (!playerId) {
    throw new Error("playerId is required");
  }

  if (!itemId) {
    throw new Error("itemId is required");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }

  // Make sure the item actually exists.
  const { data: itemDefinition, error: itemError } = await supabase
    .from("item_definitions")
    .select("id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) {
    console.error("CHECK ITEM DEFINITION ERROR:", itemError);
    throw new Error(
      `Failed to check item definition: ${itemError.message}`
    );
  }

  if (!itemDefinition) {
    throw new Error(`Item definition not found: ${itemId}`);
  }

  const existing = await getInventoryItem(playerId, itemId, roomId);

  let inventoryItem: InventoryItem;

  if (existing) {
    const newQuantity = existing.quantity + quantity;

    const { data, error } = await supabase
      .from("player_inventory")
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(
        "id, room_id, player_id, item_id, quantity, acquired_at, updated_at"
      )
      .single();

    if (error) {
      console.error("UPDATE INVENTORY ERROR:", error);
      throw new Error(`Failed to update inventory: ${error.message}`);
    }

    inventoryItem = data as InventoryItem;
  } else {
    const { data, error } = await supabase
      .from("player_inventory")
      .insert({
        room_id: roomId,
        player_id: playerId,
        item_id: itemId,
        quantity,
      })
      .select(
        "id, room_id, player_id, item_id, quantity, acquired_at, updated_at"
      )
      .single();

    if (error) {
      console.error("INSERT INVENTORY ERROR:", error);
      throw new Error(`Failed to add item to inventory: ${error.message}`);
    }

    inventoryItem = data as InventoryItem;
  }

  await logInventoryChange({
    roomId,
    playerId,
    itemId,
    action,
    quantity,
    source,
    referenceId,
    metadata,
  });

  return inventoryItem;
}

/**
 * Remove a quantity of an item from a player's inventory.
 *
 * If the remaining quantity reaches zero, the inventory row is deleted.
 */
export async function removeItem(
  options: RemoveItemOptions
): Promise<InventoryItem | null> {
  const {
    roomId,
    playerId,
    itemId,
    quantity = 1,
    action = "remove",
    source = "game",
    referenceId = null,
    metadata = {},
  } = options;

  if (!roomId) {
    throw new Error("roomId is required");
  }

  if (!playerId) {
    throw new Error("playerId is required");
  }

  if (!itemId) {
    throw new Error("itemId is required");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }

  const existing = await getInventoryItem(playerId, itemId, roomId);

  if (!existing) {
    throw new Error(`Player does not own item: ${itemId}`);
  }

  if (existing.quantity < quantity) {
    throw new Error(
      `Not enough item quantity. Have ${existing.quantity}, need ${quantity}.`
    );
  }

  const remainingQuantity = existing.quantity - quantity;

  let inventoryItem: InventoryItem | null = null;

  if (remainingQuantity === 0) {
    const { error } = await supabase
      .from("player_inventory")
      .delete()
      .eq("id", existing.id);

    if (error) {
      console.error("DELETE INVENTORY ERROR:", error);
      throw new Error(`Failed to remove item: ${error.message}`);
    }
  } else {
    const { data, error } = await supabase
      .from("player_inventory")
      .update({
        quantity: remainingQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(
        "id, room_id, player_id, item_id, quantity, acquired_at, updated_at"
      )
      .single();

    if (error) {
      console.error("UPDATE INVENTORY AFTER REMOVE ERROR:", error);
      throw new Error(`Failed to remove item: ${error.message}`);
    }

    inventoryItem = data as InventoryItem;
  }

  await logInventoryChange({
    roomId,
    playerId,
    itemId,
    action,
    quantity,
    source,
    referenceId,
    metadata,
  });

  return inventoryItem;
}

/**
 * Consume an item.
 *
 * This is intentionally separate from removeItem() because
 * hidden/side missions can use "consume" as a meaningful
 * inventory history action.
 */
export async function consumeItem(
  roomId: string,
  playerId: string,
  itemId: string,
  quantity = 1,
  source = "mission",
  referenceId: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<InventoryItem | null> {
  return removeItem({
    roomId,
    playerId,
    itemId,
    quantity,
    action: "consume",
    source,
    referenceId,
    metadata,
  });
}

/**
 * Record an inventory change in player_inventory_log.
 */
export async function logInventoryChange(
  options: InventoryLogOptions
): Promise<void> {
  const {
    roomId,
    playerId,
    itemId,
    action,
    quantity,
    source = "game",
    referenceId = null,
    metadata = {},
  } = options;

  if (!roomId) {
    throw new Error("roomId is required");
  }

  if (!playerId) {
    throw new Error("playerId is required");
  }

  if (!itemId) {
    throw new Error("itemId is required");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }

  const { error } = await supabase
    .from("player_inventory_log")
    .insert({
      room_id: roomId,
      player_id: playerId,
      item_id: itemId,
      action,
      quantity,
      source,
      reference_id: referenceId,
      metadata,
    });

  if (error) {
    console.error("INVENTORY LOG ERROR:", error);
    throw new Error(`Failed to log inventory change: ${error.message}`);
  }
}

/**
 * Get inventory history for a player.
 */
export async function getInventoryLog(
  playerId: string,
  roomId?: string,
  limit = 100
) {
  let query = supabase
    .from("player_inventory_log")
    .select(
      "id, room_id, player_id, item_id, action, quantity, source, reference_id, metadata, created_at"
    )
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)));

  if (roomId) {
    query = query.eq("room_id", roomId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("GET INVENTORY LOG ERROR:", error);
    throw new Error(`Failed to get inventory log: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Remove all quantity of an item from a player.
 */
export async function removeAllOfItem(
  roomId: string,
  playerId: string,
  itemId: string,
  action: InventoryAction = "remove",
  source = "game",
  referenceId: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const existing = await getInventoryItem(playerId, itemId, roomId);

  if (!existing) {
    return;
  }

  await removeItem({
    roomId,
    playerId,
    itemId,
    quantity: existing.quantity,
    action,
    source,
    referenceId,
    metadata,
  });
}