import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ACTIONS = [
  "pause_room",
  "resume_room",
  "reset_round",
  "clear_votes",
  "force_stop_round",
  "unlock_room",
  "force_end_game",
] as const;

type EmergencyAction = (typeof ALLOWED_ACTIONS)[number];

type JsonObject = Record<string, unknown>;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function json(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function hashDeveloperSession(token: string) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/*
 * ============================================================
 * DEVELOPER SESSION
 * ============================================================
 */

async function validateDeveloperSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  token: string
) {
  if (!token) {
    return {
      valid: false,
      playerId: null,
    };
  }

  const tokenHash =
    hashDeveloperSession(token);

  const {
    data: session,
    error,
  } = await supabase
    .from("developer_sessions")
    .select(`
      id,
      player_id,
      expires_at
    `)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error(
      "EMERGENCY - DEVELOPER SESSION ERROR:",
      error
    );

    return {
      valid: false,
      playerId: null,
    };
  }

  if (!session) {
    return {
      valid: false,
      playerId: null,
    };
  }

  const expiresAt =
    new Date(session.expires_at).getTime();

  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return {
      valid: false,
      playerId: null,
    };
  }

  return {
    valid: true,
    playerId: session.player_id ?? null,
  };
}

/*
 * ============================================================
 * LOAD ACTIVE SESSION
 * ============================================================
 */

