import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getSideQuest,
  selectSideQuestChoice,
  resolveSideQuest,
} from "@/lib/game/side-quest";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
);

type RouteContext = {
  params: Promise<{ code: string }>;
};

function errorResponse(
  message: string,
  status = 400,
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    { status },
  );
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { code } = await context.params;

    const normalizedCode = code?.trim();

    if (
      !normalizedCode ||
      !/^\d{6}$/.test(normalizedCode)
    ) {
      return errorResponse(
        "Mã phòng không hợp lệ.",
        400,
      );
    }

    const playerToken =
      request.headers.get("x-player-token");

    if (!playerToken) {
      return errorResponse(
        "Thiếu player token.",
        401,
      );
    }

    const body = await request
      .json()
      .catch(() => null);

    const questId =
      typeof body?.questId === "string"
        ? body.questId.trim()
        : "";

    const choiceId =
      typeof body?.choiceId === "string"
        ? body.choiceId.trim()
        : "";

    if (!questId) {
      return errorResponse(
        "Thiếu questId.",
        400,
      );
    }

    if (!choiceId) {
      return errorResponse(
        "Thiếu choiceId.",
        400,
      );
    }

    // --------------------------------------------------
    // ROOM
    // --------------------------------------------------

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select("id, code, status")
        .eq("code", normalizedCode)
        .maybeSingle();

    if (roomError) {
      console.error(
        "side quest choose room error:",
        roomError,
      );

      return errorResponse(
        "Không thể kiểm tra phòng.",
        500,
      );
    }

    if (!room) {
      return errorResponse(
        "Không tìm thấy phòng.",
        404,
      );
    }

    // Side Quest phải thuộc một game đang chạy.
    if (room.status !== "playing") {
      return errorResponse(
        "Game hiện không ở trạng thái đang chơi.",
        409,
      );
    }

    // --------------------------------------------------
    // PLAYER
    // --------------------------------------------------

    const { data: player, error: playerError } =
      await supabase
        .from("room_players")
        .select(
          "id, player_name, role, moderation_status",
        )
        .eq("room_id", room.id)
        .eq("player_token", playerToken)
        .maybeSingle();

    if (playerError) {
      console.error(
        "side quest choose player error:",
        playerError,
      );

      return errorResponse(
        "Không thể xác thực người chơi.",
        500,
      );
    }

    if (!player) {
      return errorResponse(
        "Player token không hợp lệ.",
        401,
      );
    }

    if (
      !["host", "player"].includes(
        player.role,
      )
    ) {
      return errorResponse(
        "Spectator không thể chọn Side Quest.",
        403,
      );
    }

    if (
      player.moderation_status !== "active"
    ) {
      return errorResponse(
        "Người chơi hiện không hoạt động.",
        403,
      );
    }

    // --------------------------------------------------
    // QUEST
    // --------------------------------------------------

    const quest = await getSideQuest(
      supabase,
      questId,
    );

    if (!quest) {
      return errorResponse(
        "Không tìm thấy Side Quest.",
        404,
      );
    }

    if (quest.room_id !== room.id) {
      return errorResponse(
        "Side Quest không thuộc phòng này.",
        403,
      );
    }

    if (quest.player_id !== player.id) {
      return errorResponse(
        "Side Quest không thuộc người chơi này.",
        403,
      );
    }

    if (quest.status !== "choosing") {
      return errorResponse(
        "Side Quest này không còn chờ lựa chọn.",
        409,
      );
    }

    // --------------------------------------------------
    // VERIFY CHOICE
    // --------------------------------------------------

    const selectedChoice =
      quest.choices.find(
        (choice) =>
          choice.id === choiceId,
      );

    if (!selectedChoice) {
      return errorResponse(
        "Lựa chọn không hợp lệ.",
        400,
      );
    }

    // --------------------------------------------------
    // SELECT
    // choosing -> resolving
    // --------------------------------------------------

    await selectSideQuestChoice(
  supabase,
  quest.id,
  player.id,
  choiceId,
);

    // --------------------------------------------------
    // BUILD RESULT
    //
    // Item vẫn CHƯA bị consume ở bước này.
    // resolveSideQuest() mới consume item.
    // --------------------------------------------------

    let money = 0;
    let hp = 0;

    let message =
      "Bạn quyết định không can thiệp.";

    let message_en =
      "You decide not to intervene.";

    switch (choiceId) {
      // ------------------------------------------------
      // MEDICAL / POSITIVE ACTION
      // ------------------------------------------------

      case "help":
        money = 200_000;
        hp = -2;

        message =
          "Bạn giúp đỡ người gặp nạn. Họ cảm ơn và để lại cho bạn một khoản tiền.";

        message_en =
          "You help the person in trouble. They thank you and give you some money.";

        break;

      case "ask_reward":
        money = 250_000;
        hp = 0;

        message =
          "Bạn giúp đỡ nhưng yêu cầu một khoản thù lao. Cuối cùng, hai bên đạt được thỏa thuận.";

        message_en =
          "You help but ask for payment. In the end, you reach an agreement.";

        break;

      // ------------------------------------------------
      // REPAIR
      // ------------------------------------------------

      case "repair":
        money = 250_000;
        hp = 0;

        message =
          "Bạn sửa được chiếc xe. Chủ xe trả công cho bạn.";

        message_en =
          "You manage to repair the vehicle. The owner pays you for your help.";

        break;

      // ------------------------------------------------
      // COMMUNICATION
      // ------------------------------------------------

      case "answer":
        money = 100_000;
        hp = 0;

        message =
          "Bạn nghe máy. Cuộc gọi mang đến một thông tin có giá trị.";

        message_en =
          "You answer the call. The conversation gives you valuable information.";

        break;

      case "refuse":
        money = 0;
        hp = 0;

        message =
          "Bạn từ chối cuộc gọi và tiếp tục hành trình.";

        message_en =
          "You refuse the call and continue your journey.";

        break;

      // ------------------------------------------------
      // FOOD / SURVIVAL
      // ------------------------------------------------

      case "share":
        money = 150_000;
        hp = 0;

        message =
          "Bạn chia sẻ đồ ăn. Người lạ để lại cho bạn một khoản tiền nhỏ.";

        message_en =
          "You share your food. The stranger leaves you some money.";

        break;

      // ------------------------------------------------
      // TRAVEL / EXPLORATION
      // ------------------------------------------------

      case "follow":
        money = 150_000;
        hp = -3;

        message =
          "Bạn đi theo con đường lạ và tìm thấy một cơ hội bất ngờ, nhưng chuyến đi khá nguy hiểm.";

        message_en =
          "You follow the strange road and find an unexpected opportunity, but the journey is risky.";

        break;

      // ------------------------------------------------
      // INSPECTION
      // ------------------------------------------------

      case "inspect":
        money = 100_000;
        hp = 0;

        message =
          "Bạn kiểm tra kỹ tình hình và phát hiện một cơ hội nhỏ.";

        message_en =
          "You inspect the situation carefully and discover a small opportunity.";

        break;

      // ------------------------------------------------
      // IGNORE / LEAVE / KEEP
      // ------------------------------------------------

      case "leave":
        money = 0;
        hp = 0;

        message =
          "Bạn quyết định bỏ qua và tiếp tục hành trình.";

        message_en =
          "You decide to leave and continue your journey.";

        break;

      case "ignore":
        money = 0;
        hp = 0;

        message =
          "Bạn không can thiệp và tiếp tục cuộc hành trình.";

        message_en =
          "You decide not to intervene and continue your journey.";

        break;

      case "keep":
        money = 0;
        hp = 0;

        message =
          "Bạn giữ món đồ lại cho mình và tiếp tục hành trình.";

        message_en =
          "You keep the item for yourself and continue your journey.";

        break;

      // ------------------------------------------------
      // FALLBACK
      // ------------------------------------------------

      default:
        money = 0;
        hp = 0;

        message =
          "Bạn đã đưa ra lựa chọn của mình.";

        message_en =
          "You have made your choice.";

        break;
    }

    // --------------------------------------------------
    // RESOLVE
    //
    // IMPORTANT:
    // - Item consumed ONLY here.
    // - Player money / HP updated here.
    // - Main game state untouched.
    // - No round change.
    // - No vote.
    // - No current_event_id change.
    // --------------------------------------------------

    const resolvedQuest =
      await resolveSideQuest(
        supabase,
        quest.id,
        player.id,
        {
          money,
          hp,
          message,
          message_en,
        },
      );

    // --------------------------------------------------
    // RETURN UPDATED PLAYER
    // --------------------------------------------------

    const {
      data: updatedPlayer,
      error: updatedPlayerError,
    } = await supabase
      .from("room_players")
      .select(
        "id, player_name, hp, money, location, legal_risk",
      )
      .eq("id", player.id)
      .maybeSingle();

    if (updatedPlayerError) {
      console.error(
        "side quest updated player error:",
        updatedPlayerError,
      );
    }

    // --------------------------------------------------
    // RETURN UPDATED INVENTORY
    // --------------------------------------------------

    const {
      data: inventory,
      error: inventoryError,
    } = await supabase
      .from("player_inventory")
      .select(
        "id, item_id, quantity, acquired_at, updated_at",
      )
      .eq("player_id", player.id)
      .order("acquired_at", {
        ascending: false,
      });

    if (inventoryError) {
      console.error(
        "side quest inventory error:",
        inventoryError,
      );
    }

    // --------------------------------------------------
    // RESPONSE
    // --------------------------------------------------

    return NextResponse.json({
      ok: true,

      sideQuest: resolvedQuest,

      result: {
        money,
        hp,
        message,
        message_en,
      },

      player:
        updatedPlayer ?? null,

      inventory:
        inventory ?? [],
    });
  } catch (error) {
    console.error(
      "POST side quest choose error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Không thể xử lý Side Quest.",
      },
      { status: 500 },
    );
  }
}