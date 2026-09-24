import type { SupabaseClient } from "@supabase/supabase-js";
import type { Player } from "./types";
import {
  generateAIHostEvents,
  type AIHostContext,
} from "./ai/host";

export type GeneratePlayerRoundEventsInput = {
  supabase: SupabaseClient;
  roomId: string;
  sessionId: string;
  round: number;
  players: Player[];
  sourceEventId?: string | null;
};

export type GeneratedPlayerRoundEvent = {
  id: string;
  room_id: string;
  session_id: string;
  round: number;
  player_id: string;
  source_event_id: string | null;
  title: string;
  description: string;
  event_type: string;
  choices: unknown[];
  selected_choice_id: string | null;
  result: unknown | null;
  status: string;
};

export function isMoneyQuestRound(round: number): boolean {
  return (
    round >= 6 &&
    (round - 6) % 5 === 0
  );
}

function buildAIContext(
  round: number,
  players: Player[],
  recentEventsByPlayer: Map<
    string,
    {
      round: number;
      title: string;
      description: string;
      status: string | null;
      event_type: string | null;
    }[]
  >
): AIHostContext {
  return {
    round,

    isMoneyQuestRound:
      isMoneyQuestRound(round),

    players: players.map((player) => ({
      id: player.id,

      player_name:
        player.player_name,

      hp:
        player.hp,

      money:
        player.money,

      location:
        player.location,

      legal_risk:
        player.legal_risk,

      last_choice:
        player.last_choice,

      rounds_in_location:
        (player as typeof player & {
          rounds_in_location?: number;
        }).rounds_in_location ?? 1,

      recent_events:
        recentEventsByPlayer.get(player.id) ?? [],
    })),
  };
}


/* =====================================================
   FALLBACK PRIVATE EVENT
   ===================================================== */

function buildFallbackPrivateEvent(
  round: number,
  player: Player,
  moneyQuest: boolean
) {
  if (moneyQuest) {
    return {
      title:
        `Cơ hội kiếm tiền lớn - Vòng ${round}`,

      description:
        `Một cơ hội công việc có giá trị xuất hiện tại ${player.location}. Công việc đòi hỏi bạn phải tự quyết định cách tiếp cận và chấp nhận rủi ro trước khi biết kết quả.`,

      event_type:
        "money_main_quest",

      choices: [
        {
          id: "a",
          title:
            "Nhận cơ hội và làm ngay",
          description:
            "Bạn chấp nhận công việc và bắt đầu thực hiện.",
        },
        {
          id: "b",
          title:
            "Tìm hiểu kỹ trước",
          description:
            "Bạn kiểm tra thông tin, người thuê và điều kiện trước khi quyết định.",
        },
        {
          id: "c",
          title:
            "Thương lượng lại",
          description:
            "Bạn cố gắng giảm rủi ro và cải thiện điều kiện của công việc.",
        },
        {
          id: "d",
          title:
            "Từ chối",
          description:
            "Bạn bỏ qua cơ hội và giữ nguyên tình trạng hiện tại.",
        },
      ],
    };
  }

  const variants = [
    {
      title: `Một dấu hiệu bất thường - Vòng ${round}`,
      description:
        `Tại ${player.location}, bạn nhận ra một chi tiết bất thường có thể ảnh hưởng đến kế hoạch hiện tại. Bạn cần quyết định có nên kiểm tra hay tiếp tục.`,
      choices: [
        {
          id: "a",
          title: "Kiểm tra",
          description: "Bạn dành thời gian tìm hiểu chuyện gì đang xảy ra.",
        },
        {
          id: "b",
          title: "Bỏ qua",
          description: "Bạn không để chuyện này làm lệch kế hoạch.",
        },
        {
          id: "c",
          title: "Hỏi người gần đó",
          description: "Bạn tìm một người có thể cung cấp thêm thông tin.",
        },
        {
          id: "d",
          title: "Chờ thêm",
          description: "Bạn quan sát thêm trước khi quyết định.",
        },
      ],
    },
    {
      title: `Một cơ hội nhỏ - Vòng ${round}`,
      description:
        `Một cơ hội thực tế xuất hiện gần ${player.location}. Nó chưa chắc mang lại lợi ích, nhưng có thể mở ra một hướng mới nếu bạn chủ động tìm hiểu.`,
      choices: [
        {
          id: "a",
          title: "Tìm hiểu",
          description: "Bạn hỏi kỹ về cơ hội này.",
        },
        {
          id: "b",
          title: "Thử ngay",
          description: "Bạn chủ động tiếp cận cơ hội.",
        },
        {
          id: "c",
          title: "Thương lượng",
          description: "Bạn tìm cách giảm rủi ro trước khi tham gia.",
        },
        {
          id: "d",
          title: "Bỏ qua",
          description: "Bạn giữ kế hoạch hiện tại.",
        },
      ],
    },
    {
      title: `Một vấn đề đời thường - Vòng ${round}`,
      description:
        `Một vấn đề nhỏ phát sinh tại ${player.location}. Nó chưa phải khủng hoảng, nhưng cách bạn xử lý có thể ảnh hưởng đến những việc tiếp theo.`,
      choices: [
        {
          id: "a",
          title: "Giải quyết ngay",
          description: "Bạn xử lý vấn đề trước khi tiếp tục.",
        },
        {
          id: "b",
          title: "Tìm người giúp",
          description: "Bạn nhờ một người phù hợp hỗ trợ.",
        },
        {
          id: "c",
          title: "Tạm hoãn",
          description: "Bạn giữ vấn đề lại và ưu tiên kế hoạch hiện tại.",
        },
        {
          id: "d",
          title: "Tìm phương án khác",
          description: "Bạn thử một cách xử lý khác.",
        },
      ],
    },
  ];

  return variants[
    Math.max(0, round - 1) % variants.length
  ];
}


