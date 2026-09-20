import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyDeveloperSession } from "@/lib/developer/auth";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function json(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
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
    const roomCode = String(code).trim();

    if (!/^\d{6}$/.test(roomCode)) {
      return json(
        {
          success: false,
          error: "Mã phòng không hợp lệ.",
        },
        400
      );
    }

    // 1. Verify developer session
    const auth = await verifyDeveloperSession(request);

    if (!auth.ok) {
      return json(
        {
          success: false,
          error: auth.error,
        },
        401
      );
    }

    // 2. Parse body
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return json(
        {
          success: false,
          error: "Request body không hợp lệ.",
        },
        400
      );
    }

    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!message) {
      return json(
        {
          success: false,
          error: "Lời nhắn không được để trống.",
        },
        400
      );
    }

    if (message.length > 500) {
      return json(
        {
          success: false,
          error: "Lời nhắn tối đa 500 ký tự.",
        },
        400
      );
    }

    const supabase = getSupabaseAdmin();

    // 3. Find room
    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select("id, code")
        .eq("code", roomCode)
        .maybeSingle();

    if (roomError) {
      console.error(
        "DEV NOTIFICATION - ROOM ERROR:",
        roomError
      );

      return json(
        {
          success: false,
          error: "Không thể tải phòng.",
        },
        500
      );
    }

    if (!room) {
      return json(
        {
          success: false,
          error: "Phòng không tồn tại.",
        },
        404
      );
    }

    // 4. Insert notification
    const { data: notification, error } =
      await supabase
        .from("room_notifications")
        .insert({
          room_id: room.id,
          type: "developer",
          sender: "developer",
          message,
        })
        .select(
          "id, room_id, type, sender, message, created_at"
        )
        .single();

    if (error) {
      console.error(
        "DEV NOTIFICATION - INSERT ERROR:",
        error
      );

      return json(
        {
          success: false,
          error: "Không thể gửi notification.",
        },
        500
      );
    }

    console.log(
      `[DEV NOTIFICATION] room=${roomCode} message=${message}`
    );

    return json({
      success: true,
      roomCode,
      notification,
    });
  } catch (error) {
    console.error(
      "[DEV NOTIFICATION ERROR]",
      error
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500
    );
  }
}