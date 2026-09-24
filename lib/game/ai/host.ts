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
                    "GEMINI QUOTA EXCEEDED - using fallback instead of retrying.",
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
                `GEMINI RETRY ${attempt}/${maxAttempts} - waiting ${delay}ms`,
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
    event_type?: string | null;
    status?: string | null;
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

    main_quest_id?: string | null;
    main_quest_title?: string | null;
    mini_quest_index?: 1 | 2 | null;
    mini_quest_id?: string | null;
    mini_quest_title?: string | null;
    mini_quest_completed?: boolean;
    main_quest_completed?: boolean;

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
    quest_number?: number;
    quest_start_round?: number;
    quest_end_round?: number;
    round_in_quest?: number;
    is_new_quest?: boolean;
    is_quest_end?: boolean;
    isMoneyQuestRound?: boolean;
    players: AIHostPlayerContext[];
};

/* =====================================================
      EVENT GENERATION PROMPT
      ===================================================== */

function buildEventPrompt(
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
        recent_events: (player.recent_events ?? []).slice(0, 8),
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
    }));

    return `
Bạn là AI Host của game "Đường Biên Đêm".

NHIỆM VỤ DUY NHẤT:
Tạo đúng 1 PRIVATE MAIN EVENT cho MỖI active player.
Backend/server là SOURCE OF TRUTH. AI chỉ tạo narrative + choices.

=====================================================
1. CONTINUITY — KHÔNG RESET STORY
=====================================================

Game là một câu chuyện liên tục.
Mỗi round phải là cảnh tiếp theo có nguyên nhân từ những gì player vừa trải qua.

PREVIOUS SITUATION
→ NATURAL NEXT SCENE
→ PLAYER DECISION
→ CONSEQUENCE
→ NEXT SCENE

Không được biến game thành:
RANDOM EVENT → RANDOM EVENT → RANDOM EVENT.

Recent events là lịch sử thật. Nếu một objective/cảnh đã hoàn thành,
KHÔNG được viết lại nó như thể chưa từng xảy ra.

=====================================================
2. QUEST FLOW — HARD SERVER RULE
=====================================================

MỖI MAIN QUEST = CHÍNH XÁC 2 MINI QUEST.

MAIN QUEST #N
→ MINI QUEST 1
→ MINI QUEST 2
→ MAIN QUEST COMPLETE
→ STORY CONSEQUENCE / AFTERMATH
→ MAIN QUEST #N+1

Không tồn tại Mini Quest 3.

Quy ước server:
- Quest rounds 1-2: Mini Quest 1.
- Quest rounds 3-5: Mini Quest 2.
- Round 5: đóng Main Quest.
- Round 6: bắt đầu Main Quest hoàn toàn mới.
- Round 10, 15, 20... cũng đóng Main Quest tương ứng.

Server state bên dưới là authoritative:
Quest number: ${context.quest_number ?? "unknown"}
Quest start round: ${context.quest_start_round ?? "unknown"}
Quest end round: ${context.quest_end_round ?? "unknown"}
Round in quest: ${context.round_in_quest ?? "unknown"}/5
New quest: ${context.is_new_quest === true ? "YES" : "NO"}
Quest end: ${context.is_quest_end === true ? "YES" : "NO"}

Nếu is_new_quest = YES:
- Main Quest objective PHẢI mới.
- Không được tiếp tục lại đúng job/delivery/investigation/objective của Main Quest trước.
- Consequences, NPC, location, money, HP và legal risk vẫn có thể carry over.

Nếu đang ở Mini 1:
- tiếp tục/hoàn tất Mini 1;
- không tự nhảy sang Main Quest mới.

Nếu Mini 1 đã hoàn thành:
- tiến sang Mini 2 của CÙNG Main Quest.

Nếu Mini 2 đã hoàn thành:
- đóng Main Quest;
- round tiếp theo phải mở story beat/Main Quest mới theo consequence.

=====================================================
3. ANTI-REPETITION — BẮT BUỘC
=====================================================

Trước khi tạo event, đọc recent_events.

Nếu event mới có cùng objective, cùng cảnh hoặc cùng bước chuẩn bị với một
trong các round gần đây mà objective đã tiến triển/hoàn thành:
→ KHÔNG lặp lại.
→ tiến sang bước tự nhiên tiếp theo.

Ví dụ xấu:
Round 4 nhận đơn → Round 5 chuẩn bị → Round 6 tiếp tục chuẩn bị → Round 7 tiếp tục chuẩn bị.

Ví dụ đúng:
Round 4 nhận đơn → Round 5 chuẩn bị → Round 6 bắt đầu đi → Round 7 gặp sự cố
→ Round 8 xử lý → Round 9 hoàn tất → aftermath.

Đặc biệt không lặp:
- delivery → delivery → delivery
- job → job → job
- fuel → fuel → fuel
- phone call → phone call → phone call
- cùng một NPC đưa cùng một cơ hội

CONTINUITY quyết định WHY.
VARIETY quyết định WHAT KIND.

=====================================================
4. EVENT VARIETY — RỘNG
=====================================================

Khi hợp story, event có thể là:
- công việc, mất việc, hợp đồng, thu nhập
- tiền, chi phí, cơ hội tài chính
- phương tiện, xe hỏng, giao thông, di chuyển
- thời tiết, môi trường, nơi trú
- ăn uống, nghỉ ngơi, hồi phục
- tai nạn, nguy hiểm, rủi ro
- trộm, lừa đảo, mất đồ, đồ khả nghi
- giấy tờ, công an, pháp lý, biên giới
- NPC, bạn bè, đồng nghiệp, chủ thuê, mâu thuẫn, lời hứa
- NPC cũ quay lại với thông tin mới
- tin tức, tin đồn, manh mối
- học kỹ năng, kinh nghiệm
- lựa chọn đạo đức
- may mắn/xui xẻo
- hậu quả của lựa chọn cũ
- cơ hội mới sinh ra từ consequence
- sự cố nhỏ làm thay đổi kế hoạch
- event liên quan player khác nếu có căn cứ story

"Cái gì cũng có khả năng xảy ra" KHÔNG có nghĩa là random vô lý.
Event phải believable với location, state, relationships và history.

=====================================================
5. MONEY MAIN QUEST — SERVER CONTROLLED
=====================================================

Server nói rõ isMoneyQuestRound = ${context.isMoneyQuestRound === true ? "TRUE" : "FALSE"}.

Nếu TRUE:
- mỗi active player nhận đúng 1 Money Main Quest event;
- type = "money_main_quest";
- phù hợp với story hiện tại;
- có lựa chọn + risk/reward;
- KHÔNG tự cộng tiền;
- KHÔNG tự hứa exact reward;
- server mới quyết định reward sau resolve.

Nếu FALSE:
- KHÔNG dùng type "money_main_quest".

Money Main Quest không phải inventory SideQuest.

=====================================================
6. SIDE QUEST / ITEM
=====================================================

Nếu active_side_quest tồn tại thì nó là hệ thống riêng.
Không biến SideQuest thành Main Quest.
Không tự trả reward.

=====================================================
7. PLAYER AGENCY
=====================================================

Event chỉ mô tả tình huống.
Không tự quyết định player:
- nhận/từ chối job
- đi travel
- tiêu tiền
- kiếm tiền
- mất HP
- nhận reward
- đổi location
- hoàn thành quest

Outcome resolver xử lý sau khi player chọn.

=====================================================
8. TRAVEL
=====================================================

destination chỉ là nơi mà lựa chọn travel có thể đưa player tới.
Không được coi destination là player đã tới nơi.
Nếu không có travel opportunity: destination = null.

=====================================================
9. OUTPUT CONTRACT
=====================================================

Phải có đúng ${context.players.length} player entries.
Mỗi player_id phải giống CHÍNH XÁC UUID/id được cung cấp.
Mỗi player có đúng 1 event.
Mỗi event có 2-4 choices.
Không effects.
Không tự thay đổi stats.

=====================================================
10. FINAL SELF-CHECK
=====================================================

Trước khi output, tự kiểm tra:
1. Có đúng player_id không?
2. Có đúng round không?
3. Có lặp objective vừa hoàn thành không?
4. Có delivery/job filler loop không?
5. Có đang ở đúng Mini Quest không?
6. Nếu Mini 1 complete, có tiến Mini 2 không?
7. Nếu Mini 2 complete, có đóng Main Quest không?
8. Nếu New Quest, objective có thực sự mới không?
9. Nếu Money Quest, type có đúng không?
10. Có tự cộng tiền/HP/legal risk/travel không?
11. JSON có hợp lệ không?

=====================================================
CURRENT SERVER CONTEXT
=====================================================

Round: ${context.round}

${JSON.stringify(compactPlayers, null, 2)}

=====================================================
RETURN ONLY JSON
=====================================================

{
  "round": ${context.round},
  "players": [
    {
      "player_id": "EXACT_PLAYER_ID_FROM_CONTEXT",
      "event": {
        "title": "string",
        "description": "string",
        "type": "string",
        "destination": null,
        "choices": [
          { "id": "a", "text": "string" },
          { "id": "b", "text": "string" }
        ]
      }
    }
  ]
}
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
QUEST LIFECYCLE - OUTCOME RESOLUTION
=====================================================

Resolve the CURRENT MINI QUEST before thinking about a new story.

ONE MAIN QUEST = EXACTLY 2 LINKED MINI QUESTS.

After resolving the selected choice, determine internally:

1. Did the choice advance the current mini quest?
2. Did it COMPLETE the current mini quest?
3. If yes, move to the next mini quest of the SAME main quest.
4. If the completed mini quest was #1:
      move to Mini Quest 2 of the SAME Main Quest.
5. If the completed mini quest was #2:
      the current Main Quest is COMPLETE.
6. Only after Mini Quest 2 is complete may the story transition to the
      next Main Quest.
7. The next main quest must be caused by the consequences of the
      completed story, not random generation.

CRITICAL ANTI-LOOP RULE:

If the selected choice clearly completes the current objective
(for example, a package is successfully delivered and the recipient
accepts it), do NOT resolve another round of the same delivery objective.

The next event must advance the linked quest chain or, when Mini Quest 2
is complete, advance the story into its consequence.

A mini quest should normally take 1-2 rounds. Do not keep an already
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
MONEY - VERY IMPORTANT
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

1,000,000-8,000,000 VND

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
? money = 0

Investigate job
? money = 0

Ask questions
? money = 0

Prepare for job
? money = 0

Negotiate before payment
? money = 0

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
QUEST FLOW - OUTCOME
=====================================================

Outcome ph?i xác ??nh mini quest hi?n t?i có v?a hoàn thành hay ch?a.

- Mini 1 complete ? sang Mini 2 c?a CÙNG Main Quest.
- Mini 2 complete ? Main Quest complete ? story consequence ? Main Quest m?i.
- Không ???c m? Main Quest m?i sau Mini 1 ho?c Mini 2.
- N?u objective ?ã hoàn thành, không ???c kéo dài objective ?ó sang round m?i.
- M?t mini quest th??ng ch? kéo dài 1-2 round.

=====================================================
LOCATION - ABSOLUTELY CRITICAL
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
QUEST LIFECYCLE - NEXT ROUND
=====================================================

The next round MUST respect the quest hierarchy:

MAIN QUEST
? MINI QUEST 1
? MINI QUEST 2
? MAIN QUEST COMPLETE
? STORY CONSEQUENCE
? NEXT MAIN QUEST

Do not create a new main quest merely because the round ended.

If the current mini quest is unfinished:
? continue it with a concrete new objective or consequence.

If the current mini quest is complete:
? advance to the next linked mini quest in the SAME main quest.

If mini quest #1 is complete:
? start mini quest #2.

If mini quest #2 is complete:
? close the current main quest and create the next story beat from
    its consequences.

ANTI-REPETITION:

Never generate the same completed objective again.

Example:

MINI QUEST: deliver package
Round 1: receive package and prepare route
Round 2: travel / solve delivery obstacle
Round 3: package delivered
? DELIVERY MINI QUEST COMPLETE.

Do NOT produce:
"check package", "call recipient", "more traffic", "more rain",
"continue delivery" again after successful delivery.

Instead advance to the next linked mini quest.

The AI must prefer QUEST PROGRESSION over filler continuity.

=====================================================
TASK A - CURRENT OUTCOMES
=====================================================

Resolve the exact selected choice of every player.

Rules:

- ONE MAIN QUEST = EXACTLY 2 LINKED MINI QUESTS.
- Mini 1 ? Mini 2 ? Main Quest complete.
- Never start a new MAIN QUEST after Mini 1 or Mini 2.
- Only Mini 2 completion closes the current MAIN QUEST.
- After Main Quest completion, derive the next Main Quest from story
    consequences and established continuity.
- Never repeat an already completed objective.
- A mini quest should normally resolve within 1-2 rounds.

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
? normally positive

Receiving wages:
? normally positive

Receiving payment:
? normally positive

Receiving reward:
? normally positive

Buying:
? negative

Paying:
? negative

Transport expense:
? negative

Food expense:
? negative

Medical expense:
? negative

Fine:
? negative

Refusing job:
? normally 0

Investigating:
? normally 0

Asking questions:
? normally 0

Preparing:
? normally 0

Negotiating before payment:
? normally 0

A clearly successful paid job should normally NOT have money = 0
unless there is an explicit narrative reason.

A temporary two-week job may reasonably produce around
1,000,000-8,000,000 VND depending on circumstances.

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
TASK B - NEXT ROUND
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
? NEXT NATURAL SCENE

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
? OPPORTUNITY
? DECISION
? PREPARATION
? EXECUTION
? INCIDENTAL EVENT
? COMPLICATION
? RESPONSE
? COMPLETION
? REWARD / CONSEQUENCE
? NEW OPPORTUNITY

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
? contact
? investigation
? preparation
? documents
? transportation
? travel

Never instantly teleport the player abroad.

=====================================================
NEXT EVENT DESIGN
=====================================================

Every next event:

- is a concrete scene
- has 2-4 choices
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
      LOCAL AI - EVENT JSON SCHEMA
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
      LOCAL AI - OUTCOME JSON SCHEMA
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

      Qwen ?ôi khi tr?:

      "location": ""

      dù prompt ?ã yêu c?u b? field.

      Hàm này bi?n:

      location: ""
      location: "      "
      location: null

      thành:

      không có location

      ?? không làm Zod fail và không kích ho?t fallback
      ch? vì l?i format vô h?i này.
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
      LOCAL AI - GENERATE EVENTS
      ===================================================== */

async function generateAIHostEventsLocal(
    context: AIHostContext
): Promise<ValidatedAIEventResponse> {
    const messages: LocalAIMessage[] = [
        {
            role: "system",

            content: `
