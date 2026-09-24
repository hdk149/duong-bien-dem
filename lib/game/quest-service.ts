import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ============================================================
 * QUEST ENGINE
 * ============================================================
 *
 * FLOW BẮT BUỘC
 *
 *   MAIN QUEST #1
 *        ↓
 *   MINI QUEST 1
 *        ↓
 *   MINI QUEST 2
 *        ↓
 *   MAIN QUEST #1 COMPLETED
 *        ↓
 *   MAIN QUEST #2
 *
 * ============================================================
 * CORE RULES
 * ============================================================
 *
 * 1. Một Main Quest chỉ có đúng 2 Mini Quest.
 *
 * 2. mini_index:
 *
 *      0 = Mini Quest 1
 *      1 = Mini Quest 2
 *
 *    Không tồn tại Mini Quest 3.
 *
 * 3. AI KHÔNG được quyết định transition.
 *
 * 4. Quest service là source of truth.
 *
 * 5. rounds.ts chỉ đọc / set objective.
 *
 * 6. resolve-service.ts chỉ gọi advanceQuest()
 *    sau khi round resolve thành công.
 *
 * 7. Một objective không được complete nhiều lần.
 *
 * 8. Main Quest đang active không được tạo Main Quest khác.
 *
 * 9. Khi Mini Quest 2 hoàn thành:
 *
 *      active → completed
 *
 *    sau đó mới tạo Main Quest tiếp theo.
 *
 * 10. Không dùng round number làm state machine.
 *     Round chỉ là metadata về thời điểm objective hoàn thành.
 *
 * ============================================================
 */

export const MINI_QUEST_COUNT = 2;

export type QuestStatus =
  | "active"
  | "completed"
  | "failed";

export type CompletedObjective = {
  key: string;
  title: string;
  round: number;
  completed_at?: string;
};

export type GameQuest = {
  id: string;
  room_id: string;
  session_id: string;
  quest_number: number;
  title: string;
  description: string;
  status: QuestStatus;

  /**
   * Database representation:
   *
   * 0 = Mini Quest 1
   * 1 = Mini Quest 2
   */
  mini_index: 0 | 1;

  /**
   * Objective hiện tại của Mini Quest.
   */
  current_objective: string | null;

  /**
   * Lịch sử objective đã hoàn thành.
   */
  completed_objectives: CompletedObjective[];

  created_at: string;
  completed_at: string | null;
};

export type QuestTransitionResult = {
  quest: GameQuest;

  previousMiniIndex: 0 | 1;
  currentMiniIndex: 0 | 1;

  miniQuestCompleted: boolean;
  mainQuestCompleted: boolean;

  createdNextMainQuest: boolean;
  nextQuest: GameQuest | null;
};

export type EnsureActiveQuestInput = {
  roomId: string;
  sessionId: string;

  questNumber?: number;

  title?: string;
  description?: string;

  objective?: string | null;
};

/**
 * ============================================================
 * SELECT
 * ============================================================
 */

const QUEST_SELECT = `
  id,
  room_id,
  session_id,
  quest_number,
  title,
  description,
  status,
  mini_index,
  current_objective,
  completed_objectives,
  created_at,
  completed_at
`;

/**
 * ============================================================
 * TYPE GUARDS
 * ============================================================
 */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * ============================================================
 * NORMALIZE COMPLETED OBJECTIVES
 * ============================================================
 */

function normalizeCompletedObjectives(
  value: unknown
): CompletedObjective[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => {
      const rawRound = Number(
        item.round ?? 0
      );

      return {
        key:
          typeof item.key === "string"
            ? item.key.trim()
            : "",

        title:
          typeof item.title === "string"
            ? item.title.trim()
            : "",

        round:
          Number.isFinite(rawRound)
            ? rawRound
            : 0,

        completed_at:
          typeof item.completed_at === "string"
            ? item.completed_at
            : undefined,
      };
    })
    .filter(
      (item) =>
        item.key.length > 0
    );
}

/**
 * ============================================================
 * NORMALIZE QUEST
 * ============================================================
 *
 * Đây là lớp bảo vệ cuối cùng giữa DB và application.
 *
 * Nếu DB chứa mini_index ngoài 0/1,
 * KHÔNG được tự sửa thành state hợp lệ.
 *
 * Phải throw để phát hiện corruption.
 * ============================================================
 */

