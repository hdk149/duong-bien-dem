import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SHOP_DURATION_MS = 85_000;

// Số item tối đa xuất hiện trong một Shop session.
const MAX_SHOP_ITEMS = 8;

// Stock mặc định theo category.
// Đây là số lượng hàng trong Shop session,
// chưa phải giới hạn inventory của người chơi.
const STOCK_RANGE: Record<
  string,
  { min: number; max: number }
> = {
  weapons: { min: 1, max: 2 },
  armor: { min: 1, max: 2 },
  medical: { min: 1, max: 4 },
  tickets: { min: 1, max: 2 },
  special: { min: 1, max: 2 },
  tools: { min: 1, max: 3 },
};

type ItemDefinition = {
  id: string;
  category: string;
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  price: number;
  icon: string;
  stackable: boolean;
  spawn_weight: number;
};

function randomInt(min: number, max: number) {
  const safeMin = Math.max(0, Math.floor(min));
  const safeMax = Math.max(safeMin, Math.floor(max));

  return (
    Math.floor(
      Math.random() *
        (safeMax - safeMin + 1)
    ) + safeMin
  );
}

/**
 * Weighted random sampling without replacement.
 *
 * Item có spawn_weight cao sẽ có xác suất được chọn cao hơn.
 * Mỗi item chỉ xuất hiện tối đa một lần trong một Shop session.
 */
