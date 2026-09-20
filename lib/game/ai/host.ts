import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

import type {
  AIHostResponse,
  AIPlayerResult,
} from "./schema";

import {
  validateAIHostResponse,
  validateAIEventResponse,
  validateAIOutcomeResponse,
  type ValidatedAIHostResponse,
  type ValidatedAIEventResponse,
  type ValidatedAIOutcomeResponse,
} from "./validate";

import {
  validateAIPlayers,
  type ExpectedPlayer,
} from "./host-validation";

/* =====================================================
   GEMINI CLIENT
   ===================================================== */

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  return new GoogleGenAI({
    apiKey,
  });
}

/* =====================================================
   GEMINI RETRY
   ===================================================== */

async function generateWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const message =
        error instanceof Error ? error.message : String(error);

      // Daily quota / request quota:
      // retry không có ích, vì quota không reset sau vài giây.
      const isQuotaExceeded =
        message.includes("429") &&
        (
          message.includes("quota") ||
          message.includes("RESOURCE_EXHAUSTED") ||
          message.includes("GenerateRequestsPerDay") ||
          message.includes("free_tier")
        );

      if (isQuotaExceeded) {
        console.warn(
          "GEMINI QUOTA EXCEEDED — using fallback instead of retrying.",
        );
        throw error;
      }

      const retryable =
        message.includes("503") ||
        message.includes("UNAVAILABLE") ||
        message.includes("high demand") ||
        message.includes("temporarily unavailable");

      if (!retryable || attempt === maxAttempts) {
        throw error;
      }

      const delay = attempt * 2000;

      console.warn(
        `GEMINI RETRY ${attempt}/${maxAttempts} — waiting ${delay}ms`,
      );

      await new Promise<void>((resolve) =>
        setTimeout(resolve, delay),
      );
    }
  }

  throw lastError;
}

/* =====================================================
   AI HOST CONTEXT
   ===================================================== */

export type AIHostPlayerContext = {
  id: string;

  player_name: string;

  hp: number;

  money: number;

  location: string;

  legal_risk?: number;

  last_choice?: string | null;

  rounds_in_location: number;
};

export type AIHostContext = {
  round: number;
  players: AIHostPlayerContext[];
};

/* =====================================================
   EVENT GENERATION
   ===================================================== */

function buildEventPrompt(
  context: AIHostContext
): string {
  return `
You are the AI Game Host for a Vietnamese multiplayer survival/travel RPG called "Đường Biên Đêm".

The game is fictional.

Your job is to generate ONE independent event for EACH active player.

IMPORTANT RULES:

1. Every player must receive exactly one event.
2. Events may be completely different between players.
3. Consider each player's:
   - current HP
   - money
   - location
   - legal risk
   - previous choice
   - round number
4. The event should make sense for the player's current situation.
5. Do not directly modify the database.
6. Do NOT generate consequences or effects yet.
7. Do NOT generate hp changes.
8. Do NOT generate money changes.
9. Do NOT generate legal_risk changes.
10. Do NOT generate location changes.
11. Do not invent player IDs.
12. Keep events suitable for a general audience.
13. The game can contain fictional danger, accidents, financial problems, travel problems, jobs, opportunities, NPC encounters, and fictional legal consequences, but do not provide real-world instructions for wrongdoing.
14. Do not make every event purely positive.
15. Events should have meaningful choices.
16. Each event should contain 2 to 4 choices.
17. Choice IDs must be unique within that player's event.
18. Avoid repeating the same event structure for every player.
19. Use Vietnamese for all event text.
20. The choices should represent actual decisions the player can make.
21. The consequences of choices will be generated later after the player chooses.
22. Maintain continuity with the existing story state when available.
23. Prefer continuing an active story thread over creating an unrelated event.
24. Previous player choices may influence which events appear in later rounds.
25. Reuse established NPCs, locations, objects, and unresolved situations when appropriate.
26. Do not force story continuity when it would contradict the player's current situation.
27. New story threads may be introduced when appropriate.
28. Each event should contribute either to an existing thread or establish a potentially reusable thread.
29. Do not reveal or pre-generate the consequence of a choice.

CURRENT ROUND:
${context.round}

PLAYERS:
${JSON.stringify(
  context.players,
  null,
  2
)}

RETURN ONLY VALID JSON.

The JSON must have exactly this structure:

{
  "round": number,
  "players": [
    {
      "player_id": "UUID",
      "event": {
        "title": "string",
        "description": "string",
        "type": "string",
        "choices": [
          {
            "id": "string",
            "text": "string"
          }
        ]
      }
    }
  ]
}

The "players" array must contain exactly the same players supplied above.

DO NOT include an "effects" field anywhere.
`;
}

