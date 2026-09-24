import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

import {
  callLocalAIJson,
  type LocalAIMessage,
} from "@/lib/ai/local";

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

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt++
  ) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const message =
        error instanceof Error
          ? error.message
          : String(error);

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

      if (
        !retryable ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      const delay =
        attempt * 2000;

      console.warn(
        `GEMINI RETRY ${attempt}/${maxAttempts} — waiting ${delay}ms`,
      );

      await new Promise<void>(
        (resolve) =>
          setTimeout(
            resolve,
            delay,
          ),
      );
    }
  }

  throw lastError;
}

/* =====================================================
   AI HOST CONTEXT
   ===================================================== */

export type AIHostRecentEvent = {
  round: number;
  title: string;
  description: string;
  status?: string | null;
  event_type?: string | null;
};

export type AIHostPlayerContext = {
  id: string;

  player_name: string;

  hp: number;

  money: number;

  location: string;

  legal_risk?: number;

  last_choice?: string | null;

  rounds_in_location: number;

  recent_events?: AIHostRecentEvent[];

  // Optional quest state. Existing callers remain compatible.
  main_quest_id?: string | null;
  main_quest_title?: string | null;
  mini_quest_index?: 1 | 2 | 3 | null;
  mini_quest_id?: string | null;
  mini_quest_title?: string | null;
  mini_quest_completed?: boolean;
  main_quest_completed?: boolean;

  // Optional active inventory-triggered SideQuest.
  // Backend remains the source of truth for status/reward.
  active_side_quest?: {
    id?: string | null;
    title?: string | null;
    objective?: string | null;
    source_item_id?: string | null;
    status?: string | null;
  } | null;
};

export type AIHostContext = {
  round: number;
  isMoneyQuestRound?: boolean;
  players: AIHostPlayerContext[];
};

/* =====================================================
   EVENT GENERATION PROMPT
   ===================================================== */

function compactEventContext(
  context: AIHostContext
): string {
  const compactPlayers = context.players.map((player) => ({
    id: player.id,
    player_name: player.player_name,
    hp: player.hp,
    money: player.money,
    location: player.location,
    legal_risk: player.legal_risk ?? 0,
    last_choice: player.last_choice ?? null,
    rounds_in_location: player.rounds_in_location,
    quest: {
      main_quest_id: player.main_quest_id ?? null,
      main_quest_title: player.main_quest_title ?? null,
      mini_quest_index: player.mini_quest_index ?? null,
      mini_quest_id: player.mini_quest_id ?? null,
      mini_quest_title: player.mini_quest_title ?? null,
      mini_quest_completed: player.mini_quest_completed ?? false,
      main_quest_completed: player.main_quest_completed ?? false,
    },
    active_side_quest: player.active_side_quest ?? null,
    recent_events: (player.recent_events ?? [])
      .slice(0, 4)
      .map((event) => ({
        round: event.round,
        type: event.event_type ?? null,
        title: event.title.slice(0, 140),
        description: event.description.slice(0, 260),
        status: event.status ?? null,
      })),
  }));

  return JSON.stringify(
    {
      round: context.round,
      isMoneyQuestRound: Boolean(context.isMoneyQuestRound),
      players: compactPlayers,
    },
    null,
    2
  );
}

