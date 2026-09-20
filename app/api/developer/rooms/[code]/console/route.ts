import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

type CommandArgs = {
  command?: string;
};

type PlayerRow = {
  id: string;
  player_name: string;
  hp: number;
  money: number | string;
  location: string | null;
  role: string;
  is_connected: boolean;
  last_choice: string | null;
  moderation_status: string;
  moderation_reason: string | null;
  moderated_at: string | null;
};

type SessionRow = {
  id: string;
  room_id: string;
  session_number: number;
  status: string;
  round: number;
  phase: string;
  current_event_id: string | null;
  started_at: string | null;
  finished_at: string | null;
};

type GameStateRow = {
  id: string;
  room_id: string;
  session_id: string | null;
  round: number;
  phase: string;
  current_event_id: string | null;
  started_at: string | null;
  updated_at: string | null;
};

type EventRow = {
  id: string;
  room_id: string;
  session_id: string | null;
  round: number;
  title: string;
  description: string;
  event_type: string;
  choices: unknown;
  result: unknown;
  created_at: string | null;
};

const HELP = [
  "/help",
  "/room",
  "/players",
  "/state",
  "/session",
  "/resolve",
  "/next",
  "/event",
  "/dissolve",
  "/kick <player_id|player_name>",
  "/ban <player_id|player_name>",
];

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

function errorResponse(
  message: string,
  status: number
) {
  return json(
    {
      success: false,
      error: message,
    },
    status
  );
}

function hashToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function parseCommand(command: string) {
  return command
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
}

async function getDeveloperSession(
  request: NextRequest
) {
  const token =
    request.headers
      .get("x-developer-session")
      ?.trim();

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);

  const { data, error } = await supabase
    .from("developer_sessions")
    .select(
      `
        id,
        player_id,
        token_hash,
        expires_at
      `
    )
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

async function getRoom(code: string) {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    throw new Error("Không thể tải phòng.");
  }

  return data;
}

async function getActivePlayers(
  roomId: string
): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from("room_players")
    .select(
      `
        id,
        player_name,
        hp,
        money,
        location,
        role,
        is_connected,
        last_choice,
        moderation_status,
        moderation_reason,
        moderated_at
      `
    )
    .eq("room_id", roomId)
    .in("role", ["host", "player"])
    .eq("moderation_status", "active")
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      "Không thể tải danh sách người chơi."
    );
  }

  return (data ?? []) as PlayerRow[];
}

