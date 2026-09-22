/* =====================================================
   LOCAL AI — LM STUDIO / QWEN
   ===================================================== */

const LOCAL_AI_URL =
  process.env.LOCAL_AI_URL ??
  "http://localhost:1234/v1/chat/completions";

const LOCAL_AI_MODEL =
  process.env.LOCAL_AI_MODEL ??
  "qwen/qwen3-4b-2507";

/* =====================================================
   TYPES
   ===================================================== */

export type LocalAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LocalAIOptions = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;

  /**
   * Optional OpenAI-compatible JSON Schema.
   *
   * LM Studio supports:
   *
   * response_format: {
   *   type: "json_schema",
   *   json_schema: {
   *     name,
   *     strict,
   *     schema
   *   }
   * }
   */
  jsonSchema?: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  };
};

export type LocalAIResult = {
  content: string;
  model: string;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    [key: string]: unknown;
  } | null;
  finishReason: string | null;
};

/* =====================================================
   CALL LOCAL AI
   ===================================================== */

export async function callLocalAI(
  messages: LocalAIMessage[],
  options?: LocalAIOptions,
): Promise<LocalAIResult> {
  const body: Record<string, unknown> = {
    model: LOCAL_AI_MODEL,

    messages,

    temperature:
      options?.temperature ?? 0.7,

    top_p:
      options?.topP ?? 0.9,

    max_tokens:
      options?.maxTokens ?? 500,

    stream: false,
  };

  /* ===================================================
     STRUCTURED JSON OUTPUT
     =================================================== */

  if (options?.jsonSchema) {
    body.response_format = {
      type: "json_schema",

      json_schema: {
        name:
          options.jsonSchema.name,

        strict:
          options.jsonSchema.strict ?? true,

        schema:
          options.jsonSchema.schema,
      },
    };
  }

  /* ===================================================
     REQUEST
     =================================================== */

  let response: Response;

  try {
    response = await fetch(
      LOCAL_AI_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(body),
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    throw new Error(
      `Local AI connection failed: ${message}`,
    );
  }

  /* ===================================================
     HTTP ERROR
     =================================================== */

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Local AI request failed (${response.status}): ${errorText}`,
    );
  }

  /* ===================================================
     PARSE RESPONSE
     =================================================== */

  let data: any;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      "Local AI returned invalid JSON.",
    );
  }

  /* ===================================================
     EXTRACT MESSAGE
     =================================================== */

  const content =
    data?.choices?.[0]?.message?.content;

  if (
    typeof content !== "string" ||
    !content.trim()
  ) {
    throw new Error(
      "Local AI returned an empty response.",
    );
  }

  /* ===================================================
     RETURN
     =================================================== */

  return {
    content,

    model:
      data?.model ??
      LOCAL_AI_MODEL,

    usage:
      data?.usage ??
      null,

    finishReason:
      data?.choices?.[0]
        ?.finish_reason ??
      null,
  };
}

/* =====================================================
   CALL LOCAL AI — JSON HELPER
   ===================================================== */

export async function callLocalAIJson<T>(
  messages: LocalAIMessage[],
  jsonSchema: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  },
  options?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  },
): Promise<{
  data: T;
  raw: LocalAIResult;
}> {
  const result =
    await callLocalAI(
      messages,
      {
        ...options,

        jsonSchema,
      },
    );

  /* ===================================================
     PARSE STRUCTURED JSON
     =================================================== */

  let parsed: T;

  try {
    parsed =
      JSON.parse(result.content) as T;
  } catch {
    /*
     * LM Studio should normally return
     * pure JSON when json_schema is enabled.
     *
     * This fallback also handles occasional
     * ```json ... ``` wrappers.
     */

    const cleaned =
      result.content
        .trim()
        .replace(
          /^```json\s*/i,
          "",
        )
        .replace(
          /^```\s*/i,
          "",
        )
        .replace(
          /\s*```$/i,
          "",
        )
        .trim();

    try {
      parsed =
        JSON.parse(
          cleaned,
        ) as T;
    } catch {
      throw new Error(
        "Local AI returned invalid structured JSON.",
      );
    }
  }

  return {
    data: parsed,
    raw: result,
  };
}

/* =====================================================
   CONNECTION CHECK
   ===================================================== */

export async function isLocalAIAvailable(): Promise<boolean> {
  try {
    const response =
      await fetch(
        LOCAL_AI_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            model:
              LOCAL_AI_MODEL,

            messages: [
              {
                role: "user",
                content:
                  "Ping",
              },
            ],

            max_tokens: 1,

            stream: false,
          }),
        },
      );

    return response.ok;
  } catch {
    return false;
  }
}