function buildEventPrompt(
  context: AIHostContext
): string {
  return `
Bạn là AI Host của game Đường Biên Đêm.

MỤC TIÊU:
Tạo đúng 1 PRIVATE MAIN EVENT cho mỗi active player.

=====================================================
1. STORY CONTINUITY
=====================================================

Event mới phải là cảnh tiếp theo hợp lý của cuộc đời player.

CONTINUITY = lý do event xảy ra.
VARIETY = loại event xảy ra.

Không được biến game thành chuỗi giao hàng/job:
delivery → xăng → mưa → gọi điện → delivery → delivery.

Nếu một objective đã hoàn thành:
→ KHÔNG lặp lại objective đó.
→ chuyển sang mini quest kế tiếp hoặc hậu quả mới.

Không được tạo MAIN QUEST mới khi MAIN QUEST hiện tại chưa hoàn thành.

=====================================================
2. QUEST FLOW — CỨNG
=====================================================

ONE MAIN QUEST = EXACTLY 3 LINKED MINI QUESTS.

MAIN
→ MINI 1
→ MINI 2
→ MINI 3
→ MAIN COMPLETE
→ STORY CONSEQUENCE
→ NEXT MAIN.

Không được kết thúc Main Quest sau Mini 1 hoặc Mini 2.

Một Mini Quest thường 1–2 round.
Nếu objective đã xong thì phải tiến sang bước tiếp theo.

Nếu metadata quest có trong context:
→ coi metadata là SOURCE OF TRUTH.

Nếu không có metadata:
→ chỉ suy luận từ recent_events, last_choice và state.
→ không tự bịa rằng quest đã hoàn thành.

=====================================================
3. EVENT VARIETY — RỘNG
=====================================================

Khi story cho phép, event có thể thuộc bất kỳ nhóm hợp lý nào:

- công việc / mất việc / cơ hội mới
- tiền / chi phí / tài chính
- du lịch / phương tiện / xe hỏng
- thời tiết / môi trường
- ăn uống / chỗ ở / mệt / hồi phục
- tai nạn / nguy hiểm
- trộm / lừa đảo / mất đồ / đồ khả nghi
- công an / giấy tờ / pháp lý / biên giới
- NPC / quan hệ / tranh cãi / hiểu lầm / nợ / lời hứa
- NPC cũ quay lại
- tin tức / tin đồn / thông tin
- học kỹ năng / kinh nghiệm
- lựa chọn đạo đức
- may mắn / xui xẻo
- hậu quả từ lựa chọn cũ
- cơ hội sinh ra từ quest đã hoàn thành
- vấn đề từ quest chưa giải quyết
- sự kiện liên quan player khác nếu có căn cứ

Không phải round nào cũng cần drama.
Không phải event nào cũng cần tiền, HP, travel hoặc nguy hiểm.

Nếu recent_events đã lặp cùng kiểu cảnh:
→ ưu tiên một kiểu event khác NẾU story cho phép.

Mục tiêu:
"Cái gì cũng có khả năng xảy ra"
nhưng vẫn hợp lý với hoàn cảnh hiện tại.

=====================================================
4. MONEY MAIN QUEST — SERVER SCHEDULE
=====================================================

Money Main Quest xảy ra khi:

round >= 6 AND (round - 6) % 5 === 0

Tức:
6, 11, 16, 21, 26, ...

Nếu isMoneyQuestRound = true:

- EVERY active player MUST nhận Money Main Quest.
- Đây là MAIN EVENT, KHÔNG phải SideQuest.
- event.type BẮT BUỘC = "money_main_quest".
- Phải là cơ hội có giá trị, có lựa chọn và risk/reward.
- Phải phù hợp với location, state và storyline của player.
- Không tự cộng tiền.
- Không ghi effects/reward vào event.
- Không tự quyết số tiền.
- Server mới quyết định reward sau khi resolve.
- Có thể tạo cơ hội có khả năng kiếm số tiền lớn, nhưng không hứa chắc.
- Không thay thế inventory-triggered SideQuest.

Nếu isMoneyQuestRound = false:
- Không tạo Money Main Quest.
- Không dùng type "money_main_quest".

=====================================================
5. ITEM → SIDEQUEST
=====================================================

Inventory SideQuest là hệ thống RIÊNG với Main Quest.

Nếu context có active_side_quest:
→ tiếp tục SideQuest đó nếu nó đang chờ player.
→ không biến nó thành Main Quest.
→ không tự trả reward.

Khi một item đã trigger SideQuest:
→ quest đó có objective và completion riêng.
→ reward chỉ được server cấp khi SideQuest hoàn thành.
→ không cho AI tự cộng tiền.
→ không tạo SideQuest mới chỉ để farm cùng item.

Item SideQuest có thể tạo:
- cơ hội kiếm tiền
- NPC mới
- thông tin
- travel opportunity
- risk
- chi phí
- hậu quả story

Nhưng AI chỉ tạo narrative/choices.
Backend là source of truth cho item, trạng thái và reward.

=====================================================
6. PLAYER AGENCY
=====================================================

Event chỉ mô tả tình huống.

KHÔNG tự động:
- accept / refuse
- travel
- spend money
- earn money
- lose HP
- gain reward
- change location
- complete quest

Player chọn trước.
Outcome resolve sau.

=====================================================
7. TRAVEL
=====================================================

destination = cơ hội đi tới nơi khác, KHÔNG phải đã đi.

Nếu không có cơ hội travel:
destination = null.

Nếu có:
- destination khác current location
- có lý do rõ ràng
- có choice để pursue travel

Không teleport.

=====================================================
8. EVENT SHAPE
=====================================================

Mỗi player:
- đúng 1 event
- 2–4 choices
- choices phải khác nhau về hướng quyết định
- không effects trong event
- không tự thay đổi stats

=====================================================
9. ANTI-LOOP SELF CHECK
=====================================================

Trước khi output, kiểm tra:

1. Event này có lặp objective vừa hoàn thành không?
2. Có đang lặp delivery/job filler không?
3. Có thể đổi loại event mà vẫn hợp story không?
4. Quest hiện tại đang ở Main/Mini nào?
5. Nếu Mini đã complete, event có tiến sang Mini tiếp theo không?
6. Nếu Mini 3 complete, event mới có xuất phát từ consequence không?
7. Nếu round là Money Quest round, type có đúng "money_main_quest" không?
8. Có tự cộng tiền / HP / legal risk / travel không?
9. Có biến SideQuest thành Main Quest không?

=====================================================
CURRENT GAME CONTEXT
=====================================================

${compactEventContext(context)}

=====================================================
OUTPUT
=====================================================

CHỈ TRẢ JSON:

{
  "round": number,
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

Không markdown.
Không giải thích.
Không thêm field.
`;
}

/* =====================================================
   OUTCOME / RESOLVE CONTEXT
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
   OUTCOME PROMPT
   ===================================================== */

