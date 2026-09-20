import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
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

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { code } = await context.params;

    const roomCode = String(code ?? "").trim();

    if (!/^\d{6}$/.test(roomCode)) {
      return NextResponse.json(
        {
          error: "Mã phòng không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    const playerToken =
      request.headers.get("x-player-token");

    if (!playerToken) {
      return NextResponse.json(
        {
          error: "Thiếu player token.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * Tìm phòng
     */

    const { data: room, error: roomError } =
      await supabase
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
            dice_system
          `
        )
        .eq("code", roomCode)
        .maybeSingle();

    if (roomError) {
      console.error(
        "ROOM API - ROOM ERROR:",
        roomError
      );

      return NextResponse.json(
        {
          error: "Không thể tải phòng.",
        },
        {
          status: 500,
        }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error: "Phòng không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Xác thực người chơi
     */

    const {
      data: currentPlayer,
      error: currentPlayerError,
    } = await supabase
      .from("room_players")
      .select(
        `
          id,
          room_id,
          player_name,
          role,
          is_connected
        `
      )
      .eq("room_id", room.id)
      .eq("player_token", playerToken)
      .maybeSingle();

    if (currentPlayerError) {
      console.error(
        "ROOM API - PLAYER ERROR:",
        currentPlayerError
      );

      return NextResponse.json(
        {
          error: "Không thể xác thực người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    if (!currentPlayer) {
      return NextResponse.json(
        {
          error:
            "Bạn không còn là thành viên của phòng này.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * Lấy danh sách player
     */

    const {
      data: players,
      error: playersError,
    } = await supabase
      .from("room_players")
      .select(
  `
    id,
    player_name,
    role,
    hp,
    money,
    location,
    is_connected,
    created_at
  `
)
      .eq("room_id", room.id)
      .order("created_at", {
        ascending: true,
      });

    if (playersError) {
      console.error(
        "ROOM API - PLAYERS ERROR:",
        playersError
      );

      return NextResponse.json(
        {
          error: "Không thể tải danh sách người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Nếu game đã bắt đầu,
     * client sẽ tự chuyển sang game.
     */

    return NextResponse.json(
      {
        room,
        players: players ?? [],
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "ROOM API - UNEXPECTED ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}