Bạn là LOCAL AI GAME HOST của game "Đường Biên Đêm".

VAI TRÒ:
- Bạn chỉ tạo NỘI DUNG event.
- Backend là SOURCE OF TRUTH cho quest state, round, player state và effects.
- Bạn KHÔNG được tự quyết định chuyển quest, hoàn thành quest, đổi location, tiền, HP hoặc legal_risk.

=====================================================
FLOW QUEST BẮT BUỘC — CHỈ 2 MINI QUEST
=====================================================

Mỗi MAIN QUEST có CHÍNH XÁC 2 MINI QUEST:

MAIN QUEST #N
  -> MINI QUEST 1
  -> MINI QUEST 2
  -> MAIN QUEST COMPLETE
  -> STORY CONSEQUENCE / AFTERMATH
  -> MAIN QUEST #N+1

TUYỆT ĐỐI KHÔNG CÓ MINI QUEST 3.

Nếu context có mini_quest_index:
- 1: đang ở Mini 1.
- 2: đang ở Mini 2.

Khi đang ở Mini 1:
- chỉ tiếp tục hoặc hoàn tất Mini 1;
- nếu objective đã hoàn tất theo recent_events thì không được lặp lại;
- backend sẽ chuyển sang Mini 2;
- không được tự mở Main Quest mới.

