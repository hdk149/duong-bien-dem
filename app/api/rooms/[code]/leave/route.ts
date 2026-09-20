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
        { status: 400 }
      );
    }

    const token =
      request.headers.get("x-player-token");

    if (!token) {
      return NextResponse.json(
        {
          error: "Thiếu player token.",
        },
        { status: 401 }
      );
    }

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select("id, code, status")
        .eq("code", roomCode)
        .maybeSingle();

    if (roomError) {
      console.error(roomError);

      return NextResponse.json(
        {
          error: "Không thể tải phòng.",
        },
        { status: 500 }
      );
    }

    if (!room) {
      return NextResponse.json(
        {
          error: "Phòng không tồn tại.",
        },
        { status: 404 }
      );
    }

    const { data: player, error: playerError } =
      await supabase
        .from("room_players")
        .select(
          "id, player_name, role"
        )
        .eq("room_id", room.id)
        .eq("player_token", token)
        .maybeSingle();

    if (playerError) {
      console.error(playerError);

      return NextResponse.json(
        {
          error: "Không thể xác thực người chơi.",
        },
        { status: 500 }
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          error: "Bạn không thuộc phòng này.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      room: {
        code: room.code,
        status: room.status,
      },
      player: {
        id: player.id,
        playerName: player.player_name,
        role:
          player.role === "host"
            ? "host"
            : "player",
      },
    });
  } catch (error) {
    console.error(
      "CHECK ROOM MEMBERSHIP ERROR:",
      error
    );

    return NextResponse.json(
      {
        error: "Internal server error.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const token =
      request.headers.get("x-player-token");

    if (!token) {
      return NextResponse.json(
        {
          error: "Thiếu player token.",
        },
        {
          status: 401,
        }
      );
    }

    let body: {
      action?: "leave" | "dissolve";
    } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const action =
      body.action === "dissolve"
        ? "dissolve"
        : "leave";

    const { data: room, error: roomError } =
      await supabase
        .from("rooms")
        .select(
          "id, code, status, host_name"
        )
        .eq("code", roomCode)
        .maybeSingle();

    if (roomError) {
      console.error(roomError);

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

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from("room_players")
      .select(
        "id, role, player_name"
      )
      .eq("room_id", room.id)
      .eq("player_token", token)
      .maybeSingle();

    if (playerError) {
      console.error(playerError);

      return NextResponse.json(
        {
          error: "Không thể xác thực người chơi.",
        },
        {
          status: 500,
        }
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          error: "Bạn không thuộc phòng này.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * HOST + DISSOLVE
     * ----------------
     * Host chủ động chọn giải tán phòng.
     */
    if (
      player.role === "host" &&
      action === "dissolve"
    ) {
      const { error: deleteRoomError } =
        await supabase
          .from("rooms")
          .delete()
          .eq("id", room.id);

      if (deleteRoomError) {
        console.error(deleteRoomError);

        return NextResponse.json(
          {
            error: "Không thể giải tán phòng.",
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        success: true,
        closed: true,
        action: "room_dissolved",
      });
    }

    /*
     * HOST + LEAVE
     * ------------
     * Host rời nhưng không giải tán.
     * Chuyển quyền host cho player tồn tại lâu nhất.
     */
    if (
      player.role === "host" &&
      action === "leave"
    ) {
      const {
        data: remainingPlayers,
        error: remainingPlayersError,
      } = await supabase
        .from("room_players")
        .select(
          "id, player_name, created_at"
        )
        .eq("room_id", room.id)
        .neq("id", player.id)
        .order("created_at", {
          ascending: true,
        });

      if (remainingPlayersError) {
        console.error(
          remainingPlayersError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tìm người chơi kế nhiệm.",
          },
          {
            status: 500,
          }
        );
      }

      /*
       * Nếu host là người cuối cùng,
       * không còn ai để chuyển host.
       * Khi đó giải tán phòng.
       */
      if (
        !remainingPlayers ||
        remainingPlayers.length === 0
      ) {
        const { error: deleteRoomError } =
          await supabase
            .from("rooms")
            .delete()
            .eq("id", room.id);

        if (deleteRoomError) {
          console.error(deleteRoomError);

          return NextResponse.json(
            {
              error:
                "Không thể đóng phòng.",
            },
            {
              status: 500,
            }
          );
        }

        return NextResponse.json({
          success: true,
          closed: true,
          action: "room_dissolved",
        });
      }

      const nextHost =
        remainingPlayers[0];

      const {
        error: deletePlayerError,
      } = await supabase
        .from("room_players")
        .delete()
        .eq("id", player.id)
        .eq("room_id", room.id);

      if (deletePlayerError) {
        console.error(deletePlayerError);

        return NextResponse.json(
          {
            error: "Không thể thoát phòng.",
          },
          {
            status: 500,
          }
        );
      }

      const {
        error: promoteError,
      } = await supabase
        .from("room_players")
        .update({
          role: "host",
        })
        .eq("id", nextHost.id)
        .eq("room_id", room.id);

      if (promoteError) {
        console.error(promoteError);

        return NextResponse.json(
          {
            error:
              "Không thể chuyển quyền HOST.",
          },
          {
            status: 500,
          }
        );
      }

      const {
        error: updateRoomError,
      } = await supabase
        .from("rooms")
        .update({
          host_name: nextHost.player_name,
        })
        .eq("id", room.id);

      if (updateRoomError) {
        console.error(updateRoomError);
      }

      return NextResponse.json({
        success: true,
        closed: false,
        action: "host_left",
        newHost: nextHost.player_name,
      });
    }

    /*
     * PLAYER + LEAVE
     */
    const {
      error: deletePlayerError,
    } = await supabase
      .from("room_players")
      .delete()
      .eq("id", player.id)
      .eq("room_id", room.id);

    if (deletePlayerError) {
      console.error(deletePlayerError);

      return NextResponse.json(
        {
          error: "Không thể thoát phòng.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      closed: false,
      action: "player_left",
    });
  } catch (error) {
    console.error(
      "LEAVE ROOM UNEXPECTED ERROR:",
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