async function getActiveSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  roomId: string
) {
  const {
    data,
    error,
  } = await supabase
    .from("game_sessions")
    .select(`
      id,
      room_id,
      session_number,
      status,
      round,
      phase,
      current_event_id
    `)
    .eq("room_id", roomId)
    .eq("status", "active")
    .order("session_number", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Không thể tải game session: ${error.message}`
    );
  }

  return data;
}

/*
 * ============================================================
 * CLEAR PLAYER CHOICES
 * ============================================================
 *
 * Có 2 state cần clear:
 *
 * 1. room_players.last_choice
 *    → UI/cache của player
 *
 * 2. player_choices
 *    → choice thật được game-state / resolve sử dụng
 *
 * Nếu chỉ clear last_choice thì vote vẫn còn.
 */

async function clearPlayerChoices(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  roomId: string,
  eventId: string | null
) {
  /*
   * ----------------------------------------------------------
   * 1. CLEAR room_players.last_choice
   * ----------------------------------------------------------
   */

  const {
    error: playersError,
  } = await supabase
    .from("room_players")
    .update({
      last_choice: null,
    })
    .eq("room_id", roomId)
    .in("role", ["host", "player"])
    .eq("moderation_status", "active");

  if (playersError) {
    throw new Error(
      `Không thể clear last_choice: ${playersError.message}`
    );
  }

  /*
   * ----------------------------------------------------------
   * 2. CLEAR player_choices
   * ----------------------------------------------------------
   *
   * Nếu có event hiện tại → chỉ xóa choice
   * của event đó.
   *
   * Nếu không có event → xóa toàn bộ choices
   * của room bằng cách lấy player IDs.
   */

  if (eventId) {
    const {
      error: choicesError,
    } = await supabase
      .from("player_choices")
      .delete()
      .eq("event_id", eventId);

    if (choicesError) {
      throw new Error(
        `Không thể clear player_choices: ${choicesError.message}`
      );
    }

    return;
  }

  /*
   * Không có event_id.
   * Lấy active player IDs rồi clear choices
   * của những player đó.
   */

  const {
    data: players,
    error: playerLoadError,
  } = await supabase
    .from("room_players")
    .select("id")
    .eq("room_id", roomId)
    .in("role", ["host", "player"])
    .eq("moderation_status", "active");

  if (playerLoadError) {
    throw new Error(
      `Không thể tải player để clear choices: ${playerLoadError.message}`
    );
  }

  const playerIds =
    (players ?? [])
      .map((player) => player.id)
      .filter(Boolean);

  if (playerIds.length === 0) {
    return;
  }

  const {
    error: choicesError,
  } = await supabase
    .from("player_choices")
    .delete()
    .in("player_id", playerIds);

  if (choicesError) {
    throw new Error(
      `Không thể clear player_choices: ${choicesError.message}`
    );
  }
}

/*
 * ============================================================
 * SYNC GAME STATE
 * ============================================================
 */

async function syncGameState(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionId: string,
  round: number,
  phase: string,
  currentEventId: string | null
) {
  /*
   * game_sessions
   */

  const {
    error: sessionError,
  } = await supabase
    .from("game_sessions")
    .update({
      round,
      phase,
      current_event_id: currentEventId,
    })
    .eq("id", sessionId);

  if (sessionError) {
    throw new Error(
      `Không thể cập nhật game_sessions: ${sessionError.message}`
    );
  }

  /*
   * game_states
   */

  const {
    error: stateError,
  } = await supabase
    .from("game_states")
    .update({
      round,
      phase,
      current_event_id: currentEventId,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId);

  if (stateError) {
    throw new Error(
      `Không thể cập nhật game_states: ${stateError.message}`
    );
  }
}

/*
 * ============================================================
 * POST
 * ============================================================
 */

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ code: string }>;
  }
) {
  try {
    /*
     * --------------------------------------------------------
     * 1. ROOM CODE
     * --------------------------------------------------------
     */

    const { code } = await params;

    const roomCode =
      String(code).trim();

    if (!/^\d{6}$/.test(roomCode)) {
      return json(
        {
          success: false,
          error: "Mã phòng không hợp lệ.",
        },
        400
      );
    }

    /*
     * --------------------------------------------------------
     * 2. BODY
     * --------------------------------------------------------
     */

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return json(
        {
          success: false,
          error: "Request body không hợp lệ.",
        },
        400
      );
    }

    const action =
      isJsonObject(body)
        ? body.action
        : null;

    if (
      typeof action !== "string" ||
      !ALLOWED_ACTIONS.includes(
        action as EmergencyAction
      )
    ) {
      return json(
        {
          success: false,
          error: "Emergency action không hợp lệ.",
          allowedActions: ALLOWED_ACTIONS,
        },
        400
      );
    }

    const emergencyAction =
      action as EmergencyAction;

    /*
     * --------------------------------------------------------
     * 3. SUPABASE
     * --------------------------------------------------------
     */

    const supabase =
      getSupabaseAdmin();

    /*
     * --------------------------------------------------------
     * 4. DEVELOPER SESSION
     * --------------------------------------------------------
     */

    const developerToken =
      request.headers
        .get("x-developer-session")
        ?.trim() ?? "";

    const {
      valid: isDeveloper,
      playerId: developerPlayerId,
    } =
      await validateDeveloperSession(
        supabase,
        developerToken
      );

    if (!isDeveloper) {
      return json(
        {
          success: false,
          error:
            "Developer session không hợp lệ hoặc đã hết hạn.",
        },
        401
      );
    }

    /*
     * --------------------------------------------------------
     * 5. LOAD ROOM
     * --------------------------------------------------------
     */

    const {
      data: room,
      error: roomError,
    } = await supabase
      .from("rooms")
      .select(`
        id,
        code,
        status,
        rules
      `)
      .eq("code", roomCode)
      .maybeSingle();

    if (roomError) {
      console.error(
        "EMERGENCY - LOAD ROOM ERROR:",
        roomError
      );

      return json(
        {
          success: false,
          error: "Không thể tải phòng.",
        },
        500
      );
    }

    if (!room) {
      return json(
        {
          success: false,
          error: "Phòng không tồn tại.",
        },
        404
      );
    }

    /*
     * developerPlayerId hiện được giữ để tương thích
     * với Developer Session độc lập.
     *
     * Developer session không bắt buộc phải thuộc
     * room_players.
     */

    void developerPlayerId;

    /*
     * --------------------------------------------------------
     * VARIABLES
     * --------------------------------------------------------
     */

    const previousStatus =
      room.status;

    let newStatus:
      | string
      | null = null;

    let message = "";

    /*
     * ========================================================
     * ACTIONS
     * ========================================================
     */

    switch (emergencyAction) {
      /*
       * ======================================================
       * PAUSE ROOM
       * ======================================================
       */

      case "pause_room": {
        if (room.status === "finished") {
          return json(
            {
              success: false,
              error:
                "Không thể pause game đã kết thúc.",
            },
            409
          );
        }

        if (room.status === "paused") {
          return json(
            {
              success: false,
              error: "Phòng đã paused.",
            },
            409
          );
        }

        const currentRules =
          isJsonObject(room.rules)
            ? room.rules
            : {};

        const updatedRules = {
          ...currentRules,
          emergency_previous_status:
            room.status,
        };

        const {
          error,
        } = await supabase
          .from("rooms")
          .update({
            status: "paused",
            rules: updatedRules,
          })
          .eq("id", room.id);

        if (error) {
          throw error;
        }

        newStatus = "paused";

        message =
          `Room ${roomCode} đã được pause.`;

        break;
      }

      /*
       * ======================================================
       * RESUME ROOM
       * ======================================================
       */

      case "resume_room": {
        if (room.status !== "paused") {
          return json(
            {
              success: false,
              error:
                `Phòng không ở trạng thái paused. Current status: ${room.status}`,
            },
            409
          );
        }

        const currentRules =
          isJsonObject(room.rules)
            ? room.rules
            : {};

        let restoreStatus =
          typeof currentRules
            .emergency_previous_status ===
          "string"
            ? currentRules
                .emergency_previous_status
            : "lobby";

        if (
          ![
            "lobby",
            "playing",
            "finished",
          ].includes(restoreStatus)
        ) {
          restoreStatus = "lobby";
        }

        /*
         * Nếu trước pause là lobby nhưng đã có
         * active session thì thực tế game đang chạy.
         */

        if (restoreStatus === "lobby") {
          const activeSession =
            await getActiveSession(
              supabase,
              room.id
            );

          if (activeSession) {
            restoreStatus = "playing";
          }
        }

        const updatedRules = {
          ...currentRules,
        };

        delete updatedRules
          .emergency_previous_status;

        /*
         * Nếu đang resume một session đã force-stop
         * thì đưa round về choosing để có thể tiếp tục.
         */

        const activeSession =
          await getActiveSession(
            supabase,
            room.id
          );

        if (
          activeSession &&
          activeSession.phase === "finished"
        ) {
          /*
           * Không đụng vào game đã finished.
           */
        }

        const {
          error,
        } = await supabase
          .from("rooms")
          .update({
            status: restoreStatus,
            rules: updatedRules,
          })
          .eq("id", room.id);

        if (error) {
          throw error;
        }

        newStatus = restoreStatus;

        message =
          `Room ${roomCode} đã resume về "${restoreStatus}".`;

        break;
      }

      /*
       * ======================================================
       * CLEAR VOTES
       * ======================================================
       */

      case "clear_votes": {
        const session =
          await getActiveSession(
            supabase,
            room.id
          );

        await clearPlayerChoices(
          supabase,
          room.id,
          session?.current_event_id ?? null
        );

        if (session) {
          await syncGameState(
            supabase,
            session.id,
            Number(session.round),
            "choosing",
            session.current_event_id ?? null
          );
        }

        message =
          `Đã clear toàn bộ vote của round hiện tại trong room ${roomCode}.`;

        break;
      }

      /*
       * ======================================================
       * RESET ROUND
       * ======================================================
       */

      case "reset_round": {
        const session =
          await getActiveSession(
            supabase,
            room.id
          );

        if (!session) {
          return json(
            {
              success: false,
              error:
                "Room chưa có active game session.",
            },
            409
          );
        }

        const currentRound =
          Number(session.round);

        if (
          !Number.isInteger(currentRound) ||
          currentRound < 1
        ) {
          return json(
            {
              success: false,
              error:
                "Round hiện tại không hợp lệ.",
            },
            409
          );
        }

        let eventId =
          session.current_event_id ?? null;

        /*
         * Nếu session không có event,
         * tìm event mới nhất của round hiện tại.
         */

        if (!eventId) {
          const {
            data: roundEvent,
            error: roundEventError,
          } = await supabase
            .from("game_events")
            .select("id")
            .eq("session_id", session.id)
            .eq("round", currentRound)
            .order("created_at", {
              ascending: false,
            })
            .limit(1)
            .maybeSingle();

          if (roundEventError) {
            throw roundEventError;
          }

          eventId =
            roundEvent?.id ?? null;
        }

        /*
         * XÓA VOTE THẬT.
         */

        await clearPlayerChoices(
          supabase,
          room.id,
          eventId
        );

        /*
         * Reset result của event hiện tại.
         *
         * Không tạo event mới.
         * Người chơi sẽ vote lại cùng event.
         */

        if (eventId) {
          const {
            error: eventResetError,
          } = await supabase
            .from("game_events")
            .update({
              result: null,
            })
            .eq("id", eventId)
            .eq("session_id", session.id);

          if (eventResetError) {
            throw eventResetError;
          }
        }

        /*
         * Đồng bộ cả session + state.
         */

        await syncGameState(
          supabase,
          session.id,
          currentRound,
          "choosing",
          eventId
        );

        message =
          `Đã reset Round ${currentRound} của room ${roomCode}. Vote cũ đã bị xóa và người chơi có thể vote lại.`;

        break;
      }

      /*
       * ======================================================
       * FORCE STOP ROUND
       * ======================================================
       *
       * KHÔNG dùng phase "stopped".
       *
       * Phase đó không tồn tại trong game engine hiện tại.
       *
       * Ta lưu emergency flag trong rooms.rules,
       * clear vote, và giữ phase "choosing".
       *
       * Khi unlock/resume, flag được gỡ.
       */

      case "force_stop_round": {
        const session =
          await getActiveSession(
            supabase,
            room.id
          );

        if (!session) {
          return json(
            {
              success: false,
              error:
                "Không có active game session.",
            },
            409
          );
        }

        await clearPlayerChoices(
          supabase,
          room.id,
          session.current_event_id ?? null
        );

        const currentRules =
          isJsonObject(room.rules)
            ? room.rules
            : {};

        const updatedRules = {
          ...currentRules,
          emergency_round_stopped: true,
          emergency_round_stopped_at:
            new Date().toISOString(),
        };

        const {
          error: roomUpdateError,
        } = await supabase
          .from("rooms")
          .update({
            rules: updatedRules,
          })
          .eq("id", room.id);

        if (roomUpdateError) {
          throw roomUpdateError;
        }

        /*
         * Giữ phase hợp lệ.
         * choosing = không resolve round cũ nữa
         * sau khi clear choices.
         */

        await syncGameState(
          supabase,
          session.id,
          Number(session.round),
          "choosing",
          session.current_event_id ?? null
        );

        message =
          `Round ${session.round} của room ${roomCode} đã bị force stop. Vote cũ đã được xóa.`;

        break;
      }

      /*
       * ======================================================
       * UNLOCK ROOM
       * ======================================================
       */

      case "unlock_room": {
        const currentRules =
          isJsonObject(room.rules)
            ? room.rules
            : {};

        const wasPaused =
          room.status === "paused";

        const wasRoundStopped =
          currentRules
            .emergency_round_stopped ===
          true;

        if (
          !wasPaused &&
          !wasRoundStopped
        ) {
          return json(
            {
              success: false,
              error:
                `Room không có emergency lock. Current status: ${room.status}`,
            },
            409
          );
        }

        /*
         * Restore room status.
         */

        let restoreStatus =
          typeof currentRules
            .emergency_previous_status ===
          "string"
            ? currentRules
                .emergency_previous_status
            : null;

        if (!restoreStatus) {
          const activeSession =
            await getActiveSession(
              supabase,
              room.id
            );

          restoreStatus =
            activeSession
              ? "playing"
              : "lobby";
        }

        if (
          ![
            "lobby",
            "playing",
          ].includes(restoreStatus)
        ) {
          restoreStatus = "playing";
        }

        /*
         * Xóa emergency flags.
         */

        const updatedRules = {
          ...currentRules,
        };

        delete updatedRules
          .emergency_previous_status;

        delete updatedRules
          .emergency_round_stopped;

        delete updatedRules
          .emergency_round_stopped_at;

        /*
         * Nếu có active session,
         * đưa round về choosing để player tiếp tục.
         */

        const session =
          await getActiveSession(
            supabase,
            room.id
          );

        if (session) {
          await syncGameState(
            supabase,
            session.id,
            Number(session.round),
            "choosing",
            session.current_event_id ?? null
          );
        }

        const {
          error,
        } = await supabase
          .from("rooms")
          .update({
            status: restoreStatus,
            rules: updatedRules,
          })
          .eq("id", room.id);

        if (error) {
          throw error;
        }

        newStatus = restoreStatus;

        message =
          `Room ${roomCode} đã được unlock. ${
            session
              ? `Round ${session.round} đã trở lại trạng thái choosing.`
              : ""
          }`;

        break;
      }

            /*
       * ======================================================
       * FORCE END GAME
       * ======================================================
       *
       * Flow:
       *
       * playing
       *    ↓
       * ending
       *    ↓
       * frontend shows End Game cinematic
       *    ↓
       * /finalize-end
       *    ↓
       * finished
       *
       * KHÔNG set finished ở đây.
       */

      case "force_end_game": {
        if (room.status === "finished") {
          return json(
            {
              success: false,
              error: "Game đã kết thúc.",
            },
            409
          );
        }

        if (room.status === "ending") {
          return json(
            {
              success: false,
              error: "Game đang trong quá trình kết thúc.",
            },
            409
          );
        }

        /*
         * ----------------------------------------------------
         * LOAD ACTIVE SESSION
         * ----------------------------------------------------
         */

        const {
          data: activeSession,
          error: activeSessionError,
        } = await supabase
          .from("game_sessions")
          .select(`
            id,
            round,
            phase,
            current_event_id,
            session_number
          `)
          .eq("room_id", room.id)
          .eq("status", "active")
          .order("session_number", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (activeSessionError) {
          throw new Error(
            `Không thể tải active game session: ${activeSessionError.message}`
          );
        }

        /*
         * ----------------------------------------------------
         * LẤY PLAYER ĐỂ TẠO END-GAME PAYLOAD
         * ----------------------------------------------------
         *
         * Host cũng là player.
         * Spectator không được tính.
         */

        const {
          data: players,
          error: playersError,
        } = await supabase
          .from("room_players")
          .select(`
            id,
            player_name,
            hp,
            money,
            location,
            role,
            moderation_status
          `)
          .eq("room_id", room.id)
          .in("role", ["host", "player"])
          .eq("moderation_status", "active")
          .order("created_at", {
            ascending: true,
          });

        if (playersError) {
          throw new Error(
            `Không thể tải players: ${playersError.message}`
          );
        }

        /*
         * ----------------------------------------------------
         * END GAME PAYLOAD
         * ----------------------------------------------------
         *
         * Mỗi client sẽ tự lấy currentPlayer của mình,
         * nên payload này chủ yếu lưu metadata cho trạng thái
         * ending và fallback.
         */

        const endGamePayload = {
          reason: "developer_force_end",
          triggered_at: new Date().toISOString(),
          round: activeSession
            ? Number(activeSession.round)
            : 0,
          message:
            "Game đã được kết thúc bởi Developer.",
          players: (players ?? []).map((player) => ({
            id: player.id,
            player_name: player.player_name,
            hp: player.hp,
            money: player.money,
            location: player.location,
          })),
        };

        /*
         * ----------------------------------------------------
         * SAVE ENDING PAYLOAD
         * ----------------------------------------------------
         *
         * Lưu trong rooms.rules để không cần thêm column mới.
         */

        const currentRules =
          isJsonObject(room.rules)
            ? room.rules
            : {};

        const updatedRules = {
          ...currentRules,
          emergency_end_game: true,
          emergency_end_game_reason:
            "developer_force_end",
          emergency_end_game_at:
            endGamePayload.triggered_at,
          end_game_payload: endGamePayload,
        };

        /*
         * ----------------------------------------------------
         * ROOM → ENDING
         * ----------------------------------------------------
         */

        const {
          error: roomEndingError,
        } = await supabase
          .from("rooms")
          .update({
            status: "ending",
            rules: updatedRules,
          })
          .eq("id", room.id)
          .neq("status", "finished");

        if (roomEndingError) {
          throw new Error(
            `Không thể chuyển room sang ending: ${roomEndingError.message}`
          );
        }

        /*
         * ----------------------------------------------------
         * SESSION → ENDING
         * ----------------------------------------------------
         *
         * Không dùng getActiveSession() nữa vì session sắp
         * chuyển status.
         */

        if (activeSession) {
          const {
            error: sessionEndingError,
          } = await supabase
            .from("game_sessions")
            .update({
              status: "ending",
              phase: "ending",
            })
            .eq("id", activeSession.id)
            .eq("status", "active");

          if (sessionEndingError) {
            throw new Error(
              `Không thể chuyển game session sang ending: ${sessionEndingError.message}`
            );
          }

          /*
           * --------------------------------------------------
           * GAME STATE → ENDING
           * --------------------------------------------------
           */

          const {
            error: stateEndingError,
          } = await supabase
            .from("game_states")
            .update({
              round: Number(activeSession.round),
              phase: "ending",
              current_event_id:
                activeSession.current_event_id ?? null,
              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "session_id",
              activeSession.id
            );

          if (stateEndingError) {
            throw new Error(
              `Không thể chuyển game state sang ending: ${stateEndingError.message}`
            );
          }
        }

                newStatus = "ending";

        message =
          `Game ${roomCode} đã chuyển sang trạng thái ending. Client sẽ chạy End Game cinematic trước khi finalize.`;

        break;
      }
    }
  } catch (error) {
    console.error(
      "[DEVELOPER EMERGENCY ERROR]",
      error
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500
    );
  }
}