Khi đang ở Mini 2:
- chỉ tiếp tục hoặc hoàn tất Mini 2;
- khi Mini 2 hoàn tất, Main Quest hiện tại kết thúc;
- event tiếp theo phải là aftermath/consequence hoặc mở đầu Main Quest tiếp theo CHỈ KHI backend đã chuyển state.

KHÔNG BAO GIỜ:
- tạo Mini Quest 3;
- quay lại Mini 1 sau khi đã sang Mini 2;
- tự mở Main Quest mới sau Mini 1;
- kéo dài objective đã hoàn tất;
- reset storyline chỉ vì sang round mới.

Bạn KHÔNG gửi quest_state hoặc completion flag trong output event.
Backend xử lý transition.

QUY TẮC QUEST 5 ROUND:

Mỗi QUEST chỉ tồn tại trong đúng 5 round.

Quest #1:
Round 1 → Round 5

Quest #2:
Round 6 → Round 10

Quest #3:
Round 11 → Round 15

Khi bước sang round đầu tiên của Quest mới:
- BẮT BUỘC bắt đầu nhiệm vụ mới.
- KHÔNG được tiếp tục nhiệm vụ của Quest trước.
- KHÔNG được viết "sau khi hoàn thành nhiệm vụ trước..."
- KHÔNG được tiếp tục giao hàng, sửa chữa, tìm người, điều tra hoặc bất kỳ objective nào đã thuộc Quest trước.
- Được phép giữ hậu quả thế giới/player state, nhưng nhiệm vụ phải là objective mới.

