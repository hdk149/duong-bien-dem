import type {
  EventData,
  Player,
  PlayerVote,
} from "./types";

import {
  generateAIHostOutcome,
  generateAIHostNextEventsGroq,
  type AIOutcomeContext,
  type AIHostPlayerContext,
} from "./ai/host";

import type {
  AIEvent,
  AIPlayerEffects,
} from "./ai/schema";

import type {
  ValidatedAIEventResponse,
} from "./ai/validate";

import {
  applyPlayerResult,
  type PlayerResultApplication,
} from "./apply-player-result";

import type {
  PlayerStats,
} from "./stats";

/* ============================================================
   TYPES
   ============================================================ */

export type ResolvePlayerRoundEvent = {
  id: string;
  player_id: string;

  title: string;
  description: string;

  event_type: string;
  destination?: string | null;

  choices: unknown;

  selected_choice_id: string | null;

  source_event_id?: string | null;
};

export type RoundResolveInput = {
  round: number;

  event: EventData;

  players: Player[];

  votes: PlayerVote[];

  playerEvents: ResolvePlayerRoundEvent[];

  roomId?: string;

  sessionId?: string;
};

export type ResolvedPlayer = {
  player: Player;

  vote: PlayerVote;

  application: PlayerResultApplication;
};

export type RoundResolveResult = {
  round: number;

  players: ResolvedPlayer[];

  aiResponse: unknown;

  nextEvents: ValidatedAIEventResponse;
};

/* ============================================================
   HELPERS
   ============================================================ */

function getPlayerStats(
  player: Player
): PlayerStats {
  return {
    hp: Number(player.hp ?? 100),

    money: Number(
      player.money ?? 0
    ),

    location:
      player.location ??
      "Việt Nam",

    legal_risk:
      Number(
        player.legal_risk ?? 0
      ),
  };
}

/* ============================================================
   LOCATION COUNTER
   ============================================================ */

function getRoundsInLocation(
  players: Player[]
): Map<string, number> {
  const counts =
    new Map<string, number>();

  for (const player of players) {
    const location =
      player.location ??
      "Việt Nam";

    counts.set(
      location,
      (counts.get(location) ?? 0) + 1
    );
  }

  return counts;
}

/* ============================================================
   CHOICES
   ============================================================ */

function normalizeChoiceList(
  choices: unknown
): Array<{
  id: string;
  text: string;
}> {
  if (!Array.isArray(choices)) {
    return [];
  }

  return choices.map(
    (choice: any) => ({
      id: String(
        choice?.id ?? ""
      ),

      text: String(
        choice?.text ??
          choice?.title ??
          choice?.description ??
          ""
      ),
    })
  );
}

/* ============================================================
   PRIVATE DB EVENT → AI EVENT
   ============================================================ */

function toAIEvent(
  playerEvent: ResolvePlayerRoundEvent
): AIEvent {
  return {
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
      normalizeChoiceList(
        playerEvent.choices
      ),
  };
}

/* ============================================================
   MONEY PARSER
   ============================================================ */