/* =====================================================
   OUTCOME / RESOLVE PROMPT
   ===================================================== */

export type AIOutcomePlayerContext =
  AIHostPlayerContext & {
    event: {
      title: string;
      description: string;
      type: string;

      destination:
        | string
        | null;

      choices: {
        id: string;
        text: string;
      }[];
    };

    chosen_choice_id: string;
    chosen_choice_text: string;
  };

export type AIOutcomeContext = {
  round: number;
  players: AIOutcomePlayerContext[];
};
/* =====================================================
   ROUND BATCH CONTEXT
   ===================================================== */

export type AIRoundBatchContext = {
  round: number;
  outcomePlayers: AIOutcomePlayerContext[];
  nextRoundPlayers: AIHostPlayerContext[];
};

export type AIRoundBatchResponse = {
  round: number;

  outcomes: ValidatedAIOutcomeResponse;

  nextEvents: ValidatedAIEventResponse;
};

/* =====================================================
   BATCH PROMPT

   ONE GEMINI REQUEST:
   - resolve current round
   - generate next round events

   This replaces the old 2-request flow.
   ===================================================== */

function buildRoundBatchPrompt(
  context: AIRoundBatchContext
): string {
  return `
You are the AI Game Host for "Đường Biên Đêm", a fictional Vietnamese multiplayer survival/travel RPG.

Perform TWO tasks in ONE JSON response:

TASK A — Resolve every player's CURRENT choice.
TASK B — Generate exactly one NEXT ROUND event for every player.

GENERAL RULES:
- Complete both tasks for every player.
- Keep current-round outcomes separate from next-round events.
- Do not modify the database.
- Never invent player IDs.
- Use Vietnamese for all story/event text.
- Keep the game suitable for a general audience.
- Do not provide real-world wrongdoing instructions.

=====================================================
TASK A — CURRENT ROUND OUTCOMES
=====================================================

Resolve the exact choice selected by each player for the exact event shown to them.

Rules:
1. Generate exactly one outcome for every player.
2. The outcome must match the exact event shown to that player.
3. The outcome must specifically correspond to the selected choice.
4. Effects may contain ONLY changes actually caused by that choice.
5. hp changes must be integers.
6. money changes must be integers.
7. legal_risk changes must be integers from -10 to +10.
8. Return location ONLY when the player's location actually changes.
9. Effects should normally be moderate.
10. Do not directly modify the database.

TRAVEL RULES — CRITICAL:

- event.destination is an OPPORTUNITY, not an automatic location change.
- A destination existing by itself is NEVER enough to change location.
- The selected choice must clearly accept, pursue, complete, or successfully commit to actual travel.
- Refusing, delaying, investigating, negotiating, preparing, or merely considering travel does NOT change location.
- If actual travel occurs, effects.location MUST exactly equal event.destination.
- NEVER invent a different destination.
- If event.destination is null, NEVER return effects.location.
- NEVER teleport a player merely because a destination exists.
- The server will validate the location change.

Examples:

destination = "Đà Nẵng"

Choice:
"Nhận công việc và đi theo chuyến xe đến Đà Nẵng."
→ effects.location = "Đà Nẵng"

Choice:
"Từ chối công việc và ở lại."
→ no location field

Choice:
"Hỏi thêm về công việc trước khi quyết định."
→ no location field

Choice:
"Chấp nhận nhưng hẹn ngày mai mới đi."
→ no location field

=====================================================
CURRENT ROUND
=====================================================

Round: ${context.round}

Players:
${JSON.stringify(context.outcomePlayers, null, 2)}

=====================================================
TASK B — NEXT ROUND EVENTS
=====================================================

Generate exactly ONE event for every player for round ${context.round + 1}.

The game is an evolving survival journey, not a collection of disconnected
random events.

Use each player's:
- current location
- rounds_in_location
- money
- hp
- legal_risk
- last_choice
- previous story context
- current situation

to create an event appropriate to that player.

Different players may have completely different stories, locations and NPCs.

Do not force all players into the same storyline.

=====================================================
STORY CONTINUITY
=====================================================

Prefer meaningful continuity when appropriate.

A previous choice may create:
- an unresolved problem
- an NPC relationship
- a new opportunity
- useful information
- a complication
- a future travel opportunity
- a new situation

Previous NPCs, locations, objects and unresolved threads may return.

Do not reveal the future consequence of a choice before the player makes it.

Do not force continuity when it would make no sense.

A story thread may remain unresolved for several rounds.

Avoid repeatedly generating unrelated generic random events when an existing
story thread can naturally continue.

=====================================================
JOURNEY & LOCATION PROGRESSION
=====================================================

The game should gradually allow players to survive, earn money, meet people,
discover opportunities, travel and expand their world.

rounds_in_location is an important signal.

If rounds_in_location is low:
- Local survival events, small jobs, NPC encounters and preparation are fine.

If rounds_in_location >= 3:
- Begin increasing meaningful opportunities that could lead elsewhere.

If rounds_in_location >= 5:
- Strongly consider an opportunity that gives the player a believable reason
  to leave the current location.
- Prefer work, money, transport, NPC connections, information, escape from a
  problem, or a useful opportunity elsewhere.
- Staying is still allowed if justified by the story.

If rounds_in_location >= 8:
- Strongly prioritize meaningful mobility or progression.
- Prefer another city, province, region, or eventually another country.
- Do not keep producing generic local jobs or minor random encounters unless
  an important unresolved story thread requires staying.

The AI must NEVER automatically move the player.
The event may offer travel, but the player's choice determines whether travel
is pursued.

=====================================================
TRAVEL OPPORTUNITIES
=====================================================

A travel event must have a concrete reason for the player to go somewhere.

Good reasons include:
- paid work elsewhere
- delivery or transport work
- temporary employment
- an NPC connection
- a business opportunity
- a previous NPC asking for help elsewhere
- information about a better opportunity
- transportation offered in exchange for work
- a believable reason to leave a dangerous situation

Avoid:
- random unexplained jobs
- sudden decisions to travel
- unexplained free transportation
- teleportation
- generic repeated local opportunities

When creating a travel opportunity:

1. Include a specific destination.
2. Destination must differ from the player's current location.
3. Explain why the opportunity exists.
4. Give the player something meaningful to gain.
5. Give the player something meaningful to risk or give up.
6. Include at least one choice that can pursue the opportunity.
7. Do not reveal the final consequence of the choice.

The destination describes WHERE THE OPPORTUNITY LEADS.
It does NOT mean the player has already travelled there.

For ordinary non-travel events:
destination = null

Do not repeatedly use the same destination unless an existing story thread
requires it.

=====================================================
INTERNATIONAL PROGRESSION
=====================================================

Foreign travel is allowed but should feel like progression.

Do not immediately teleport players abroad.

International opportunities should normally develop through believable story
steps such as:
- hearing about work abroad
- meeting an overseas contact
- receiving a job lead
- finding a sponsor/contact
- earning money
- preparing documents
- arranging transportation
- dealing with practical or legal obstacles

The player must retain agency through choices such as:
ACCEPT / REFUSE / INVESTIGATE / NEGOTIATE / DELAY / FIND AN ALTERNATIVE

These are narrative choices only. Do not create mechanical effects for the
next event.

=====================================================
EVENT DESIGN
=====================================================

Every event should feel like a concrete scene.

Prefer:
- recognizable setting
- specific NPC or situation
- reason the player is involved
- tension or uncertainty
- meaningful decision

Avoid generic:
"Bạn gặp một người lạ."
"Bạn thấy một cơ hội kiếm tiền."
"Bạn gặp một vấn đề."

Events should be vivid but concise.

Each event:
- has 2 to 4 choices
- choices have unique IDs within that event
- choices represent meaningful decisions
- does not state the consequences
- does not contain hp/money/legal_risk effects
- does not directly change location

Different players should not receive identical generic events.

=====================================================
PLAYER STATE FOR NEXT ROUND
=====================================================

CURRENT ROUND PLAYERS:
${JSON.stringify(context.outcomePlayers, null, 2)}

NEXT ROUND PLAYER STATE:
${JSON.stringify(context.nextRoundPlayers, null, 2)}

NEXT ROUND:
${context.round + 1}

=====================================================
OUTPUT REQUIREMENTS — CRITICAL
=====================================================

Return ONLY valid JSON.

The top-level object MUST contain exactly:
- round
- outcomes
- nextEvents

NEVER omit outcomes.
NEVER omit nextEvents.

Structure:

{
  "round": ${context.round},
  "outcomes": {
    "round": ${context.round},
    "players": [
      {
        "player_id": "UUID",
        "effects": {
          "hp": 0,
          "money": 0,
          "legal_risk": 0
        }
      }
    ]
  },
  "nextEvents": {
    "round": ${context.round + 1},
    "players": [
      {
        "player_id": "UUID",
        "event": {
          "title": "string",
          "description": "string",
          "type": "string",
          "destination": "string or null",
          "choices": [
            {
              "id": "string",
              "text": "string"
            }
          ]
        }
      }
    ]
  }
}

OUTCOME RULES:
- outcomes.players must contain exactly the same player IDs as CURRENT ROUND PLAYERS.
- effects.location is optional and should only exist for actual travel.
- Do not add an outcome message field unless the schema explicitly supports it.

NEXT EVENT RULES:
- nextEvents.players must contain exactly the same player IDs as NEXT ROUND PLAYER STATE.
- Every player gets exactly one event.
- destination must be a concrete destination for travel opportunities.
- destination must be null for ordinary non-travel events.
- Never include mechanical effects in nextEvents.
- Do not add any fields not shown in the schema.

Return valid JSON only.
`;
}