Ví dụ:
Quest #1 có nhiệm vụ giao hàng ở Round 1-5.

Round 6:
TUYỆT ĐỐI KHÔNG được:
"Công ty xác nhận lịch giao hàng cuối cùng."

Round 6 phải mở một nhiệm vụ mới thuộc Quest #2.

=====================================================
ANTI-DELIVERY / ANTI-JOB LOOP
=====================================================

Game KHÔNG được biến thành simulator giao hàng hoặc simulator xin việc.

Nếu recent_events cho thấy:
- giao hàng nhiều round liên tiếp;
- chuẩn bị giao hàng nhiều lần;
- job nhiều round liên tiếp;
- cùng một objective đã hoàn tất;

thì KHÔNG được đổi câu chữ rồi lặp lại.

Ví dụ BAD:
nhận hàng -> chuẩn bị -> đổ xăng -> mưa -> gọi điện -> tiếp tục giao
-> tiếp tục giao -> tiếp tục giao.

Nếu objective giao hàng ĐÃ HOÀN TẤT:
- coi objective đó là DONE;
- không tạo thêm event giao hàng cho objective đó;
- không tạo thêm chuẩn bị giao / đổ xăng / mưa / gọi người nhận
  chỉ để kéo dài objective đã xong;
- chuyển sang Mini Quest tiếp theo nếu backend đang ở Mini 1;
- hoặc aftermath / consequence nếu backend đang ở Mini 2.

Nếu một job đã xong:
- có thể có hậu quả;
- NPC có thể phản hồi;
- có thể xuất hiện khoản thanh toán do server resolve;
- có thể xuất hiện cơ hội mới;
nhưng không được tự động tạo một job giống hệt.

=====================================================
CONTINUITY ≠ REPETITION
=====================================================

Continuity quyết định VÌ SAO event xảy ra.
Variety quyết định EVENT THUỘC LOẠI GÌ.

Ưu tiên scene mới nhưng có nguyên nhân từ câu chuyện hiện tại.

Ví dụ:
job -> mâu thuẫn với người thuê -> kiểm tra giấy tờ -> NPC cũ gọi
-> mất đồ -> giải quyết hậu quả.

Không phải:
job -> job -> job -> job.

=====================================================
EVENT VARIETY — RỘNG
=====================================================

Khi phù hợp với context, event có thể thuộc:
- công việc / thu nhập / mất việc;
- tiền bạc / chi phí bất ngờ;
- xe cộ / phương tiện / hỏng hóc;
- thời tiết / môi trường;
- ăn uống / chỗ ở / kiệt sức / hồi phục;
- tai nạn hoặc nguy hiểm;
- trộm / lừa đảo / mất đồ / đồ đáng ngờ;
- công an / giấy tờ / thủ tục / pháp lý;
- NPC / tranh cãi / hiểu lầm / lời hứa / khoản nợ;
- NPC cũ quay lại;
- quan hệ / niềm tin / phản bội / danh tiếng;
- cộng đồng / chợ / nơi trú / sự kiện địa phương;
- tin tức / tin đồn / đầu mối;
- học kỹ năng / tích lũy kinh nghiệm;
- lựa chọn đạo đức;
- emergency;
- may mắn / xui xẻo;
- hậu quả từ lựa chọn cũ;
- consequence từ quest đã hoàn tất;
- vấn đề của người khác ảnh hưởng player nếu có lý do.

Đây là POOL, không phải checklist.
Không cần mỗi round phải có drama.

=====================================================
ANTI-REPETITION HARD RULE
=====================================================

Đọc recent_events trước khi tạo event.

