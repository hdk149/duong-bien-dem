import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { closeShop } from "@/lib/game/shop";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !supabaseUrl ||
  !serviceRoleKey
) {
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

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { code } =
      await context.params;

    const roomCode =
      String(
        code ?? ""
      ).trim();

    /* ===================================================
       1. VALIDATE ROOM CODE
       =================================================== */

    if (
      !/^\d{6}$/.test(
        roomCode
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Mã phòng không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    /* ===================================================
       2. PLAYER TOKEN
       =================================================== */

    const playerToken =
      request.headers
        .get(
          "x-player-token"
        )
        ?.trim() ?? "";

    if (!playerToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Thiếu player token.",
        },
        {
          status: 401,
        }
      );
    }

    /* ===================================================
       3. FIND ROOM
       =================================================== */

    const {
      data: room,
      error: roomError,
    } = await supabase
      .from("rooms")
      .select(`
        id,
        code,
        status
      `)
      .eq(
        "code",
        roomCode
      )
      .maybeSingle();

    if (roomError) {
      console.error(
        "[SHOP CLOSE] room lookup error:",
        roomError
      );

      return NextResponse.json(
        {
          ok: false,
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
          ok: false,
          error:
            "Phòng không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    /* ===================================================
       4. AUTH PLAYER
       =================================================== */

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from("room_players")
      .select(`
        id,
        room_id,
        role,
        moderation_status
      `)
      .eq(
        "room_id",
        room.id
      )
      .eq(
        "player_token",
        playerToken
      )
      .maybeSingle();

    if (playerError) {
      console.error(
        "[SHOP CLOSE] player lookup error:",
        playerError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể xác thực người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Player token không hợp lệ.",
        },
        {
          status: 401,
        }
      );
    }

    /* ===================================================
       5. MODERATION
       =================================================== */

    if (
      player.moderation_status !==
      "active"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Bạn không còn là thành viên hoạt động của phòng.",
        },
        {
          status: 403,
        }
      );
    }

    /* ===================================================
       6. SPECTATOR CANNOT CLOSE SHOP
       =================================================== */

    if (
      player.role ===
      "spectator"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Khán giả không thể đóng Shop.",
        },
        {
          status: 403,
        }
      );
    }

    /* ===================================================
       7. CLOSE SHOP
       =================================================== */

    const result =
      await closeShop(
        supabase,
        room.id
      );

    /* ===================================================
       8. SHOP STILL OPEN
       =================================================== */

    if (
      !result.closed &&
      !result.alreadyClosed &&
      !result.expired
    ) {
      return NextResponse.json(
        {
          ok: false,

          closed: false,

          expired: false,

          error:
            "Shop vẫn còn thời gian.",

          session:
            result.session ?? null,

          shopSession:
            result.shopSession ?? null,

          serverNow:
            new Date().toISOString(),
        },
        {
          status: 409,
        }
      );
    }

    /* ===================================================
       9. ALREADY CLOSED
       =================================================== */

    if (
      result.alreadyClosed &&
      !result.closed
    ) {
      return NextResponse.json({
        ok: true,

        closed: false,

        alreadyClosed: true,

        session:
          result.session ?? null,

        shopSession:
          result.shopSession ?? null,

        serverNow:
          new Date().toISOString(),
      });
    }

    /* ===================================================
       10. SUCCESS
       =================================================== */

    return NextResponse.json({
      ok: true,

      closed: true,

      alreadyClosed: false,

      session:
        result.session ?? null,

      shopSession:
        result.shopSession ?? null,

      serverNow:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "[SHOP CLOSE] unexpected error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}