function buildOutcomePrompt(
  context: AIOutcomeContext
): string {
  return `
You are the AI Game Host for a Vietnamese multiplayer survival/travel RPG called "Đường Biên Đêm".

The game is fictional.

You are resolving choices that players have ALREADY MADE.

Each player has:

- current state
- exact event
- exact choices
- exact selected choice

Your job is to calculate the believable consequences of THAT EXACT CHOICE.

=====================================================
HIGHEST PRIORITY
=====================================================

The selected choice is the source of truth.

DO NOT:

- change the selected choice
- invent another choice
- resolve a different event
- create unrelated consequences
- teleport players
- invent rewards without narrative reason
- invent expenses without narrative reason

The outcome must be the natural consequence of:

CURRENT STATE
+
CURRENT EVENT
+
SELECTED CHOICE.


=====================================================
QUEST LIFECYCLE — OUTCOME RESOLUTION
=====================================================

Resolve the CURRENT MINI QUEST before thinking about a new story.

ONE MAIN QUEST = EXACTLY 3 LINKED MINI QUESTS.

After resolving the selected choice, determine internally:

1. Did the choice advance the current mini quest?
2. Did it COMPLETE the current mini quest?
3. If yes, move to the next mini quest of the SAME main quest.
4. If the completed mini quest was #1 or #2:
   NEVER start a new main quest.
5. If the completed mini quest was #3:
   the current main quest is COMPLETE.
6. Only then may the story transition to the next main quest.
7. The next main quest must be caused by the consequences of the
   completed story, not random generation.

CRITICAL ANTI-LOOP RULE:

If the selected choice clearly completes the current objective
(for example, a package is successfully delivered and the recipient
accepts it), do NOT resolve another round of the same delivery objective.

The next event must advance the linked quest chain or, when the third
mini quest is complete, advance the story into its consequence.

A mini quest should normally take 1–2 rounds. Do not keep an already
completed mini quest alive merely because the broader storyline is
still active.

=====================================================
PLAYER ID
=====================================================

Every result must use the EXACT player_id supplied.

NEVER invent UUIDs.

Every supplied player must receive exactly one result.

=====================================================
EFFECTS ARE DELTAS
=====================================================

IMPORTANT:

effects.hp
effects.money
effects.legal_risk

are CHANGES.

They are NOT final values.

Example:

Current money:
5,000,000

Player receives:
3,000,000

Correct:

"money": 3000000

Incorrect:

"money": 8000000

=====================================================
MONEY — VERY IMPORTANT
=====================================================

Money represents actual financial change.

POSITIVE money means the player gains money.

NEGATIVE money means the player loses money.

ZERO means there is no meaningful financial consequence.

If the selected choice clearly involves:

- accepting paid work
- completing paid work
- receiving wages
- receiving payment
- receiving a reward
- receiving financial support
- selling something
- successfully completing a paid delivery
- successfully earning money

then money should normally be POSITIVE.

If the selected choice clearly involves:

- paying
- buying
- transportation expense
- food expense
- medical expense
- fine
- deposit
- losing money
- being robbed
- losing property

then money should normally be NEGATIVE.

If there is no meaningful financial consequence:

money can be 0.

=====================================================
PAID JOB RULE
=====================================================

A clearly successful paid job should NOT normally return:

"money": 0

unless the story explicitly explains why the player was not paid.

For a temporary two-week job, a realistic positive income can
commonly be around:

1,000,000–8,000,000 VND

depending on:

- job type
- difficulty
- location
- risk
- conditions
- performance

This is a DELTA, not total money.

Example:

Current:
5,000,000

Payment:
3,000,000

Correct:
"money": 3000000

NOT:
"money": 8000000

=====================================================
CHOICES WITH NO PAYMENT
=====================================================

Normally:

Refuse job
→ money = 0

Investigate job
→ money = 0

Ask questions
→ money = 0

Prepare for job
→ money = 0

Negotiate before payment
→ money = 0

Only apply money when the selected choice actually causes
a financial consequence.

=====================================================
HP
=====================================================

hp is a CHANGE.

Only change HP when the selected choice actually affects health.

Examples:

Minor injury:
"hp": -2

Rest / recovery:
"hp": 1

No health effect:
"hp": 0

Do not create large HP changes without strong narrative reason.

=====================================================
LEGAL RISK
=====================================================

legal_risk is a CHANGE from:

-10 to +10

Only modify it when the selected choice actually relates to:

- legal problems
- documents
- border checks
- police checks
- suspicious activity
- fines
- legal exposure
- reducing legal risk

Otherwise:

"legal_risk": 0

=====================================================
QUEST FLOW — OUTCOME
=====================================================

Outcome phải xác định mini quest hiện tại có vừa hoàn thành hay chưa.

- Mini 1 complete → sang Mini 2 của CÙNG Main Quest.
- Mini 2 complete → sang Mini 3 của CÙNG Main Quest.
- Mini 3 complete → Main Quest complete → story consequence → Main Quest mới.
- Không được mở Main Quest mới sau Mini 1 hoặc Mini 2.
- Nếu objective đã hoàn thành, không được kéo dài objective đó sang round mới.
- Một mini quest thường chỉ kéo dài 1–2 round.

=====================================================
LOCATION — ABSOLUTELY CRITICAL
=====================================================

The location field is OPTIONAL.

Only return effects.location if the player ACTUALLY MOVES.

The existence of event.destination DOES NOT automatically mean
the player moved.

The player must have selected a choice that clearly:

- accepts travel
- commits to travel
- actually travels
- successfully begins/finishes the journey

If the player:

- refuses
- delays
- investigates
- asks questions
- negotiates
- prepares
- considers
- stays

then DO NOT return location.

=====================================================
NEVER RETURN EMPTY LOCATION
=====================================================

ABSOLUTELY NEVER:

"location": ""

ABSOLUTELY NEVER:

"location": " "

ABSOLUTELY NEVER:

"location": null

when no movement occurs.

If the player did not move:

REMOVE THE LOCATION FIELD ENTIRELY.

Correct:

{
  "player_id": "...",
  "effects": {
    "hp": 0,
    "money": -50000,
    "legal_risk": 0
  }
}

Incorrect:

{
  "player_id": "...",
  "effects": {
    "hp": 0,
    "money": -50000,
    "location": "",
    "legal_risk": 0
  }
}

=====================================================
ACTUAL TRAVEL
=====================================================

If actual travel occurs:

effects.location MUST:

1. Exist.
2. Be a non-empty string.
3. Be trimmed.
4. Exactly equal event.destination.
5. Represent the destination actually reached.

NEVER invent another destination.

If event.destination is null:

NEVER return effects.location.

=====================================================
NO TELEPORTATION
=====================================================

Do not change location merely because:

- the event mentions a destination
- a job exists elsewhere
- the player investigates
- the player asks about travel
- the player considers travel

Travel requires an appropriate selected choice.

=====================================================
STORY CONTINUITY
=====================================================

The outcome should continue the player's existing storyline.

If the player is:

- doing a delivery
- working a job
- travelling
- waiting for someone
- negotiating
- solving a problem
- helping an NPC

resolve that situation.

Do not reset the story.

=====================================================
NO UNJUSTIFIED EFFECTS
=====================================================

Every effect needs a narrative reason.

Do NOT:

- give random money
- remove random money
- randomly damage HP
- randomly increase legal risk
- randomly move location

If an effect has no reason:

DO NOT APPLY IT.

=====================================================
CURRENT ROUND
=====================================================

Round:
${context.round}

Players and their exact events / choices:

${JSON.stringify(
  context.players,
  null,
  2
)}

=====================================================
FINAL SELF-CHECK
=====================================================

Before returning JSON, internally verify:

1. Is player_id exactly correct?
2. Is this the exact selected choice?
3. Is money a DELTA rather than total money?
4. If successful paid work happened, is money normally positive?
5. If an expense happened, is money normally negative?
6. If no financial consequence happened, is money 0?
7. Does HP actually change?
8. Does legal risk actually change?
9. Did the player ACTUALLY travel?
10. If NOT, did I completely OMIT location?
11. Did I accidentally output location = ""?
12. Did I accidentally output location = " "?
13. If travel occurred, does location exactly equal event.destination?
14. Did I invent any effect without narrative support?

=====================================================
OUTPUT
=====================================================

Return ONLY valid JSON.

No markdown.
No explanation.
No text outside JSON.

Exactly:

{
  "round": number,
  "players": [
    {
      "player_id": "UUID",
      "effects": {
        "hp": number,
        "money": number,
        "legal_risk": number,
        "location": "string"
      }
    }
  ]
}

IMPORTANT:

- effects.location is OPTIONAL.
- If there is no movement, OMIT location completely.
- NEVER use an empty string for location.
- NEVER use whitespace for location.
- NEVER use null for location.
- Only include location after actual travel.
- Only include location when it exactly equals event.destination.

Return valid JSON only.
`;
}