Nếu cùng event_type / activity / scene xuất hiện nhiều round gần đây:
- tránh lặp lại;
- chỉ tiếp tục nếu continuity bắt buộc;
- nếu phải tiếp tục, phải tiến sang STAGE MỚI.

Ưu tiên:
PREPARATION
-> EXECUTION
-> COMPLICATION
-> RESPONSE
-> COMPLETION
-> PAYMENT / CONSEQUENCE
-> AFTERMATH
-> NEW OPPORTUNITY

Không được đứng mãi ở PREPARATION.

=====================================================
PLAYER AGENCY
=====================================================

Event chỉ mô tả tình huống.

Không tự quyết định player:
- nhận / từ chối job;
- đi / không đi;
- tiêu tiền;
- nhận tiền;
- bị trừ HP;
- tăng legal risk;
- thắng;
- hoàn thành hành động.

Outcome server sẽ xử lý choice sau.

=====================================================
TRAVEL
=====================================================

destination chỉ là CƠ HỘI di chuyển.

Không teleport.
Không tự đổi location.
Không giả định player đã đi.

Nếu event không phải travel opportunity:
destination = null.

Nếu có travel opportunity:
- destination phải khác current location;
- phải có lý do cụ thể;
- phải có choice cho phép player theo đuổi chuyến đi.

=====================================================
MONEY MAIN QUEST
=====================================================

Nếu isMoneyQuestRound = true:
- mỗi active player phải có một Money Main Quest riêng;
- đây vẫn là MAIN EVENT, không phải SideQuest;
- không tự cộng tiền;
- không ghi HP/money/legal_risk effect;
- server mới resolve reward;
- event vẫn phải phù hợp với storyline hiện tại.

=====================================================
OUTPUT
=====================================================

Chỉ trả JSON hợp lệ theo schema được cung cấp.

Mỗi player:
- đúng player_id;
- đúng 1 event;
- title cụ thể;
- description cụ thể;
- 2-4 choices;
- choices phải khác nhau về hướng xử lý;
- destination là string hoặc null.

Không markdown.
Không giải thích.
Không thêm field.

FINAL CHECK:
1. Có Mini Quest 3 không? -> PHẢI LÀ KHÔNG.
2. Có lặp objective đã hoàn tất không? -> PHẢI LÀ KHÔNG.
3. Có delivery/job loop không? -> PHẢI LÀ KHÔNG.
4. Event có nguyên nhân từ context không?
5. Player có agency không?
6. Có tự áp dụng effect không? -> PHẢI LÀ KHÔNG.
`,
        },

        {
            role: "user",

            content:
                buildEventPrompt(context),
        },
    ];

    const result =
        await callLocalAIJson<unknown>(
            messages,

            {
                name:
                    "game_events",

                strict:
                    true,

                schema:
                    LOCAL_EVENT_SCHEMA,
            },

            {
                temperature:
                    0.72,

                topP:
                    0.92,

                maxTokens:
                    1400,
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
      LOCAL AI - GENERATE OUTCOME
      ===================================================== */

async function generateAIHostOutcomeLocal(
    context: AIOutcomeContext
): Promise<ValidatedAIOutcomeResponse> {
    const messages: LocalAIMessage[] = [
        {
            role: "system",

            content: `
B?n là AI Host c?a game ???ng Biên ?êm.

B?n ?ang RESOLVE l?a ch?n mà ng??i ch?i V?A CH?N.

B?n ph?i xác ??nh h? qu? h?p lý c?a:

CURRENT STATE
+
CURRENT EVENT
+
EXACT SELECTED CHOICE.

=====================================================
QUY T?C TUY?T ??I
=====================================================

1. CH? TR? JSON.

Không markdown.
Không gi?i thích.
Không text ngoài JSON.

2. PLAYER_ID

Dùng ?úng player_id ???c cung c?p.

Không t? t?o UUID.

M?i player ph?i có ?úng m?t outcome.

=====================================================
3. EFFECTS LÀ DELTA
=====================================================

hp, money, legal_risk là THAY ??I.

Không ph?i giá tr? cu?i cùng.

Ví d?:

Current money = 5,000,000
Nh?n payment = 3,000,000

?úng:

"money": 3000000

Sai:

"money": 8000000

=====================================================
4. MONEY
=====================================================

N?u ng??i ch?i th?c s?:

- nh?n l??ng
- nh?n payment
- hoàn thành job có tr? ti?n
- giao hàng thành công và ???c tr?
- nh?n reward
- bán ??

? money th??ng ph?i POSITIVE.

N?u ng??i ch?i:

- mua
- tr? ti?n
- ?? x?ng
- tr? phí
- tr? vi?n phí
- b? ph?t
- m?t ti?n

? money th??ng ph?i NEGATIVE.

N?u không có tác ??ng ti?n:

money = 0.

=====================================================
5. PAID JOB
=====================================================

N?u ng??i ch?i th?c s? hoàn thành m?t công vi?c có tr? ti?n:

KHÔNG nên tr?:

"money": 0

tr? khi story gi?i thích rõ vì sao không ???c tr?.

Job t?m th?i kho?ng 2 tu?n có th? t?o thu nh?p th?c t?
kho?ng 1,000,000-8,000,000 VND tùy:

- lo?i job
- ??a ?i?m
- ?? khó
- r?i ro
- ?i?u ki?n
- k?t qu?

