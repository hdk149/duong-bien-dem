import type {
  EventData,
  Player,
  PlayerVote,
} from "./types";

import type {
  PlayerStats,
} from "./stats";

import {
  generateAIHostRoundBatch,
  type AIOutcomeContext,
} from "./ai/host";

import type {
  ValidatedAIOutcomeResponse,
} from "./ai/validate";

import {
  applyPlayerResult,
  type PlayerResultApplication,
} from "./apply-player-result";

/* =====================================================
   PLAYER ROUND EVENT TYPE
   ===================================================== */

export type ResolvePlayerRoundEvent = {
  id: string;
  player_id: string;

  title: string;
  description: string;

  event_type: string;

  destination:
    | string
    | null;

  choices: unknown[];

  selected_choice_id:
    | string
    | null;

  source_event_id:
    | string
    | null;
};

/* =====================================================
   ROUND RESOLVER TYPES
   ===================================================== */

export type RoundResolveInput = {
  round: number;

  /*
   * Shared/source event.
   *
   * Kept for compatibility with the existing
   * resolve route and result structure.
   */
  event: EventData;

  players: Player[];

  votes: PlayerVote[];

  /*
   * The actual private event shown to each player.
   *
   * This is the event that must be used when resolving
   * that player's choice.
   */
  playerEvents: ResolvePlayerRoundEvent[];
};

export type PlayerRoundResolveResult = {
  player: Player;

  vote: PlayerVote;

  playerEvent:
    ResolvePlayerRoundEvent;

  application:
    PlayerResultApplication;
};

export type RoundResolveResult = {
  round: number;

  event: EventData;

  players:
    PlayerRoundResolveResult[];

  aiResponse:
    ValidatedAIOutcomeResponse;
  nextEvents:
  import("./ai/validate").ValidatedAIEventResponse;  

};

/* =====================================================
   GET PLAYER STATS
   ===================================================== */

function getPlayerStats(
  player: Player
): PlayerStats {
  return {
    hp:
      player.hp,

    money:
      player.money,

    location:
      player.location,

    legal_risk:
      player.legal_risk,
  };
}

/* =====================================================
   NORMALIZE PRIVATE EVENT CHOICES
   =====================================================

   player_round_events currently stores choices as JSON.

   Older fallback events use:

     {
       id,
       title,
       description
     }

   AI events use:

     {
       id,
       text
     }

   The outcome AI only needs id + text.
   ===================================================== */

function normalizeChoices(
  choices: unknown
): {
  id: string;
  text: string;
}[] {
  if (!Array.isArray(choices)) {
    throw new Error(
      "Player event choices must be an array."
    );
  }

  return choices.map(
    (
      choice,
      index
    ) => {
      if (
        typeof choice !==
        "object" ||
        choice === null
      ) {
        throw new Error(
          `Invalid choice at index ${index}.`
        );
      }

      const raw =
        choice as Record<
          string,
          unknown
        >;

      const id =
        typeof raw.id ===
        "string"
          ? raw.id
          : "";

      if (!id) {
        throw new Error(
          `Player event choice at index ${index} has no id.`
        );
      }

      const text =
        typeof raw.text ===
        "string"
          ? raw.text
          : typeof raw.title ===
              "string"
            ? raw.title
            : typeof raw.description ===
                "string"
              ? raw.description
              : "";

      if (!text) {
        throw new Error(
          `Player event choice ${id} has no text.`
        );
      }

      return {
        id,
        text,
      };
    }
  );
}

/* =====================================================
   BUILD AI OUTCOME CONTEXT
   ===================================================== */

function buildAIOutcomeContext(
  round: number,
  players: Player[],
  playerEvents: ResolvePlayerRoundEvent[],
  voteMap: Map<
    string,
    PlayerVote
  >
): AIOutcomeContext {
  return {
    round,

    players:
      players.map(
        (player) => {
          const playerEvent =
            playerEvents.find(
              (event) =>
                event.player_id ===
                player.id
                
            );

          if (!playerEvent) {
            throw new Error(
              `Player event missing for ${player.id}.`
            );
          }

          const vote =
            voteMap.get(
              player.id
            );

          if (!vote) {
            throw new Error(
              `Vote missing for ${player.id}.`
            );
          }

          const choices =
            normalizeChoices(
              playerEvent.choices
            );

          const chosenChoice =
            choices.find(
              (choice) =>
                choice.id ===
                vote.choice_id
            );

          if (!chosenChoice) {
            throw new Error(
              `Choice ${vote.choice_id} does not exist in player event ${playerEvent.id}.`
            );
          }

          return {
            id:
              player.id,

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

            event: {
  title:
    playerEvent.title,

  description:
    playerEvent.description,

  type:
    playerEvent.event_type,

  destination:
    playerEvent.destination ?? null,

  choices,
},

            chosen_choice_id:
              chosenChoice.id,

            chosen_choice_text:
              chosenChoice.text,
          };
        }
      ),
  };
}

/* =====================================================
   RESOLVE ROUND
   ===================================================== */