/* =====================================================
   ROUND BATCH PROMPT
   ===================================================== */

function buildRoundBatchPrompt(
  context: AIRoundBatchContext
): string {
  return `
You are the AI Game Host for "Đường Biên Đêm", a fictional Vietnamese multiplayer survival/travel RPG.

Perform TWO tasks:

TASK A:
Resolve the CURRENT ROUND choices.

TASK B:
Generate the NEXT ROUND events.


=====================================================
QUEST LIFECYCLE — NEXT ROUND
=====================================================

The next round MUST respect the quest hierarchy:

MAIN QUEST
→ MINI QUEST 1
→ MINI QUEST 2
→ MINI QUEST 3
→ MAIN QUEST COMPLETE
→ STORY CONSEQUENCE
→ NEXT MAIN QUEST

Do not create a new main quest merely because the round ended.

If the current mini quest is unfinished:
→ continue it with a concrete new objective or consequence.

If the current mini quest is complete:
→ advance to the next linked mini quest in the SAME main quest.

If mini quest #1 is complete:
→ start mini quest #2.

If mini quest #2 is complete:
→ start mini quest #3.

If mini quest #3 is complete:
→ close the current main quest and create the next story beat from
  its consequences.

ANTI-REPETITION:

Never generate the same completed objective again.

Example:

MINI QUEST: deliver package
Round 1: receive package and prepare route
Round 2: travel / solve delivery obstacle
Round 3: package delivered
→ DELIVERY MINI QUEST COMPLETE.

Do NOT produce:
"check package", "call recipient", "more traffic", "more rain",
"continue delivery" again after successful delivery.

Instead advance to the next linked mini quest.

The AI must prefer QUEST PROGRESSION over filler continuity.

=====================================================
TASK A — CURRENT OUTCOMES
=====================================================

Resolve the exact selected choice of every player.

Rules:

- ONE MAIN QUEST = EXACTLY 3 LINKED MINI QUESTS.
- Mini 1 → Mini 2 → Mini 3.
- Never start a new MAIN QUEST after Mini 1 or Mini 2.
- Only Mini 3 completion closes the current MAIN QUEST.
- After Main Quest completion, derive the next Main Quest from story
  consequences and established continuity.
- Never repeat an already completed objective.
- A mini quest should normally resolve within 1–2 rounds.

- exactly one outcome per player
- use exact player_id
- use exact event
- use exact selected choice
- effects are DELTAS
- hp is an integer change
- money is an integer VND change
- legal_risk is an integer change from -10 to +10
- location is OPTIONAL
- location only exists after actual travel

=====================================================
MONEY
=====================================================

money is a CHANGE, never total money.

Successful paid work:
→ normally positive

Receiving wages:
→ normally positive

Receiving payment:
→ normally positive

Receiving reward:
→ normally positive

Buying:
→ negative

Paying:
→ negative

Transport expense:
→ negative

Food expense:
→ negative

Medical expense:
→ negative

Fine:
→ negative

Refusing job:
→ normally 0

Investigating:
→ normally 0

Asking questions:
→ normally 0

Preparing:
→ normally 0

Negotiating before payment:
→ normally 0

A clearly successful paid job should normally NOT have money = 0
unless there is an explicit narrative reason.

A temporary two-week job may reasonably produce around
1,000,000–8,000,000 VND depending on circumstances.

=====================================================
LOCATION
=====================================================

A destination in the event is only a travel OPPORTUNITY.

It does NOT mean the player already travelled.

Only include:

"location": "destination"

when the selected choice actually causes travel.

If the player:

- refuses
- delays
- investigates
- negotiates
- asks questions
- prepares
- considers

DO NOT include location.

NEVER:

"location": ""

NEVER:

"location": " "

NEVER:

"location": null

If no movement:

OMIT location completely.

If movement occurs:

location MUST exactly equal event.destination.

=====================================================
CURRENT ROUND
=====================================================

Round:
${context.round}

Players:
${JSON.stringify(
  context.outcomePlayers,
  null,
  2
)}

=====================================================
TASK B — NEXT ROUND
=====================================================

Generate exactly one event for every player for:

Round ${context.round + 1}

Use:

- current location
- money
- HP
- legal risk
- last choice
- rounds_in_location
- current storyline
- previous NPCs
- unresolved problems
- current journey
- current job

=====================================================
NEXT ROUND CONTINUITY
=====================================================

Prefer:

CURRENT STORY
→ NEXT NATURAL SCENE

Do not reset the story.

If a player is in the middle of a job:

continue the job.

If travelling:

continue the journey.

If waiting:

continue waiting / follow-up.

If negotiating:

continue negotiation.

If a story was completed:

show aftermath before introducing a new major story.

=====================================================
MAIN STORY + INCIDENTAL EVENTS
=====================================================

Side events must fit the current activity.

Example:

Delivery story:

- fuel
- food
- rain
- traffic
- call from company
- vehicle issue
- recipient call
- address problem

Do not replace the delivery story with an unrelated major storyline.

=====================================================
STORY ARC
=====================================================

Use natural progression:

INTRODUCTION
→ OPPORTUNITY
→ DECISION
→ PREPARATION
→ EXECUTION
→ INCIDENTAL EVENT
→ COMPLICATION
→ RESPONSE
→ COMPLETION
→ REWARD / CONSEQUENCE
→ NEW OPPORTUNITY

Do not force all stages.

=====================================================
LOCATION PROGRESSION
=====================================================

If rounds_in_location is low:

local progression is normal.

If rounds_in_location >= 3:

increase opportunities to leave.

If rounds_in_location >= 5:

strongly consider meaningful travel opportunities.

If rounds_in_location >= 8:

strongly prioritize mobility/progression.

BUT:

unresolved story continuity takes priority.

Do not force travel just because the counter is high.

=====================================================
TRAVEL OPPORTUNITIES
=====================================================

A travel opportunity needs:

- concrete destination
- reason to go
- meaningful benefit
- meaningful risk/cost
- choice that can pursue travel

Destination must differ from current location.

Do not teleport.

For ordinary events:

destination = null

For travel opportunity:

destination = concrete location

=====================================================
INTERNATIONAL PROGRESSION
=====================================================

International travel should develop gradually.

Possible sequence:

opportunity
→ contact
→ investigation
→ preparation
→ documents
→ transportation
→ travel

Never instantly teleport the player abroad.

=====================================================
NEXT EVENT DESIGN
=====================================================

Every next event:

- is a concrete scene
- has 2–4 choices
- has unique choice IDs
- has meaningful choices
- does not reveal mechanical consequences
- does not contain HP/money/legal effects
- does not automatically move player

=====================================================
NEXT ROUND PLAYER STATE
=====================================================

${JSON.stringify(
  context.nextRoundPlayers,
  null,
  2
)}

=====================================================
OUTPUT
=====================================================

Return ONLY valid JSON.

Exactly:

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

STRICT:

- outcomes.players = exact current player IDs
- nextEvents.players = exact next-round player IDs
- effects.location OPTIONAL
- omit effects.location when no travel
- NEVER return empty location
- NEVER return whitespace location
- NEVER return null location
- location must exactly equal event.destination when travel occurs
- no extra fields
- valid JSON only
`;
}