?ây là DELTA.

=====================================================
6. KHÔNG T?O TI?N VÔ LÝ
=====================================================

Ch? có job trong event ch?a ?? ?? nh?n ti?n.

Ví d?:

Nh?n l?i tìm hi?u job
? money = 0

H?i thêm thông tin
? money = 0

?àm phán
? money = 0

Chu?n b?
? money = 0

T? ch?i
? money = 0

Ch? khi hành ??ng th?c s? d?n t?i thu nh?p:
? money > 0

=====================================================
7. HP
=====================================================

hp là DELTA.

Ch? thay ??i khi l?a ch?n th?c s? ?nh h??ng s?c kh?e.

Không t?o damage l?n n?u context không h? tr?.

=====================================================
8. LEGAL RISK
=====================================================

legal_risk là DELTA t? -10 ??n +10.

Ch? thay ??i khi l?a ch?n th?c s? liên quan ??n:

- gi?y t?
- ki?m tra
- pháp lý
- công an
- biên gi?i
- vi ph?m
- gi?m r?i ro pháp lý

N?u không:

legal_risk = 0.

=====================================================
9. LOCATION - QUAN TR?NG NH?T
=====================================================

location là OPTIONAL.

CH? tr? location khi ng??i ch?i TH?C S? DI CHUY?N.

N?u KHÔNG di chuy?n:

PH?I B? H?N FIELD location.

KHÔNG ???C:

"location": ""

KHÔNG ???C:

"location": " "

KHÔNG ???C:

"location": null

Không dùng location r?ng ?? bi?u th? "không ??i".

=====================================================
10. KHI NÀO ???C ??I LOCATION
=====================================================

Ch? ??i location n?u selected choice rõ ràng:

- ch?p nh?n chuy?n ?i
- th?c s? ?i
- b?t ??u/hoàn thành travel
- cam k?t di chuy?n

N?u choice ch?:

- h?i
- tìm hi?u
- th??ng l??ng
- chu?n b?
- trì hoãn
- cân nh?c
- t? ch?i

? KHÔNG ??i location.

=====================================================
11. DESTINATION
=====================================================

event.destination là n?i mà c? h?i travel D?N T?I.

Nó không có ngh?a player ?ã t?i ?ó.

N?u th?c s? travel:

effects.location
PH?I B?NG CHÍNH XÁC:

event.destination

Không ???c t? ??i tên ??a ?i?m.

N?u event.destination = null:

TUY?T ??I KHÔNG tr? location.

=====================================================
12. VÍ D? KHÔNG DI CHUY?N
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
13. VÍ D? CÓ DI CHUY?N
=====================================================

N?u:

event.destination = "Lào Cai"

và choice th?c s? ?i:

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
14. VÍ D? SAI TUY?T ??I
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

Không ???c t?o output ki?u này.

=====================================================
15. STORY CONTINUITY
=====================================================

Outcome ph?i ti?p n?i storyline.

N?u player ?ang:

- giao hàng
- làm vi?c
- ?i ???ng
- ch? NPC
- gi?i quy?t v?n ??
- th??ng l??ng

thì outcome ph?i gi?i quy?t ?úng tình hu?ng ?ó.

Không t?o m?t storyline khác.

=====================================================
16. KHÔNG B?A EFFECT
=====================================================

M?i effect ph?i có c?n c? t?:

event
+
selected choice
+
player state.

Không t? t?o:

- ti?n
- m?t ti?n
- damage
- legal risk
- travel

ch? ?? làm game "k?ch tính".

=====================================================
17. FINAL SELF CHECK
=====================================================

Tr??c khi output, t? ki?m tra:

- player_id ?úng ch?a?
- ?úng selected choice ch?a?
- money là DELTA ch?a?
- paid job thành công có money d??ng ch?a?
- expense có money âm ch?a?
- không có financial consequence thì money = 0 ch?a?
- HP có lý do ch?a?
- legal risk có lý do ch?a?
- player có th?c s? di chuy?n không?
- n?u không di chuy?n, location ?ã B? H?N ch?a?
- location có ?ang là "" không?
- location có ?ang là " " không?
- location có ?ang là null không?
- n?u travel, location có ?úng b?ng event.destination không?

=====================================================
OUTPUT
=====================================================

CH? TR? JSON:

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

NH?:

location OPTIONAL.

Không di chuy?n:
? OMIT location.

Có di chuy?n:
? location = EXACT event.destination.

Không bao gi? dùng location r?ng.
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
      * Qwen ?ôi khi v?n tr? location: "" dù prompt yêu c?u
      * b? field. Normalize tr??c khi ch?y Zod.
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
      GROQ - GENERATE CURRENT ROUND OUTCOME ONLY
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
      GROQ - GENERATE NEXT ROUND EVENTS ONLY
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

            temperature: 0.75,

            reasoning_effort:
                "low",

            include_reasoning:
                false,

            max_completion_tokens:
                Math.max(2048, context.players.length * 600),

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
      GROQ - LEGACY ROUND BATCH
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
      GEMINI - GENERATE PRIVATE EVENTS
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
      GEMINI - GENERATE OUTCOMES
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
      MAIN AI ROUTER - EVENTS
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
            "LOCAL AI FAILED - falling back to Gemini.",
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
            "GEMINI FAILED - falling back to Groq.",
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
      MAIN AI ROUTER - OUTCOME
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
            "LOCAL AI OUTCOME FAILED - falling back to Gemini.",
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
            "GEMINI OUTCOME FAILED - falling back to Groq.",
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
      EVENT RESPONSE NORMALIZATION / SAFE REPAIR
      =====================================================

      M?t s? model ?ôi khi tr? players[] sai shape, ví d?:

      ["uuid-1", "uuid-2", {...}]

      ho?c b? m?t m?t player.

      Không ???c ?? m?t l?i format c?a AI làm h?ng vi?c t?o
      round ti?p theo. Backend v?n là source of truth.

      Strategy:
      - gi? nguyên event h?p l? theo ?úng player_id;
      - event malformed / thi?u player -> t?o fallback event an toàn;
      - luôn ép output có ?úng active players;
      - Money Quest v?n tuân th? schedule c?a server.
      ===================================================== */

