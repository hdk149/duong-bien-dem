import type {
  EventData,
  Player,
  PlayerVote,
} from "./types";

import type {
  PlayerStats,
} from "./stats";

import {
  generateAIHostOutcomeGroq,
  generateAIHostNextEventsGroq,
  type AIOutcomeContext,
  type AIHostPlayerContext,
} from "./ai/host";

import type {
  ValidatedAIOutcomeResponse,
  ValidatedAIEventResponse,
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
    ValidatedAIEventResponse;
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
   GET ROUNDS IN LOCATION
   ===================================================== */

function getRoundsInLocation(
  player: Player
): number {
  return (
    (
      player as Player & {
        rounds_in_location?: number;
      }
    ).rounds_in_location ?? 1
  );
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
              getRoundsInLocation(
                player
              ),

            event: {
              title:
                playerEvent.title,

              description:
                playerEvent.description,

              type:
                playerEvent.event_type,

              destination:
                playerEvent.destination ??
                null,

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
   BUILD NEXT-ROUND AI CONTEXT
   =====================================================

   IMPORTANT:

   This MUST be built from the state AFTER the current
   round's effects have been applied.

   This is what prevents the AI from generating a
   next-round event using the player's old location.

   Example:

     Round 6:
       location = TP.HCM
       choice = travel to Đà Lạt

     server resolves:
       location -> Đà Lạt

     THEN:

     Round 7 AI receives:
       location = Đà Lạt

   Not TP.HCM.
   ===================================================== */

function buildNextRoundPlayers(
  round: number,
  players: Player[],
  resolvedPlayers: PlayerRoundResolveResult[]
): AIHostPlayerContext[] {
  return resolvedPlayers.map(
    (resolved) => {
      const originalPlayer =
        players.find(
          (player) =>
            player.id ===
            resolved.player.id
        );

      if (!originalPlayer) {
        throw new Error(
          `Original player ${resolved.player.id} not found while building next-round AI context.`
        );
      }

      const after =
        resolved.application.after;

      const beforeLocation =
        originalPlayer.location.trim();

      const afterLocation =
        after.location.trim();

      const sameLocation =
        beforeLocation ===
        afterLocation;

      const previousRounds =
        getRoundsInLocation(
          originalPlayer
        );

      const roundsInLocation =
        sameLocation
          ? previousRounds + 1
          : 1;

      return {
        id:
          originalPlayer.id,

        player_name:
          originalPlayer.player_name,

        hp:
          after.hp,

        money:
          after.money,

        location:
          after.location,

        legal_risk:
          after.legal_risk,

        /*
         * The choice that produced the current state
         * becomes the latest choice for the next event
         * generation.
         */
        last_choice:
          resolved.vote.choice_id,

        rounds_in_location:
          roundsInLocation,
      };
    }
  );
}

/* =====================================================
   BUILD SAFE NEXT EVENTS FALLBACK
   ===================================================== */

function buildFallbackNextEvents(
  round: number,
  resolvedPlayers: PlayerRoundResolveResult[]
): ValidatedAIEventResponse {
  return {
    round:
      round + 1,

    players:
      resolvedPlayers.map(
        (resolved) => ({
          player_id:
            resolved.player.id,

          event: {
            title:
              `Một ngày mới - Vòng ${round + 1}`,

            description:
              `Bạn đang ở ${resolved.application.after.location}. Một ngày mới bắt đầu và bạn phải quyết định bước tiếp theo.`,

            type:
              "normal",

            choices: [
              {
                id:
                  "continue",

                text:
                  "Tiếp tục tiến lên",
              },

              {
                id:
                  "money",

                text:
                  "Tìm cơ hội kiếm tiền",
              },

              {
                id:
                  "rest",

                text:
                  "Nghỉ ngơi",
              },

              {
                id:
                  "explore",

                text:
                  "Khám phá khu vực",
              },
            ],
          },
        })
      ),
  };
}

/* =====================================================
   BUILD SAFE OUTCOME FALLBACK
   ===================================================== */

function buildFallbackOutcome(
  round: number,
  players: Player[]
): ValidatedAIOutcomeResponse {
  return {
    round,

    players:
      players.map(
        (player) => ({
          player_id:
            player.id,

          effects: {
            hp:
              0,

            money:
              0,

            legal_risk:
              0,
          },
        })
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
     BUILD CURRENT-ROUND AI OUTCOME CONTEXT
     =================================================== */

  const aiContext =
    buildAIOutcomeContext(
      round,
      players,
      playerEvents,
      voteMap
    );

  /* ===================================================
     GENERATE OUTCOMES ONLY
     
     IMPORTANT:
     
     Do NOT generate next-round events here.

     The next event must be generated only AFTER
     server-side outcome application because travel,
     money, HP, legal risk, etc. may change.
     =================================================== */

  let aiResponse:
    ValidatedAIOutcomeResponse;

  try {
    aiResponse =
      await generateAIHostOutcomeGroq(
        aiContext
      );
  } catch (error) {
    console.warn(
      "GROQ OUTCOME GENERATION FAILED — using safe fallback.",
      error
    );

    aiResponse =
      buildFallbackOutcome(
        round,
        players
      );
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
        playerEvent.destination ??
        null,

      choices:
        normalizeChoices(
          playerEvent.choices
        ),
    };

    /* =================================================
       LOCATION / TRAVEL SAFETY
       =================================================

       The AI may only move a player to the destination
       explicitly attached to this private event.

       The AI cannot invent a location.

       Travel is therefore:

         AI choice consequence
               ↓
         requested location
               ↓
         compare with event.destination
               ↓
         accept/reject
    */

    const safeEffects = {
      ...aiOutcome.effects,
    };

    if (
      safeEffects.location !==
      undefined
    ) {
      const destination =
        normalizedEvent.destination;

      const requestedLocation =
        typeof safeEffects.location ===
        "string"
          ? safeEffects.location.trim()
          : "";

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

    /* =================================================
       SERVER-SIDE STATE APPLICATION
       ================================================= */

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

  /* ===================================================
     IMPORTANT:
     
     AT THIS POINT ALL CURRENT-ROUND OUTCOMES HAVE
     BEEN APPLIED IN MEMORY.
     
     application.after now contains the real state
     that the next-round AI must see.
     =================================================== */

  const nextRoundPlayers =
    buildNextRoundPlayers(
      round,
      players,
      resolvedPlayers
    );

  /* ===================================================
     GENERATE NEXT-ROUND EVENTS
     
     This is intentionally AFTER outcome application.
     
     Therefore:
     
       current location
             ↓
       player chooses travel
             ↓
       server validates travel
             ↓
       application.after.location
             ↓
       nextRoundPlayers.location
             ↓
       AI generates next event
     
     No stale location.
     =================================================== */

  let nextEvents:
    ValidatedAIEventResponse;

  try {
    nextEvents =
      await generateAIHostNextEventsGroq({
        round:
          round + 1,

        players:
          nextRoundPlayers,
      });
  } catch (error) {
    console.warn(
      "GROQ NEXT-EVENT GENERATION FAILED — using safe fallback.",
      error
    );

    nextEvents =
      buildFallbackNextEvents(
        round,
        resolvedPlayers
      );
  }

  /* ===================================================
     FINAL RESULT
     =================================================== */

  return {
    round,

    event,

    players:
      resolvedPlayers,

    aiResponse,

    nextEvents,
  };
}