/* =====================================================
   GENERATE ONE REQUEST FOR OUTCOME + NEXT EVENTS
   ===================================================== */

export async function generateAIHostRoundBatch(
  context: AIRoundBatchContext
): Promise<AIRoundBatchResponse> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not configured."
    );
  }

  const groq = new Groq({
    apiKey,
  });

  const prompt =
    buildRoundBatchPrompt(
      context
    );

  const response =
  await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
    reasoning_effort: "low",
    include_reasoning: false,
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
  });

  const responseText =
    response.choices[0]?.message?.content;

  if (!responseText) {
    throw new Error(
      "Groq returned an empty round batch response."
    );
  }

  const rawResponse =
  extractJson(
    responseText
  ) as {
    round?: unknown;
    outcomes?: unknown;
    nextEvents?: unknown;
  };

console.log(
  "GROQ ROUND BATCH RAW RESPONSE:",
  JSON.stringify(
    rawResponse,
    null,
    2
  )
);

if (
  rawResponse.round !==
  context.round
) {
  throw new Error(
    `AI returned batch round ${String(
      rawResponse.round
    )}, expected ${context.round}.`
  );
}

if (!rawResponse.outcomes) {
  throw new Error(
    "AI round batch is missing top-level 'outcomes'."
  );
}

if (!rawResponse.nextEvents) {
  throw new Error(
    "AI round batch is missing top-level 'nextEvents'."
  );
}