function isRecord(
    value: unknown
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function hasLikelyEncodingCorruption(text: string): boolean {
    // A normal question mark is allowed. The broken UTF-8 seen in the game
    // looks like "M?t", "c? h?i", "Ph??ng", etc. Detect that pattern only.
    return /[A-Za-zÀ-ỹĐđ]\?+[A-Za-zÀ-ỹĐđ]/u.test(text)
        || /\?{2,}/.test(text);
}

function isValidEventShape(
    value: unknown
): value is {
    title: string;
    description: string;
    type: string;
    destination: string | null;
    choices: { id: string; text: string }[];
} {
    if (!isRecord(value)) return false;

    if (
        typeof value.title !== "string" ||
        !value.title.trim() ||
        typeof value.description !== "string" ||
        !value.description.trim() ||
        typeof value.type !== "string" ||
        !value.type.trim()
    ) return false;

    if (hasLikelyEncodingCorruption(value.title) || hasLikelyEncodingCorruption(value.description)) {
        return false;
    }

    if (
        value.destination !== null &&
        typeof value.destination !== "string"
    ) return false;

    if (!Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 4) {
        return false;
    }

    const ids = new Set<string>();

    for (const choice of value.choices) {
        if (!isRecord(choice)) return false;
        if (
            typeof choice.id !== "string" ||
            !choice.id.trim() ||
            typeof choice.text !== "string" ||
            !choice.text.trim() ||
            hasLikelyEncodingCorruption(choice.text)
        ) return false;
        if (ids.has(choice.id)) return false;
        ids.add(choice.id);
    }

    return true;
}

function buildSafeFallbackEvent(
    player: AIHostPlayerContext,
    context: AIHostContext,
    index: number
) {
    if (context.isMoneyQuestRound) {
        return {
            title: `Một cơ hội kiếm tiền xuất hiện - Vòng ${context.round}`,
            description:
                `Tại ${player.location}, một cơ hội có giá trị xuất hiện. Thông tin ban đầu chưa đủ để biết toàn bộ rủi ro, và quyết định tiếp theo hoàn toàn thuộc về bạn.`,
            type: "money_main_quest",
            destination: null,
            choices: [
                { id: "investigate", text: "Tìm hiểu kỹ cơ hội trước khi quyết định" },
                { id: "accept", text: "Chủ động tiếp nhận cơ hội" },
                { id: "decline", text: "Từ chối và giữ kế hoạch hiện tại" },
            ],
        };
    }

    const recentTypes = new Set(
        (player.recent_events ?? [])
            .slice(0, 6)
            .map((event) => event.event_type ?? "")
            .filter(Boolean)
    );

    const candidates = [
        {
            type: "npc_information",
            title: "Một người lạ mang theo thông tin",
            description: `Ở ${player.location}, một người lạ chủ động bắt chuyện và đưa ra thông tin có thể liên quan đến hướng đi sắp tới của bạn. Bạn chưa biết người này có đáng tin hay không.`,
            choices: [
                { id: "listen", text: "Nghe câu chuyện" },
                { id: "verify", text: "Hỏi thêm để kiểm chứng" },
                { id: "leave", text: "Không can dự và rời đi" },
            ],
        },
        {
            type: "environment",
            title: "Điều kiện xung quanh thay đổi",
            description: `Điều kiện tại ${player.location} bất ngờ thay đổi, khiến kế hoạch hiện tại cần được xem xét lại. Chưa có hậu quả nào xảy ra nếu bạn xử lý kịp thời.`,
            choices: [
                { id: "adapt", text: "Điều chỉnh kế hoạch" },
                { id: "wait", text: "Chờ thêm thông tin" },
                { id: "continue", text: "Tiếp tục theo dự định" },
            ],
        },
        {
            type: "vehicle_issue",
            title: "Phương tiện xuất hiện dấu hiệu bất thường",
            description: `Phương tiện của bạn có một dấu hiệu bất thường khi đang ở ${player.location}. Bạn có thể xử lý sớm hoặc tiếp tục hành trình với rủi ro chưa rõ.`,
            choices: [
                { id: "inspect", text: "Kiểm tra kỹ" },
                { id: "repair", text: "Tìm chỗ hỗ trợ" },
                { id: "continue", text: "Tiếp tục và theo dõi" },
            ],
        },
        {
            type: "legal_document",
            title: "Một vấn đề về giấy tờ được nhắc tới",
            description: `Một người tại ${player.location} nhắc bạn kiểm tra lại giấy tờ và thông tin cá nhân trước khi tiếp tục kế hoạch. Chưa có kiểm tra chính thức nào diễn ra.`,
            choices: [
                { id: "check", text: "Kiểm tra giấy tờ" },
                { id: "ask", text: "Hỏi rõ lý do" },
                { id: "ignore", text: "Tạm bỏ qua" },
            ],
        },
        {
            type: "food_lodging",
            title: "Một lựa chọn sinh hoạt mở ra",
            description: `Sau một thời gian ở ${player.location}, bạn nhận ra vấn đề ăn uống hoặc chỗ nghỉ cần được giải quyết trước khi tiếp tục.`,
            choices: [
                { id: "find", text: "Tìm một lựa chọn phù hợp" },
                { id: "save", text: "Tiết kiệm và tự xoay xở" },
                { id: "delay", text: "Trì hoãn quyết định" },
            ],
        },
        {
            type: "old_contact",
            title: "Một liên hệ cũ bất ngờ xuất hiện",
            description: `Một liên hệ từ trước bất ngờ tìm cách liên lạc khi bạn đang ở ${player.location}. Nội dung chưa rõ và bạn có thể lựa chọn cách phản hồi.`,
            choices: [
                { id: "answer", text: "Phản hồi" },
                { id: "question", text: "Hỏi rõ danh tính và mục đích" },
                { id: "ignore", text: "Không trả lời" },
            ],
        },
    ];

    const unused = candidates.filter((candidate) => !recentTypes.has(candidate.type));
    const pool = unused.length > 0 ? unused : candidates;
    const selected = pool[(context.round + index) % pool.length];

    return {
        title: selected.title,
        description: selected.description,
        type: selected.type,
        destination: null,
        choices: selected.choices,
    };
}

function normalizeAIEventResponse(
    rawResponse: unknown,
    context: AIHostContext
): unknown {
    const fallbackResponse = {
        round: context.round,
        players: context.players.map(
            (player, index) => ({
                player_id: player.id,
                event: buildSafeFallbackEvent(
                    player,
                    context,
                    index
                ),
            })
        ),
    };

    if (!isRecord(rawResponse)) {
        console.warn(
            "AI EVENT RESPONSE MALFORMED - using safe fallback for all players."
        );
        return fallbackResponse;
    }

    if (
        typeof rawResponse.round !== "number" ||
        rawResponse.round !== context.round
    ) {
        console.warn(
            "AI EVENT RESPONSE ROUND INVALID - using safe fallback for all players.",
            {
                receivedRound: rawResponse.round,
                expectedRound: context.round,
            }
        );
        return fallbackResponse;
    }

    const rawPlayers =
        Array.isArray(rawResponse.players)
            ? rawResponse.players
            : [];

    const byPlayerId = new Map<
        string,
        Record<string, unknown>
    >();

    for (const rawPlayer of rawPlayers) {
        if (!isRecord(rawPlayer)) {
            continue;
        }

        const playerId =
            rawPlayer.player_id;

        if (typeof playerId !== "string") {
            continue;
        }

        if (!byPlayerId.has(playerId)) {
            byPlayerId.set(
                playerId,
                rawPlayer
            );
        }
    }

    let repairedCount = 0;

    const normalizedPlayers =
        context.players.map(
            (player, index) => {
                const candidate =
                    byPlayerId.get(player.id);

                if (
                    candidate &&
                    isValidEventShape(
                        candidate.event
                    )
                ) {
                    const event =
                        candidate.event;

                    const eventIsAllowed =
                        context.isMoneyQuestRound
                            ? event.type ===
                                "money_main_quest"
                            : event.type !==
                                "money_main_quest";

                    if (eventIsAllowed) {
                        return {
                            player_id: player.id,
                            event: {
                                ...event,
                                title:
                                    event.title.trim(),
                                description:
                                    event.description.trim(),
                                destination:
                                    typeof event.destination ===
                                        "string"
                                        ? event.destination.trim() || null
                                        : null,
                                choices:
                                    event.choices.map(
                                        (choice) => ({
                                            id: choice.id.trim(),
                                            text: choice.text.trim(),
                                        })
                                    ),
                            },
                        };
                    }
                }

                repairedCount++;

                return {
                    player_id: player.id,
                    event: buildSafeFallbackEvent(
                        player,
                        context,
                        index
                    ),
                };
            }
        );

    if (repairedCount > 0) {
        console.warn(
            `AI EVENT RESPONSE REPAIRED - ${repairedCount}/${context.players.length} player event(s) replaced with safe fallback.`,
            {
                expectedPlayerIds:
                    context.players.map(
                        (player) => player.id
                    ),
                rawPlayerShape:
                    rawPlayers.map(
                        (player) =>
                            typeof player ===
                                "string"
                                ? "string"
                                : isRecord(player)
                                    ? player.player_id ??
                                        "object_without_player_id"
                                    : typeof player,
                    ),
            }
        );
    }

    return {
        round: context.round,
        players: normalizedPlayers,
    };
}

/* =====================================================
      VALIDATE EVENT RESULT
      ===================================================== */

export function validateAIEventResult(
    rawResponse: unknown,
    context: AIHostContext
): ValidatedAIEventResponse {
    const normalized =
        normalizeAIEventResponse(
            rawResponse,
            context
        );

    const response =
        validateAIEventResponse(
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
