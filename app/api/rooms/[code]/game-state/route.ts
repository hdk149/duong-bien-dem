import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing Supabase server environment variables"
  );
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

type Choice = {
  id: string;
  text?: string;
  label?: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
};

type PlayerRoundEvent = {
  id: string;
  room_id: string;
  session_id: string;
  round: number;
  player_id: string;
  source_event_id: string | null;
  title: string;
  description: string;
  event_type: string;
  choices: unknown;
  selected_choice_id: string | null;
  result: unknown | null;
  status: string;
  created_at?: string;
  resolved_at?: string | null;
};

type SharedGameEvent = {
  id: string;
  room_id: string;
  round: number;
  title: string;
  description: string;
  event_type: string;
  choices: unknown;
  result: unknown;
  created_at: string;
  session_id: string;
};

type JsonObject = Record<string, unknown>;

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

function isJsonObject(
  value: unknown
): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeChoices(
  value: unknown
): Choice[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(
    (
      choice: unknown,
      index: number
    ) => {
      if (typeof choice === "string") {
        return {
          id: choice,
          text: choice,
        };
      }

      if (
        choice &&
        typeof choice === "object"
      ) {
        const obj =
          choice as Record<
            string,
            unknown
          >;

        const id =
          typeof obj.id === "string"
            ? obj.id
            : typeof obj.choice_id === "string"
              ? obj.choice_id
              : String(index + 1);

        return {
          ...obj,
          id,
        } as Choice;
      }

      return {
        id: String(index + 1),
        text: `Choice ${index + 1}`,
      };
    }
  );
}