/* =====================================================
   LOCAL AI — EVENT JSON SCHEMA
   ===================================================== */

const LOCAL_EVENT_SCHEMA: Record<
  string,
  unknown
> = {
  type: "object",

  additionalProperties: false,

  properties: {
    round: {
      type: "integer",
    },

    players: {
      type: "array",

      items: {
        type: "object",

        additionalProperties: false,

        properties: {
          player_id: {
            type: "string",
          },

          event: {
            type: "object",

            additionalProperties: false,

            properties: {
              title: {
                type: "string",
              },

              description: {
                type: "string",
              },

              type: {
                type: "string",
              },

              destination: {
                anyOf: [
                  {
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },

              choices: {
                type: "array",

                minItems: 2,
                maxItems: 4,

                items: {
                  type: "object",

                  additionalProperties: false,

                  properties: {
                    id: {
                      type: "string",
                    },

                    text: {
                      type: "string",
                    },
                  },

                  required: [
                    "id",
                    "text",
                  ],
                },
              },
            },

            required: [
              "title",
              "description",
              "type",
              "destination",
              "choices",
            ],
          },
        },

        required: [
          "player_id",
          "event",
        ],
      },
    },
  },

  required: [
    "round",
    "players",
  ],
};

/* =====================================================
   LOCAL AI — OUTCOME JSON SCHEMA
   ===================================================== */

const LOCAL_OUTCOME_SCHEMA: Record<
  string,
  unknown
> = {
  type: "object",

  additionalProperties: false,

  properties: {
    round: {
      type: "integer",
    },

    players: {
      type: "array",

      items: {
        type: "object",

        additionalProperties: false,

        properties: {
          player_id: {
            type: "string",
          },

          effects: {
            type: "object",

            additionalProperties: false,

            properties: {
              hp: {
                type: "integer",
              },

              money: {
                type: "integer",
              },

              location: {
                type: "string",
                description:
                  "ONLY include when the player actually travels. NEVER use an empty string. Omit this field when there is no movement.",
              },

              legal_risk: {
                type: "integer",
                minimum: -10,
                maximum: 10,
              },
            },

            required: [
              "hp",
              "money",
              "legal_risk",
            ],
          },
        },

        required: [
          "player_id",
          "effects",
        ],
      },
    },
  },

  required: [
    "round",
    "players",
  ],
};

/* =====================================================
   NORMALIZE LOCAL / AI OUTCOME
   =====================================================

   Qwen đôi khi trả:

   "location": ""

   dù prompt đã yêu cầu bỏ field.

   Hàm này biến:

   location: ""
   location: "   "
   location: null

   thành:

   không có location

   để không làm Zod fail và không kích hoạt fallback
   chỉ vì lỗi format vô hại này.
   ===================================================== */

function normalizeOutcomeLocation(
  rawResponse: unknown
): unknown {
  if (
    !rawResponse ||
    typeof rawResponse !== "object" ||
    Array.isArray(rawResponse)
  ) {
    return rawResponse;
  }

  const response =
    rawResponse as Record<
      string,
      unknown
    >;

  if (
    !Array.isArray(
      response.players
    )
  ) {
    return rawResponse;
  }

  return {
    ...response,

    players:
      response.players.map(
        (player) => {
          if (
            !player ||
            typeof player !== "object" ||
            Array.isArray(player)
          ) {
            return player;
          }

          const playerObject =
            player as Record<
              string,
              unknown
            >;

          if (
            !playerObject.effects ||
            typeof playerObject.effects !== "object" ||
            Array.isArray(
              playerObject.effects
            )
          ) {
            return player;
          }

          const effects =
            playerObject.effects as Record<
              string,
              unknown
            >;

          if (
            !("location" in effects)
          ) {
            return player;
          }

          const location =
            effects.location;

          if (
            location === null ||
            location === undefined
          ) {
            const {
              location: _ignored,
              ...cleanEffects
            } = effects;

            return {
              ...playerObject,
              effects:
                cleanEffects,
            };
          }

          if (
            typeof location === "string"
          ) {
            const trimmed =
              location.trim();

            if (!trimmed) {
              const {
                location: _ignored,
                ...cleanEffects
              } = effects;

              return {
                ...playerObject,
                effects:
                  cleanEffects,
              };
            }

            if (
              trimmed !== location
            ) {
              return {
                ...playerObject,

                effects: {
                  ...effects,
                  location:
                    trimmed,
                },
              };
            }
          }

          return player;
        }
      ),
  };
}

/* =====================================================
   LOCAL AI — GENERATE EVENTS
   ===================================================== */

async function generateAIHostEventsLocal(
  context: AIHostContext
): Promise<ValidatedAIEventResponse> {
  const messages: LocalAIMessage[] = [
    {
      role: "system",
      content: `
Bạn là AI Host của Đường Biên Đêm.

BẮT BUỘC:
- CURRENT GAME CONTEXT có bao nhiêu player thì output phải có ĐÚNG bấy nhiêu player entries.
- Mỗi player_id trong context phải xuất hiện ĐÚNG 1 lần.
- Không được bỏ sót player.
- Không được dừng JSON sau player đầu tiên.
- Hãy tạo event cho TẤT CẢ player rồi mới kết thúc JSON.

Tạo event JSON đúng schema.
Tuân thủ tuyệt đối:
- story continuity
- đúng quest flow 1 Main = 3 Mini
- đa dạng event, không lặp delivery/job filler
- Money Main Quest đúng lịch server
- item SideQuest là hệ thống riêng
- player agency
- không tự tạo effects
- không teleport
`,
    },
    {
      role: "user",
      content: buildEventPrompt(context),
    },
  ];

  /*
   * Qwen must return exactly one event for every active player.
   * Put the exact player count into the JSON schema so the model
   * cannot legally stop after generating only the first player.
   */
  const expectedPlayerCount =
    context.players.length;

  const basePlayersSchema =
    (
      LOCAL_EVENT_SCHEMA.properties as {
        players: {
          items: unknown;
        };
      }
    ).players;

  const localEventSchema = {
    ...LOCAL_EVENT_SCHEMA,

    properties: {
      ...(LOCAL_EVENT_SCHEMA.properties as Record<string, unknown>),

      players: {
        type: "array",
        minItems: expectedPlayerCount,
        maxItems: expectedPlayerCount,
        items: basePlayersSchema.items,
      },
    },
  };

  const result =
    await callLocalAIJson<unknown>(
      messages,
      {
        name: "game_events",
        strict: true,
        schema: localEventSchema,
      },
      {
        temperature: 0.78,
        topP: 0.9,
        maxTokens: Math.max(
          1200,
          expectedPlayerCount * 550
        ),
      },
    );

  console.log(
    "LOCAL AI EVENTS:",
    JSON.stringify(
      result.raw.usage,
      null,
      2,
    ),
  );

  console.log(
    "LOCAL AI EVENTS FINISH:",
    result.raw.finishReason,
  );

  return validateAIEventResult(
    result.data,
    context
  );
}

/* =====================================================
   LOCAL AI — GENERATE OUTCOME
   ===================================================== */


async function generateAIHostOutcomeLocal(
  context: AIOutcomeContext
): Promise<ValidatedAIOutcomeResponse> {
  const messages: LocalAIMessage[] = [
    {
      role: "system",

      content: `
Bạn là AI Host của game Đường Biên Đêm.

Bạn đang RESOLVE lựa chọn mà người chơi VỪA CHỌN.

Bạn phải xác định hệ quả hợp lý của:

CURRENT STATE
+
CURRENT EVENT
+
EXACT SELECTED CHOICE.

=====================================================
QUY TẮC TUYỆT ĐỐI
=====================================================

1. CHỈ TRẢ JSON.

Không markdown.
Không giải thích.
Không text ngoài JSON.

2. PLAYER_ID

Dùng đúng player_id được cung cấp.

Không tự tạo UUID.

Mỗi player phải có đúng một outcome.

=====================================================
3. EFFECTS LÀ DELTA
=====================================================

hp, money, legal_risk là THAY ĐỔI.

Không phải giá trị cuối cùng.

Ví dụ:

Current money = 5,000,000
Nhận payment = 3,000,000

Đúng:

"money": 3000000

Sai:

"money": 8000000

=====================================================
4. MONEY
=====================================================

Nếu người chơi thực sự:

- nhận lương
- nhận payment
- hoàn thành job có trả tiền
- giao hàng thành công và được trả
- nhận reward
- bán đồ

→ money thường phải POSITIVE.

Nếu người chơi:

- mua
- trả tiền
- đổ xăng
- trả phí
- trả viện phí
- bị phạt
- mất tiền

→ money thường phải NEGATIVE.

Nếu không có tác động tiền:

money = 0.

=====================================================
5. PAID JOB
=====================================================

Nếu người chơi thực sự hoàn thành một công việc có trả tiền:

KHÔNG nên trả:

"money": 0

trừ khi story giải thích rõ vì sao không được trả.

Job tạm thời khoảng 2 tuần có thể tạo thu nhập thực tế
khoảng 1,000,000–8,000,000 VND tùy:

- loại job
- địa điểm
- độ khó
- rủi ro
- điều kiện
- kết quả

Đây là DELTA.

=====================================================
6. KHÔNG TẠO TIỀN VÔ LÝ
=====================================================

Chỉ có job trong event chưa đủ để nhận tiền.

Ví dụ:

Nhận lời tìm hiểu job
→ money = 0

Hỏi thêm thông tin
→ money = 0

Đàm phán
→ money = 0

Chuẩn bị
→ money = 0

Từ chối
→ money = 0

Chỉ khi hành động thực sự dẫn tới thu nhập:
→ money > 0

=====================================================
7. HP
=====================================================

hp là DELTA.

Chỉ thay đổi khi lựa chọn thực sự ảnh hưởng sức khỏe.

Không tạo damage lớn nếu context không hỗ trợ.

=====================================================
8. LEGAL RISK
=====================================================

legal_risk là DELTA từ -10 đến +10.

Chỉ thay đổi khi lựa chọn thực sự liên quan đến:

- giấy tờ
- kiểm tra
- pháp lý
- công an
- biên giới
- vi phạm
- giảm rủi ro pháp lý

Nếu không:

legal_risk = 0.

=====================================================
9. LOCATION — QUAN TRỌNG NHẤT
=====================================================

location là OPTIONAL.

CHỈ trả location khi người chơi THỰC SỰ DI CHUYỂN.

Nếu KHÔNG di chuyển:

PHẢI BỎ HẲN FIELD location.

KHÔNG ĐƯỢC:

"location": ""

KHÔNG ĐƯỢC:

"location": " "

KHÔNG ĐƯỢC:

"location": null

Không dùng location rỗng để biểu thị "không đổi".

=====================================================
10. KHI NÀO ĐƯỢC ĐỔI LOCATION
=====================================================

Chỉ đổi location nếu selected choice rõ ràng:

- chấp nhận chuyến đi
- thực sự đi
- bắt đầu/hoàn thành travel
- cam kết di chuyển

Nếu choice chỉ:

- hỏi
- tìm hiểu
- thương lượng
- chuẩn bị
- trì hoãn
- cân nhắc
- từ chối

→ KHÔNG đổi location.

=====================================================
11. DESTINATION
=====================================================

event.destination là nơi mà cơ hội travel DẪN TỚI.

Nó không có nghĩa player đã tới đó.

Nếu thực sự travel:

effects.location
PHẢI BẰNG CHÍNH XÁC:

event.destination

Không được tự đổi tên địa điểm.

Nếu event.destination = null:

TUYỆT ĐỐI KHÔNG trả location.

=====================================================
12. VÍ DỤ KHÔNG DI CHUYỂN
=====================================================

{
  "player_id": "...",
  "effects": {
    "hp": 0,
    "money": -50000,
    "legal_risk": 0
  }
}

=====================================================
13. VÍ DỤ CÓ DI CHUYỂN
=====================================================

Nếu:

event.destination = "Lào Cai"

và choice thực sự đi:

{
  "player_id": "...",
  "effects": {
    "hp": 0,
    "money": -200000,
    "location": "Lào Cai",
    "legal_risk": 0
  }
}

=====================================================
14. VÍ DỤ SAI TUYỆT ĐỐI
=====================================================

{
  "player_id": "...",
  "effects": {
    "hp": 0,
    "money": 0,
    "location": "",
    "legal_risk": 0
  }
}

Không được tạo output kiểu này.

=====================================================
15. STORY CONTINUITY
=====================================================

Outcome phải tiếp nối storyline.

Nếu player đang:

- giao hàng
- làm việc
- đi đường
- chờ NPC
- giải quyết vấn đề
- thương lượng

thì outcome phải giải quyết đúng tình huống đó.

Không tạo một storyline khác.

=====================================================
16. KHÔNG BỊA EFFECT
=====================================================

Mọi effect phải có căn cứ từ:

event
+
selected choice
+
player state.

Không tự tạo:

- tiền
- mất tiền
- damage
- legal risk
- travel

chỉ để làm game "kịch tính".

=====================================================
17. FINAL SELF CHECK
=====================================================

Trước khi output, tự kiểm tra:

- player_id đúng chưa?
- đúng selected choice chưa?
- money là DELTA chưa?
- paid job thành công có money dương chưa?
- expense có money âm chưa?
- không có financial consequence thì money = 0 chưa?
- HP có lý do chưa?
- legal risk có lý do chưa?
- player có thực sự di chuyển không?
- nếu không di chuyển, location đã BỎ HẲN chưa?
- location có đang là "" không?
- location có đang là " " không?
- location có đang là null không?
- nếu travel, location có đúng bằng event.destination không?

=====================================================
OUTPUT
=====================================================

CHỈ TRẢ JSON:

{
  "round": number,
  "players": [
    {
      "player_id": "uuid",
      "effects": {
        "hp": number,
        "money": number,
        "legal_risk": number,
        "location": "string"
      }
    }
  ]
}

NHỚ:

location OPTIONAL.

Không di chuyển:
→ OMIT location.

Có di chuyển:
→ location = EXACT event.destination.

Không bao giờ dùng location rỗng.
`,
    },

    {
      role: "user",

      content:
        buildOutcomePrompt(context),
    },
  ];

  const result =
    await callLocalAIJson<unknown>(
      messages,

      {
        name:
          "game_outcome",

        strict:
          true,

        schema:
          LOCAL_OUTCOME_SCHEMA,
      },

      {
        temperature:
          0.55,

        topP:
          0.9,

        maxTokens:
          650,
      },
    );

  console.log(
    "LOCAL AI OUTCOME:",
    JSON.stringify(
      result.raw.usage,
      null,
      2,
    ),
  );

  console.log(
    "LOCAL AI OUTCOME FINISH:",
    result.raw.finishReason,
  );

  /*
   * Qwen đôi khi vẫn trả location: "" dù prompt yêu cầu
   * bỏ field. Normalize trước khi chạy Zod.
   */
  const normalized =
    normalizeOutcomeLocation(
      result.data
    );

  console.log(
    "LOCAL AI OUTCOME NORMALIZED:",
    JSON.stringify(
      normalized,
      null,
      2
    )
  );

  return validateAIOutcomeResult(
    normalized,
    context
  );
}

/* =====================================================
   GROQ — GENERATE CURRENT ROUND OUTCOME ONLY
   ===================================================== */

export async function generateAIHostOutcomeGroq(
  context: AIOutcomeContext
): Promise<ValidatedAIOutcomeResponse> {
  const apiKey =
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not configured."
    );
  }

  const groq =
    new Groq({
      apiKey,
    });

  const prompt =
    buildOutcomePrompt(
      context
    );

  const response =
    await groq.chat.completions.create({
      model:
        "openai/gpt-oss-20b",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0.6,

      reasoning_effort:
        "low",

      include_reasoning:
        false,

      max_completion_tokens:
        1024,

      response_format: {
        type: "json_object",
      },
    });

  const responseText =
    response.choices[0]
      ?.message
      ?.content;

  if (!responseText) {
    throw new Error(
      "Groq returned an empty outcome response."
    );
  }

  const rawResponse =
    extractJson(
      responseText
    );

  const normalized =
    normalizeOutcomeLocation(
      rawResponse
    );

  console.log(
    "GROQ OUTCOME RAW RESPONSE:",
    JSON.stringify(
      normalized,
      null,
      2
    )
  );

  return validateAIOutcomeResult(
    normalized,
    context
  );
}