async function getLatestSession(
  roomId: string
): Promise<SessionRow | null> {
  const { data, error } = await supabase
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
        finished_at
      `
    )
    .eq("room_id", roomId)
    .eq("status", "active")
    .order("session_number", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Không thể tải game session."
    );
  }

  return data as SessionRow | null;
}

async function getGameState(
  roomId: string
): Promise<GameStateRow | null> {
  const { data, error } = await supabase
    .from("game_states")
    .select(
      `
        id,
        room_id,
        session_id,
        round,
        phase,
        current_event_id,
        started_at,
        updated_at
      `
    )
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Không thể tải game state."
    );
  }

  return data as GameStateRow | null;
}

async function getEvent(
  eventId: string | null
): Promise<EventRow | null> {
  if (!eventId) {
    return null;
  }

  const { data, error } = await supabase
    .from("game_events")
    .select(
      `
        id,
        room_id,
        session_id,
        round,
        title,
        description,
        event_type,
        choices,
        result,
        created_at
      `
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Không thể tải event hiện tại."
    );
  }

  return data as EventRow | null;
}

function publicPlayer(
  player: PlayerRow
) {
  return {
    id: player.id,
    name: player.player_name,
    hp: player.hp,
    money: player.money,
    location: player.location,
    role: player.role,
    connected: player.is_connected,
    lastChoice: player.last_choice,
    moderationStatus:
      player.moderation_status,
    moderationReason:
      player.moderation_reason,
    moderatedAt:
      player.moderated_at,
  };
}

async function runResolve(
  request: NextRequest,
  code: string
) {
  const origin =
    request.nextUrl.origin;

  const response = await fetch(
    `${origin}/api/rooms/${code}/resolve`,
    {
      method: "POST",
      headers: {
        "x-developer-session":
          request.headers.get(
            "x-developer-session"
          ) ?? "",
        "Content-Type":
          "application/json",
      },
      cache: "no-store",
    }
  );

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
  };
}

async function findPlayer(
  roomId: string,
  target: string
): Promise<PlayerRow | null> {
  const players =
    await getActivePlayers(roomId);

  const normalized =
    target.trim().toLowerCase();

  return (
    players.find(
      (player) =>
        player.id === target
    ) ??
    players.find(
      (player) =>
        player.player_name
          .toLowerCase() === normalized
    ) ??
    null
  );
}

async function moderatePlayer(
  request: NextRequest,
  code: string,
  action: "kick" | "ban",
  target: string,
  reason: string | null
) {
  const room =
    await getRoom(code);

  if (!room) {
    return errorResponse(
      "Không tìm thấy phòng.",
      404
    );
  }

  const player =
    await findPlayer(
      room.id,
      target
    );

  if (!player) {
    return errorResponse(
      "Không tìm thấy player đang active. Dùng /players để xem ID.",
      404
    );
  }

  const moderationStatus =
    action === "ban"
      ? "banned"
      : "kicked";

  const now =
    new Date().toISOString();

  const { data, error } =
    await supabase
      .from("room_players")
      .update({
        moderation_status:
          moderationStatus,
        moderation_reason:
          reason,
        moderated_at: now,
        is_connected: false,

        /*
         * Rotate token immediately so
         * the old client session cannot
         * continue using it.
         */
        player_token:
          crypto.randomUUID(),
      })
      .eq("id", player.id)
      .eq(
        "moderation_status",
        "active"
      )
      .select(
        `
          id,
          player_name,
          role,
          moderation_status,
          moderation_reason,
          moderated_at
        `
      )
      .maybeSingle();

  if (error) {
    console.error(
      "DEV CONSOLE MODERATION ERROR:",
      error
    );

    return errorResponse(
      "Không thể thực hiện moderation.",
      500
    );
  }

  if (!data) {
    return errorResponse(
      "Player đã bị moderation hoặc không còn active.",
      409
    );
  }

  const remaining =
    await getActivePlayers(
      room.id
    );

  /*
   * Same room lifecycle rule used
   * by the normal moderation APIs:
   * if nobody capable of playing remains,
   * dissolve the room.
   */
  if (remaining.length === 0) {
    await supabase
      .from("rooms")
      .delete()
      .eq("id", room.id);

    return json({
      success: true,
      command:
        `/${action}`,
      target: {
        id: data.id,
        name: data.player_name,
        role: data.role,
      },
      status: moderationStatus,
      roomDissolved: true,
      output: [
        `${action} ${data.player_name}`,
        "Không còn player active.",
        "Room đã được giải tán.",
      ],
    });
  }

  /*
   * If the game is currently playing,
   * attempt normal server-side resolve.
   *
   * A 409 is intentionally non-fatal because
   * it can simply mean there are not enough
   * votes yet.
   */
  let resolve: unknown = null;

  if (room.status === "playing") {
    try {
      const result =
        await runResolve(
          request,
          code
        );

      resolve = {
        status: result.status,
        data: result.data,
      };
    } catch (resolveError) {
      console.error(
        "DEV CONSOLE RESOLVE AFTER MODERATION:",
        resolveError
      );

      resolve = {
        error:
          "Không thể tự resolve sau moderation.",
      };
    }
  }

  return json({
    success: true,
    command: `/${action}`,
    target: {
      id: data.id,
      name: data.player_name,
      role: data.role,
    },
    status: moderationStatus,
    roomDissolved: false,
    remainingPlayers:
      remaining.length,
    resolve,
    output: [
      `${action} ${data.player_name}`,
      `Trạng thái: ${moderationStatus}`,
      `Còn ${remaining.length} player active.`,
    ],
  });
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      code: string;
    }>;
  }
) {
  try {
    const developerSession =
      await getDeveloperSession(
        request
      );

    if (!developerSession) {
      return errorResponse(
        "Developer session không hợp lệ hoặc đã hết hạn.",
        401
      );
    }

    const { code: rawCode } =
      await context.params;

    const code =
      String(rawCode ?? "").trim();

    if (!/^\d{6}$/.test(code)) {
      return errorResponse(
        "Mã phòng phải gồm đúng 6 chữ số.",
        400
      );
    }

    let body: CommandArgs;

    try {
      body =
        (await request.json()) as CommandArgs;
    } catch {
      return errorResponse(
        "Body JSON không hợp lệ.",
        400
      );
    }

    const rawCommand =
      typeof body.command === "string"
        ? body.command.trim()
        : "";

    if (!rawCommand) {
      return errorResponse(
        "Thiếu command.",
        400
      );
    }

    if (rawCommand.length > 500) {
      return errorResponse(
        "Command quá dài.",
        400
      );
    }

    const parts =
      parseCommand(rawCommand);

    const command =
      parts[0]?.toLowerCase() ?? "";

    const args =
      parts.slice(1);

    const room =
      await getRoom(code);

    if (!room) {
      return errorResponse(
        "Không tìm thấy phòng.",
        404
      );
    }

    /*
     * --------------------------------------------------
     * /help
     * --------------------------------------------------
     */
    if (command === "/help") {
      return json({
        success: true,
        command: "/help",
        room: {
          code: room.code,
          host_name:
            room.host_name,
          status: room.status,
        },
        output: HELP,
      });
    }

    /*
     * --------------------------------------------------
     * /room
     * --------------------------------------------------
     */
    if (command === "/room") {
      const [
        players,
        session,
        gameState,
      ] = await Promise.all([
        getActivePlayers(room.id),
        getLatestSession(room.id),
        getGameState(room.id),
      ]);

      return json({
        success: true,
        command: "/room",
        room: {
          id: room.id,
          code: room.code,
          host_name:
            room.host_name,
          status: room.status,
          max_players:
            room.max_players,
          starting_money:
            room.starting_money,
          goal_money:
            room.goal_money,
          starting_location:
            room.starting_location,
          dice_system:
            room.dice_system,
        },
        player_count:
          players.length,
        session:
          session
            ? {
                id: session.id,
                session_number:
                  session.session_number,
                status: session.status,
                round: session.round,
                phase: session.phase,
                current_event_id:
                  session.current_event_id,
              }
            : null,
        game_state:
          gameState
            ? {
                id: gameState.id,
                round:
                  gameState.round,
                phase:
                  gameState.phase,
                current_event_id:
                  gameState.current_event_id,
                session_id:
                  gameState.session_id,
              }
            : null,
      });
    }

    /*
     * --------------------------------------------------
     * /players
     * --------------------------------------------------
     */
    if (command === "/players") {
      const players =
        await getActivePlayers(
          room.id
        );

      return json({
        success: true,
        command: "/players",
        count: players.length,
        output:
          players.map(publicPlayer),
      });
    }

    /*
     * --------------------------------------------------
     * /state
     * --------------------------------------------------
     */
    if (command === "/state") {
      const [
        session,
        gameState,
      ] = await Promise.all([
        getLatestSession(room.id),
        getGameState(room.id),
      ]);

      const event =
        await getEvent(
          gameState?.current_event_id ??
            session?.current_event_id ??
            null
        );

      const players =
        await getActivePlayers(
          room.id
        );

      let chosenPlayers = 0;

      if (event) {
        const {
          data: choices,
          error,
        } = await supabase
          .from("player_choices")
          .select(
            `
              id,
              player_id,
              choice_id,
              event_id
            `
          )
          .eq(
            "event_id",
            event.id
          );

        if (error) {
          throw new Error(
            "Không thể tải player choices."
          );
        }

        const activeIds =
          new Set(
            players.map(
              (player) => player.id
            )
          );

        chosenPlayers =
          (choices ?? []).filter(
            (choice) =>
              activeIds.has(
                choice.player_id
              )
          ).length;
      }

      return json({
        success: true,
        command: "/state",
        roomStatus:
          room.status,
        session:
          session
            ? {
                id: session.id,
                round:
                  session.round,
                phase:
                  session.phase,
                currentEventId:
                  session.current_event_id,
              }
            : null,
        gameState,
        event: event
          ? {
              id: event.id,
              round: event.round,
              title: event.title,
              description:
                event.description,
              event_type:
                event.event_type,
              choices:
                event.choices,
              result:
                event.result,
            }
          : null,
        votes: {
          chosenPlayers,
          totalPlayers:
            players.length,
          allPlayersChosen:
            players.length > 0 &&
            chosenPlayers >=
              players.length,
        },
      });
    }

    /*
     * --------------------------------------------------
     * /session
     * --------------------------------------------------
     */
    if (command === "/session") {
      const session =
        await getLatestSession(
          room.id
        );

      if (!session) {
        return json({
          success: true,
          command: "/session",
          session: null,
          output: [
            "Không có active session.",
          ],
        });
      }

      return json({
        success: true,
        command: "/session",
        session,
      });
    }

    /*
     * --------------------------------------------------
     * /resolve
     *
     * Reuses the normal resolver endpoint.
     * --------------------------------------------------
     */
    if (command === "/resolve") {
      if (room.status !== "playing") {
        return errorResponse(
          "Room chưa ở trạng thái playing.",
          409
        );
      }

      const result =
        await runResolve(
          request,
          code
        );

      /*
       * 409 means the normal resolver
       * rejected the attempt, e.g. not enough
       * votes or already resolving.
       */
      if (
        result.status >= 400
      ) {
        return json(
          {
            success: false,
            command: "/resolve",
            status: result.status,
            error:
              typeof result.data ===
                "object" &&
              result.data !== null &&
              "error" in result.data
                ? (
                    result.data as {
                      error?: string;
                    }
                  ).error ??
                  "Resolve thất bại."
                : "Resolve thất bại.",
            upstream:
              result.data,
          },
          result.status
        );
      }

      return json({
        success: true,
        command: "/resolve",
        output: [
          "Đã gọi resolver chính của game.",
        ],
        result: result.data,
      });
    }

    /*
     * --------------------------------------------------
     * /dissolve
     * --------------------------------------------------
     */
    if (command === "/dissolve") {
      const { data, error } =
        await supabase
          .from("rooms")
          .delete()
          .eq("id", room.id)
          .select(
            "id, code, host_name"
          )
          .maybeSingle();

      if (error) {
        console.error(
          "DEV CONSOLE DISSOLVE ERROR:",
          error
        );

        return errorResponse(
          "Không thể giải tán room.",
          500
        );
      }

      if (!data) {
        return errorResponse(
          "Room không còn tồn tại.",
          404
        );
      }

      return json({
        success: true,
        command: "/dissolve",
        output: [
          `Room ${code} đã được giải tán.`,
        ],
        room: data,
      });
    }

    /*
     * --------------------------------------------------
     * /kick
     * /ban
     *
     * Syntax:
     * /kick player_id
     * /kick player_name
     *
     * Optional reason:
     * /kick player_id reason...
     * --------------------------------------------------
     */
    if (
      command === "/kick" ||
      command === "/ban"
    ) {
      if (!args[0]) {
        return errorResponse(
          `Thiếu player. Dùng ${command} <player_id|player_name> [reason]`,
          400
        );
      }

      const action =
        command === "/ban"
          ? "ban"
          : "kick";

      const target =
        args[0];

      const reason =
        args.length > 1
          ? args
              .slice(1)
              .join(" ")
              .slice(0, 500)
          : null;

      return await moderatePlayer(
        request,
        code,
        action,
        target,
        reason
      );
    }

    /*
     * --------------------------------------------------
     * /next
     *
     * We intentionally do NOT duplicate
     * event-generation logic here.
     *
     * Current project has dedicated Host
     * Next/Event APIs, but their exact
     * request contract is not part of the
     * current confirmed console contract.
     *
     * Return a useful diagnostic instead
     * of corrupting game state.
     * --------------------------------------------------
     */
    if (command === "/next") {
      const [
        session,
        gameState,
      ] = await Promise.all([
        getLatestSession(room.id),
        getGameState(room.id),
      ]);

      if (!session) {
        return errorResponse(
          "Không có active session.",
          409
        );
      }

      return json({
        success: false,
        command: "/next",
        error:
          "Lệnh /next chưa được nối vào Host Next flow. Chưa thay đổi state để tránh tạo round/event lệch resolver.",
        current: {
          session,
          gameState,
        },
      }, 501);
    }

    /*
     * --------------------------------------------------
     * /event
     *
     * Same reason as /next:
     * do not create an event with an ad-hoc
     * schema and bypass the existing engine.
     *
     * This keeps the console safe until the
     * confirmed Host Event contract is wired.
     * --------------------------------------------------
     */
    if (command === "/event") {
      return json({
        success: false,
        command: "/event",
        error:
          "Lệnh /event chưa được nối vào Host Event flow. Chưa ghi event trực tiếp để không bypass game engine.",
      }, 501);
    }

    /*
     * --------------------------------------------------
     * UNKNOWN
     * --------------------------------------------------
     */
    return json(
      {
        success: false,
        command: rawCommand,
        error:
          `Unknown command "${command}".`,
        output: HELP,
      },
      400
    );
  } catch (error) {
    console.error(
      "DEV CONSOLE ERROR:",
      error
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : "Lỗi máy chủ Dev Console.",
      500
    );
  }
}