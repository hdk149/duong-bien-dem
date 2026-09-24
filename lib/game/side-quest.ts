import { SupabaseClient } from "@supabase/supabase-js";

export type SideQuestChoice = {
  id: string;
  text: string;
  text_en?: string;
};

export type SideQuestResult = {
  money?: number;
  hp?: number;
  location?: string;
  message?: string;
  message_en?: string;
  reward_item_id?: string | null;
  reward_quantity?: number;
};

export type SideQuest = {
  id: string;
  room_id: string;
  player_id: string;
  item_id: string;

  title: string;
  title_en?: string | null;

  description: string;
  description_en?: string | null;

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

type RawSideQuest = Record<string, unknown>;

function normalizeChoice(
  value: unknown,
): SideQuestChoice {
  const item =
    value &&
    typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    id: String(item.id ?? ""),
    text: String(item.text ?? ""),
    text_en:
      item.text_en == null
        ? undefined
        : String(item.text_en),
  };
}

function normalizeSideQuest(
  value: unknown,
): SideQuest {
  const item =
    value &&
    typeof value === "object"
      ? (value as RawSideQuest)
      : {};

  const rawChoices = Array.isArray(item.choices)
    ? item.choices
    : [];

  return {
    id: String(item.id ?? ""),
    room_id: String(item.room_id ?? ""),
    player_id: String(item.player_id ?? ""),
    item_id: String(item.item_id ?? ""),

    title: String(item.title ?? ""),

    title_en:
      item.title_en == null
        ? null
        : String(item.title_en),

    description: String(
      item.description ?? "",
    ),

    description_en:
      item.description_en == null
        ? null
        : String(item.description_en),

    choices:
      rawChoices.map(normalizeChoice),

    status: (
      item.status === "resolving" ||
      item.status === "resolved" ||
      item.status === "cancelled"
        ? item.status
        : "choosing"
    ) as SideQuest["status"],

    selected_choice:
      item.selected_choice == null
        ? null
        : String(item.selected_choice),

    result:
      item.result == null
        ? null
        : (item.result as SideQuestResult),

    created_at:
      item.created_at == null
        ? undefined
        : String(item.created_at),

    resolved_at:
      item.resolved_at == null
        ? null
        : String(item.resolved_at),
  };
}

/**
 * Get the player's currently active side quest.
 *
 * Active:
 * - choosing
 * - resolving
 */
export async function getActiveSideQuest(
  supabase: SupabaseClient,
  roomId: string,
  playerId: string,
): Promise<SideQuest | null> {
  const { data, error } = await supabase
    .from("side_quests")
    .select("*")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .in("status", [
      "choosing",
      "resolving",
    ])
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to get active side quest: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return normalizeSideQuest(data);
}

/**
 * Get a specific side quest.
 */
