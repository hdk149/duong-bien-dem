// lib/game/quest-flow.ts

/**
 * QUEST FLOW
 *
 * Đây là source of truth cho flow Quest của game.
 *
 * Quy tắc hiện tại:
 * - 1 Quest = 5 rounds
 * - Quest 1 = R1-R5
 * - Quest 2 = R6-R10
 * - Quest 3 = R11-R15
 * - Quest 4 = R16-R20
 * - ...
 *
 * Các file khác KHÔNG nên tự tính quest number / round_in_quest.
 * Hãy gọi function từ file này.
 */

export const ROUNDS_PER_QUEST = 5;

export type QuestState = {
  questNumber: number;

  startRound: number;

  endRound: number;

  roundInQuest: number;

  isNewQuest: boolean;

  isQuestEnd: boolean;
};

/**
 * Lấy toàn bộ trạng thái Quest của một round.
 *
 * Ví dụ:
 *
 * R1 -> Quest 1 / 1-5 / round 1
 * R5 -> Quest 1 / 1-5 / round 5
 * R6 -> Quest 2 / 6-10 / round 1
 * R10 -> Quest 2 / 6-10 / round 5
 * R11 -> Quest 3 / 11-15 / round 1
 */
export function getQuestState(
  round: number
): QuestState {
  if (
    !Number.isInteger(round) ||
    round < 1
  ) {
    throw new Error(
      "round must be a positive integer."
    );
  }

  const questNumber =
    Math.floor(
      (round - 1) /
        ROUNDS_PER_QUEST
    ) + 1;

  const startRound =
    (questNumber - 1) *
      ROUNDS_PER_QUEST +
    1;

  const endRound =
    questNumber *
    ROUNDS_PER_QUEST;

  const roundInQuest =
    round -
      startRound +
    1;

  return {
    questNumber,

    startRound,

    endRound,

    roundInQuest,

    isNewQuest:
      round ===
      startRound,

    isQuestEnd:
      round ===
      endRound,
  };
}

/**
 * Quest hiện tại có bắt đầu ở round này không?
 */
export function isNewQuest(
  round: number
): boolean {
  return getQuestState(
    round
  ).isNewQuest;
}

/**
 * Quest hiện tại có kết thúc ở round này không?
 */
export function isQuestEnd(
  round: number
): boolean {
  return getQuestState(
    round
  ).isQuestEnd;
}

/**
 * Lấy số Quest.
 *
 * R1-R5   -> 1
 * R6-R10  -> 2
 * R11-R15 -> 3
 */
export function getQuestNumber(
  round: number
): number {
  return getQuestState(
    round
  ).questNumber;
}

/**
 * Lấy round hiện tại bên trong Quest.
 *
 * R1 -> 1
 * R2 -> 2
 * ...
 * R5 -> 5
 * R6 -> 1
 */
export function getRoundInQuest(
  round: number
): number {
  return getQuestState(
    round
  ).roundInQuest;
}

/**
 * Lấy round bắt đầu của Quest hiện tại.
 */
export function getQuestStartRound(
  round: number
): number {
  return getQuestState(
    round
  ).startRound;
}

/**
 * Lấy round kết thúc của Quest hiện tại.
 */
export function getQuestEndRound(
  round: number
): number {
  return getQuestState(
    round
  ).endRound;
}

/**
 * Lấy Quest kế tiếp.
 *
 * R1-R5 -> Quest 2
 * R6-R10 -> Quest 3
 */
export function getNextQuestState(
  round: number
): QuestState {
  const current =
    getQuestState(round);

  return getQuestState(
    current.endRound + 1
  );
}

/**
 * Kiểm tra xem round hiện tại có phải
 * round đầu tiên của một Quest mới không.
 *
 * Dùng khi tạo objective mới.
 */
export function shouldStartNewObjective(
  round: number
): boolean {
  return isNewQuest(round);
}

/**
 * Kiểm tra xem round hiện tại có phải
 * round cuối của Quest không.
 *
 * Dùng trước khi chuyển sang Quest tiếp theo.
 */
export function shouldCompleteQuest(
  round: number
): boolean {
  return isQuestEnd(round);
}

/**
 * Lấy thông tin dạng text để đưa cho AI.
 *
 * Function này chỉ tạo CONTEXT.
 * AI không được dùng nó để quyết định state.
 */
export function getQuestAIContext(
  round: number
): {
  quest_number: number;
  quest_start_round: number;
  quest_end_round: number;
  round_in_quest: number;
  is_new_quest: boolean;
  is_quest_end: boolean;
  rounds_per_quest: number;
} {
  const state =
    getQuestState(round);

  return {
    quest_number:
      state.questNumber,

    quest_start_round:
      state.startRound,

    quest_end_round:
      state.endRound,

    round_in_quest:
      state.roundInQuest,

    is_new_quest:
      state.isNewQuest,

    is_quest_end:
      state.isQuestEnd,

    rounds_per_quest:
      ROUNDS_PER_QUEST,
  };
}

/**
 * Validate một Quest transition.
 *
 * Dùng để backend kiểm tra xem round
 * có đang chuyển đúng flow hay không.
 */
export function validateQuestTransition(
  previousRound: number,
  nextRound: number
): {
  valid: boolean;
  reason: string;
} {
  if (
    !Number.isInteger(
      previousRound
    ) ||
    !Number.isInteger(
      nextRound
    )
  ) {
    return {
      valid: false,
      reason:
        "Round must be an integer.",
    };
  }

  if (
    previousRound < 1 ||
    nextRound < 1
  ) {
    return {
      valid: false,
      reason:
        "Round must be positive.",
    };
  }

  if (
    nextRound !==
    previousRound + 1
  ) {
    return {
      valid: false,
      reason:
        "Quest flow can only advance one round at a time.",
    };
  }

  const previous =
    getQuestState(
      previousRound
    );

  const next =
    getQuestState(
      nextRound
    );

  /*
   * Nếu round trước chưa kết thúc Quest,
   * round tiếp theo phải vẫn ở cùng Quest.
   */
  if (
    !previous.isQuestEnd &&
    previous.questNumber !==
      next.questNumber
  ) {
    return {
      valid: false,
      reason:
        "Quest changed before the previous Quest ended.",
    };
  }

  /*
   * Nếu round trước là round cuối,
   * round tiếp theo bắt buộc phải là Quest mới.
   */
  if (
    previous.isQuestEnd &&
    next.questNumber !==
      previous.questNumber + 1
  ) {
    return {
      valid: false,
      reason:
        "Next round must start the next Quest.",
    };
  }

  if (
    previous.isQuestEnd &&
    !next.isNewQuest
  ) {
    return {
      valid: false,
      reason:
        "Next round must be marked as a new Quest.",
    };
  }

  return {
    valid: true,
    reason:
      "Quest transition is valid.",
  };
}

/**
 * Helper dùng khi debug.
 */
export function describeQuest(
  round: number
): string {
  const state =
    getQuestState(round);

  return [
    `Quest #${state.questNumber}`,
    `Round ${state.roundInQuest}/${ROUNDS_PER_QUEST}`,
    `R${state.startRound}-R${state.endRound}`,
    state.isNewQuest
      ? "NEW QUEST"
      : "",
    state.isQuestEnd
      ? "QUEST END"
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
}