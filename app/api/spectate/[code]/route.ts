import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    // Kiểm tra mã phòng
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        {
          error: "Mã phòng không hợp lệ.",
        },
        { status: 400 }
      );
    }

    // Tìm phòng
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select(`
        id,
        code,
        host_name,
        max_players,
        status
      `)
      .eq("code", code)
      .maybeSingle();

    if (roomError) {
      console.error("SPECTATE - ROOM ERROR:", roomError);

      return NextResponse.json(
        {
          error: "Không thể tìm phòng.",
        },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error: "Không tìm thấy phòng.",
        },
        { status: 404 }
      );
    }

    /*
      PUBLIC DATA dành cho Spectator.

      Spectator được xem:
      - player_name
      - hp
      - money
      - country
      - role
      - is_connected

      Spectator KHÔNG được xem:
      - location cụ thể
      - last_choice
      - player_token
      - choice_data
      - inventory
      - skills
      - quests
      - private events
      - dice result
      - developer/debug data

      Lưu ý:
      DB vẫn có thể lưu location cụ thể của người chơi.
      API này chỉ trả về quốc gia chung chung cho Spectator.
    */

    const { data: players, error: playersError } =
      await supabase
        .from("room_players")
        .select(`
          id,
          player_name,
          hp,
          money,
          location,
          role,
          is_connected
        `)
        .eq("room_id", room.id)
        .in("role", ["host", "player"])
        .order("created_at", {
          ascending: true,
        });

    if (playersError) {
      console.error(
        "SPECTATE - PLAYERS ERROR:",
        playersError
      );

      return NextResponse.json(
        {
          error: "Không thể lấy danh sách người chơi.",
        },
        { status: 500 }
      );
    }

    /*
      Chuyển location cụ thể thành quốc gia.

      Hiện tại tất cả người chơi khởi đầu ở Việt Nam,
      nên nếu location không có thông tin quốc gia riêng
      thì mặc định là Việt Nam.

      API tuyệt đối không trả location cụ thể.
    */
    function getCountry(location: string | null) {
      if (!location) {
        return "Việt Nam";
      }

      const normalized = location
        .trim()
        .toLowerCase();

      /*
        Việt Nam
      */
      const vietnamLocations = [
        "việt nam",
        "viet nam",
        "vietnam",
        "tp. hồ chí minh",
        "tp hồ chí minh",
        "thành phố hồ chí minh",
        "ho chi minh",
        "ho chi minh city",
        "hồ chí minh",
        "hcm",
        "hanoi",
        "hà nội",
        "đà lạt",
        "da lat",
        "đà nẵng",
        "da nang",
        "hải phòng",
        "hai phong",
        "cần thơ",
        "can tho",
        "nha trang",
        "huế",
        "hue",
      ];

      if (
        vietnamLocations.some(
          (item) =>
            normalized === item ||
            normalized.includes(item)
        )
      ) {
        return "Việt Nam";
      }

      /*
        Nếu location sau này được mở rộng sang quốc gia khác,
        có thể bổ sung mapping tại đây.

        Quan trọng:
        Không trả nguyên location cho Spectator.
      */

      return "Việt Nam";
    }

    const safePlayers = (players ?? []).map(
      (player) => ({
        id: player.id,
        player_name: player.player_name,
        hp: player.hp ?? 100,
        money: player.money ?? 5000000,

        // Chỉ trả quốc gia, KHÔNG trả thành phố/tỉnh.
        country: getCountry(player.location),

        role: player.role,
        is_connected: player.is_connected,
      })
    );

    return NextResponse.json(
      {
        success: true,

        room: {
          id: room.id,
          code: room.code,
          hostName: room.host_name,
          maxPlayers: room.max_players,
          status: room.status,
        },

        players: safePlayers,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error(
      "SPECTATE - UNEXPECTED ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: "Đã xảy ra lỗi.",
      },
      { status: 500 }
    );
  }
}