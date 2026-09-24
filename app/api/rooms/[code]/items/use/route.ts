import { NextRequest, NextResponse } from "next/server";

import {
  executeItemUse,
} from "@/lib/game/items/item-service";

import type {
  ItemUseTarget,
} from "@/lib/game/items/types";

import { createClient } from "@supabase/supabase-js";

/* =========================================================
   SUPABASE
========================================================= */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL",
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY",
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
  },
);

/* =========================================================
   TYPES
========================================================= */

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

type UseItemBody = {
  itemId?: string;
  target?: ItemUseTarget | string;
  targetPlayerId?: string | null;
  round?: number;
  source?: string | null;
  referenceId?: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function jsonError(
  message: string,
  status = 400,
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    /* -----------------------------------------------------
       ROOM CODE
    ----------------------------------------------------- */

    const { code } = await context.params;

    const roomCode =
      code?.trim();

    if (!roomCode) {
      return jsonError(
        "Missing room code.",
        400,
      );
    }

    /* -----------------------------------------------------
       PLAYER TOKEN
    ----------------------------------------------------- */

    const playerToken =
      request.headers.get(
        "x-player-token",
      );

    if (!playerToken) {
      return jsonError(
        "Missing player token.",
        401,
      );
    }

    /* -----------------------------------------------------
       FIND ROOM
    ----------------------------------------------------- */

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select(
          `
            id,
            code,
            status
          `,
        )
        .eq("code", roomCode)
        .maybeSingle();

    if (roomError) {
      console.error(
        "Failed to get room:",
        roomError,
      );

      return jsonError(
        "Failed to load room.",
        500,
      );
    }

    if (!room) {
      return jsonError(
        "Room not found.",
        404,
      );
    }

    /* -----------------------------------------------------
       FIND PLAYER BY TOKEN
    ----------------------------------------------------- */

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from("room_players")
      .select(
        `
          id,
          room_id,
          player_name,
          role,
          player_token,
          moderation_status,
          is_connected
        `,
      )
      .eq("room_id", room.id)
      .eq("player_token", playerToken)
      .maybeSingle();

    if (playerError) {
      console.error(
        "Failed to get player:",
        playerError,
      );

      return jsonError(
        "Failed to verify player.",
        500,
      );
    }

    if (!player) {
      return jsonError(
        "Invalid player token.",
        401,
      );
    }

    /* -----------------------------------------------------
       PLAYER STATUS
    ----------------------------------------------------- */

    if (
      player.moderation_status &&
      player.moderation_status !==
        "active"
    ) {
      return jsonError(
        "Player is not active.",
        403,
      );
    }

    if (
      player.role ===
      "spectator"
    ) {
      return jsonError(
        "Spectators cannot use items.",
        403,
      );
    }

    /* -----------------------------------------------------
       ROOM STATUS
    ----------------------------------------------------- */

    if (
      room.status ===
      "ended"
    ) {
      return jsonError(
        "Game has already ended.",
        409,
      );
    }

    if (
      room.status ===
      "paused"
    ) {
      return jsonError(
        "Game is currently paused.",
        409,
      );
    }

    /* -----------------------------------------------------
       BODY
    ----------------------------------------------------- */

    let body: UseItemBody;

    try {
      body =
        (await request.json()) as UseItemBody;
    } catch {
      return jsonError(
        "Invalid JSON body.",
        400,
      );
    }

    const itemId =
      typeof body.itemId ===
      "string"
        ? body.itemId.trim()
        : "";

    const target =
      typeof body.target ===
      "string"
        ? body.target.trim()
        : "";

    if (!itemId) {
      return jsonError(
        "Missing itemId.",
        400,
      );
    }

    if (!target) {
      return jsonError(
        "Missing target.",
        400,
      );
    }

    /* -----------------------------------------------------
       TARGET VALIDATION
    ----------------------------------------------------- */

    if (
      target !== "self" &&
      target !== "player" &&
      target !== "sidequest"
    ) {
      return jsonError(
        `Invalid target "${target}".`,
        400,
      );
    }

    const itemTarget =
      target as ItemUseTarget;

    /* -----------------------------------------------------
       TARGET PLAYER
    ----------------------------------------------------- */

    let targetPlayerId:
      | string
      | undefined;

    if (
      itemTarget ===
      "player"
    ) {
      if (
        typeof body.targetPlayerId !==
          "string" ||
        !body.targetPlayerId.trim()
      ) {
        return jsonError(
          "targetPlayerId is required when using an item on another player.",
          400,
        );
      }

      targetPlayerId =
        body.targetPlayerId.trim();

      if (
        targetPlayerId ===
        player.id
      ) {
        return jsonError(
          "Cannot target yourself with the player target.",
          400,
        );
      }

      /* ---------------------------------------------------
         VERIFY TARGET PLAYER
      --------------------------------------------------- */

      const {
        data: targetPlayer,
        error:
          targetPlayerError,
      } = await supabase
        .from("room_players")
        .select(
          `
            id,
            room_id,
            role,
            moderation_status
          `,
        )
        .eq(
          "room_id",
          room.id,
        )
        .eq(
          "id",
          targetPlayerId,
        )
        .maybeSingle();

      if (
        targetPlayerError
      ) {
        console.error(
          "Failed to get target player:",
          targetPlayerError,
        );

        return jsonError(
          "Failed to verify target player.",
          500,
        );
      }

      if (!targetPlayer) {
        return jsonError(
          "Target player not found.",
          404,
        );
      }

      if (
        targetPlayer.role ===
        "spectator"
      ) {
        return jsonError(
          "Cannot use an item on a spectator.",
          400,
        );
      }

      if (
        targetPlayer.moderation_status &&
        targetPlayer.moderation_status !==
          "active"
      ) {
        return jsonError(
          "Target player is not active.",
          400,
        );
      }
    }

    /* -----------------------------------------------------
       ROUND
    ----------------------------------------------------- */

    let round:
      | number
      | undefined;

    if (
      body.round !== undefined
    ) {
      if (
        typeof body.round !==
          "number" ||
        !Number.isInteger(
          body.round,
        ) ||
        body.round < 0
      ) {
        return jsonError(
          "round must be a non-negative integer.",
          400,
        );
      }

      round = body.round;
    }

    /* -----------------------------------------------------
       EXECUTE ITEM
    ----------------------------------------------------- */

    const result =
      await executeItemUse({
        itemId,
        target: itemTarget,
        targetPlayerId,
        roomId: room.id,
        playerId: player.id,
        round,
        source:
          body.source ??
          "room_item_use",
        referenceId:
          body.referenceId ??
          null,
      });

    /* -----------------------------------------------------
       ENGINE FAILURE
    ----------------------------------------------------- */

    if (!result.success) {
      return NextResponse.json(
        result,
        { status: 400 },
      );
    }

    /* -----------------------------------------------------
       SUCCESS
    ----------------------------------------------------- */

    return NextResponse.json(
      {
        success: true,
        result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "Item use API error:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Failed to use item.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}