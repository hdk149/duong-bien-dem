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

function buildAIContext(
  round: number,
  players: Player[]
): AIHostContext {
  return {
    round,

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
    })),
  };
}

/* =====================================================
   FALLBACK PRIVATE EVENT
   ===================================================== */

function buildFallbackPrivateEvent(
  round: number,
  player: Player
) {
  return {
    title:
      `Một ngày mới - Vòng ${round}`,

    description:
      `Bạn đang ở ${player.location}. Một ngày mới bắt đầu và bạn cần quyết định bước tiếp theo trong hành trình của mình.`,

    event_type:
      "normal",

    choices: [
      {
        id: "a",

        title:
          "Tiếp tục tiến lên",

        description:
          "Bạn quyết định tiếp tục hành trình.",
      },

      {
        id: "b",

        title:
          "Tìm cơ hội kiếm tiền",

        description:
          "Bạn dành thời gian tìm một cơ hội mới.",
      },

      {
        id: "c",

        title:
          "Nghỉ ngơi",

        description:
          "Bạn tạm thời nghỉ ngơi để chuẩn bị cho chặng tiếp theo.",
      },

      {
        id: "d",

        title:
          "Khám phá khu vực",

        description:
          "Bạn khám phá nơi mình đang ở.",
      },
    ],
  };
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
     AI CONTEXT
     ===================================================== */

  const aiContext =
    buildAIContext(
      round,
      activePlayers
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
            player
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
  "type" in event
    ? event.type
    : event.event_type,

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