import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import {
  createClient,
} from "@supabase/supabase-js";

const supabase =
  createClient(
    process.env
      .NEXT_PUBLIC_SUPABASE_URL!,

    process.env
      .SUPABASE_SERVICE_ROLE_KEY!
  );

function hashToken(
  token: string
) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      code: string;
      playerId: string;
    }>;
  }
) {
  try {
    const {
      code,
      playerId,
    } = await params;

    /* =====================================================
       DEVELOPER SESSION
       ===================================================== */

    const developerToken =
      request.headers
        .get(
          "x-developer-session"
        )
        ?.trim() ?? "";

    if (!developerToken) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing Developer Session",
        },
        {
          status: 401,
        }
      );
    }

    const tokenHash =
      hashToken(
        developerToken
      );

    const {
      data:
        developerSession,
      error:
        sessionError,
    } = await supabase
      .from(
        "developer_sessions"
      )
      .select(
        "id, player_id, expires_at"
      )
      .eq(
        "token_hash",
        tokenHash
      )
      .maybeSingle();

    if (
      sessionError ||
      !developerSession
    ) {
      console.error(
        "Developer session error:",
        sessionError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid Developer Session",
        },
        {
          status: 403,
        }
      );
    }

    if (
      !developerSession.expires_at ||
      new Date(
        developerSession.expires_at
      ).getTime() <=
        Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Developer Session expired",
        },
        {
          status: 403,
        }
      );
    }

    /* =====================================================
       ROOM CODE
       ===================================================== */

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid room code",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       ROOM
       ===================================================== */

    const {
      data: room,
      error:
        roomError,
    } = await supabase
      .from("rooms")
      .select(
        "id, code, host_name, status"
      )
      .eq(
        "code",
        code
      )
      .maybeSingle();

    if (
      roomError ||
      !room
    ) {
      console.error(
        "Room error:",
        roomError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Room not found",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       PLAYER
       ===================================================== */

    const {
      data: player,
      error:
        playerError,
    } = await supabase
      .from(
        "room_players"
      )
      .select(
        `
          id,
          player_name,
          role,
          moderation_status,
          moderation_reason,
          moderated_at,
          is_connected
        `
      )
      .eq(
        "id",
        playerId
      )
      .eq(
        "room_id",
        room.id
      )
      .maybeSingle();

    if (
      playerError ||
      !player
    ) {
      console.error(
        "Player error:",
        playerError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Player not found",
        },
        {
          status: 404
        }
      );
    }

    /* =====================================================
       SELF MODERATION
       ===================================================== */

    if (
      developerSession.player_id &&
      developerSession.player_id ===
        playerId
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cannot moderate your own Developer player",
        },
        {
          status: 400
        }
      );
    }

    /* =====================================================
       ALREADY KICKED
       ===================================================== */

    if (
      player.moderation_status ===
      "kicked"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Player is already kicked",
        },
        {
          status: 409
        }
      );
    }

    if (
      player.moderation_status ===
      "banned"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Player is already banned",
        },
        {
          status: 409
        }
      );
    }

    /* =====================================================
       REASON
       ===================================================== */

    let body: {
      reason?: string;
    } = {};

    try {
      body =
        await request.json();
    } catch {
      /*
       * Reason optional.
       */
    }

    const reason =
      typeof body.reason ===
        "string" &&
      body.reason.trim()
        ? body.reason.trim()
        : "Kicked by Developer";

    /* =====================================================
       KICK PLAYER
       ===================================================== */

    const {
      data:
        updatedPlayer,
      error:
        updateError,
    } = await supabase
      .from(
        "room_players"
      )
      .update({
        moderation_status:
          "kicked",

        moderation_reason:
          reason,

        moderated_at:
          new Date().toISOString(),

        is_connected:
          false,

        /*
         * Invalidate old player token.
         */
        player_token:
          crypto.randomUUID(),
      })
      .eq(
        "id",
        playerId
      )
      .eq(
        "room_id",
        room.id
      )
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
          moderated_at,
          is_connected
        `
      )
      .single();

    if (updateError) {
      console.error(
        "Kick update error:",
        updateError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to kick player",
          details:
            updateError.message,
        },
        {
          status: 500
        }
      );
    }

    /* =====================================================
       REMAINING ACTIVE PLAYERS
       ===================================================== */

    const {
      data:
        remainingPlayers,
      error:
        remainingPlayersError,
    } = await supabase
      .from(
        "room_players"
      )
      .select(
        `
          id,
          player_name,
          role,
          moderation_status,
          last_choice
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
      );

    if (
      remainingPlayersError
    ) {
      console.error(
        "Remaining player check error:",
        remainingPlayersError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Player kicked but failed to verify remaining players",
          details:
            remainingPlayersError.message,

          player:
            updatedPlayer,
        },
        {
          status: 500
        }
      );
    }

    const remainingActivePlayers =
      remainingPlayers?.length ??
      0;

    /* =====================================================
       EMPTY ROOM
       ===================================================== */

    if (
      remainingActivePlayers ===
      0
    ) {
      const {
        error:
          deleteRoomError,
      } = await supabase
        .from("rooms")
        .delete()
        .eq(
          "id",
          room.id
        );

      if (
        deleteRoomError
      ) {
        console.error(
          "Delete empty room error:",
          deleteRoomError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Player kicked but failed to delete empty room",
            details:
              deleteRoomError.message,

            player:
              updatedPlayer,
          },
          {
            status: 500
          }
        );
      }

      return NextResponse.json({
        success: true,

        action:
          "kick",

        roomDeleted:
          true,

        remainingActivePlayers:
          0,

        player:
          updatedPlayer,
      });
    }

    /* =====================================================
       ⭐ TRIGGER RESOLVE AFTER KICK
       ===================================================== */

    let resolveResult:
      | Record<string, unknown>
      | null = null;

    let resolveError:
      | string
      | null = null;

    /*
     * Chỉ cần trigger khi game đang playing.
     *
     * Nếu room chưa start thì không có
     * game session để resolve.
     */
    if (
      room.status ===
      "playing"
    ) {
      try {
        const resolveUrl =
          new URL(
            `/api/rooms/${code}/resolve`,
            request.url
          );

        const resolveResponse =
          await fetch(
            resolveUrl,
            {
              method:
                "POST",

              headers: {
                "x-developer-session":
                  developerToken,
              },

              cache:
                "no-store",
            }
          );

        const contentType =
          resolveResponse
            .headers
            .get(
              "content-type"
            ) ?? "";

        if (
          contentType.includes(
            "application/json"
          )
        ) {
          const data =
            await resolveResponse.json();

          resolveResult =
            data;

          /*
           * 409 "chưa đủ vote" không
           * phải Kick failure.
           *
           * Chỉ ghi nhận để debug.
           */
          if (
            !resolveResponse.ok &&
            resolveResponse.status !==
              409
          ) {
            resolveError =
              typeof data?.error ===
              "string"
                ? data.error
                : "Resolve failed";
          }
        } else {
          resolveError =
            "Resolve returned a non-JSON response";
        }
      } catch (
        resolveException
      ) {
        console.error(
          "Kick -> Resolve error:",
          resolveException
        );

        resolveError =
          resolveException instanceof
          Error
            ? resolveException.message
            : "Failed to trigger resolve";
      }
    }

    /* =====================================================
       NORMAL RESPONSE
       ===================================================== */

    return NextResponse.json({
      success: true,

      action:
        "kick",

      roomDeleted:
        false,

      remainingActivePlayers,

      player:
        updatedPlayer,

      /*
       * Cho dashboard/debugging.
       */
      resolve:
        resolveResult,

      resolveError,
    });
  } catch (
    error
  ) {
    console.error(
      "Kick API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Internal server error",
      },
      {
        status: 500
      }
    );
  }
}