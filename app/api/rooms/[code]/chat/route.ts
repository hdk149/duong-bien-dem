import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
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

/* =========================================================
   GET — LẤY LỊCH SỬ CHAT
   ========================================================= */

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { code } = await context.params;

    const playerToken =
      request.headers.get("x-player-token")?.trim();

    if (!playerToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing player token",
        },
        { status: 401 }
      );
    }

    /* -----------------------------------------------------
       ROOM
       ----------------------------------------------------- */

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select("id, code, status")
        .eq("code", code)
        .maybeSingle();

    if (roomError) {
      console.error("[CHAT][GET] room error:", roomError);

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to load room",
        },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          ok: false,
          error: "Room not found",
        },
        { status: 404 }
      );
    }

    /* -----------------------------------------------------
       PLAYER
       ----------------------------------------------------- */

    const { data: player, error: playerError } =
      await supabase
        .from("room_players")
        .select(
          "id, player_name, role, moderation_status"
        )
        .eq("room_id", room.id)
        .eq("player_token", playerToken)
        .maybeSingle();

    if (playerError) {
      console.error(
        "[CHAT][GET] player error:",
        playerError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to authenticate player",
        },
        { status: 500 }
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid player token",
        },
        { status: 401 }
      );
    }

    /* -----------------------------------------------------
       MODERATION
       ----------------------------------------------------- */

    if (player.moderation_status !== "active") {
      return NextResponse.json(
        {
          ok: false,
          error: "Player is not active",
        },
        { status: 403 }
      );
    }

    /* -----------------------------------------------------
       ROLE
       ----------------------------------------------------- */

    const isPlayer =
      player.role === "host" ||
      player.role === "player";

    if (!isPlayer) {
      return NextResponse.json(
        {
          ok: false,
          error: "Spectators cannot use team chat",
        },
        { status: 403 }
      );
    }

    /* -----------------------------------------------------
       CHAT HISTORY
       ----------------------------------------------------- */

    const { data: messages, error: chatError } =
      await supabase
        .from("room_chat")
        .select(
          `
          id,
          room_id,
          player_id,
          player_name,
          message,
          created_at
          `
        )
        .eq("room_id", room.id)
        .order("created_at", {
          ascending: true,
        })
        .limit(100);

    if (chatError) {
      console.error(
        "[CHAT][GET] chat error:",
        chatError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to load chat",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      messages: messages ?? [],
    });
  } catch (error) {
    console.error("[CHAT][GET] unexpected error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST — GỬI TIN NHẮN
   ========================================================= */

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { code } = await context.params;

    const playerToken =
      request.headers.get("x-player-token")?.trim();

    if (!playerToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing player token",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const message =
      typeof body?.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return NextResponse.json(
        {
          ok: false,
          error: "Message is required",
        },
        { status: 400 }
      );
    }

    if (message.length > 300) {
      return NextResponse.json(
        {
          ok: false,
          error: "Message must be 300 characters or less",
        },
        { status: 400 }
      );
    }

    /* -----------------------------------------------------
       ROOM
       ----------------------------------------------------- */

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select("id, code, status")
        .eq("code", code)
        .maybeSingle();

    if (roomError) {
      console.error("[CHAT][POST] room error:", roomError);

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to load room",
        },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          ok: false,
          error: "Room not found",
        },
        { status: 404 }
      );
    }

    if (room.status !== "playing") {
      return NextResponse.json(
        {
          ok: false,
          error: "Chat is only available while the game is playing",
        },
        { status: 409 }
      );
    }

    /* -----------------------------------------------------
       PLAYER
       ----------------------------------------------------- */

    const { data: player, error: playerError } =
      await supabase
        .from("room_players")
        .select(
          `
          id,
          player_name,
          role,
          moderation_status
          `
        )
        .eq("room_id", room.id)
        .eq("player_token", playerToken)
        .maybeSingle();

    if (playerError) {
      console.error(
        "[CHAT][POST] player error:",
        playerError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Failed to authenticate player",
        },
        { status: 500 }
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid player token",
        },
        { status: 401 }
      );
    }

    /* -----------------------------------------------------
       MODERATION
       ----------------------------------------------------- */

    if (player.moderation_status !== "active") {
      return NextResponse.json(
        {
          ok: false,
          error: "Player is not active",
        },
        { status: 403 }
      );
    }

    /* -----------------------------------------------------
       ROLE
       ----------------------------------------------------- */

    const isPlayer =
      player.role === "host" ||
      player.role === "player";

    if (!isPlayer) {
      return NextResponse.json(
        {
          ok: false,
          error: "Spectators cannot send messages",
        },
        { status: 403 }
      );
    }

    /* -----------------------------------------------------
       INSERT
       ----------------------------------------------------- */

    const { data: insertedMessage, error: insertError } =
      await supabase
        .from("room_chat")
        .insert({
          room_id: room.id,
          player_id: player.id,
          player_name: player.player_name,
          message,
        })
        .select(
          `
          id,
          room_id,
          player_id,
          player_name,
          message,
          created_at
          `
        )
        .single();

    if (insertError) {
  console.error(
    "[CHAT][POST] insert error:",
    insertError
  );

  return NextResponse.json(
    {
      ok: false,
      error: "Failed to send message",
      details: insertError.message,
      code: insertError.code,
      hint: insertError.hint,
      details_raw: insertError.details,
    },
    { status: 500 }
  );
}

    return NextResponse.json(
      {
        ok: true,
        message: insertedMessage,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "[CHAT][POST] unexpected error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}