import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { addItem } from "@/lib/game/inventory";

const SHOP_DURATION_MS = 75_000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const body = await request.json().catch(() => null);

    const itemId =
      typeof body?.itemId === "string"
        ? body.itemId.trim()
        : "";

    const playerToken =
      request.headers
        .get("x-player-token")
        ?.trim() ?? "";

    // =========================================================
    // 1. BASIC VALIDATION
    // =========================================================

    if (!itemId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Thiếu itemId.",
        },
        { status: 400 }
      );
    }

    if (!playerToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Thiếu player token.",
        },
        { status: 401 }
      );
    }

    // =========================================================
    // 2. FIND ROOM
    // =========================================================

    const {
      data: room,
      error: roomError,
    } = await supabase
      .from("rooms")
      .select("id, code")
      .eq("code", code)
      .maybeSingle();

    if (roomError) {
      console.error(
        "[SHOP BUY] room lookup:",
        roomError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Không thể tìm phòng.",
        },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          ok: false,
          error: "Phòng không tồn tại.",
        },
        { status: 404 }
      );
    }

    // =========================================================
    // 3. FIND PLAYER
    // =========================================================

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from("room_players")
      .select(
        "id, room_id, role, player_token, money"
      )
      .eq("room_id", room.id)
      .eq("player_token", playerToken)
      .maybeSingle();

    if (playerError) {
      console.error(
        "[SHOP BUY] player lookup:",
        playerError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Không thể xác thực người chơi.",
        },
        { status: 500 }
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          ok: false,
          error: "Player token không hợp lệ.",
        },
        { status: 401 }
      );
    }

    // Spectator cannot buy
    if (player.role === "spectator") {
      return NextResponse.json(
        {
          ok: false,
          error: "Spectator không thể mua vật phẩm.",
        },
        { status: 403 }
      );
    }

    // =========================================================
    // 4. ACTIVE GAME SESSION
    // =========================================================

    const {
      data: session,
      error: sessionError,
    } = await supabase
      .from("game_sessions")
      .select(
        "id, room_id, round, phase, status"
      )
      .eq("room_id", room.id)
      .eq("status", "active")
      .maybeSingle();

    if (sessionError) {
      console.error(
        "[SHOP BUY] game session lookup:",
        sessionError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể kiểm tra trạng thái game.",
        },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: "Game chưa bắt đầu.",
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 5. SHOP MUST BE OPEN
    // =========================================================

    if (session.phase !== "shop") {
      return NextResponse.json(
        {
          ok: false,
          error: "Shop hiện không mở.",
          phase: session.phase,
          round: session.round,
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 6. SHOP SESSION
    // =========================================================

    const {
      data: shopSession,
      error: shopSessionError,
    } = await supabase
      .from("shop_sessions")
      .select(
        "id, room_id, round, started_at, expires_at"
      )
      .eq("room_id", room.id)
      .eq("round", session.round)
      .maybeSingle();

    if (shopSessionError) {
      console.error(
        "[SHOP BUY] shop session lookup:",
        shopSessionError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Không thể tìm phiên Shop.",
        },
        { status: 500 }
      );
    }

    if (!shopSession) {
      return NextResponse.json(
        {
          ok: false,
          error: "Phiên Shop chưa được tạo.",
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 7. CHECK SHOP TIMER
    // =========================================================

    const now = Date.now();

    const startedAt =
      new Date(
        shopSession.started_at
      ).getTime();

    const expiresAt =
      new Date(
        shopSession.expires_at
      ).getTime();

    if (
      !Number.isFinite(startedAt) ||
      !Number.isFinite(expiresAt)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Thời gian Shop không hợp lệ.",
        },
        { status: 500 }
      );
    }

    const calculatedExpiresAt =
      startedAt + SHOP_DURATION_MS;

    const actualExpiresAt = Math.min(
      expiresAt,
      calculatedExpiresAt
    );

    if (now >= actualExpiresAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "Shop đã hết thời gian.",
          expired: true,
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 8. ITEM DEFINITION
    // =========================================================

    const {
      data: item,
      error: itemError,
    } = await supabase
      .from("item_definitions")
      .select(
        "id, name, name_en, price, category, stackable"
      )
      .eq("id", itemId)
      .maybeSingle();

    if (itemError) {
      console.error(
        "[SHOP BUY] item lookup:",
        itemError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Không thể kiểm tra vật phẩm.",
        },
        { status: 500 }
      );
    }

    if (!item) {
      return NextResponse.json(
        {
          ok: false,
          error: "Vật phẩm không tồn tại.",
        },
        { status: 404 }
      );
    }

    // =========================================================
    // 9. CHECK STOCK EXISTS
    // =========================================================

    const {
      data: stock,
      error: stockError,
    } = await supabase
      .from("shop_stock")
      .select(
        "id, shop_session_id, item_id, initial_stock, remaining_stock"
      )
      .eq(
        "shop_session_id",
        shopSession.id
      )
      .eq("item_id", itemId)
      .maybeSingle();

    if (stockError) {
      console.error(
        "[SHOP BUY] stock lookup:",
        stockError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Không thể kiểm tra tồn kho.",
        },
        { status: 500 }
      );
    }

    if (!stock) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Vật phẩm này không có trong Shop hiện tại.",
        },
        { status: 409 }
      );
    }

    const remainingStock = Number(
      stock.remaining_stock ?? 0
    );

    if (
      !Number.isFinite(remainingStock) ||
      remainingStock <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Vật phẩm đã hết hàng.",
          remainingStock: 0,
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 10. PRICE
    // =========================================================

    const price = Number(
      item.price ?? 0
    );

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Giá vật phẩm không hợp lệ.",
        },
        { status: 500 }
      );
    }

    // =========================================================
    // 11. PRE-CHECK MONEY
    // =========================================================

    const money = Number(
      player.money ?? 0
    );

    if (!Number.isFinite(money)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Số tiền người chơi không hợp lệ.",
        },
        { status: 500 }
      );
    }

    if (money < price) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Bạn không đủ tiền để mua vật phẩm này.",
          price,
          money,
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 12. ATOMIC MONEY + STOCK PURCHASE
    // =========================================================

    const {
      data: purchaseResult,
      error: purchaseError,
    } = await supabase.rpc(
      "buy_shop_item",
      {
        p_room_id: room.id,
        p_player_id: player.id,
        p_shop_session_id:
          shopSession.id,
        p_item_id: item.id,
        p_price: price,
      }
    );

    if (purchaseError) {
      console.error(
        "[SHOP BUY] transaction failed:",
        purchaseError
      );

      const message =
        purchaseError.message ?? "";

      if (
        message.includes(
          "INSUFFICIENT_MONEY"
        )
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Bạn không đủ tiền để mua vật phẩm này.",
          },
          { status: 409 }
        );
      }

      if (
        message.includes(
          "OUT_OF_STOCK"
        )
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Vật phẩm vừa được người khác mua hết.",
            remainingStock: 0,
          },
          { status: 409 }
        );
      }

      if (
        message.includes(
          "ITEM_NOT_IN_SHOP"
        )
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Vật phẩm không còn trong Shop.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            "Không thể hoàn tất giao dịch.",
          details:
            purchaseError.message,
        },
        { status: 500 }
      );
    }

    const result =
      (purchaseResult ?? {}) as {
        success?: boolean;
        money?: number;
        remaining_stock?: number;
      };

    const newMoney = Number(
      result.money ?? money - price
    );

    const newRemainingStock =
      Number(
        result.remaining_stock ??
          remainingStock - 1
      );

    // =========================================================
    // 13. ADD ITEM TO PLAYER INVENTORY
    // =========================================================
    //
    // Money + stock đã được xử lý bởi PostgreSQL RPC.
    // Inventory service chịu trách nhiệm tạo/cộng item
    // và ghi purchase log.
    //
    // =========================================================

    let inventoryItem;

    try {
      inventoryItem = await addItem({
        roomId: room.id,
        playerId: player.id,
        itemId: item.id,
        quantity: 1,
        action: "purchase",
        source: "shop",
        referenceId: shopSession.id,
        metadata: {
          shop_session_id: shopSession.id,
          round: shopSession.round,
          price,
          shop_stock_id: stock.id,
        },
      });
    } catch (inventoryError) {
      console.error(
        "[SHOP BUY] inventory update failed:",
        inventoryError
      );

      /*
       * IMPORTANT:
       *
       * buy_shop_item đã commit tiền + stock trước đó.
       * Nếu inventory fail ở đây thì transaction PostgreSQL
       * không thể tự rollback.
       *
       * Vì vậy đây là lỗi hệ thống cần được log để xử lý,
       * không được giả vờ trả success.
       */
      return NextResponse.json(
        {
          ok: false,
          error:
            "Giao dịch đã trừ tiền nhưng không thể cập nhật túi đồ. Vui lòng báo Developer.",
          transactionCompleted: true,
          inventoryUpdated: false,
          details:
            inventoryError instanceof Error
              ? inventoryError.message
              : String(inventoryError),
        },
        { status: 500 }
      );
    }

    // =========================================================
    // 14. SUCCESS
    // =========================================================

    console.log(
      "[SHOP BUY] PURCHASE SUCCESS",
      {
        room: code,
        playerId: player.id,
        itemId: item.id,
        price,
        oldMoney: money,
        newMoney,
        oldStock: remainingStock,
        newStock: newRemainingStock,
        inventoryQuantity:
          inventoryItem.quantity,
      }
    );

    return NextResponse.json({
      ok: true,
      purchased: true,

      message:
        "Mua vật phẩm thành công.",

      player: {
        id: player.id,
        role: player.role,
        money: newMoney,
      },

      item: {
        id: item.id,
        name: item.name,
        nameEn: item.name_en,
        price,
        category: item.category,
        stackable: item.stackable,
      },

      inventory: {
        id: inventoryItem.id,
        itemId: inventoryItem.item_id,
        quantity: inventoryItem.quantity,
      },

      stock: {
        remainingStock:
          newRemainingStock,
      },

      shopSession: {
        id: shopSession.id,
        round: shopSession.round,
        startedAt:
          shopSession.started_at,
        expiresAt:
          new Date(
            actualExpiresAt
          ).toISOString(),
      },

      serverNow:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "[SHOP BUY] unexpected error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Lỗi máy chủ khi xử lý mua hàng.",
      },
      { status: 500 }
    );
  }
}