import { NextRequest, NextResponse } from "next/server";
import developerAdmin, {
  verifyDeveloperSession,
} from "@/lib/developer/auth";

type ServerAction =
  | "pause"
  | "resume"
  | "force_close";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await verifyDeveloperSession(request);

    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: 401 }
      );
    }

    const { code } = await params;

    const body = await request.json().catch(() => null);
    const action = body?.action as ServerAction | undefined;

    if (
      action !== "pause" &&
      action !== "resume" &&
      action !== "force_close"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid action. Use pause, resume or force_close.",
        },
        { status: 400 }
      );
    }

    const { data: room, error: roomError } =
      await developerAdmin
        .from("rooms")
        .select(
          "id, code, status, rules"
        )
        .eq("code", code)
        .maybeSingle();

    if (roomError) {
      console.error(
        "SERVER CONTROL ROOM ERROR:",
        roomError
      );

      return NextResponse.json(
        { error: "Không thể lấy thông tin room." },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        { error: "Room không tồn tại." },
        { status: 404 }
      );
    }

    const currentRules =
      room.rules &&
      typeof room.rules === "object" &&
      !Array.isArray(room.rules)
        ? room.rules
        : {};

    if (action === "pause") {
      if (room.status === "paused") {
        return NextResponse.json({
          success: true,
          action,
          message: "Room đã được pause.",
        });
      }

      const nextRules = {
        ...currentRules,
        server_previous_status: room.status,
      };

      const { error } = await developerAdmin
        .from("rooms")
        .update({
          status: "paused",
          rules: nextRules,
        })
        .eq("id", room.id);

      if (error) {
        console.error(
          "SERVER PAUSE ERROR:",
          error
        );

        return NextResponse.json(
          { error: "Không thể pause room." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action,
        roomCode: room.code,
        previousStatus: room.status,
        newStatus: "paused",
        message: `Room ${room.code} đã được pause.`,
      });
    }

    if (action === "resume") {
      if (room.status !== "paused") {
        return NextResponse.json(
          {
            error:
              "Room hiện không ở trạng thái paused.",
          },
          { status: 400 }
        );
      }

      const previousStatus =
        typeof currentRules.server_previous_status ===
          "string"
          ? currentRules.server_previous_status
          : "playing";

      const nextRules = {
        ...currentRules,
      };

      delete nextRules.server_previous_status;

      const { error } = await developerAdmin
        .from("rooms")
        .update({
          status: previousStatus,
          rules: nextRules,
        })
        .eq("id", room.id);

      if (error) {
        console.error(
          "SERVER RESUME ERROR:",
          error
        );

        return NextResponse.json(
          { error: "Không thể resume room." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action,
        roomCode: room.code,
        previousStatus: "paused",
        newStatus: previousStatus,
        message: `Room ${room.code} đã được resume.`,
      });
    }

    // force_close
    if (
      room.status === "finished" ||
      room.status === "closed"
    ) {
      return NextResponse.json({
        success: true,
        action,
        roomCode: room.code,
        message: "Room đã được đóng.",
      });
    }

    const { error } = await developerAdmin
      .from("rooms")
      .update({
        status: "finished",
      })
      .eq("id", room.id);

    if (error) {
      console.error(
        "SERVER FORCE CLOSE ERROR:",
        error
      );

      return NextResponse.json(
        { error: "Không thể force close room." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action,
      roomCode: room.code,
      previousStatus: room.status,
      newStatus: "finished",
      message: `Room ${room.code} đã bị force close.`,
    });
  } catch (error) {
    console.error(
      "SERVER CONTROL ERROR:",
      error
    );

    return NextResponse.json(
      { error: "Server control failed." },
      { status: 500 }
    );
  }
}