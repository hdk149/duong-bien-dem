import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    "Missing Supabase environment variables."
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function hashToken(token: string) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function GET(
  request: NextRequest
) {
  try {
    // ==========================================
    // 1. GET DEVELOPER SESSION
    // ==========================================

    const developerToken =
      request.headers
        .get("x-developer-session")
        ?.trim() || "";

    if (!developerToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Developer session required.",
        },
        { status: 401 }
      );
    }

    // ==========================================
    // 2. VALIDATE DEVELOPER SESSION
    // ==========================================

    const tokenHash =
      hashToken(developerToken);

    const {
      data: session,
      error: sessionError,
    } = await supabase
      .from("developer_sessions")
      .select(
        "id, player_id, expires_at"
      )
      .eq(
        "token_hash",
        tokenHash
      )
      .gt(
        "expires_at",
        new Date().toISOString()
      )
      .maybeSingle();

    if (sessionError) {
      console.error(
        "[DEVELOPER CONTROL] Session error:",
        sessionError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to validate developer session.",
        },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid or expired developer session.",
        },
        { status: 401 }
      );
    }

    // ==========================================
    // 3. LOAD ROOMS
    // ==========================================
    //
    // We intentionally load the rooms first,
    // then determine which ones are actually
    // active based on room_players.
    //
    // A room row can remain in `rooms` even
    // after the actual game has been dissolved.
    //
    // Therefore:
    //
    // room exists
    //       +
    // active host/player exists
    //       =
    // active room
    //
    // ==========================================

    const {
      data: rooms,
      error: roomsError,
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
          created_at
        `
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (roomsError) {
      console.error(
        "[DEVELOPER CONTROL] Rooms error:",
        roomsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to load rooms.",
        },
        { status: 500 }
      );
    }

    const safeRooms =
      Array.isArray(rooms)
        ? rooms
        : [];

    // ==========================================
    // 4. NO ROOMS
    // ==========================================

    if (safeRooms.length === 0) {
      return NextResponse.json(
        {
          success: true,

          developer: {
            verified: true,
            type: "global",
            sessionId:
              session.id,
            playerId:
              session.player_id,
            expiresAt:
              session.expires_at,
          },

          rooms: [],
        },
        {
          status: 200,
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        }
      );
    }

    // ==========================================
    // 5. GET ROOM IDS
    // ==========================================

    const roomIds =
      safeRooms.map(
        (room) => room.id
      );

    // ==========================================
    // 6. LOAD ACTIVE PLAYERS
    // ==========================================
    //
    // IMPORTANT:
    //
    // Only host/player count as real
    // participants.
    //
    // Spectators are excluded.
    //
    // Kicked/banned players are excluded.
    //
    // This is what allows us to detect
    // previously dissolved rooms.
    //
    // ==========================================

    const {
      data: activePlayers,
      error:
        activePlayersError,
    } = await supabase
      .from("room_players")
      .select(
        `
          room_id,
          role,
          moderation_status
        `
      )
      .in(
        "room_id",
        roomIds
      )
      .in(
        "role",
        ["host", "player"]
      )
      .eq(
        "moderation_status",
        "active"
      );

    if (activePlayersError) {
      console.error(
        "[DEVELOPER CONTROL] Active players error:",
        activePlayersError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to determine active rooms.",
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 7. COUNT ACTIVE PLAYERS PER ROOM
    // ==========================================

    const playerCounts: Record<
      string,
      number
    > = {};

    for (const player of
      activePlayers || []) {
      if (
        !player.room_id
      ) {
        continue;
      }

      playerCounts[
        player.room_id
      ] =
        (playerCounts[
          player.room_id
        ] || 0) + 1;
    }

    // ==========================================
    // 8. FILTER DISSOLVED ROOMS
    // ==========================================
    //
    // A room is considered active only when
    // at least one real active participant
    // remains.
    //
    // Therefore old/stale rooms with:
    //
    //   0 active host/player
    //
    // are removed from the Control Center
    // response.
    //
    // ==========================================

    const activeRooms =
      safeRooms.filter(
        (room) =>
          (playerCounts[
            room.id
          ] || 0) > 0
      );

    // ==========================================
    // 9. SAFE RESPONSE
    // ==========================================

    const result =
      activeRooms.map(
        (room) => ({
          id: room.id,
          code: room.code,
          host_name:
            room.host_name,
          max_players:
            room.max_players,
          status: room.status,
          starting_money:
            room.starting_money,
          goal_money:
            room.goal_money,
          starting_location:
            room.starting_location,
          dice_system:
            room.dice_system,
          player_count:
            playerCounts[
              room.id
            ] || 0,
          created_at:
            room.created_at,
        })
      );

    return NextResponse.json(
      {
        success: true,

        developer: {
          verified: true,
          type: "global",
          sessionId:
            session.id,
          playerId:
            session.player_id,
          expiresAt:
            session.expires_at,
        },

        rooms: result,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "[DEVELOPER CONTROL] Unexpected error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Internal server error.",
      },
      { status: 500 }
    );
  }
}