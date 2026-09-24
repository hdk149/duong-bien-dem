import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  createSideQuest,
  getActiveSideQuest,
} from "@/lib/game/side-quest";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
);

type QuestChoice = {
  id: string;
  text: string;
};

function getQuestTemplate(item: {
  name?: string | null;
  name_en?: string | null;
  category?: string | null;
}) {
  const text = `${item.name ?? ""} ${item.name_en ?? ""} ${
    item.category ?? ""
  }`.toLowerCase();

  if (
    text.includes("repair") ||
    text.includes("tool") ||
    text.includes("sửa")
  ) {
    return {
      title: "Một chiếc xe bỏ lại",
      title_en: "An Abandoned Vehicle",
      description:
        "Trên đường đi, bạn phát hiện một chiếc xe cũ bị bỏ lại. Có vẻ nó vẫn còn khả năng hoạt động.",
      description_en:
        "On the road, you find an abandoned vehicle that might still be usable.",
      choices: [
        { id: "repair", text: "Dùng dụng cụ để sửa thử" },
        { id: "search", text: "Kiểm tra chiếc xe trước" },
        { id: "leave", text: "Bỏ qua và tiếp tục đi" },
      ],
    };
  }

  if (
    text.includes("med") ||
    text.includes("heal") ||
    text.includes("thuốc") ||
    text.includes("y tế")
  ) {
    return {
      title: "Người bị thương bên đường",
      title_en: "The Injured Stranger",
      description:
        "Bạn gặp một người bị thương đang cần giúp đỡ.",
      description_en:
        "You encounter an injured stranger who needs help.",
      choices: [
        { id: "help", text: "Giúp người đó" },
        { id: "inspect", text: "Kiểm tra tình hình trước" },
        { id: "leave", text: "Rời đi" },
      ],
    };
  }

  if (
    text.includes("map") ||
    text.includes("bản đồ")
  ) {
    return {
      title: "Con đường không có trên bản đồ",
      title_en: "A Road Missing From The Map",
      description:
        "Một con đường cũ xuất hiện trên bản đồ nhưng không có trên bất kỳ biển chỉ dẫn nào.",
      description_en:
        "An old road appears on the map, but there are no signs pointing toward it.",
      choices: [
        { id: "explore", text: "Đi theo con đường" },
        { id: "observe", text: "Quan sát khu vực" },
        { id: "leave", text: "Không mạo hiểm" },
      ],
    };
  }

  if (
    text.includes("phone") ||
    text.includes("điện thoại")
  ) {
    return {
      title: "Cuộc gọi lạ",
      title_en: "The Strange Call",
      description:
        "Chiếc điện thoại cũ bất ngờ nhận được một cuộc gọi từ một số không được lưu.",
      description_en:
        "An old phone suddenly receives a call from an unknown number.",
      choices: [
        { id: "answer", text: "Nghe máy" },
        { id: "trace", text: "Kiểm tra số gọi đến" },
        { id: "ignore", text: "Không nghe" },
      ],
    };
  }

  if (
    text.includes("key") ||
    text.includes("chìa khóa")
  ) {
    return {
      title: "Chiếc chìa khóa kỳ lạ",
      title_en: "The Strange Key",
      description:
        "Bạn tìm thấy một chiếc chìa khóa cũ với ký hiệu mà bạn chưa từng thấy.",
      description_en:
        "You find an old key marked with a symbol you do not recognize.",
      choices: [
        {
          id: "search",
          text: "Tìm nơi chiếc chìa khóa có thể mở",
        },
        { id: "inspect", text: "Nghiên cứu ký hiệu" },
        { id: "discard", text: "Bỏ lại" },
      ],
    };
  }

  return {
    title: "Một cơ hội bất ngờ",
    title_en: "An Unexpected Opportunity",
    description:
      "Một tình huống bất ngờ xuất hiện trên đường đi của bạn.",
    description_en:
      "An unexpected situation appears along your journey.",
    choices: [
      { id: "accept", text: "Thử cơ hội này" },
      { id: "observe", text: "Quan sát trước" },
      { id: "leave", text: "Bỏ qua" },
    ],
  };
}

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ code: string }>;
  },
) {
  try {
    const { code } = await params;

    const token = req.headers.get("x-player-token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing player token" },
        { status: 401 },
      );
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, code, status")
      .eq("code", code)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: "Room not found" },
        { status: 404 },
      );
    }

    if (room.status !== "playing") {
      return NextResponse.json(
        {
          error:
            "Side quest can only start while the game is playing",
        },
        { status: 400 },
      );
    }

    const { data: player, error: playerError } =
      await supabase
        .from("room_players")
        .select(
          "id, player_name, role, moderation_status",
        )
        .eq("room_id", room.id)
        .eq("player_token", token)
        .single();

    if (playerError || !player) {
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404 },
      );
    }

    if (
      player.role === "spectator" ||
      player.moderation_status !== "active"
    ) {
      return NextResponse.json(
        {
          error:
            "Player is not allowed to use side quests",
        },
        { status: 403 },
      );
    }

    const existingQuest = await getActiveSideQuest(
      supabase,
      room.id,
      player.id,
    );

    if (existingQuest) {
      return NextResponse.json(
        {
          error: "You already have an active side quest",
          sideQuest: existingQuest,
        },
        { status: 409 },
      );
    }

    const body = await req.json();
    const itemId = body?.itemId;

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json(
        { error: "Missing itemId" },
        { status: 400 },
      );
    }

    const { data: item, error: itemError } =
      await supabase
        .from("item_definitions")
        .select(
          "id, name, name_en, description, description_en, category, icon",
        )
        .eq("id", itemId)
        .single();

    if (itemError || !item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 },
      );
    }

    const {
      data: inventoryItem,
      error: inventoryError,
    } = await supabase
      .from("player_inventory")
      .select("id, quantity")
      .eq("room_id", room.id)
      .eq("player_id", player.id)
      .eq("item_id", itemId)
      .maybeSingle();

    if (
      inventoryError ||
      !inventoryItem ||
      inventoryItem.quantity <= 0
    ) {
      return NextResponse.json(
        { error: "Item is not in your inventory" },
        { status: 400 },
      );
    }

    const template = getQuestTemplate(item);

    const sideQuest = await createSideQuest(
  supabase,
  {
    roomId: room.id,
    playerId: player.id,
    itemId: item.id,
    title: template.title,
    titleEn: template.title_en,
    description: template.description,
    descriptionEn: template.description_en,
    choices: template.choices,
  },
);

    return NextResponse.json({
      ok: true,
      sideQuest,
    });
  } catch (error) {
    console.error(
      "SIDE_QUEST_USE_ERROR",
      error,
    );

    return NextResponse.json(
      {
        error: "Failed to create side quest",
      },
      { status: 500 },
    );
  }
}