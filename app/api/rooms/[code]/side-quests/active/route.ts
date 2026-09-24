import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getActiveSideQuest } from "@/lib/game/side-quest";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
);

export async function GET(
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
      .select("id, code")
      .eq("code", code)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: "Room not found" },
        { status: 404 },
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
            "Player is not allowed to access side quests",
        },
        { status: 403 },
      );
    }

    const sideQuest = await getActiveSideQuest(
      supabase,
      room.id,
      player.id,
    );

    return NextResponse.json({
      ok: true,
      sideQuest: sideQuest ?? null,
    });
  } catch (error) {
    console.error(
      "SIDE_QUEST_ACTIVE_ERROR",
      error,
    );

    return NextResponse.json(
      {
        error: "Failed to load active side quest",
      },
      { status: 500 },
    );
  }
}