function normalizeQuest(
  row: unknown
): GameQuest | null {
  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.id !== "string" ||
    typeof row.room_id !== "string" ||
    typeof row.session_id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.description !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  const rawMiniIndex = Number(
    row.mini_index ?? 0
  );

  /**
   * HARD GUARD:
   *
   * Chỉ:
   *
   * 0 = Mini 1
   * 1 = Mini 2
   */
  if (
    rawMiniIndex !== 0 &&
    rawMiniIndex !== 1
  ) {
    throw new Error(
      `Quest state không hợp lệ: mini_index=${rawMiniIndex}. ` +
        `Chỉ cho phép 0 hoặc 1.`
    );
  }

  const rawStatus =
    typeof row.status === "string"
      ? row.status
      : "active";

  let status: QuestStatus;

  if (rawStatus === "completed") {
    status = "completed";
  } else if (rawStatus === "failed") {
    status = "failed";
  } else {
    status = "active";
  }

  const rawQuestNumber = Number(
    row.quest_number ?? 1
  );

  if (
    !Number.isInteger(
      rawQuestNumber
    ) ||
    rawQuestNumber < 1
  ) {
    throw new Error(
      `Quest number không hợp lệ: ${rawQuestNumber}.`
    );
  }

  return {
    id: row.id,
    room_id: row.room_id,
    session_id: row.session_id,

    quest_number:
      rawQuestNumber,

    title: row.title,
    description: row.description,

    status,

    mini_index:
      rawMiniIndex === 1
        ? 1
        : 0,

    current_objective:
      typeof row.current_objective ===
      "string"
        ? row.current_objective.trim() ||
          null
        : null,

    completed_objectives:
      normalizeCompletedObjectives(
        row.completed_objectives
      ),

    created_at:
      row.created_at,

    completed_at:
      typeof row.completed_at ===
      "string"
        ? row.completed_at
        : null,
  };
}

/**
 * ============================================================
 * INTERNAL HELPERS
 * ============================================================
 */

/**
 * Stable key cho Mini Quest.
 *
 * Không cần bảng mini_quests riêng.
 *
 * Ví dụ:
 *
 *   questUUID:mini:1
 *   questUUID:mini:2
 */
function makeObjectiveKey(
  questId: string,
  miniIndex: 0 | 1
): string {
  return `${questId}:mini:${miniIndex + 1}`;
}

/**
 * Lấy quest number tiếp theo.
 */
function getNextQuestNumber(
  quests: GameQuest[]
): number {
  if (quests.length === 0) {
    return 1;
  }

  return (
    Math.max(
      ...quests.map(
        (quest) =>
          quest.quest_number
      )
    ) + 1
  );
}

/**
 * ============================================================
 * GET ACTIVE QUEST
 * ============================================================
 */