const outcomes =
  validateAIOutcomeResult(
    rawResponse.outcomes,
    {
      round:
        context.round,

      players:
        context.outcomePlayers,
    }
  );

const nextEvents =
  validateAIEventResult(
    rawResponse.nextEvents,
    {
      round:
        context.round + 1,

      players:
        context.nextRoundPlayers,
    }
  );

  return {
    round:
      context.round,

    outcomes,

    nextEvents,
  };
}

function buildOutcomePrompt(
  context: AIOutcomeContext
): string {
  return `
You are the AI Game Host for a Vietnamese multiplayer survival/travel RPG called "Đường Biên Đêm".

The game is fictional.

You are now RESOLVING player choices.

Each player has already received a specific event and has selected one specific choice.

Your job is to determine the outcome of EACH player's exact event and exact chosen choice.

IMPORTANT RULES:

1. Every player must receive exactly one outcome.
2. Resolve each player independently.
3. Use the exact event provided for that player.
4. Use the exact chosen choice provided for that player.
5. Do not change the event.
6. Do not invent a different choice.
7. Do not generate new choices.
8. Consider the player's current:
   - HP
   - money
   - location
   - legal risk
   - previous choice
9. Effects are CHANGES, not absolute values.
10. hp is an integer change.
11. money is an integer change.
12. legal_risk is an integer change from -10 to +10.
13. location should only be returned if the player's location actually changes.

14. TRAVEL RULE — CRITICAL:
    If the event contains a destination, that destination represents
    an OPPORTUNITY to travel, NOT an automatic location change.

15. The player must have selected a choice that clearly accepts,
    pursues, completes, or successfully commits to the travel opportunity
    before you may return a location effect.

16. If the selected choice refuses, delays, investigates, negotiates,
    prepares for, or otherwise does NOT actually travel, do NOT return
    a location effect.

17. If the selected choice results in actual travel:
    effects.location MUST be exactly the event.destination.

18. NEVER invent a different destination in effects.location.

19. If the event.destination is null, NEVER return effects.location.

20. Do not teleport the player merely because a destination exists.

21. The server will validate the location change after this response.

22. Effects should normally be moderate.
23. Do not directly modify the database.
24. Do not invent player IDs.
25. Use Vietnamese for the outcome message if an outcome message is provided.
26. The result must correspond specifically to the selected choice.
27. Different choices should generally produce meaningfully different outcomes.
28. Do not provide real-world instructions for wrongdoing.
29. Keep the game suitable for a general audience.

CURRENT ROUND:
${context.round}

PLAYERS AND THEIR EXACT EVENTS / CHOICES:
${JSON.stringify(
  context.players,
  null,
  2
)}

RETURN ONLY VALID JSON.

The JSON must have exactly this structure:

{
  "round": number,
  "players": [
    {
      "player_id": "UUID",
      "effects": {
        "hp": number,
        "money": number,
        "location": "string",
        "legal_risk": number
      }
    }
  ]
}

The "players" array must contain exactly the same players supplied above.

DO NOT return events.
DO NOT return choices.
DO NOT return a different choice.

Only return the effects produced by the exact selected choice.
`;
}