function pickWeightedItems(
  items: ItemDefinition[],
  maxItems: number
) {
  const available = items.filter(
    (item) => item.spawn_weight > 0
  );

  const selected: ItemDefinition[] = [];

  while (
    available.length > 0 &&
    selected.length < maxItems
  ) {
    const totalWeight =
      available.reduce(
        (sum, item) =>
          sum + item.spawn_weight,
        0
      );

    if (totalWeight <= 0) {
      break;
    }

    let random =
      Math.random() * totalWeight;

    let selectedIndex = -1;

    for (
      let i = 0;
      i < available.length;
      i++
    ) {
      random -=
        available[i].spawn_weight;

      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    if (selectedIndex === -1) {
      selectedIndex =
        available.length - 1;
    }

    const [picked] =
      available.splice(
        selectedIndex,
        1
      );

    selected.push(picked);
  }

  return selected;
}

function getStockRange(
  category: string
) {
  return (
    STOCK_RANGE[category] ?? {
      min: 1,
      max: 2,
    }
  );
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ code: string }>;
  }
) {
  try {
    const { code } =
      await context.params;

    if (!code) {
      return NextResponse.json(
        {
          error:
            "Missing room code",
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------
    // 0. Supabase server configuration
    // --------------------------------------------------

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabaseServiceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;

    console.log(
      "[SHOP API] service key exists:",
      Boolean(
        supabaseServiceRoleKey
      ),
      "length:",
      supabaseServiceRoleKey?.length ??
        0
    );

    if (
      !supabaseUrl ||
      !supabaseServiceRoleKey
    ) {
      console.error(
        "Missing Supabase server environment variables."
      );

      return NextResponse.json(
        {
          error:
            "Server configuration error",
        },
        {
          status: 500,
        }
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        supabaseServiceRoleKey,
        {
          auth: {
            autoRefreshToken:
              false,
            persistSession:
              false,
          },
        }
      );

    // --------------------------------------------------
    // 1. Find room
    // --------------------------------------------------

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
        "Failed to load room:",
        roomError
      );

      return NextResponse.json(
        {
          error:
            "Failed to load room",
          details:
            roomError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error:
            "Room not found",
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------
    // 2. Get current active game session
    // --------------------------------------------------

    const {
      data: session,
      error: sessionError,
    } = await supabase
      .from("game_sessions")
      .select(
        "id, room_id, status, round, phase, current_event_id"
      )
      .eq(
        "room_id",
        room.id
      )
      .eq(
        "status",
        "active"
      )
      .maybeSingle();

    if (sessionError) {
      console.error(
        "Failed to load game session:",
        sessionError
      );

      return NextResponse.json(
        {
          error:
            "Failed to load game session",
          details:
            sessionError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Active game session not found",
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------
    // 3. Make sure current phase is Shop
    // --------------------------------------------------

    if (
      session.phase !==
      "shop"
    ) {
      return NextResponse.json(
        {
          error:
            "Shop is not active",
          phase:
            session.phase,
          round:
            session.round,
        },
        {
          status: 409,
        }
      );
    }

    const round =
      Number(session.round);

    if (
      !Number.isInteger(
        round
      ) ||
      round <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid game round",
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------
    // 4. Check whether Shop session already exists
    // --------------------------------------------------

    const {
      data:
        existingShopSession,
      error:
        existingSessionError,
    } = await supabase
      .from("shop_sessions")
      .select(
        "id, room_id, round, started_at, expires_at"
      )
      .eq(
        "room_id",
        room.id
      )
      .eq(
        "round",
        round
      )
      .maybeSingle();

    if (
      existingSessionError
    ) {
      console.error(
        "Failed to check existing Shop session:",
        existingSessionError
      );

      return NextResponse.json(
        {
          error:
            "Failed to check Shop session",
          details:
            existingSessionError.message,
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------
    // 5. Existing Shop session
    // --------------------------------------------------

    if (
      existingShopSession
    ) {
      const {
        data: existingStock,
        error:
          existingStockError,
      } = await supabase
        .from("shop_stock")
        .select(
          "id, shop_session_id, item_id, initial_stock, remaining_stock"
        )
        .eq(
          "shop_session_id",
          existingShopSession.id
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

      if (
        existingStockError
      ) {
        console.error(
          "Failed to load existing Shop stock:",
          existingStockError
        );

        return NextResponse.json(
          {
            error:
              "Failed to load Shop stock",
            details:
              existingStockError.message,
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        ok: true,
        created: false,
        session:
          existingShopSession,
        stock:
          existingStock ?? [],
        serverNow:
          new Date().toISOString(),
      });
    }

    // --------------------------------------------------
    // 6. Load item definitions
    // --------------------------------------------------

    const {
      data: items,
      error: itemsError,
    } = await supabase
      .from(
        "item_definitions"
      )
      .select(
        [
          "id",
          "category",
          "name",
          "name_en",
          "description",
          "description_en",
          "price",
          "icon",
          "stackable",
          "spawn_weight",
        ].join(", ")
      )
      .gt(
        "spawn_weight",
        0
      );

    if (itemsError) {
      console.error(
        "Failed to load item definitions:",
        itemsError
      );

      return NextResponse.json(
        {
          error:
            "Failed to load item definitions",
          details:
            itemsError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (
      !items ||
      items.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No shop items with positive spawn weight were found",
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------
    // 7. Pick random items using spawn_weight
    // --------------------------------------------------

    const itemDefinitions:
      ItemDefinition[] =
      (items ??
        []) as unknown as ItemDefinition[];

    const selectedItems =
      pickWeightedItems(
        itemDefinitions,
        Math.min(
          MAX_SHOP_ITEMS,
          itemDefinitions.length
        )
      );

    if (
      selectedItems.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "Failed to generate Shop stock",
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------
    // 8. Create Shop session
    // --------------------------------------------------

    /*
     * QUAN TRỌNG:
     *
     * startedAt được tạo NGAY TẠI LÚC API NÀY ĐƯỢC GỌI.
     *
     * Vì vậy timer 85 giây chỉ bắt đầu khi client
     * thực sự gọi endpoint này.
     */

    const startedAt =
      new Date();

    const expiresAt =
      new Date(
        startedAt.getTime() +
          SHOP_DURATION_MS
      );

    const {
      data:
        newShopSession,
      error:
        createSessionError,
    } = await supabase
      .from("shop_sessions")
      .insert({
        room_id:
          room.id,
        round,
        started_at:
          startedAt.toISOString(),
        expires_at:
          expiresAt.toISOString(),
      })
      .select(
        "id, room_id, round, started_at, expires_at"
      )
      .single();

    if (
      createSessionError
    ) {
      // Another request may have created the session
      // at the same time.
      if (
        createSessionError.code ===
        "23505"
      ) {
        const {
          data:
            concurrentSession,
          error:
            concurrentSessionError,
        } = await supabase
          .from("shop_sessions")
          .select(
            "id, room_id, round, started_at, expires_at"
          )
          .eq(
            "room_id",
            room.id
          )
          .eq(
            "round",
            round
          )
          .maybeSingle();

        if (
          concurrentSessionError ||
          !concurrentSession
        ) {
          console.error(
            "Shop session race recovery failed:",
            concurrentSessionError
          );

          return NextResponse.json(
            {
              error:
                "Failed to recover Shop session",
            },
            {
              status: 500,
            }
          );
        }

        const {
          data:
            concurrentStock,
          error:
            concurrentStockError,
        } = await supabase
          .from(
            "shop_stock"
          )
          .select(
            "id, shop_session_id, item_id, initial_stock, remaining_stock"
          )
          .eq(
            "shop_session_id",
            concurrentSession.id
          )
          .order(
            "created_at",
            {
              ascending: true,
            }
          );

        if (
          concurrentStockError
        ) {
          return NextResponse.json(
            {
              error:
                "Failed to load concurrent Shop stock",
              details:
                concurrentStockError.message,
            },
            {
              status: 500,
            }
          );
        }

        return NextResponse.json({
          ok: true,
          created: false,
          session:
            concurrentSession,
          stock:
            concurrentStock ?? [],
          serverNow:
            new Date().toISOString(),
        });
      }

      console.error(
        "Failed to create Shop session:",
        createSessionError
      );

      return NextResponse.json(
        {
          error:
            "Failed to create Shop session",
          details:
            createSessionError.message,
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------
    // 9. Generate stock rows
    // --------------------------------------------------

    const stockRows =
      selectedItems.map(
        (item) => {
          const range =
            getStockRange(
              item.category
            );

          const stock =
            randomInt(
              range.min,
              range.max
            );

          return {
            shop_session_id:
              newShopSession.id,
            item_id:
              item.id,
            initial_stock:
              stock,
            remaining_stock:
              stock,
          };
        }
      );

    // --------------------------------------------------
    // 10. Insert stock
    // --------------------------------------------------

    const {
      data:
        insertedStock,
      error: stockError,
    } = await supabase
      .from("shop_stock")
      .insert(
        stockRows
      )
      .select(
        "id, shop_session_id, item_id, initial_stock, remaining_stock"
      );

    if (stockError) {
      console.error(
        "Failed to create Shop stock:",
        stockError
      );

      // Nếu tạo session thành công nhưng stock thất bại,
      // xóa session để tránh session rỗng.
      await supabase
        .from(
          "shop_sessions"
        )
        .delete()
        .eq(
          "id",
          newShopSession.id
        );

      return NextResponse.json(
        {
          error:
            "Failed to create Shop stock",
          details:
            stockError.message,
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------
    // 11. Return complete Shop session
    // --------------------------------------------------

    return NextResponse.json(
      {
        ok: true,
        created: true,

        session:
          newShopSession,

        stock:
          insertedStock ?? [],

        serverNow:
          new Date().toISOString(),
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Unexpected Shop session error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}