export async function getActiveQuest(
  supabase: SupabaseClient,
  sessionId: string
): Promise<GameQuest | null> {
  if (!sessionId?.trim()) {
    throw new Error(
      "sessionId không được để trống."
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("game_quests")
    .select(QUEST_SELECT)
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("quest_number", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Không thể tải active quest: ${error.message}`
    );
  }

  return normalizeQuest(data);
}

/**
 * ============================================================
 * GET QUEST BY ID
 * ============================================================
 */

export async function getQuestById(
  supabase: SupabaseClient,
  questId: string
): Promise<GameQuest | null> {
  if (!questId?.trim()) {
    throw new Error(
      "questId không được để trống."
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("game_quests")
    .select(QUEST_SELECT)
    .eq("id", questId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Không thể tải quest: ${error.message}`
    );
  }

  return normalizeQuest(data);
}

/**
 * ============================================================
 * GET ALL QUESTS OF SESSION
 * ============================================================
 */

export async function getSessionQuests(
  supabase: SupabaseClient,
  sessionId: string
): Promise<GameQuest[]> {
  if (!sessionId?.trim()) {
    throw new Error(
      "sessionId không được để trống."
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("game_quests")
    .select(QUEST_SELECT)
    .eq("session_id", sessionId)
    .order("quest_number", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Không thể tải quest history: ${error.message}`
    );
  }

  return (data ?? [])
    .map(normalizeQuest)
    .filter(
      (
        quest
      ): quest is GameQuest =>
        quest !== null
    );
}

/**
 * ============================================================
 * CREATE MAIN QUEST
 * ============================================================
 *
 * Chỉ tạo nếu không có active quest.
 *
 * Đây là guard ở application layer.
 *
 * Database vẫn nên có:
 *
 *   unique partial index
 *
 * trên:
 *
 *   session_id
 *
 * với:
 *
 *   status = active
 *
 * ============================================================
 */

export async function createMainQuest(
  supabase: SupabaseClient,
  input: {
    roomId: string;
    sessionId: string;

    questNumber?: number;

    title: string;
    description: string;

    objective?: string | null;
  }
): Promise<GameQuest> {
  if (!input.roomId?.trim()) {
    throw new Error(
      "roomId không được để trống."
    );
  }

  if (!input.sessionId?.trim()) {
    throw new Error(
      "sessionId không được để trống."
    );
  }

  const title =
    input.title.trim();

  const description =
    input.description.trim();

  if (!title) {
    throw new Error(
      "Main Quest title không được để trống."
    );
  }

  if (!description) {
    throw new Error(
      "Main Quest description không được để trống."
    );
  }

  /**
   * Không tạo quest nếu vẫn còn quest active.
   */
  const active =
    await getActiveQuest(
      supabase,
      input.sessionId
    );

  if (active) {
    throw new Error(
      `Session vẫn còn Main Quest #${active.quest_number} đang active.`
    );
  }

  let questNumber =
    input.questNumber;

  if (
    typeof questNumber !== "number" ||
    !Number.isInteger(
      questNumber
    ) ||
    questNumber < 1
  ) {
    const quests =
      await getSessionQuests(
        supabase,
        input.sessionId
      );

    questNumber =
      getNextQuestNumber(
        quests
      );
  }

  const objective =
    typeof input.objective ===
    "string"
      ? input.objective.trim() ||
        null
      : null;

  const {
    data,
    error,
  } = await supabase
    .from("game_quests")
    .insert({
      room_id:
        input.roomId,

      session_id:
        input.sessionId,

      quest_number:
        questNumber,

      title,

      description,

      status:
        "active",

      mini_index:
        0,

      current_objective:
        objective,

      completed_objectives:
        [],
    })
    .select(QUEST_SELECT)
    .single();

  if (error) {
    throw new Error(
      `Không thể tạo Main Quest: ${error.message}`
    );
  }

  const quest =
    normalizeQuest(data);

  if (!quest) {
    throw new Error(
      "Main Quest được tạo nhưng dữ liệu không hợp lệ."
    );
  }

  return quest;
}

/**
 * ============================================================
 * ENSURE ACTIVE QUEST
 * ============================================================
 *
 * Nếu active quest tồn tại:
 *
 *   → trả quest đó.
 *
 * Nếu không:
 *
 *   → tạo quest tiếp theo.
 *
 * Đây là entry point an toàn cho start / rounds.
 * ============================================================
 */

export async function ensureActiveQuest(
  supabase: SupabaseClient,
  input: EnsureActiveQuestInput
): Promise<GameQuest> {
  const active =
    await getActiveQuest(
      supabase,
      input.sessionId
    );

  if (active) {
    return active;
  }

  const quests =
    await getSessionQuests(
      supabase,
      input.sessionId
    );

  const questNumber =
    typeof input.questNumber ===
      "number" &&
    Number.isInteger(
      input.questNumber
    ) &&
    input.questNumber >= 1
      ? input.questNumber
      : getNextQuestNumber(
          quests
        );

  const quest =
    await createMainQuest(
      supabase,
      {
        roomId:
          input.roomId,

        sessionId:
          input.sessionId,

        questNumber,

        title:
          input.title ??
          `Hành trình #${questNumber}`,

        description:
          input.description ??
          "Một chặng đường mới bắt đầu.",

        objective:
          input.objective ??
          null,
      }
    );

  return quest;
}

/**
 * ============================================================
 * SET CURRENT OBJECTIVE
 * ============================================================
 *
 * Chỉ set objective cho active quest.
 *
 * Không tự advance.
 * Không tự complete.
 * Không tạo quest.
 * ============================================================
 */

export async function setQuestObjective(
  supabase: SupabaseClient,
  input: {
    questId: string;
    objective: string;
  }
): Promise<GameQuest> {
  const objective =
    input.objective.trim();

  if (!objective) {
    throw new Error(
      "Objective không được để trống."
    );
  }

  const current =
    await getQuestById(
      supabase,
      input.questId
    );

  if (!current) {
    throw new Error(
      "Không tìm thấy quest."
    );
  }

  if (current.status !== "active") {
    throw new Error(
      `Không thể set objective cho quest ${current.status}.`
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("game_quests")
    .update({
      current_objective:
        objective,
    })
    .eq("id", current.id)
    .eq("status", "active")
    .select(QUEST_SELECT)
    .single();

  if (error) {
    throw new Error(
      `Không thể cập nhật objective: ${error.message}`
    );
  }

  const quest =
    normalizeQuest(data);

  if (!quest) {
    throw new Error(
      "Quest sau khi cập nhật objective không hợp lệ."
    );
  }

  return quest;
}

/**
 * ============================================================
 * HAS COMPLETED OBJECTIVE
 * ============================================================
 */

export async function hasCompletedObjective(
  supabase: SupabaseClient,
  input: {
    questId: string;
    objectiveKey: string;
  }
): Promise<boolean> {
  const objectiveKey =
    input.objectiveKey.trim();

  if (!objectiveKey) {
    return false;
  }

  const quest =
    await getQuestById(
      supabase,
      input.questId
    );

  if (!quest) {
    return false;
  }

  return quest.completed_objectives.some(
    (objective) =>
      objective.key ===
      objectiveKey
  );
}

/**
 * ============================================================
 * COMPLETE CURRENT MINI QUEST
 * ============================================================
 *
 * MINI 1
 *
 *   0 → 1
 *
 * MINI 2
 *
 *   1 → COMPLETED
 *
 * ============================================================
 *
 * Quan trọng:
 *
 * Hàm này chỉ complete Mini hiện tại.
 *
 * Nó KHÔNG tạo Main Quest tiếp theo.
 *
 * Việc tạo Main Quest tiếp theo nằm trong advanceQuest().
 *
 * Điều này giúp caller đảm bảo:
 *
 *   resolve round
 *       ↓
 *   persist result
 *       ↓
 *   advance quest
 *
 * ============================================================
 */

export async function completeCurrentMiniQuest(
  supabase: SupabaseClient,
  input: {
    questId: string;
    round: number;
    objectiveKey: string;
    objectiveTitle: string;
  }
): Promise<{
  quest: GameQuest;
  mainQuestCompleted: boolean;
}> {
  if (
    !Number.isInteger(
      input.round
    ) ||
    input.round < 1
  ) {
    throw new Error(
      `Round không hợp lệ: ${input.round}`
    );
  }

  const objectiveKey =
    input.objectiveKey.trim();

  const objectiveTitle =
    input.objectiveTitle.trim();

  if (!objectiveKey) {
    throw new Error(
      "objectiveKey không được để trống."
    );
  }

  if (!objectiveTitle) {
    throw new Error(
      "objectiveTitle không được để trống."
    );
  }

  const current =
    await getQuestById(
      supabase,
      input.questId
    );

  if (!current) {
    throw new Error(
      "Không tìm thấy Main Quest."
    );
  }

  /**
   * ========================================================
   * IDEMPOTENCY
   * ========================================================
   *
   * Nếu quest đã completed:
   *
   * → không chạy transition lần nữa.
   *
   * Điều này bảo vệ trường hợp:
   *
   *   request retry
   *   double click
   *   realtime retry
   *   autoResolve retry
   */
  if (
    current.status ===
    "completed"
  ) {
    return {
      quest: current,
      mainQuestCompleted:
        true,
    };
  }

  if (
    current.status !==
    "active"
  ) {
    throw new Error(
      `Không thể complete quest có status=${current.status}.`
    );
  }

  /**
   * HARD GUARD:
   *
   * Không bao giờ cho state ngoài 0/1.
   */
  if (
    current.mini_index !== 0 &&
    current.mini_index !== 1
  ) {
    throw new Error(
      `Quest state không hợp lệ: mini_index=${current.mini_index}.`
    );
  }

  /**
   * ========================================================
   * DUPLICATE OBJECTIVE GUARD
   * ========================================================
   */

  const alreadyCompleted =
  current.completed_objectives.some(
    (objective) =>
      objective.key === objectiveKey
  );

if (alreadyCompleted) {
  return {
    quest: current,
    mainQuestCompleted: false,
  };
}

  /**
   * ========================================================
   * BUILD HISTORY
   * ========================================================
   */

  const completedObjectives: CompletedObjective[] =
    [
      ...current.completed_objectives,

      {
        key:
          objectiveKey,

        title:
          objectiveTitle,

        round:
          input.round,

        completed_at:
          new Date().toISOString(),
      },
    ];

  /**
   * ========================================================
   * MINI 1 → MINI 2
   * ========================================================
   */

  if (
    current.mini_index ===
    0
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("game_quests")
      .update({
        mini_index:
          1,

        /**
         * Objective cũ đã complete.
         *
         * Mini 2 cần objective mới.
         *
         * rounds.ts / AI sẽ set objective mới.
         */
        current_objective:
          null,

        completed_objectives:
          completedObjectives,
      })
      .eq(
        "id",
        current.id
      )
      .eq(
        "status",
        "active"
      )
      .eq(
        "mini_index",
        0
      )
      .select(
        QUEST_SELECT
      )
      .maybeSingle();

    if (error) {
      throw new Error(
        `Không thể chuyển Mini 1 → Mini 2: ${error.message}`
      );
    }

    /**
     * Nếu update không match row:
     *
     * Có thể request khác đã transition trước.
     *
     * Reload state thay vì tạo state giả.
     */
    if (!data) {
      const latest =
        await getQuestById(
          supabase,
          current.id
        );

      if (!latest) {
        throw new Error(
          "Quest không còn tồn tại sau transition Mini 1."
        );
      }

      return {
        quest:
          latest,

        mainQuestCompleted:
          latest.status ===
          "completed",
      };
    }

    const updated =
      normalizeQuest(data);

    if (!updated) {
      throw new Error(
        "Quest sau khi chuyển Mini 2 không hợp lệ."
      );
    }

    /**
     * Hard guard sau update.
     */
    if (
      updated.mini_index !==
      1
    ) {
      throw new Error(
        "Transition Mini 1 → Mini 2 trả về state không hợp lệ."
      );
    }

    return {
      quest:
        updated,

      mainQuestCompleted:
        false,
    };
  }

  /**
   * ========================================================
   * MINI 2 → MAIN QUEST COMPLETED
   * ========================================================
   */

  const completedAt =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from("game_quests")
    .update({
      status:
        "completed",

      current_objective:
        null,

      completed_objectives:
        completedObjectives,

      completed_at:
        completedAt,
    })
    .eq(
      "id",
      current.id
    )
    .eq(
      "status",
      "active"
    )
    .eq(
      "mini_index",
      1
    )
    .select(
      QUEST_SELECT
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Không thể hoàn thành Main Quest: ${error.message}`
    );
  }

  /**
   * Concurrent request:
   *
   * Request khác có thể đã complete quest.
   *
   * Reload state.
   */
  if (!data) {
    const latest =
      await getQuestById(
        supabase,
        current.id
      );

    if (!latest) {
      throw new Error(
        "Quest không còn tồn tại sau khi complete."
      );
    }

    return {
      quest:
        latest,

      mainQuestCompleted:
        latest.status ===
        "completed",
    };
  }

  const completedQuest =
    normalizeQuest(data);

  if (!completedQuest) {
    throw new Error(
      "Quest hoàn thành nhưng dữ liệu không hợp lệ."
    );
  }

  if (
    completedQuest.status !==
    "completed"
  ) {
    throw new Error(
      "Quest transition không đưa Main Quest về completed."
    );
  }

  return {
    quest:
      completedQuest,

    mainQuestCompleted:
      true,
  };
}

/**
 * ============================================================
 * ADVANCE QUEST
 * ============================================================
 *
 * Đây là transition API cấp cao.
 *
 * Flow:
 *
 *   MINI 1
 *      ↓
 *   MINI 2
 *
 * hoặc:
 *
 *   MINI 2
 *      ↓
 *   MAIN COMPLETED
 *      ↓
 *   NEXT MAIN QUEST
 *
 * ============================================================
 *
 * Chỉ backend gọi function này.
 *
 * AI không gọi function này.
 * ============================================================
 */

export async function advanceQuest(
  supabase: SupabaseClient,
  input: {
    roomId: string;
    sessionId: string;

    questId: string;

    round: number;

    objectiveKey: string;
    objectiveTitle: string;

    nextQuestTitle?: string;
    nextQuestDescription?: string;
    nextQuestObjective?: string | null;
  }
): Promise<QuestTransitionResult> {
  if (!input.roomId?.trim()) {
    throw new Error(
      "roomId không được để trống."
    );
  }

  if (!input.sessionId?.trim()) {
    throw new Error(
      "sessionId không được để trống."
    );
  }

  if (!input.questId?.trim()) {
    throw new Error(
      "questId không được để trống."
    );
  }

  /**
   * ========================================================
   * LOAD BEFORE STATE
   * ========================================================
   */

  const before =
    await getQuestById(
      supabase,
      input.questId
    );

  if (!before) {
    throw new Error(
      "Không tìm thấy quest trước khi advance."
    );
  }

  /**
   * Không cho một session khác sử dụng quest này.
   */
  if (
    before.session_id !==
    input.sessionId
  ) {
    throw new Error(
      "Quest không thuộc session hiện tại."
    );
  }

  if (
    before.room_id !==
    input.roomId
  ) {
    throw new Error(
      "Quest không thuộc room hiện tại."
    );
  }

  const previousMiniIndex =
    before.mini_index;

  /**
   * ========================================================
   * COMPLETE CURRENT MINI
   * ========================================================
   */

  const result =
    await completeCurrentMiniQuest(
      supabase,
      {
        questId:
          input.questId,

        round:
          input.round,

        objectiveKey:
          input.objectiveKey,

        objectiveTitle:
          input.objectiveTitle,
      }
    );

  /**
   * ========================================================
   * MINI 1 → MINI 2
   * ========================================================
   */

  if (
    !result.mainQuestCompleted
  ) {
    return {
      quest:
        result.quest,

      previousMiniIndex,

      currentMiniIndex:
        result.quest
          .mini_index,

      miniQuestCompleted:
        true,

      mainQuestCompleted:
        false,

      createdNextMainQuest:
        false,

      nextQuest:
        null,
    };
  }

  /**
   * ========================================================
   * MAIN QUEST COMPLETED
   * ========================================================
   *
   * Tại đây Main Quest cũ đã chắc chắn completed.
   *
   * Bây giờ mới được phép tạo Main Quest tiếp theo.
   * ========================================================
   */

  const nextQuestTitle =
    input.nextQuestTitle?.trim() ||
    `Hành trình #${
      result.quest.quest_number + 1
    }`;

  const nextQuestDescription =
    input.nextQuestDescription?.trim() ||
    "Một chặng đường mới bắt đầu.";

  const nextQuestObjective =
    typeof input.nextQuestObjective ===
    "string"
      ? input.nextQuestObjective.trim() ||
        null
      : null;

  /**
   * ========================================================
   * ENSURE NEXT MAIN QUEST
   * ========================================================
   *
   * Nếu request bị retry:
   *
   * - Main Quest cũ đã completed.
   * - Main Quest mới có thể đã được tạo.
   *
   * ensureActiveQuest() sẽ lấy quest đó
   * thay vì tạo thêm quest.
   * ========================================================
   */

  const nextQuest =
    await ensureActiveQuest(
      supabase,
      {
        roomId:
          input.roomId,

        sessionId:
          input.sessionId,

        questNumber:
          result.quest
              .quest_number +
          1,

        title:
          nextQuestTitle,

        description:
          nextQuestDescription,

        objective:
          nextQuestObjective,
      }
    );

  /**
   * Safety:
   *
   * Next quest phải khác quest vừa completed.
   */
  if (
    nextQuest.id ===
    result.quest.id
  ) {
    throw new Error(
      "Quest engine đã trả về cùng Main Quest sau transition."
    );
  }

  /**
   * Safety:
   *
   * Next quest phải là active.
   */
  if (
    nextQuest.status !==
    "active"
  ) {
    throw new Error(
      "Main Quest tiếp theo không ở trạng thái active."
    );
  }

  /**
   * Safety:
   *
   * Next quest luôn bắt đầu tại Mini 1.
   */
  if (
    nextQuest.mini_index !==
    0
  ) {
    throw new Error(
      "Main Quest mới không bắt đầu từ Mini Quest 1."
    );
  }

  return {
    quest:
      result.quest,

    previousMiniIndex,

    currentMiniIndex:
      result.quest
        .mini_index,

    miniQuestCompleted:
      true,

    mainQuestCompleted:
      true,

    createdNextMainQuest:
      true,

    nextQuest,
  };
}

/**
 * ============================================================
 * QUEST AI CONTEXT
 * ============================================================
 *
 * AI chỉ nhận STATE.
 *
 * AI không có quyền:
 *
 * - tạo quest
 * - complete quest
 * - đổi mini_index
 * - tạo Mini 3
 * - tự chuyển Main Quest
 *
 * ============================================================
 */

export type QuestAIContext = {
  main_quest_id: string;

  main_quest_number: number;

  main_quest_title: string;

  main_quest_description: string;

  /**
   * 1 hoặc 2.
   */
  mini_quest_index: 1 | 2;

  /**
   * Synthetic stable ID:
   *
   *   questUUID:mini:1
   *   questUUID:mini:2
   */
  mini_quest_id: string;

  /**
   * Objective hiện tại.
   */
  mini_quest_title:
    | string
    | null;

  /**
   * Quest engine đã hoàn thành Mini hiện tại chưa.
   *
   * Với active quest:
   *
   * luôn false.
   *
   * Field được giữ để tương thích AI context.
   */
  mini_quest_completed: boolean;

  /**
   * Quest status.
   */
  main_quest_completed: boolean;

  /**
   * Objective history.
   */
  completed_objectives: Array<{
    key: string;
    title: string;
    round: number;
  }>;
};

/**
 * ============================================================
 * BUILD QUEST AI CONTEXT
 * ============================================================
 */

export function buildQuestAIContext(
  quest: GameQuest | null
): QuestAIContext | null {
  if (!quest) {
    return null;
  }

  /**
   * Database:
   *
   * 0 → Mini 1
   * 1 → Mini 2
   *
   * AI:
   *
   * 1 → Mini 1
   * 2 → Mini 2
   */
  const miniQuestIndex =
    quest.mini_index === 0
      ? 1
      : 2;

  return {
    main_quest_id:
      quest.id,

    main_quest_number:
      quest.quest_number,

    main_quest_title:
      quest.title,

    main_quest_description:
      quest.description,

    mini_quest_index:
      miniQuestIndex,

    mini_quest_id:
      makeObjectiveKey(
        quest.id,
        quest.mini_index
      ),

    mini_quest_title:
      quest.current_objective,

    /**
     * Active quest nghĩa là mini hiện tại
     * vẫn đang chạy.
     */
    mini_quest_completed:
      false,

    main_quest_completed:
      quest.status ===
      "completed",

    completed_objectives:
      quest.completed_objectives.map(
        (objective) => ({
          key:
            objective.key,

          title:
            objective.title,

          round:
            objective.round,
        })
      ),
  };
}

/**
 * ============================================================
 * CHECK MAIN QUEST COMPLETED
 * ============================================================
 */

export function isMainQuestCompleted(
  quest: GameQuest | null
): boolean {
  return (
    quest?.status ===
    "completed"
  );
}

/**
 * ============================================================
 * GET CURRENT MINI NUMBER
 * ============================================================
 */

export function getCurrentMiniQuestNumber(
  quest: GameQuest
): 1 | 2 {
  if (
    quest.mini_index ===
    0
  ) {
    return 1;
  }

  return 2;
}

/**
 * ============================================================
 * GET CURRENT MINI LABEL
 * ============================================================
 */

export function getCurrentMiniQuestLabel(
  quest: GameQuest
): string {
  return `Mini Quest ${getCurrentMiniQuestNumber(
    quest
  )}/2`;
}