/* =====================================================
   EXTRACT JSON
   ===================================================== */

function extractJson(
  text: string
): unknown {
  const cleaned = text
    .trim()
    .replace(
      /^```json\s*/i,
      ""
    )
    .replace(
      /^```\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
    .trim();

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    const firstBrace =
      cleaned.indexOf("{");

    const lastBrace =
      cleaned.lastIndexOf("}");

    if (
      firstBrace === -1 ||
      lastBrace === -1
    ) {
      throw new Error(
        "Gemini did not return valid JSON."
      );
    }

    return JSON.parse(
      cleaned.slice(
        firstBrace,
        lastBrace + 1
      )
    );
  }
}

/* =====================================================
   GENERATE PRIVATE EVENTS
   ===================================================== */

export async function generateAIHostEvents(
  context: AIHostContext
): Promise<ValidatedAIEventResponse> {
  const ai =
    getGeminiClient();

  const prompt =
    buildEventPrompt(
      context
    );

  const response =
    await generateWithRetry(
      () =>
        ai.models.generateContent({
          model:
            "gemini-3.6-flash",

          contents:
            prompt,

          config: {
            responseMimeType:
              "application/json",

            temperature:
              0.9,
          },
        })
    );

  const responseText =
    response.text;

  if (!responseText) {
    throw new Error(
      "Gemini returned an empty event response."
    );
  }

  const rawResponse =
    extractJson(
      responseText
    );

  const validated =
    validateAIEventResult(
      rawResponse,
      context
    );

  return validated;
}

/* =====================================================
   GENERATE OUTCOMES
   ===================================================== */

export async function generateAIHostOutcome(
  context: AIOutcomeContext
): Promise<ValidatedAIOutcomeResponse> {
  const ai =
    getGeminiClient();

  const prompt =
    buildOutcomePrompt(
      context
    );

  const response =
    await generateWithRetry(
      () =>
        ai.models.generateContent({
          model:
            "gemini-3.6-flash",

          contents:
            prompt,

          config: {
            responseMimeType:
              "application/json",

            temperature:
              0.7,
          },
        })
    );

  const responseText =
    response.text;

  if (!responseText) {
    throw new Error(
      "Gemini returned an empty outcome response."
    );
  }

  const rawResponse =
    extractJson(
      responseText
    );

  const validated =
    validateAIOutcomeResult(
      rawResponse,
      context
    );

  return validated;
}

/* =====================================================
   VALIDATE EVENT RESULT
   ===================================================== */

export function validateAIEventResult(
  rawResponse: unknown,
  context: AIHostContext
): ValidatedAIEventResponse {
  const response =
    validateAIEventResponse(
      rawResponse
    );

  if (
    response.round !==
    context.round
  ) {
    throw new Error(
      `AI returned round ${response.round}, expected ${context.round}.`
    );
  }

  const expectedPlayers: ExpectedPlayer[] =
    context.players.map(
      (player: AIHostPlayerContext) => ({
        id: player.id,
      })
    );

  /*
   * host-validation currently expects
   * the legacy AI response shape.
   *
   * Event responses do not contain effects,
   * so validate player IDs directly here.
   */

  const expectedIds =
    new Set(
      expectedPlayers.map(
        (player) =>
          player.id
      )
    );

  const actualIds =
    new Set(
      response.players.map(
        (player) =>
          player.player_id
      )
    );

  if (
    actualIds.size !==
    expectedIds.size
  ) {
    throw new Error(
      "AI returned an incorrect number of players."
    );
  }

  for (
    const expectedId of
      expectedIds
  ) {
    if (
      !actualIds.has(
        expectedId
      )
    ) {
      throw new Error(
        `AI event result missing player ${expectedId}.`
      );
    }
  }

  return response;
}