/* =====================================================
   GROQ — GENERATE NEXT ROUND EVENTS ONLY
   ===================================================== */

export async function generateAIHostNextEventsGroq(
  context: AIHostContext
): Promise<ValidatedAIEventResponse> {
  const apiKey =
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not configured."
    );
  }

  const groq =
    new Groq({
      apiKey,
    });

  const prompt =
    buildEventPrompt(
      context
    );

  const response =
    await groq.chat.completions.create({
      model:
        "openai/gpt-oss-20b",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0.9,

      reasoning_effort:
        "low",

      include_reasoning:
        false,

      max_completion_tokens:
        2048,

      response_format: {
        type: "json_object",
      },
    });

  const responseText =
    response.choices[0]
      ?.message
      ?.content;

  if (!responseText) {
    throw new Error(
      "Groq returned an empty next-event response."
    );
  }

  const rawResponse =
    extractJson(
      responseText
    );

  console.log(
    "GROQ NEXT EVENTS RAW RESPONSE:",
    JSON.stringify(
      rawResponse,
      null,
      2
    )
  );

  return validateAIEventResult(
    rawResponse,
    context
  );
}

/* =====================================================
   GROQ — LEGACY ROUND BATCH
   ===================================================== */

export async function generateAIHostRoundBatch(
  context: AIRoundBatchContext
): Promise<AIRoundBatchResponse> {
  const apiKey =
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not configured."
    );
  }

  const groq =
    new Groq({
      apiKey,
    });

  const prompt =
    buildRoundBatchPrompt(
      context
    );

  const response =
    await groq.chat.completions.create({
      model:
        "openai/gpt-oss-20b",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0.6,

      reasoning_effort:
        "low",

      include_reasoning:
        false,

      max_completion_tokens:
        2048,

      response_format: {
        type: "json_object",
      },
    });

  const responseText =
    response.choices[0]
      ?.message
      ?.content;

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

  if (
    !rawResponse.outcomes
  ) {
    throw new Error(
      "AI round batch is missing top-level 'outcomes'."
    );
  }

  if (
    !rawResponse.nextEvents
  ) {
    throw new Error(
      "AI round batch is missing top-level 'nextEvents'."
    );
  }

  const outcomes =
    validateAIOutcomeResult(
      normalizeOutcomeLocation(
        rawResponse.outcomes
      ),
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

/* =====================================================
   GEMINI — GENERATE PRIVATE EVENTS
   ===================================================== */

async function generateAIHostEventsGemini(
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

  return validateAIEventResult(
    rawResponse,
    context
  );
}

/* =====================================================
   GEMINI — GENERATE OUTCOMES
   ===================================================== */

async function generateAIHostOutcomeGemini(
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

  const normalized =
    normalizeOutcomeLocation(
      rawResponse
    );

  return validateAIOutcomeResult(
    normalized,
    context
  );
}

/* =====================================================
   MAIN AI ROUTER — EVENTS
   =====================================================

   PRIORITY:

   1. LOCAL QWEN
   2. GEMINI
   3. GROQ
   ===================================================== */

export async function generateAIHostEvents(
  context: AIHostContext
): Promise<ValidatedAIEventResponse> {
  try {
    console.log(
      "AI ROUTER → LOCAL QWEN"
    );

    return await generateAIHostEventsLocal(
      context
    );
  } catch (localError) {
    console.warn(
      "LOCAL AI FAILED — falling back to Gemini.",
      localError
    );
  }

  try {
    console.log(
      "AI ROUTER → GEMINI"
    );

    return await generateAIHostEventsGemini(
      context
    );
  } catch (geminiError) {
    console.warn(
      "GEMINI FAILED — falling back to Groq.",
      geminiError
    );
  }

  console.log(
    "AI ROUTER → GROQ"
  );

  return await generateAIHostNextEventsGroq(
    context
  );
}

/* =====================================================
   MAIN AI ROUTER — OUTCOME
   =====================================================

   PRIORITY:

   1. LOCAL QWEN
   2. GEMINI
   3. GROQ
   ===================================================== */

export async function generateAIHostOutcome(
  context: AIOutcomeContext
): Promise<ValidatedAIOutcomeResponse> {
  try {
    console.log(
      "AI ROUTER → LOCAL QWEN OUTCOME"
    );

    return await generateAIHostOutcomeLocal(
      context
    );
  } catch (localError) {
    console.warn(
      "LOCAL AI OUTCOME FAILED — falling back to Gemini.",
      localError
    );
  }

  try {
    console.log(
      "AI ROUTER → GEMINI OUTCOME"
    );

    return await generateAIHostOutcomeGemini(
      context
    );
  } catch (geminiError) {
    console.warn(
      "GEMINI OUTCOME FAILED — falling back to Groq.",
      geminiError
    );
  }

  console.log(
    "AI ROUTER → GROQ OUTCOME"
  );

  return await generateAIHostOutcomeGroq(
    context
  );
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
      (
        player: AIHostPlayerContext
      ) => ({
        id: player.id,
      })
    );

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

  /*
   * Server schedule is authoritative.
   * The AI is not allowed to silently turn a Money Quest round
   * into a normal event or a normal round into a Money Quest.
   */
  for (const player of response.players) {
    const eventType = player.event.type;

    if (
      context.isMoneyQuestRound &&
      eventType !== "money_main_quest"
    ) {
      throw new Error(
        `Money Quest round requires money_main_quest event for player ${player.player_id}.`
      );
    }

    if (
      !context.isMoneyQuestRound &&
      eventType === "money_main_quest"
    ) {
      throw new Error(
        `money_main_quest is only allowed on scheduled Money Quest rounds.`
      );
    }

    if (
      player.event.choices.length < 2 ||
      player.event.choices.length > 4
    ) {
      throw new Error(
        `AI event for player ${player.player_id} must contain 2-4 choices.`
      );
    }

    const choiceIds =
      new Set(
        player.event.choices.map(
          (choice) => choice.id
        )
      );

    if (
      choiceIds.size !==
      player.event.choices.length
    ) {
      throw new Error(
        `AI event for player ${player.player_id} contains duplicate choice IDs.`
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
  const normalized =
    normalizeOutcomeLocation(
      rawResponse
    );

  const response =
    validateAIOutcomeResponse(
      normalized
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
   JSON EXTRACTION
   ===================================================== */

function extractJson(
  text: string
): unknown {
  const cleaned =
    text
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
      cleaned.indexOf(
        "{"
      );

    const lastBrace =
      cleaned.lastIndexOf(
        "}"
      );

    if (
      firstBrace === -1 ||
      lastBrace === -1
    ) {
      throw new Error(
        "AI did not return valid JSON."
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
   LEGACY GENERATE AI HOST RESULT
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
      (
        player: AIHostPlayerContext
      ) => ({
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