/**
 * Generate one private event for every active player.
 *
 * IMPORTANT:
 * - host vẫn được tính là player
 * - spectator không được truyền vào
 * - AI chỉ tạo event
 * - effects từ AI KHÔNG được áp dụng ở bước này
 * - stats chỉ được thay đổi ở bước resolve
 *
 * IMPORTANT:
 * - Nếu AI timeout / fetch fail, dùng fallback event
 * - AI failure KHÔNG được làm round rollback
 * - DB failure vẫn throw vì đó là lỗi thật cần xử lý
 */
export async function generatePlayerRoundEvents(
  input: GeneratePlayerRoundEventsInput
): Promise<GeneratedPlayerRoundEvent[]> {
  const {
    supabase,
    roomId,
    sessionId,
    round,
    players,
    sourceEventId = null,
  } = input;

  if (!roomId) {
    throw new Error(
      "roomId is required."
    );
  }

  if (!sessionId) {
    throw new Error(
      "sessionId is required."
    );
  }

  if (
    !Number.isInteger(round) ||
    round < 1
  ) {
    throw new Error(
      "round must be a positive integer."
    );
  }

  if (players.length === 0) {
    throw new Error(
      "Cannot generate player events without players."
    );
  }

  /* =====================================================
     ACTIVE PLAYERS ONLY
     ===================================================== */

  const activePlayers =
    players.filter((player) => {
      if (
        player.role ===
        "spectator"
      ) {
        return false;
      }

      return true;
    });

  if (
    activePlayers.length === 0
  ) {
    throw new Error(
      "No active players available."
    );
  }

  /* =====================================================
     CHECK EXISTING EVENTS
     ===================================================== */

  const {
    data: existingEvents,
    error: existingEventsError,
  } = await supabase
    .from(
      "player_round_events"
    )
    .select(
      `
        id,
        room_id,
        session_id,
        round,
        player_id,
        source_event_id,
        title,
        description,
        event_type,
        choices,
        selected_choice_id,
        result,
        status
      `
    )
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "session_id",
      sessionId
    )
    .eq(
      "round",
      round
    )
    .in(
      "player_id",
      activePlayers.map(
        (player) =>
          player.id
      )
    );

  if (
    existingEventsError
  ) {
    throw new Error(
      `Failed to load existing player events: ${existingEventsError.message}`
    );
  }

  const existingByPlayer =
    new Map<
      string,
      GeneratedPlayerRoundEvent
    >();

  for (
    const event of
      existingEvents ?? []
  ) {
    existingByPlayer.set(
      event.player_id,
      event as GeneratedPlayerRoundEvent
    );
  }

  /* =====================================================
     IF EVERY PLAYER ALREADY HAS AN EVENT
     ===================================================== */

  if (
    existingByPlayer.size ===
    activePlayers.length
  ) {
    return activePlayers.map(
      (player) => {
        const event =
          existingByPlayer.get(
            player.id
          );

        if (!event) {
          throw new Error(
            `Existing player event missing for ${player.id}.`
          );
        }

        return event;
      }
    );
  }

  /* =====================================================
     RECENT EVENT HISTORY

     Load the last five private events per player from this
     session so the AI can distinguish story continuation
     from repeating the same scene.
     ===================================================== */

  const {
    data: recentEventRows,
    error: recentEventsError,
  } = await supabase
    .from("player_round_events")
    .select(
      `
        player_id,
        round,
        title,
        description,
        status,
        event_type
      `
    )
    .eq("room_id", roomId)
    .eq("session_id", sessionId)
    .lt("round", round)
    .in(
      "player_id",
      activePlayers.map((player) => player.id)
    )
    .order("round", { ascending: false })
    .limit(activePlayers.length * 4);

  if (recentEventsError) {
    throw new Error(
      `Failed to load recent player event history: ${recentEventsError.message}`
    );
  }

  const recentEventsByPlayer =
    new Map<
      string,
      {
        round: number;
        title: string;
        description: string;
        status: string | null;
        event_type: string | null;
      }[]
    >();

  for (const row of recentEventRows ?? []) {
    const current =
      recentEventsByPlayer.get(row.player_id) ?? [];

    if (current.length >= 4) {
      continue;
    }

    current.push({
      round: row.round,
      title: String(row.title ?? "").slice(0, 140),
      description: String(row.description ?? "").slice(0, 260),
      status: row.status ?? null,
      event_type: row.event_type ?? null,
    });

    recentEventsByPlayer.set(
      row.player_id,
      current
    );
  }

  /* =====================================================
     AI CONTEXT
     ===================================================== */

  const aiContext =
    buildAIContext(
      round,
      activePlayers,
      recentEventsByPlayer
    );

  /* =====================================================
     GENERATE AI EVENTS
     
     AI FAILURE IS NON-FATAL.
     
     If Gemini is unavailable / timeout / network error,
     we continue with fallback events so that the game
     can still advance to the next round.
     ===================================================== */

  let aiResponse:
    | Awaited<
        ReturnType<
          typeof generateAIHostEvents
        >
      >
    | null = null;

  try {
    aiResponse =
      await generateAIHostEvents(
        aiContext
      );

    if (
      aiResponse.round !==
      round
    ) {
      console.warn(
        "AI returned unexpected round. Using fallback events.",
        {
          expectedRound:
            round,

          receivedRound:
            aiResponse.round,
        }
      );

      aiResponse =
        null;
    }

    /*
     * The round scheduler is the source of truth.
     * Never allow AI to change the Money Quest schedule.
     */
    if (aiResponse) {
      const moneyQuest =
        isMoneyQuestRound(round);

      const invalidMoneySchedule =
        aiResponse.players.some(
          (result) =>
            moneyQuest
              ? result.event.type !==
                "money_main_quest"
              : result.event.type ===
                "money_main_quest"
        );

      if (invalidMoneySchedule) {
        console.warn(
          "AI violated Money Quest schedule. Using fallback events."
        );

        aiResponse =
          null;
      }
    }
  } catch (error) {
    console.error(
      "AI HOST EVENT GENERATION FAILED:",
      error
    );
    aiResponse = null;
  }

  /* =====================================================
     CREATE ROWS
     
     Existing events are NEVER overwritten.
     Missing players receive either:
     
     1. AI-generated event
     2. fallback event
     
     depending on AI availability.
     ===================================================== */

  const rowsToInsert =
    activePlayers
      .filter(
        (player) =>
          !existingByPlayer.has(
            player.id
          )
      )
      .map((player) => {
        const aiPlayerResult =
          aiResponse?.players.find(
            (result) =>
              result.player_id ===
              player.id
          );

        const fallback =
          buildFallbackPrivateEvent(
            round,
            player,
            isMoneyQuestRound(round)
          );

        const event =
          aiPlayerResult?.event
            ? aiPlayerResult.event
            : fallback;

        return {
          room_id:
            roomId,

          session_id:
            sessionId,

          round,

          player_id:
            player.id,

          source_event_id:
            sourceEventId,

          title:
            event.title,

          description:
            event.description,

          event_type:
            isMoneyQuestRound(round)
              ? "money_main_quest"
              : (
                  "type" in event
                    ? event.type
                    : "event_type" in event
                      ? event.event_type
                      : "normal"
                ),

          choices:
            event.choices,

          selected_choice_id:
            null,

          /*
           * IMPORTANT:
           *
           * AI effects are intentionally NOT saved here.
           *
           * This event has not been answered yet.
           *
           * The player's stats must NOT change merely
           * because the event was generated.
           */
          result:
            null,

          status:
            "pending",
        };
      });

  if (
    rowsToInsert.length ===
    0
  ) {
    return activePlayers.map(
      (player) => {
        const event =
          existingByPlayer.get(
            player.id
          );

        if (!event) {
          throw new Error(
            `Player event missing for ${player.id}.`
          );
        }

        return event;
      }
    );
  }

  /* =====================================================
     UPSERT
     
     Unique constraint:
       (session_id, round, player_id)
     
     This protects against two requests trying to
     generate the same player's event simultaneously.
     ===================================================== */

  const {
    error: insertError,
  } = await supabase
    .from(
      "player_round_events"
    )
    .upsert(
      rowsToInsert,
      {
        onConflict:
          "session_id,round,player_id",

        ignoreDuplicates:
          true,
      }
    )
    .select(
      `
        id,
        room_id,
        session_id,
        round,
        player_id,
        source_event_id,
        title,
        description,
        event_type,
        choices,
        selected_choice_id,
        result,
        status
      `
    );

  if (insertError) {
    throw new Error(
      `Failed to create player round events: ${insertError.message}`
    );
  }

  /* =====================================================
     RELOAD SOURCE OF TRUTH
     
     Do not rely only on insertedEvents because
     ignoreDuplicates can cause some rows to already
     exist.
     ===================================================== */

  const {
    data: finalEvents,
    error: finalEventsError,
  } = await supabase
    .from(
      "player_round_events"
    )
    .select(
      `
        id,
        room_id,
        session_id,
        round,
        player_id,
        source_event_id,
        title,
        description,
        event_type,
        choices,
        selected_choice_id,
        result,
        status
      `
    )
    .eq(
      "room_id",
      roomId
    )
    .eq(
      "session_id",
      sessionId
    )
    .eq(
      "round",
      round
    )
    .in(
      "player_id",
      activePlayers.map(
        (player) =>
          player.id
      )
    );

  if (
    finalEventsError
  ) {
    throw new Error(
      `Failed to reload player round events: ${finalEventsError.message}`
    );
  }

  const finalByPlayer =
    new Map<
      string,
      GeneratedPlayerRoundEvent
    >();

  for (
    const event of
      finalEvents ?? []
  ) {
    finalByPlayer.set(
      event.player_id,
      event as GeneratedPlayerRoundEvent
    );
  }

  /* =====================================================
     INTEGRITY CHECK
     
     Every active player MUST have exactly one event.
     ===================================================== */

  for (
    const player of
      activePlayers
  ) {
    if (
      !finalByPlayer.has(
        player.id
      )
    ) {
      throw new Error(
        `Player round event was not created for ${player.player_name} (${player.id}).`
      );
    }
  }

  return activePlayers.map(
    (player) => {
      const event =
        finalByPlayer.get(
          player.id
        );

      if (!event) {
        throw new Error(
          `Player event missing for ${player.id}.`
        );
      }

      return event;
    }
  );
}