function parseVietnameseMoney(
  value: string
): number | null {
  const text =
    value
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  /*
   * 2 triệu
   * 2.5 triệu
   * 2,5 triệu
   * 2m
   */

  const millionMatch =
    text.match(
      /(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|m)\b/
    );

  if (millionMatch) {
    const number =
      Number(
        millionMatch[1]
          .replace(",", ".")
      );

    if (
      Number.isFinite(number)
    ) {
      return Math.round(
        number * 1_000_000
      );
    }
  }

  /*
   * 500 nghìn
   * 500 ngàn
   * 500k
   */

  const thousandMatch =
    text.match(
      /(\d+(?:[.,]\d+)?)\s*(?:nghìn|ngàn|k)\b/
    );

  if (thousandMatch) {
    const number =
      Number(
        thousandMatch[1]
          .replace(",", ".")
      );

    if (
      Number.isFinite(number)
    ) {
      return Math.round(
        number * 1_000
      );
    }
  }

  /*
   * 2.000.000
   * 2,000,000
   * 2000000
   */

  const plainMatch =
    text.match(
      /(?:\d{1,3}(?:[.,]\d{3})+|\d{4,})/
    );

  if (plainMatch) {
    const raw =
      plainMatch[0]
        .replace(/[.,]/g, "");

    const number =
      Number(raw);

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  return null;
}

/* ============================================================
   EXTRACT PAYMENT
   ============================================================ */

function extractPaymentFromEvent(
  event: AIEvent
): number | null {
  const text = [
    event.title ?? "",
    event.description ?? "",
  ].join(" ");

  return parseVietnameseMoney(
    text
  );
}

/* ============================================================
   ECONOMIC SAFETY
   ============================================================ */

function applyEconomicSafety(
  event: AIEvent,
  selectedChoiceId: string,
  effects: AIPlayerEffects
): AIPlayerEffects {
  const choice =
    event.choices.find(
      (item) =>
        String(item.id) ===
        String(selectedChoiceId)
    );

  const choiceText =
    String(
      choice?.text ?? ""
    ).toLowerCase();

  /*
   * REFUSAL
   */

  const refusal =
    /từ chối|không nhận|không làm|bỏ qua|rời đi/.test(
      choiceText
    );

  if (refusal) {
    return {
      ...effects,
      money: 0,
    };
  }

  /*
   * WORK ACCEPTANCE
   */

  const acceptingWork =
    /chấp nhận việc|nhận việc|nhận lời mời làm việc|đồng ý làm việc|bắt đầu làm việc|đi làm|chấp nhận làm|chấp nhận công việc/.test(
      choiceText
    );

  if (!acceptingWork) {
    return effects;
  }

  /*
   * AI đã trả tiền dương
   */

  if (
    typeof effects.money ===
      "number" &&
    Number.isFinite(
      effects.money
    ) &&
    effects.money > 0
  ) {
    console.log(
      "ECONOMIC SAFETY → AI PAYMENT",
      {
        selectedChoiceId,
        money:
          effects.money,
      }
    );

    return effects;
  }

  /*
   * AI không trả tiền.
   *
   * Kiểm tra event có ghi mức thù lao
   * hay không.
   */

  const payment =
    extractPaymentFromEvent(
      event
    );

  if (
    payment !== null &&
    payment > 0
  ) {
    console.warn(
      "ECONOMIC SAFETY → RESTORED WORK PAYMENT",
      {
        selectedChoiceId,
        payment,
        eventTitle:
          event.title,
      }
    );

    return {
      ...effects,
      money:
        payment,
    };
  }

  /*
   * Không tự bịa tiền.
   */

  console.warn(
    "ECONOMIC SAFETY → WORK ACCEPTED BUT NO PAYMENT",
    {
      selectedChoiceId,
      eventTitle:
        event.title,

      eventDescription:
        event.description,

      aiEffects:
        effects,
    }
  );

  return effects;
}

/* ============================================================
   LOCATION SAFETY
   ============================================================ */

function applyLocationSafety(
  current: PlayerStats,
  effects: AIPlayerEffects
): AIPlayerEffects {
  if (
    effects.location !==
      undefined &&
    typeof effects.location !==
      "string"
  ) {
    return {
      ...effects,

      location:
        current.location,
    };
  }

  return effects;
}

/* ============================================================
   AI HOST PLAYER CONTEXT
   ============================================================ */

function buildAIHostPlayers(
  players: Player[],
  locationCounts: Map<string, number>
): AIHostPlayerContext[] {
  return players.map(
    (player) => ({
      id:
        player.id,

      player_name:
        player.player_name,

      hp:
        Number(
          player.hp ?? 100
        ),

      money:
        Number(
          player.money ?? 0
        ),

      location:
        player.location ??
        "Việt Nam",

      legal_risk:
        Number(
          player.legal_risk ?? 0
        ),

      rounds_in_location:
        locationCounts.get(
          player.location ??
            "Việt Nam"
        ) ?? 0,
    })
  );
}

/* ============================================================
   OUTCOME CONTEXT
   ============================================================ */

function buildAIOutcomeContext(
  input: RoundResolveInput
): AIOutcomeContext {
  const locationCounts =
    getRoundsInLocation(
      input.players
    );

  const playerMap =
    new Map(
      input.players.map(
        (player) => [
          player.id,
          player,
        ]
      )
    );

  const voteMap =
    new Map(
      input.votes.map(
        (vote) => [
          vote.player_id,
          vote,
        ]
      )
    );

  const outcomePlayers =
    input.playerEvents.map(
      (playerEvent) => {
        const player =
          playerMap.get(
            playerEvent.player_id
          );

        if (!player) {
          throw new Error(
            `Không tìm thấy player ${playerEvent.player_id}.`
          );
        }

        const vote =
          voteMap.get(
            playerEvent.player_id
          );

        if (!vote) {
          throw new Error(
            `Không tìm thấy vote của player ${playerEvent.player_id}.`
          );
        }

        const aiEvent =
          toAIEvent(
            playerEvent
          );

        const chosenChoice =
          aiEvent.choices.find(
            (choice) =>
              String(choice.id) ===
              String(
                vote.choice_id
              )
          );

        return {
          id:
            player.id,

          player_name:
            player.player_name,

          hp:
            Number(
              player.hp ?? 100
            ),

          money:
            Number(
              player.money ?? 0
            ),

          location:
            player.location ??
            "Việt Nam",

          legal_risk:
            Number(
              player.legal_risk ?? 0
            ),

          rounds_in_location:
            locationCounts.get(
              player.location ??
                "Việt Nam"
            ) ?? 0,

          event: {
            title:
              aiEvent.title,

            description:
              aiEvent.description,

            type:
              aiEvent.type,

            destination:
              aiEvent.destination ??
              null,

            choices:
              aiEvent.choices,
          },

          chosen_choice_id:
            String(
              vote.choice_id
            ),

          chosen_choice_text:
            chosenChoice?.text ??
            "",
        };
      }
    );

  return {
  round: input.round,
  players: outcomePlayers,
};
}

/* ============================================================
   FALLBACK OUTCOME
   ============================================================ */

function fallbackOutcome(
  input: RoundResolveInput
): Record<
  string,
  AIPlayerEffects
> {
  const result: Record<
    string,
    AIPlayerEffects
  > = {};

  for (
    const playerEvent
      of input.playerEvents
  ) {
    result[
      playerEvent.player_id
    ] = {};
  }

  return result;
}

/* ============================================================
   FALLBACK NEXT EVENTS
   ============================================================ */

function fallbackNextEvents(
  round: number,
  players: Player[]
): ValidatedAIEventResponse {
  return {
    round,

    players:
      players.map(
        (player) => ({
          player_id:
            player.id,

          event: {
            title:
              `Một ngày mới - Vòng ${round}`,

            description:
              "Một tình huống mới xuất hiện trên hành trình.",

            type:
              "normal",

            destination:
              null,

            choices: [
              {
                id: "a",
                text:
                  "Tiếp tục theo kế hoạch",
              },
              {
                id: "b",
                text:
                  "Tìm kiếm cơ hội mới",
              },
              {
                id: "c",
                text:
                  "Nghỉ ngơi và quan sát",
              },
              {
                id: "d",
                text:
                  "Di chuyển sang khu vực khác",
              },
            ],
          },
        })
      ),
  };
}

/* ============================================================
   RESOLVE ROUND
   ============================================================ */

export async function resolveRound(
  input: RoundResolveInput
): Promise<RoundResolveResult> {
  if (
    input.players.length ===
    0
  ) {
    throw new Error(
      "Cannot resolve round without active players."
    );
  }

  if (
    input.playerEvents.length !==
    input.players.length
  ) {
    throw new Error(
      `Player/event count mismatch: ${input.players.length} players vs ${input.playerEvents.length} events.`
    );
  }

  if (
    input.votes.length !==
    input.players.length
  ) {
    throw new Error(
      `Player/vote count mismatch: ${input.players.length} players vs ${input.votes.length} votes.`
    );
  }

  /*
   * ----------------------------------------------------------
   * PLAYER MAP
   * ----------------------------------------------------------
   */

  const playerMap =
    new Map(
      input.players.map(
        (player) => [
          player.id,
          player,
        ]
      )
    );

  const voteMap =
    new Map(
      input.votes.map(
        (vote) => [
          vote.player_id,
          vote,
        ]
      )
    );

  /*
   * ----------------------------------------------------------
   * VALIDATE PRIVATE EVENTS
   * ----------------------------------------------------------
   */

  for (
    const playerEvent
      of input.playerEvents
  ) {
    if (
      !playerMap.has(
        playerEvent.player_id
      )
    ) {
      throw new Error(
        `Player ${playerEvent.player_id} does not exist in active players.`
      );
    }

    const vote =
      voteMap.get(
        playerEvent.player_id
      );

    if (!vote) {
      throw new Error(
        `Không tìm thấy vote cho player ${playerEvent.player_id}.`
      );
    }

    const choices =
      normalizeChoiceList(
        playerEvent.choices
      );

    const validChoice =
      choices.some(
        (choice) =>
          String(choice.id) ===
          String(
            vote.choice_id
          )
      );

    if (!validChoice) {
      throw new Error(
        `Invalid choice "${vote.choice_id}" for player ${playerEvent.player_id}.`
      );
    }
  }

  /*
   * ----------------------------------------------------------
   * BUILD OUTCOME CONTEXT
   * ----------------------------------------------------------
   */

  const aiContext =
    buildAIOutcomeContext(
      input
    );

  console.log(
    "ROUND RESOLVE → OUTCOME CONTEXT",
    JSON.stringify(
      aiContext,
      null,
      2
    )
  );

  /*
   * ----------------------------------------------------------
   * AI OUTCOME
   * ----------------------------------------------------------
   */

  let aiResponse: any;

  try {
    aiResponse =
      await generateAIHostOutcome(
        aiContext
      );

    console.log(
      "ROUND RESOLVE → AI OUTCOME",
      JSON.stringify(
        aiResponse,
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      "ROUND RESOLVE → AI OUTCOME ERROR",
      error
    );

    aiResponse = {
      players:
        fallbackOutcome(
          input
        ),
    };
  }

  /*
   * ----------------------------------------------------------
   * EXTRACT PLAYER OUTCOMES
   * ----------------------------------------------------------
   */

  const rawPlayerOutcomes =
    aiResponse?.players ??
    aiResponse?.outcomes ??
    aiResponse?.results ??
    {};

  /*
   * ----------------------------------------------------------
   * APPLY PLAYER RESULTS
   * ----------------------------------------------------------
   */

  const resolvedPlayers:
    ResolvedPlayer[] = [];

  for (
    const playerEvent
      of input.playerEvents
  ) {
    const player =
      playerMap.get(
        playerEvent.player_id
      );

    if (!player) {
      throw new Error(
        `Missing player ${playerEvent.player_id} during resolution.`
      );
    }

    const vote =
      voteMap.get(
        playerEvent.player_id
      );

    if (!vote) {
      throw new Error(
        `Missing vote ${playerEvent.player_id} during resolution.`
      );
    }

    const currentStats =
      getPlayerStats(
        player
      );

    /*
     * --------------------------------------------------------
     * RAW AI EFFECTS
     * --------------------------------------------------------
     */

    let rawEffects:
      AIPlayerEffects = {};

    if (
      rawPlayerOutcomes &&
      typeof rawPlayerOutcomes ===
        "object"
    ) {
      const playerOutcome =
        rawPlayerOutcomes[
          playerEvent.player_id
        ];

      if (
        playerOutcome &&
        typeof playerOutcome ===
          "object"
      ) {
        rawEffects =
          playerOutcome.effects ??
          playerOutcome.result ??
          playerOutcome;
      }
    }

    /*
     * --------------------------------------------------------
     * PRIVATE EVENT → AI EVENT
     * --------------------------------------------------------
     */

    const aiEvent =
      toAIEvent(
        playerEvent
      );

    /*
     * --------------------------------------------------------
     * ECONOMIC SAFETY
     * --------------------------------------------------------
     */

    const economicSafeEffects =
      applyEconomicSafety(
        aiEvent,

        vote.choice_id,

        rawEffects
      );

    /*
     * --------------------------------------------------------
     * LOCATION SAFETY
     * --------------------------------------------------------
     */

    const safeEffects =
      applyLocationSafety(
        currentStats,

        economicSafeEffects
      );

    /*
     * --------------------------------------------------------
     * APPLY STATS
     * --------------------------------------------------------
     */

    const application =
      applyPlayerResult(
        currentStats,

        player.id,

        aiEvent,

        safeEffects,

        vote.choice_id
      );

    /*
     * --------------------------------------------------------
     * DEBUG
     * --------------------------------------------------------
     */

    console.log(
      "ROUND RESULT",
      JSON.stringify(
        {
          playerId:
            player.id,

          playerName:
            player.player_name,

          playerEventId:
            playerEvent.id,

          eventTitle:
            aiEvent.title,

          selectedChoiceId:
            vote.choice_id,

          selectedChoiceText:
            aiEvent.choices.find(
              (choice) =>
                String(
                  choice.id
                ) ===
                String(
                  vote.choice_id
                )
            )?.text ?? "",

          before:
            application.before,

          rawEffects,

          safeEffects:
            application.effects,

          moneyEffect:
            application.effects
              .money ?? 0,

          moneyBefore:
            application.before
              .money,

          moneyAfter:
            application.after
              .money,

          hpBefore:
            application.before.hp,

          hpAfter:
            application.after.hp,

          locationBefore:
            application.before
              .location,

          locationAfter:
            application.after
              .location,
        },
        null,
        2
      )
    );

    resolvedPlayers.push({
      player,

      vote,

      application,
    });
  }

  /*
   * ----------------------------------------------------------
   * NEXT ROUND PLAYER CONTEXT
   * ----------------------------------------------------------
   */

  const nextRoundLocationCounts =
    getRoundsInLocation(
      resolvedPlayers.map(
        (resolvedPlayer) => ({
          ...resolvedPlayer.player,

          hp:
            resolvedPlayer
              .application
              .after.hp,

          money:
            resolvedPlayer
              .application
              .after.money,

          location:
            resolvedPlayer
              .application
              .after.location,

          legal_risk:
            resolvedPlayer
              .application
              .after
              .legal_risk,
        })
      )
    );

  const nextRoundPlayers:
    AIHostPlayerContext[] =
    resolvedPlayers.map(
      (resolvedPlayer) => ({
        id:
          resolvedPlayer
            .player.id,

        player_name:
          resolvedPlayer
            .player.player_name,

        hp:
          resolvedPlayer
            .application
            .after.hp,

        money:
          resolvedPlayer
            .application
            .after.money,

        location:
          resolvedPlayer
            .application
            .after
            .location,

        legal_risk:
          resolvedPlayer
            .application
            .after
            .legal_risk,

        rounds_in_location:
          nextRoundLocationCounts.get(
            resolvedPlayer
              .application
              .after
              .location
          ) ?? 0,
      })
    );

  /*
   * ----------------------------------------------------------
   * GENERATE NEXT EVENTS
   * ----------------------------------------------------------
   */

  let nextEvents:
    ValidatedAIEventResponse;

  try {
    nextEvents =
      await generateAIHostNextEventsGroq(
        {
          round:
            input.round + 1,

          players:
            nextRoundPlayers,
        }
      );

    console.log(
      "ROUND RESOLVE → NEXT EVENTS",
      JSON.stringify(
        nextEvents,
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      "ROUND RESOLVE → NEXT EVENTS ERROR",
      error
    );

    const fallbackPlayers:
      Player[] =
      resolvedPlayers.map(
        (resolvedPlayer) => ({
          ...resolvedPlayer.player,

          hp:
            resolvedPlayer
              .application
              .after.hp,

          money:
            resolvedPlayer
              .application
              .after.money,

          location:
            resolvedPlayer
              .application
              .after
              .location,

          legal_risk:
            resolvedPlayer
              .application
              .after
              .legal_risk,
        })
      );

    nextEvents =
      fallbackNextEvents(
        input.round + 1,

        fallbackPlayers
      );
  }

  /*
   * ----------------------------------------------------------
   * COMPLETE
   * ----------------------------------------------------------
   */

  console.log(
    "ROUND RESOLVE → COMPLETE",
    JSON.stringify(
      {
        round:
          input.round,

        resolvedPlayers:
          resolvedPlayers.map(
            (resolvedPlayer) => ({
              playerId:
                resolvedPlayer
                  .player.id,

              playerName:
                resolvedPlayer
                  .player
                  .player_name,

              selectedChoiceId:
                resolvedPlayer
                  .vote
                  .choice_id,

              moneyBefore:
                resolvedPlayer
                  .application
                  .before
                  .money,

              moneyEffect:
                resolvedPlayer
                  .application
                  .effects
                  .money ?? 0,

              moneyAfter:
                resolvedPlayer
                  .application
                  .after
                  .money,
            })
          ),
      },
      null,
      2
    )
  );

  return {
    round:
      input.round,

    players:
      resolvedPlayers,

    aiResponse,

    nextEvents,
  };
}