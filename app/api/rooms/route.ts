import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const CHARACTERS = "0123456789";

const STARTING_LOCATION = {
  id: "hcm",
  name: "TP. Hồ Chí Minh",
  lat: 10.8231,
  lng: 106.6297,
};

function generateRoomCode(length = 6) {
  let code = "";

  for (let i = 0; i < length; i++) {
    code += CHARACTERS[randomInt(CHARACTERS.length)];
  }

  return code;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const hostName = String(
      body.hostName ?? ""
    ).trim();

    const maxPlayers = Number(
      body.maxPlayers ?? 4
    );

    if (!hostName) {
      return NextResponse.json(
        {
          error:
            "Tên người tạo phòng không được để trống.",
        },
        { status: 400 }
      );
    }

    if (hostName.length > 20) {
      return NextResponse.json(
        {
          error:
            "Tên tối đa 20 ký tự.",
        },
        { status: 400 }
      );
    }

    if (
      ![1, 2, 3, 4].includes(maxPlayers)
    ) {
      return NextResponse.json(
        {
          error:
            "Số người chơi không hợp lệ.",
        },
        { status: 400 }
      );
    }

    // ==================================================
    // TẠO PHÒNG
    // ==================================================

    for (
      let attempt = 0;
      attempt < 10;
      attempt++
    ) {
      const code =
        generateRoomCode();

      const {
        data: room,
        error: roomError,
      } = await supabase
        .from("rooms")
        .insert({
          code,
          host_name: hostName,
          max_players: maxPlayers,

          // Mặc định toàn bộ game bắt đầu ở TP.HCM
          starting_location:
            STARTING_LOCATION.name,
        })
        .select()
        .single();

      if (
        roomError?.code ===
        "23505"
      ) {
        continue;
      }

      if (
        roomError ||
        !room
      ) {
        console.error(
          roomError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tạo phòng.",
          },
          { status: 500 }
        );
      }

      // ==================================================
      // TẠO HOST
      // ==================================================

      const {
        data: player,
        error: playerError,
      } = await supabase
        .from("room_players")
        .insert({
          room_id: room.id,

          player_name:
            hostName,

          hp: 100,

          money: 5000000,

          // TẤT CẢ PLAYER SPAWN Ở TP.HCM
          location:
            STARTING_LOCATION.name,

          location_id:
            STARTING_LOCATION.id,

          role: "host",

          is_connected: true,
        })
        .select(
          "id, player_token, location, location_id"
        )
        .single();

      if (
        playerError ||
        !player
      ) {
        console.error(
          playerError
        );

        await supabase
          .from("rooms")
          .delete()
          .eq(
            "id",
            room.id
          );

        return NextResponse.json(
          {
            error:
              "Không thể thêm người tạo vào phòng.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,

        room,

        playerId:
          player.id,

        playerToken:
          player.player_token,

        playerRole:
          "host",

        // Vị trí spawn mặc định
        location: {
          id:
            STARTING_LOCATION.id,

          name:
            STARTING_LOCATION.name,

          lat:
            STARTING_LOCATION.lat,

          lng:
            STARTING_LOCATION.lng,
        },
      });
    }

    return NextResponse.json(
      {
        error:
          "Không thể tạo mã phòng. Hãy thử lại.",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Dữ liệu gửi lên không hợp lệ.",
      },
      { status: 400 }
    );
  }
}