import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ACTIONS = [
  "pause_room",
  "resume_room",
  "reset_round",
  "clear_votes",
  "force_stop_round",
  "unlock_room",
  "force_end_game",
] as const;

type EmergencyAction = (typeof ALLOWED_ACTIONS)[number];

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ code: string }>;
  }
) {
  try {
    const { code } = await params;
    const body = await request.json();

    const action = body?.action as EmergencyAction;

    if (!code) {
      return NextResponse.json(
        { error: "Room code is required." },
        { status: 400 }
      );
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        {
          error: "Invalid emergency action.",
          allowedActions: ALLOWED_ACTIONS,
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Tìm room
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, code, status, rules")
      .eq("code", code)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: "Room not found." },
        { status: 404 }
      );
    }

    let newStatus: string | null = null;
    let message = "";

    switch (action) {
      case "pause_room": {
        // Không pause room đã kết thúc
        if (room.status === "finished") {
          return NextResponse.json(
            { error: "Cannot pause a finished room." },
            { status: 409 }
          );
        }

        const currentRules =
          room.rules && typeof room.rules === "object"
            ? room.rules
            : {};

        // Lưu trạng thái trước khi pause
        const updatedRules = {
          ...currentRules,
          emergency_previous_status: room.status,
        };

        newStatus = "paused";

        const { error } = await supabase
          .from("rooms")
          .update({
            status: newStatus,
            rules: updatedRules,
          })
          .eq("id", room.id);

        if (error) throw error;

        message = `Room ${code} has been paused.`;
        break;
      }

      case "resume_room": {
        if (room.status !== "paused") {
          return NextResponse.json(
            {
              error: `Room is not paused. Current status: ${room.status}`,
            },
            { status: 409 }
          );
        }

        const currentRules =
          room.rules && typeof room.rules === "object"
            ? room.rules
            : {};

        // Khôi phục trạng thái trước khi pause
        const previousStatus =
          typeof currentRules.emergency_previous_status === "string"
            ? currentRules.emergency_previous_status
            : "lobby";

        const updatedRules = {
          ...currentRules,
        };

        delete updatedRules.emergency_previous_status;

        newStatus = previousStatus;

        const { error } = await supabase
          .from("rooms")
          .update({
            status: newStatus,
            rules: updatedRules,
          })
          .eq("id", room.id);

        if (error) throw error;

        message = `Room ${code} has been resumed to "${newStatus}".`;
        break;
      }

      case "force_end_game": {
        if (room.status === "finished") {
          return NextResponse.json(
            { error: "Game is already finished." },
            { status: 409 }
          );
        }

        newStatus = "finished";

        const { error } = await supabase
          .from("rooms")
          .update({
            status: newStatus,
          })
          .eq("id", room.id);

        if (error) throw error;

        message = `Game ${code} has been force ended.`;
        break;
      }

      // Chưa thực hiện vì rooms table chưa chứa round/vote/lock data
      case "reset_round":
      case "clear_votes":
      case "force_stop_round":
      case "unlock_room": {
        return NextResponse.json(
          {
            error: `Action "${action}" is not implemented yet because the required round/vote/lock schema is not available in rooms.`,
          },
          { status: 501 }
        );
      }
    }

    console.log(
      `[DEVELOPER EMERGENCY] ${code}: ${action} -> ${newStatus}`
    );

    return NextResponse.json({
      success: true,
      roomCode: code,
      action,
      previousStatus: room.status,
      newStatus,
      message,
    });
  } catch (error) {
    console.error("[DEVELOPER EMERGENCY ERROR]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      { status: 500 }
    );
  }
}