/* =====================================================
   VALIDATE OUTCOME RESULT
   ===================================================== */

export function validateAIOutcomeResult(
  rawResponse: unknown,
  context: AIOutcomeContext
): ValidatedAIOutcomeResponse {
  const response =
    validateAIOutcomeResponse(
      rawResponse
    );

  if (
    response.round !==
    context.round
  ) {
    throw new Error(
      `AI returned round ${response.round}, expected ${context.round}.`
    );
  }

  const expectedIds =
    new Set(
      context.players.map(
        (player) =>
          player.id
      )
    );

  const actualIds =
    new Set(
      response.players.map(
        (player) =>
          player.player_id
      )
    );

  if (
    actualIds.size !==
    expectedIds.size
  ) {
    throw new Error(
      "AI returned an incorrect number of outcome players."
    );
  }

  for (
    const expectedId of
      expectedIds
  ) {
    if (
      !actualIds.has(
        expectedId
      )
    ) {
      throw new Error(
        `AI outcome missing player ${expectedId}.`
      );
    }
  }

  return response;
}

/* =====================================================
   LEGACY GENERATE AI HOST RESULT
   =====================================================

   Giữ lại để rounds.ts hiện tại vẫn compile.
   Chưa dùng cho kiến trúc mới.

   Sau khi migrate rounds.ts sang
   generateAIHostEvents(), có thể xóa.
   ===================================================== */

function buildLegacyPrompt(
  context: AIHostContext
): string {
  return `
You are the AI Game Host for a Vietnamese multiplayer survival/travel RPG called "Đường Biên Đêm".

The game is fictional.

Generate one event and proposed effects for each player.

CURRENT ROUND:
${context.round}

PLAYERS:
${JSON.stringify(
  context.players,
  null,
  2
)}

RETURN ONLY VALID JSON.

{
  "round": number,
  "players": [
    {
      "player_id": "UUID",
      "event": {
        "title": "string",
        "description": "string",
        "type": "string",
        "choices": [
          {
            "id": "string",
            "text": "string"
          }
        ]
      },
      "effects": {
        "hp": number,
        "money": number,
        "location": "string",
        "legal_risk": number
      }
    }
  ]
}
`;
}

export async function generateAIHostResult(
  context: AIHostContext
): Promise<ValidatedAIHostResponse> {
  const ai =
    getGeminiClient();

  const prompt =
    buildLegacyPrompt(
      context
    );

  const response =
    await generateWithRetry(
      () =>
        ai.models.generateContent({
          model:
            "gemini-3.6-flash",

          contents:
            prompt,

          config: {
            responseMimeType:
              "application/json",

            temperature:
              0.9,
          },
        })
    );

  const responseText =
    response.text;

  if (!responseText) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  const rawResponse =
    extractJson(
      responseText
    );

  return validateAIHostResult(
    rawResponse,
    context
  );
}

/* =====================================================
   LEGACY VALIDATION
   ===================================================== */

export function validateAIHostResult(
  rawResponse: unknown,
  context: AIHostContext
): ValidatedAIHostResponse {
  const response =
    validateAIHostResponse(
      rawResponse
    );

  if (
    response.round !==
    context.round
  ) {
    throw new Error(
      `AI returned round ${response.round}, expected ${context.round}.`
    );
  }

  const expectedPlayers: ExpectedPlayer[] =
    context.players.map(
      (player: AIHostPlayerContext) => ({
        id: player.id,
      })
    );

  validateAIPlayers(
    response,
    expectedPlayers
  );

  return response;
}

/* =====================================================
   LEGACY GET PLAYER RESULT
   ===================================================== */

export function getPlayerResult(
  response: ValidatedAIHostResponse,
  playerId: string
): AIPlayerResult {
  const result =
    response.players.find(
      (player) =>
        player.player_id ===
        playerId
    );

  if (!result) {
    throw new Error(
      `AI result not found for player ${playerId}.`
    );
  }

  return result;
}