function hashDeveloperSession(
  token: string
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function isActiveParticipant(
  role: string,
  moderationStatus?: string | null
): boolean {
  if (role === "spectator") {
    return false;
  }

  if (
    moderationStatus &&
    moderationStatus !== "active"
  ) {
    return false;
  }

  return true;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const startedAt = Date.now();

  try {
    const { code } =
      await context.params;

    const roomCode =
      String(code ?? "").trim();

    /* =====================================================
       1. VALIDATE ROOM CODE
       ===================================================== */

    if (
      !/^\d{6}$/.test(roomCode)
    ) {
      return NextResponse.json(
        {
          error:
            "Mã phòng không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       2. LOAD ROOM
       ===================================================== */

    const {
      data: room,
      error: roomError,
    } = await supabase
      .from("rooms")
      .select(
        `
          id,
          code,
          host_name,
          max_players,
          status,
          starting_money,
          goal_money,
          starting_location,
          dice_system,
          rules
        `
      )
      .eq(
        "code",
        roomCode
      )
      .maybeSingle();

    if (roomError) {
      console.error(
        "GAME STATE - ROOM ERROR:",
        roomError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải phòng.",
        },
        {
          status: 500,
        }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error:
            "Không tìm thấy phòng.",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       END GAME PAYLOAD
       ===================================================== */

    const roomRules =
      isJsonObject(room.rules)
        ? room.rules
        : {};

    const endGamePayload =
      isJsonObject(
        roomRules.end_game_payload
      )
        ? roomRules.end_game_payload
        : null;

    const developerEndGame =
      endGamePayload !== null;

    /* =====================================================
       3. ROOM MUST BE PLAYING
       
       IMPORTANT:
       force_end_game KHÔNG đổi rooms.status sang
       "finished" ngay lập tức.

       Nó chỉ ghi end_game_payload vào rules để
       frontend vẫn có thể gọi game-state và nhận
       cinematic payload.
       ===================================================== */

    if (
      room.status !==
      "playing"
    ) {
      return NextResponse.json(
        {
          error:
            "Trận đấu chưa bắt đầu.",
          roomStatus:
            room.status,

          /*
           * Giữ payload để client có thể biết
           * developer đã trigger end game nếu
           * room status sau này thay đổi.
           */
          endGame:
            developerEndGame,

          endGamePayload:
            endGamePayload,
        },
        {
          status: 409,
        }
      );
    }

    /* =====================================================
       4. AUTHENTICATION
       ===================================================== */

    const playerToken =
      request.headers.get(
        "x-player-token"
      )?.trim() ?? "";

    const developerSessionToken =
      request.headers.get(
        "x-developer-session"
      )?.trim() ?? "";

    let authenticatedPlayerId:
      | string
      | null = null;

    let isDeveloper = false;

    /* =====================================================
       DEVELOPER SESSION
       ===================================================== */

    if (
      developerSessionToken
    ) {
      const tokenHash =
        hashDeveloperSession(
          developerSessionToken
        );

      const {
        data: developerSession,
        error:
          developerSessionError,
      } = await supabase
        .from("developer_sessions")
        .select(
          `
            id,
            player_id,
            expires_at
          `
        )
        .eq(
          "token_hash",
          tokenHash
        )
        .maybeSingle();

      if (
        developerSessionError
      ) {
        console.error(
          "GAME STATE - DEVELOPER SESSION ERROR:",
          developerSessionError
        );
      } else if (
        developerSession
      ) {
        const expiresAt =
          new Date(
            developerSession.expires_at
          ).getTime();

        if (
          Number.isFinite(
            expiresAt
          ) &&
          expiresAt > Date.now() &&
          developerSession.player_id
        ) {
          authenticatedPlayerId =
            developerSession.player_id;

          isDeveloper = true;
        }
      }
    }

    /* =====================================================
       NORMAL PLAYER TOKEN
       ===================================================== */

    if (
      !authenticatedPlayerId
    ) {
      if (!playerToken) {
        return NextResponse.json(
          {
            error:
              "Thiếu player token.",
          },
          {
            status: 401,
          }
        );
      }

      const {
        data: tokenPlayer,
        error:
          tokenPlayerError,
      } = await supabase
        .from("room_players")
        .select(
          `
            id,
            moderation_status
          `
        )
        .eq(
          "room_id",
          room.id
        )
        .eq(
          "player_token",
          playerToken
        )
        .eq(
          "moderation_status",
          "active"
        )
        .maybeSingle();

      if (
        tokenPlayerError
      ) {
        console.error(
          "GAME STATE - TOKEN PLAYER ERROR:",
          tokenPlayerError
        );

        return NextResponse.json(
          {
            error:
              "Không thể xác thực người chơi.",
          },
          {
            status: 500,
          }
        );
      }

      if (!tokenPlayer) {
        return NextResponse.json(
          {
            error:
              "Bạn không còn là thành viên hoạt động của phòng này.",
          },
          {
            status: 403,
          }
        );
      }

      authenticatedPlayerId =
        tokenPlayer.id;
    }

    /* =====================================================
       5. LOAD VIEWER + SESSION + ACTIVE PLAYERS
       ===================================================== */

    const [
      currentPlayerResult,
      sessionResult,
      roomPlayersResult,
    ] = await Promise.all([
      supabase
        .from("room_players")
        .select(
          `
            id,
            player_name,
            hp,
            money,
            location,
            location_id,
            role,
            is_connected,
            last_choice,
            created_at,
            moderation_status,
            legal_risk
          `
        )
        .eq(
          "room_id",
          room.id
        )
        .eq(
          "id",
          authenticatedPlayerId
        )
        .eq(
          "moderation_status",
          "active"
        )
        .maybeSingle(),

      supabase
        .from("game_sessions")
        .select(
          `
            id,
            room_id,
            session_number,
            status,
            round,
            phase,
            current_event_id,
            started_at,
            finished_at,
            created_at
          `
        )
        .eq(
          "room_id",
          room.id
        )
        .eq(
          "status",
          "active"
        )
        .order(
          "session_number",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle(),

      supabase
        .from("room_players")
        .select(
          `
            id,
            player_name,
            hp,
            money,
            location,
            location_id,
            role,
            is_connected,
            last_choice,
            created_at,
            moderation_status,
            legal_risk
          `
        )
        .eq(
          "room_id",
          room.id
        )
        .in(
          "role",
          ["host", "player"]
        )
        .eq(
          "moderation_status",
          "active"
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        ),
    ]);

    /* =====================================================
       CURRENT PLAYER
       ===================================================== */

    if (
      currentPlayerResult.error
    ) {
      console.error(
        "GAME STATE - PLAYER ERROR:",
        currentPlayerResult.error
      );

      return NextResponse.json(
        {
          error:
            "Không thể xác thực người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    const currentPlayer =
      currentPlayerResult.data;

    if (!currentPlayer) {
      return NextResponse.json(
        {
          error:
            "Bạn không còn là thành viên hoạt động của phòng này.",
        },
        {
          status: 403,
        }
      );
    }

    /* =====================================================
       DEVELOPER SECURITY
       ===================================================== */

    if (
      isDeveloper &&
      !isActiveParticipant(
        currentPlayer.role,
        currentPlayer.moderation_status
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Developer Mode chỉ dành cho host/player.",
        },
        {
          status: 403,
        }
      );
    }

    const isSpectator =
      currentPlayer.role ===
      "spectator";

    const viewerType:
      | "player"
      | "spectator" =
      isSpectator
        ? "spectator"
        : "player";

    /* =====================================================
       SESSION
       ===================================================== */

    if (
      sessionResult.error
    ) {
      console.error(
        "GAME STATE - SESSION ERROR:",
        sessionResult.error
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải game session.",
        },
        {
          status: 500,
        }
      );
    }

    const session =
      sessionResult.data;

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Không tìm thấy game session.",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       ACTIVE PLAYERS
       ===================================================== */

    if (
      roomPlayersResult.error
    ) {
      console.error(
        "GAME STATE - ROOM PLAYERS ERROR:",
        roomPlayersResult.error
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải danh sách người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    const roomPlayers =
      roomPlayersResult.data ??
      [];

    const currentRound =
      session.round ?? 1;

    const currentPhase =
      session.phase ?? "waiting";

    const currentEventId =
      session.current_event_id ??
      null;

    const totalPlayers =
      roomPlayers.length;

    const activePlayerIds =
      roomPlayers.map(
        (player) =>
          player.id
      );

    /* =====================================================
       6. LOAD PRIVATE PLAYER EVENT
       ===================================================== */

    let playerEvent:
      | PlayerRoundEvent
      | null = null;

    let sharedEvent:
      | SharedGameEvent
      | null = null;

    let selectedChoiceId:
      | string
      | null = null;

    let chosenPlayers = 0;

    /* =====================================================
       PRIVATE EVENT
       ===================================================== */

    if (
      !isSpectator &&
      currentPlayer.role !==
        "spectator"
    ) {
      const {
        data: privateEvent,
        error:
          privateEventError,
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
            status,
            created_at,
            resolved_at
          `
        )
        .eq(
          "room_id",
          room.id
        )
        .eq(
          "session_id",
          session.id
        )
        .eq(
          "round",
          currentRound
        )
        .eq(
          "player_id",
          currentPlayer.id
        )
        .maybeSingle();

      if (
        privateEventError
      ) {
        console.error(
          "GAME STATE - PRIVATE EVENT ERROR:",
          privateEventError
        );
      } else if (
        privateEvent
      ) {
        playerEvent =
          privateEvent as PlayerRoundEvent;
      }
    }

    /* =====================================================
       FALLBACK SHARED EVENT
       ===================================================== */

    if (
      !playerEvent &&
      currentEventId
    ) {
      const {
        data: fallbackEvent,
        error:
          fallbackEventError,
      } = await supabase
        .from("game_events")
        .select(
          `
            id,
            room_id,
            round,
            title,
            description,
            event_type,
            choices,
            result,
            created_at,
            session_id
          `
        )
        .eq(
          "id",
          currentEventId
        )
        .eq(
          "room_id",
          room.id
        )
        .eq(
          "session_id",
          session.id
        )
        .maybeSingle();

      if (
        fallbackEventError
      ) {
        console.error(
          "GAME STATE - SHARED EVENT ERROR:",
          fallbackEventError
        );
      } else if (
        fallbackEvent
      ) {
        sharedEvent =
          fallbackEvent as SharedGameEvent;
      }
    }

    /* =====================================================
       7. DETERMINE EVENT SOURCE
       ===================================================== */

    const effectiveEvent =
      playerEvent ??
      sharedEvent;

    const effectiveEventId =
      playerEvent?.id ??
      sharedEvent?.id ??
      null;

    const sourceGameEventId =
      playerEvent?.source_event_id ??
      sharedEvent?.id ??
      null;

    /* =====================================================
       8. CURRENT CHOICE
       ===================================================== */

    if (
      sourceGameEventId &&
      !isSpectator
    ) {
      const {
        data: choice,
        error: choiceError,
      } = await supabase
        .from("player_choices")
        .select(
          "choice_id"
        )
        .eq(
          "event_id",
          sourceGameEventId
        )
        .eq(
          "player_id",
          currentPlayer.id
        )
        .eq(
          "session_id",
          session.id
        )
        .maybeSingle();

      if (
        choiceError
      ) {
        console.error(
          "GAME STATE - CHOICE ERROR:",
          choiceError
        );
      } else {
        selectedChoiceId =
          choice?.choice_id ??
          null;
      }
    }

    /* =====================================================
       9. COUNT ACTIVE PLAYER VOTES
       ===================================================== */

    if (
      sourceGameEventId
    ) {
      const {
        data: votes,
        error: votesError,
      } = await supabase
        .from("player_choices")
        .select(
          "player_id"
        )
        .eq(
          "event_id",
          sourceGameEventId
        )
        .eq(
          "session_id",
          session.id
        );

      if (
        votesError
      ) {
        console.error(
          "GAME STATE - VOTES ERROR:",
          votesError
        );
      } else {
        const validPlayerIds =
          new Set(
            activePlayerIds
          );

        const chosenPlayerIds =
          new Set<string>();

        for (
          const vote of
            votes ?? []
        ) {
          if (
            validPlayerIds.has(
              vote.player_id
            )
          ) {
            chosenPlayerIds.add(
              vote.player_id
            );
          }
        }

        chosenPlayers =
          chosenPlayerIds.size;
      }
    }

    /* =====================================================
       10. EVENT CONSISTENCY
       ===================================================== */

    if (
      effectiveEvent &&
      (
        effectiveEvent.room_id !==
          room.id ||
        effectiveEvent.session_id !==
          session.id ||
        effectiveEvent.round !==
          currentRound
      )
    ) {
      console.error(
        "GAME STATE - EVENT/SERVER MISMATCH:",
        {
          event: {
            id:
              effectiveEvent.id,
            round:
              effectiveEvent.round,
            sessionId:
              effectiveEvent.session_id,
          },

          session: {
            id:
              session.id,
            round:
              currentRound,
          },
        }
      );

      playerEvent =
        null;

      sharedEvent =
        null;

      selectedChoiceId =
        null;

      chosenPlayers =
        0;
    }

    const finalEvent =
      playerEvent ??
      sharedEvent;

    /* =====================================================
       11. SAFE EVENT
       ===================================================== */

    const safeEvent =
      finalEvent
        ? {
            id:
              finalEvent.id,

            isPrivate:
              Boolean(
                playerEvent
              ),

            playerEventId:
              playerEvent?.id ??
              null,

            sourceEventId:
              playerEvent?.source_event_id ??
              sharedEvent?.id ??
              null,

            round:
              finalEvent.round,

            title:
              finalEvent.title,

            description:
              finalEvent.description,

            event_type:
              finalEvent.event_type,

            choices:
              normalizeChoices(
                finalEvent.choices
              ),
          }
        : null;

    /* =====================================================
       12. SAFE PLAYERS
       ===================================================== */

    const safePlayers =
      roomPlayers.map(
        (player) => {
          const basePlayer = {
            id:
              player.id,

            playerName:
              player.player_name,

            player_name:
              player.player_name,

            hp:
              player.hp ??
              100,

            money:
              player.money ??
              room.starting_money ??
              5000000,

            role:
              player.role,

            isConnected:
              player.is_connected,

            is_connected:
              player.is_connected,
          };

          return {
            ...basePlayer,

            location:
              player.location ||
              "TP. Hồ Chí Minh",

            locationId:
              player.location_id ||
              "hcm",

            location_id:
              player.location_id ||
              "hcm",
          };
        }
      );

    /* =====================================================
       13. CURRENT PLAYER
       ===================================================== */

    const currentPlayerLocation =
      currentPlayer.location ||
      "TP. Hồ Chí Minh";

    const currentPlayerLocationId =
      currentPlayer.location_id ||
      "hcm";

    /* =====================================================
       14. DEVELOPER DATA
       ===================================================== */

    let developerData:
      | Record<string, unknown>
      | null = null;

    if (
      isDeveloper
    ) {
      const rules =
        room.rules &&
        typeof room.rules ===
          "object"
          ? room.rules
          : {};

      const rulesObject =
        rules as Record<
          string,
          unknown
        >;

      const expandedPlayers =
        roomPlayers.map(
          (player) => ({
            id:
              player.id,

            playerName:
              player.player_name,

            player_name:
              player.player_name,

            role:
              player.role,

            hp:
              player.hp ??
              100,

            money:
              player.money ??
              room.starting_money ??
              5000000,

            location:
              player.location ??
              null,

            locationId:
              player.location_id ??
              null,

            isConnected:
              player.is_connected,

            lastChoice:
              player.last_choice ??
              null,

            legalRisk:
              player.legal_risk ??
              0,

            moderationStatus:
              player.moderation_status,

            createdAt:
              player.created_at,
          })
        );

      developerData = {
        verified: true,

        playerId:
          currentPlayer.id,

        playerName:
          currentPlayer.player_name,

        viewerRole:
          currentPlayer.role,

        room: {
          id:
            room.id,

          code:
            room.code,

          hostName:
            room.host_name,

          host_name:
            room.host_name,

          maxPlayers:
            room.max_players,

          max_players:
            room.max_players,

          status:
            room.status,

          startingMoney:
            room.starting_money,

          starting_money:
            room.starting_money,

          goalMoney:
            room.goal_money,

          goal_money:
            room.goal_money,

          startingLocation:
            room.starting_location ??
            "TP. Hồ Chí Minh",

          starting_location:
            room.starting_location ??
            "TP. Hồ Chí Minh",

          diceSystem:
            room.dice_system,

          dice_system:
            room.dice_system,

          /* =============================================
             END GAME
             ============================================= */

          endGame:
            developerEndGame,

          end_game:
            developerEndGame,

          endGamePayload:
            endGamePayload,

          end_game_payload:
            endGamePayload,
        },

        gameState: {
          sessionId:
            session.id,

          sessionNumber:
            session.session_number,

          sessionStatus:
            session.status,

          round:
            currentRound,

          phase:
            currentPhase,

          currentEventId:
            currentEventId,

          playerEventId:
            playerEvent?.id ??
            null,

          sourceEventId:
            sourceGameEventId,

          startedAt:
            session.started_at,

          finishedAt:
            session.finished_at,

          createdAt:
            session.created_at,
        },

        playerCount: {
          activePlayers:
            totalPlayers,

          activePlayerIds,

          chosenPlayers,

          waitingForVotes:
            Math.max(
              totalPlayers -
                chosenPlayers,
              0
            ),

          allPlayersChosen:
            totalPlayers >
              0 &&
            chosenPlayers >=
              totalPlayers,
        },

        quest:
          rulesObject.quest ??
          null,

        rules,

        dice: {
          system:
            room.dice_system,

          configured:
            room.dice_system ??
            "1d6",
        },

        location: {
          playerId:
            currentPlayer.id,

          playerName:
            currentPlayer.player_name,

          location:
            currentPlayer.location ??
            null,

          locationId:
            currentPlayer.location_id ??
            null,
        },

        currentEvent:
          finalEvent
            ? {
                id:
                  finalEvent.id,

                playerEventId:
                  playerEvent?.id ??
                  null,

                sourceEventId:
                  playerEvent?.source_event_id ??
                  sharedEvent?.id ??
                  null,

                roomId:
                  finalEvent.room_id,

                sessionId:
                  finalEvent.session_id,

                round:
                  finalEvent.round,

                title:
                  finalEvent.title,

                description:
                  finalEvent.description,

                eventType:
                  finalEvent.event_type,

                isPrivate:
                  Boolean(
                    playerEvent
                  ),

                choices:
                  normalizeChoices(
                    finalEvent.choices
                  ),

                result:
                  finalEvent.result ??
                  null,

                status:
                  playerEvent?.status ??
                  "legacy",

                createdAt:
                  finalEvent.created_at ??
                  null,
              }
            : null,

        players:
          expandedPlayers,
      };
    }

    /* =====================================================
       15. FINAL VOTE STATUS
       ===================================================== */

    const allPlayersChosen =
      totalPlayers >
        0 &&
      chosenPlayers >=
        totalPlayers;

    const waitingForVotes =
      Math.max(
        totalPlayers -
          chosenPlayers,
        0
      );

    /* =====================================================
       16. RESPONSE
       ===================================================== */

    return NextResponse.json(
      {
        success: true,

        viewerType,

        isSpectator,

        isDeveloper,

        /* =================================================
           ROOM
           ================================================= */

        room: {
          id:
            room.id,

          code:
            room.code,

          hostName:
            room.host_name,

          host_name:
            room.host_name,

          maxPlayers:
            room.max_players,

          max_players:
            room.max_players,

          status:
            room.status,

          startingMoney:
            room.starting_money,

          starting_money:
            room.starting_money,

          goalMoney:
            room.goal_money,

          goal_money:
            room.goal_money,

          startingLocation:
            room.starting_location ??
            "TP. Hồ Chí Minh",

          starting_location:
            room.starting_location ??
            "TP. Hồ Chí Minh",

          diceSystem:
            room.dice_system,

          dice_system:
            room.dice_system,

          /* =============================================
             END GAME
             ============================================= */

          endGame:
            developerEndGame,

          end_game:
            developerEndGame,

          endGamePayload:
            endGamePayload,

          end_game_payload:
            endGamePayload,
        },

        /* =================================================
           SESSION
           ================================================= */

        session: {
          id:
            session.id,

          sessionNumber:
            session.session_number,

          session_number:
            session.session_number,

          status:
            session.status,

          round:
            currentRound,

          phase:
            currentPhase,

          currentEventId:
            currentEventId,

          current_event_id:
            currentEventId,

          playerEventId:
            playerEvent?.id ??
            null,

          startedAt:
            session.started_at,

          started_at:
            session.started_at,

          finishedAt:
            session.finished_at,

          finished_at:
            session.finished_at,

          createdAt:
            session.created_at,
        },

        /* =================================================
           CURRENT PLAYER
           ================================================= */

        currentPlayer: {
          id:
            currentPlayer.id,

          playerName:
            currentPlayer.player_name,

          player_name:
            currentPlayer.player_name,

          hp:
            currentPlayer.hp,

          money:
            currentPlayer.money,

          location:
            currentPlayerLocation,

          locationId:
            currentPlayerLocationId,

          location_id:
            currentPlayerLocationId,

          role:
            currentPlayer.role,

          isConnected:
            currentPlayer.is_connected,

          is_connected:
            currentPlayer.is_connected,

          legalRisk:
            currentPlayer.legal_risk ??
            0,

          legal_risk:
            currentPlayer.legal_risk ??
            0,

          ...(isSpectator
            ? {}
            : {
                lastChoice:
                  currentPlayer.last_choice,

                last_choice:
                  currentPlayer.last_choice,
              }),
        },

        /* =================================================
           ACTIVE PLAYERS
           ================================================= */

        players:
          safePlayers,

        /* =================================================
           PRIVATE EVENT
           ================================================= */

        event:
          safeEvent,

        /* =================================================
           NEW PRIVATE EVENT FORMAT
           ================================================= */

        playerEvent:
          playerEvent
            ? {
                id:
                  playerEvent.id,

                roomId:
                  playerEvent.room_id,

                sessionId:
                  playerEvent.session_id,

                round:
                  playerEvent.round,

                playerId:
                  playerEvent.player_id,

                sourceEventId:
                  playerEvent.source_event_id,

                title:
                  playerEvent.title,

                description:
                  playerEvent.description,

                eventType:
                  playerEvent.event_type,

                choices:
                  normalizeChoices(
                    playerEvent.choices
                  ),

                selectedChoiceId:
                  playerEvent.selected_choice_id,

                result:
                  playerEvent.result,

                status:
                  playerEvent.status,

                createdAt:
                  playerEvent.created_at ??
                  null,

                resolvedAt:
                  playerEvent.resolved_at ??
                  null,
              }
            : null,

        /* =================================================
           CHOICE STATUS
           ================================================= */

        choiceStatus: {
          selected:
            selectedChoiceId !==
            null,

          selectedChoiceId,

          chosenPlayers,

          totalPlayers,

          waitingForVotes,

          allPlayersChosen,

          eventSource:
            playerEvent
              ? "player_round_events"
              : sharedEvent
                ? "game_events"
                : null,

          playerEventId:
            playerEvent?.id ??
            null,

          sourceEventId:
            sourceGameEventId,
        },

        /* =================================================
           DEVELOPER ONLY
           ================================================= */

        ...(developerData
          ? {
              developerData,
            }
          : {}),

        /* =================================================
           DEBUG TIMING
           ================================================= */

        serverTimeMs:
          Date.now() -
          startedAt,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",

          Pragma:
            "no-cache",

          Expires:
            "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "GAME STATE - UNEXPECTED ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Lỗi máy chủ khi tải trạng thái game.",
      },
      {
        status: 500,
      }
    );
  }
}