export async function resolveRound(
  input: RoundResolveInput
): Promise<RoundResolveResult> {
  const {
    round,
    event,
    players,
    votes,
    playerEvents,
  } = input;

  /* ===================================================
     BASIC VALIDATION
     =================================================== */

  if (
    players.length ===
    0
  ) {
    throw new Error(
      "Cannot resolve round without players."
    );
  }

  if (
    votes.length !==
    players.length
  ) {
    throw new Error(
      `Expected ${players.length} votes, received ${votes.length}.`
    );
  }

  if (
    playerEvents.length !==
    players.length
  ) {
    throw new Error(
      `Expected ${players.length} player events, received ${playerEvents.length}.`
    );
  }

  /* ===================================================
     MAP VOTES
     =================================================== */

  const voteMap =
    new Map<
      string,
      PlayerVote
    >();

  for (
    const vote of
      votes
  ) {
    if (
      !voteMap.has(
        vote.player_id
      )
    ) {
      voteMap.set(
        vote.player_id,
        vote
      );
    }
  }

  /* ===================================================
     VERIFY EVERY PLAYER HAS:
     
     - a vote
     - a private event
     - the selected choice exists
     =================================================== */

  for (
    const player of
      players
  ) {
    const vote =
      voteMap.get(
        player.id
      );

    if (!vote) {
      throw new Error(
        `Missing vote for player ${player.id}.`
      );
    }

    const playerEvent =
      playerEvents.find(
        (event) =>
          event.player_id ===
          player.id
      );

    if (!playerEvent) {
      throw new Error(
        `Player event missing for player ${player.id}.`
      );
    }

    const choices =
      normalizeChoices(
        playerEvent.choices
      );

    const selectedChoice =
      choices.find(
        (choice) =>
          choice.id ===
          vote.choice_id
      );

    if (!selectedChoice) {
      throw new Error(
        `Selected choice ${vote.choice_id} does not belong to player ${player.id}'s event.`
      );
    }
  }

  /* ===================================================
     GENERATE OUTCOMES
     
     IMPORTANT:
     
     Gemini receives the EXACT event and EXACT choice
     for every player.
     
     It does NOT generate a new event here.
     =================================================== */

  const aiContext =
    buildAIOutcomeContext(
      round,
      players,
      playerEvents,
      voteMap
    );

    

  let aiResponse:
  ValidatedAIOutcomeResponse;

let nextEvents:
  import("./ai/validate").ValidatedAIEventResponse;

try {
  const batch =
    await generateAIHostRoundBatch({
      round,

      outcomePlayers:
        aiContext.players,

      nextRoundPlayers:
        aiContext.players,
    });

  aiResponse =
    batch.outcomes;

  nextEvents =
    batch.nextEvents;
} catch (error) {
  console.warn(
    "GEMINI ROUND BATCH FAILED — using safe fallback.",
    error
  );

  aiResponse = {
    round,

    players:
      players.map(
        (player) => ({
          player_id:
            player.id,

          effects: {
            hp: 0,
            money: 0,
            legal_risk: 0,
          },
        })
      ),
  };

  nextEvents = {
    round:
      round + 1,

    players:
      players.map(
        (player) => ({
          player_id:
            player.id,

          event: {
            title:
              `Một ngày mới - Vòng ${round + 1}`,

            description:
              `Bạn đang ở ${player.location}. Một ngày mới bắt đầu và bạn phải quyết định bước tiếp theo.`,

            type:
              "normal",

            choices: [
              {
                id: "continue",
                text:
                  "Tiếp tục tiến lên",
              },
              {
                id: "money",
                text:
                  "Tìm cơ hội kiếm tiền",
              },
              {
                id: "rest",
                text:
                  "Nghỉ ngơi",
              },
              {
                id: "explore",
                text:
                  "Khám phá khu vực",
              },
            ],
          },
        })
      ),
  };
}

  /* ===================================================
     APPLY OUTCOMES
     =================================================== */

  const resolvedPlayers:
    PlayerRoundResolveResult[] =
    [];

  for (
    const player of
      players
  ) {
    const vote =
      voteMap.get(
        player.id
      );

    if (!vote) {
      throw new Error(
        `Missing vote for player ${player.id}.`
      );
    }

    const playerEvent =
      playerEvents.find(
        (event) =>
          event.player_id ===
          player.id
      );

    if (!playerEvent) {
      throw new Error(
        `Player event missing for player ${player.id}.`
      );
    }

    const aiOutcome =
      aiResponse.players.find(
        (result) =>
          result.player_id ===
          player.id
      );

    if (!aiOutcome) {
      throw new Error(
        `AI outcome missing for player ${player.id}.`
      );
    }

    /*
     * Convert the DB private event into the AIEvent
     * structure expected by applyPlayerResult().
     */
    const normalizedEvent = {
  title:
    playerEvent.title,

  description:
    playerEvent.description,

  type:
    playerEvent.event_type,

  destination:
    playerEvent.destination ?? null,

  choices:
    normalizeChoices(
      playerEvent.choices
    ),
};

    /*
     * LOCATION / TRAVEL SAFETY
     *
     * The AI may only move a player to the destination explicitly
     * attached to this private event.
     *
     * This prevents the AI from inventing an arbitrary location
     * and effectively teleporting the player.
     *
     * The AI still decides whether the selected choice actually
     * results in travel. If it does not return a location effect,
     * the player's current location is preserved.
     */
    const safeEffects = {
      ...aiOutcome.effects,
    };

    if (
      safeEffects.location !== undefined
    ) {
      const destination =
        normalizedEvent.destination;

      const requestedLocation =
        safeEffects.location.trim();

      const currentLocation =
        player.location.trim();

      const validTravel =
        typeof destination ===
          "string" &&
        destination.trim().length > 0 &&
        requestedLocation.length > 0 &&
        requestedLocation ===
          destination.trim() &&
        requestedLocation !==
          currentLocation;

      if (!validTravel) {
        delete safeEffects.location;
      }
    }

    const application =
      applyPlayerResult(
        getPlayerStats(
          player
        ),

        player.id,

        normalizedEvent,

        safeEffects,

        vote.choice_id
      );

    resolvedPlayers.push({
      player,

      vote,

      playerEvent,

      application,
    });
  }

  return {
  round,

  event,

  players:
    resolvedPlayers,

  aiResponse,

  nextEvents,
};
}