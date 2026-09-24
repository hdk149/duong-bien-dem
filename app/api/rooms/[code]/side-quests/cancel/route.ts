import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getSideQuest,
  logSideQuestAction,
} from "@/lib/game/side-quest";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
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

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ code: string }>;
  },
) {
  try {
    const { code } = await context.params;

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        {
          error: "Mã phòng không hợp lệ.",
        },
        { status: 400 },
      );
    }

    const playerToken =
      request.headers.get("x-player-token");

    if (!playerToken) {
      return NextResponse.json(
        {
          error: "Thiếu player token.",
        },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);

    const questId =
      typeof body?.questId === "string"
        ? body.questId
        : "";

    if (!questId) {
      return NextResponse.json(
        {
          error: "Thiếu questId.",
        },
        { status: 400 },
      );
    }

    // --------------------------------------------------
    // Find room
    // --------------------------------------------------

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select("id, code")
        .eq("code", code)
        .maybeSingle();

    if (roomError) {
      console.error(
        "Side Quest cancel room error:",
        roomError,
      );

      return NextResponse.json(
        {
          error: "Không thể kiểm tra phòng.",
        },
        { status: 500 },
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error: "Không tìm thấy phòng.",
        },
        { status: 404 },
      );
    }

    // --------------------------------------------------
    // Authenticate player
    // --------------------------------------------------

    const { data: player, error: playerError } =
      await supabase
        .from("room_players")
        .select(
          "id, player_name, role, moderation_status, is_connected",
        )
        .eq("room_id", room.id)
        .eq("player_token", playerToken)
        .maybeSingle();

    if (playerError) {
      console.error(
        "Side Quest cancel player error:",
        playerError,
      );

      return NextResponse.json(
        {
          error: "Không thể xác thực người chơi.",
        },
        { status: 500 },
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          error: "Player token không hợp lệ.",
        },
        { status: 401 },
      );
    }

    if (
      player.role !== "host" &&
      player.role !== "player"
    ) {
      return NextResponse.json(
        {
          error: "Spectator không thể hủy Side Quest.",
        },
        { status: 403 },
      );
    }

    if (player.moderation_status !== "active") {
      return NextResponse.json(
        {
          error: "Người chơi không còn hoạt động.",
        },
        { status: 403 },
      );
    }

    // --------------------------------------------------
    // Find quest
    // --------------------------------------------------

    const quest = await getSideQuest(
      supabase,
      questId,
    );

    if (!quest) {
      return NextResponse.json(
        {
          error: "Không tìm thấy Side Quest.",
        },
        { status: 404 },
      );
    }

    if (quest.room_id !== room.id) {
      return NextResponse.json(
        {
          error: "Side Quest không thuộc phòng này.",
        },
        { status: 403 },
      );
    }

    if (quest.player_id !== player.id) {
      return NextResponse.json(
        {
          error: "Side Quest không thuộc người chơi này.",
        },
        { status: 403 },
      );
    }

    if (quest.status !== "choosing") {
      return NextResponse.json(
        {
          error:
            "Side Quest này không thể hủy ở trạng thái hiện tại.",
        },
        { status: 409 },
      );
    }

    // --------------------------------------------------
    // Cancel quest
    // --------------------------------------------------

    const {
      data: cancelledQuest,
      error: updateError,
    } = await supabase
      .from("side_quests")
      .update({
        status: "cancelled",
      })
      .eq("id", quest.id)
      .eq("room_id", room.id)
      .eq("player_id", player.id)
      .eq("status", "choosing")
      .select("*")
      .maybeSingle();

    if (updateError) {
      console.error(
        "Side Quest cancel update error:",
        updateError,
      );

      return NextResponse.json(
        {
          error: "Không thể hủy Side Quest.",
        },
        { status: 500 },
      );
    }

    if (!cancelledQuest) {
      return NextResponse.json(
        {
          error:
            "Side Quest đã được xử lý hoặc không còn có thể hủy.",
        },
        { status: 409 },
      );
    }

    // --------------------------------------------------
    // Log
    // --------------------------------------------------

    await logSideQuestAction(
      supabase,
      {
        sideQuestId: quest.id,
        roomId: room.id,
        playerId: player.id,
        action: "cancelled",
        metadata: {
          item_id: quest.item_id,
          player_name: player.player_name,
        },
      },
    );

    return NextResponse.json({
      ok: true,
      sideQuest: cancelledQuest,
      cancelled: true,
    });
  } catch (error) {
    console.error(
      "Side Quest cancel unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error: "Đã xảy ra lỗi khi hủy Side Quest.",
      },
      { status: 500 },
    );
  }
}