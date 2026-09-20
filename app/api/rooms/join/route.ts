import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const playerName = String(body.playerName ?? "").trim();
    const roomCode = String(body.roomCode ?? "").trim();

    if (!playerName) {
      return NextResponse.json(
        { error: "Tên người chơi không được để trống." },
        { status: 400 }
      );
    }

    if (playerName.length > 20) {
      return NextResponse.json(
        { error: "Tên tối đa 20 ký tự." },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(roomCode)) {
      return NextResponse.json(
        { error: "Mã phòng phải gồm đúng 6 chữ số." },
        { status: 400 }
      );
    }

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", roomCode)
      .maybeSingle();

    if (roomError) {
      console.error(roomError);

      return NextResponse.json(
        { error: "Không thể kiểm tra phòng." },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        { error: "Không tìm thấy phòng này." },
        { status: 404 }
      );
    }

    if (room.status !== "lobby") {
      return NextResponse.json(
        { error: "Phòng đã bắt đầu, không thể tham gia." },
        { status: 400 }
      );
    }

    const { data: players, error: playersError } = await supabase
      .from("room_players")
      .select("id, player_name")
      .eq("room_id", room.id);

    if (playersError) {
      console.error(playersError);

      return NextResponse.json(
        { error: "Không thể kiểm tra người chơi." },
        { status: 500 }
      );
    }

    const currentPlayers = players?.length ?? 0;

    if (currentPlayers >= room.max_players) {
      return NextResponse.json(
        { error: "Phòng đã đầy." },
        { status: 400 }
      );
    }

    const duplicateName = players?.some(
      (player) =>
        player.player_name.toLowerCase() === playerName.toLowerCase()
    );

    if (duplicateName) {
      return NextResponse.json(
        { error: "Tên này đã được sử dụng trong phòng." },
        { status: 400 }
      );
    }

    const { data: player, error: insertError } = await supabase
      .from("room_players")
      .insert({
        room_id: room.id,
        player_name: playerName,
        hp: 100,
        money: 5000000,
        location: "Vietnam",
        role: "player",
        is_connected: true,
      })
      .select("id, player_token")
      .single();

    if (insertError || !player) {
      console.error(insertError);

      return NextResponse.json(
        { error: "Không thể tham gia phòng." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      room: {
        code: room.code,
        id: room.id,
      },
      playerId: player.id,
      playerToken: player.player_token,
      playerRole: "player",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Dữ liệu gửi lên không hợp lệ." },
      { status: 400 }
    );
  }
}