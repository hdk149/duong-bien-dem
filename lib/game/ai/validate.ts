import { z } from "zod";

/* ============================================================
   EVENT GENERATION
   ============================================================ */

const AIChoiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

const AIEventSchema = z.object({
  title: z.string().min(1),

  description:
    z.string().min(1),

  type:
    z.string().min(1),

  destination:
    z.string().min(1).nullable().optional(),

  choices:
    z
      .array(AIChoiceSchema)
      .min(2)
      .max(6),
});

const AIEventPlayerResultSchema =
  z.object({
    player_id:
      z.string().uuid(),

    event:
      AIEventSchema,
  });

export const AIEventResponseSchema =
  z.object({
    round:
      z.number()
        .int()
        .nonnegative(),

    players:
      z
        .array(
          AIEventPlayerResultSchema
        )
        .min(1),
  });

export type ValidatedAIEventResponse =
  z.infer<
    typeof AIEventResponseSchema
  >;

export function validateAIEventResponse(
  data: unknown
): ValidatedAIEventResponse {
  return AIEventResponseSchema.parse(
    data
  );
}

/* ============================================================
   OUTCOME / RESOLVE
   ============================================================ */

/*
 * location đặc biệt:
 *
 * Qwen đôi khi trả:
 *
 *   "location": ""
 *
 * dù player không di chuyển.
 *
 * Không để trường hợp này làm
 * Local AI fail -> Gemini fallback.
 *
 * "" / "   " sẽ được chuyển thành
 * undefined.
 *
 * Nếu có location thật thì trim
 * khoảng trắng và giữ lại.
 */

const AIPlayerEffectsSchema =
  z.object({
    hp:
      z.number()
        .int()
        .optional(),

    money:
      z.number()
        .int()
        .optional(),

    location:
      z.preprocess(
        (value) => {
          if (
            typeof value ===
            "string"
          ) {
            const trimmed =
              value.trim();

            if (
              trimmed.length === 0
            ) {
              return undefined;
            }

            return trimmed;
          }

          return value;
        },
        z
          .string()
          .min(1)
          .optional()
      ),

    legal_risk:
      z.number()
        .int()
        .min(-10)
        .max(10)
        .optional(),
  });

const AIOutcomePlayerResultSchema =
  z.object({
    player_id:
      z.string().uuid(),

    effects:
      AIPlayerEffectsSchema,
  });

export const AIOutcomeResponseSchema =
  z.object({
    round:
      z.number()
        .int()
        .nonnegative(),

    players:
      z
        .array(
          AIOutcomePlayerResultSchema
        )
        .min(1),
  });

export type ValidatedAIOutcomeResponse =
  z.infer<
    typeof AIOutcomeResponseSchema
  >;

export function validateAIOutcomeResponse(
  data: unknown
): ValidatedAIOutcomeResponse {
  return AIOutcomeResponseSchema.parse(
    data
  );
}

/* ============================================================
   LEGACY
   ============================================================ */

const AIPlayerResultSchema =
  z.object({
    player_id:
      z.string().uuid(),

    event:
      AIEventSchema,

    effects:
      AIPlayerEffectsSchema,
  });

export const AIHostResponseSchema =
  z.object({
    round:
      z.number()
        .int()
        .nonnegative(),

    players:
      z
        .array(
          AIPlayerResultSchema
        )
        .min(1),
  });

export type ValidatedAIHostResponse =
  z.infer<
    typeof AIHostResponseSchema
  >;

export function validateAIHostResponse(
  data: unknown
): ValidatedAIHostResponse {
  return AIHostResponseSchema.parse(
    data
  );
}