export async function getSideQuest(
  supabase: SupabaseClient,
  questId: string,
): Promise<SideQuest | null> {
  const { data, error } = await supabase
    .from("side_quests")
    .select("*")
    .eq("id", questId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to get side quest: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return normalizeSideQuest(data);
}

/**
 * Create a new side quest.
 *
 * IMPORTANT:
 * The source inventory item is NOT consumed here.
 *
 * Item consumption happens only when
 * resolveSideQuest() successfully calls
 * resolve_side_quest_atomic().
 */
export async function createSideQuest(
  supabase: SupabaseClient,
  input: {
    roomId: string;
    playerId: string;
    itemId: string;

    title: string;
    titleEn?: string;

    description: string;
    descriptionEn?: string;

    choices: SideQuestChoice[];
  },
): Promise<SideQuest> {
  if (!input.roomId) {
    throw new Error(
      "Cannot create side quest: missing roomId.",
    );
  }

  if (!input.playerId) {
    throw new Error(
      "Cannot create side quest: missing playerId.",
    );
  }

  if (!input.itemId) {
    throw new Error(
      "Cannot create side quest: missing itemId.",
    );
  }

  if (!input.title.trim()) {
    throw new Error(
      "Cannot create side quest: missing title.",
    );
  }

  if (!input.description.trim()) {
    throw new Error(
      "Cannot create side quest: missing description.",
    );
  }

  if (
    !Array.isArray(input.choices) ||
    input.choices.length === 0
  ) {
    throw new Error(
      "Cannot create side quest: no choices provided.",
    );
  }

  /**
   * Prevent duplicate active quests.
   *
   * The database partial unique index should also protect
   * against concurrent requests.
   */
  const existing =
    await getActiveSideQuest(
      supabase,
      input.roomId,
      input.playerId,
    );

  if (existing) {
    throw new Error(
      "Player already has an active side quest.",
    );
  }

  const choices = input.choices.map(
    (choice) => ({
      id: String(choice.id),
      text: String(choice.text),
      ...(choice.text_en
        ? {
            text_en: String(
              choice.text_en,
            ),
          }
        : {}),
    }),
  );

  const payload = {
    room_id: input.roomId,
    player_id: input.playerId,
    item_id: input.itemId,

    title: input.title.trim(),

    title_en:
      input.titleEn?.trim() || null,

    description:
      input.description.trim(),

    description_en:
      input.descriptionEn?.trim() || null,

    choices,

    status: "choosing",
  };

  const { data, error } = await supabase
    .from("side_quests")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.error(
      "CREATE_SIDE_QUEST_DB_ERROR",
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        payload,
      },
    );

    throw new Error(
      [
        "Failed to create side quest.",
        `message=${error.message}`,
        error.code
          ? `code=${error.code}`
          : "",
        error.details
          ? `details=${error.details}`
          : "",
        error.hint
          ? `hint=${error.hint}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  if (!data) {
    throw new Error(
      "Failed to create side quest: database returned no row.",
    );
  }

  return normalizeSideQuest(data);
}

/**
 * Select a side quest choice.
 *
 * choosing -> resolving
 *
 * The conditional update prevents two fast clicks
 * from selecting two different choices.
 */
export async function selectSideQuestChoice(
  supabase: SupabaseClient,
  questId: string,
  playerId: string,
  choiceId: string,
): Promise<SideQuest> {
  const quest = await getSideQuest(
    supabase,
    questId,
  );

  if (!quest) {
    throw new Error(
      "Side quest not found.",
    );
  }

  if (quest.player_id !== playerId) {
    throw new Error(
      "You do not own this side quest.",
    );
  }

  if (quest.status !== "choosing") {
    throw new Error(
      "This side quest is no longer accepting choices.",
    );
  }

  const validChoice =
    quest.choices.some(
      (choice) =>
        choice.id === choiceId,
    );

  if (!validChoice) {
    throw new Error(
      "Invalid side quest choice.",
    );
  }

  const { data, error } =
    await supabase
      .from("side_quests")
      .update({
        selected_choice: choiceId,
        status: "resolving",
      })
      .eq("id", questId)
      .eq("player_id", playerId)
      .eq("status", "choosing")
      .select("*")
      .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to select side quest choice: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Side quest choice was already selected or quest is no longer active.",
    );
  }

  return normalizeSideQuest(data);
}

/**
 * Resolve side quest atomically.
 *
 * Actual mutation is handled by:
 *
 * public.resolve_side_quest_atomic()
 */
export async function resolveSideQuest(
  supabase: SupabaseClient,
  questId: string,
  playerId: string,
  result: SideQuestResult,
): Promise<SideQuest> {
  const quest = await getSideQuest(
    supabase,
    questId,
  );

  if (!quest) {
    throw new Error(
      "Side quest not found.",
    );
  }

  if (quest.player_id !== playerId) {
    throw new Error(
      "You do not own this side quest.",
    );
  }

  if (quest.status !== "resolving") {
    throw new Error(
      "Side quest is not ready to be resolved.",
    );
  }

  const { data, error } =
    await supabase.rpc(
      "resolve_side_quest_atomic",
      {
        p_quest_id: questId,
        p_player_id: playerId,
        p_result: result,
      },
    );

  if (error) {
    throw new Error(
      `Failed to resolve side quest atomically: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "Side quest resolution returned no data.",
    );
  }

  return normalizeSideQuest(data);
}

/**
 * Write a side quest log entry.
 */
export async function logSideQuestAction(
  supabase: SupabaseClient,
  input: {
    sideQuestId: string;
    roomId: string;
    playerId: string;
    action: string;
    metadata?: Record<
      string,
      unknown
    >;
  },
): Promise<void> {
  const { error } =
    await supabase
      .from("side_quest_log")
      .insert({
        side_quest_id:
          input.sideQuestId,
        room_id: input.roomId,
        player_id:
          input.playerId,
        action: input.action,
        metadata:
          input.metadata ?? {},
      });

  if (error) {
    throw new Error(
      `Failed to log side quest action: ${error.message}`,
    );
  }
}