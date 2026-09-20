"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Membership = {
  room: {
    code: string;
    status: string;
  };
  player: {
    id: string;
    playerName: string;
    role: string;
  };
};

export default function LeaveRoomButton() {
  const router = useRouter();

  const [membership, setMembership] =
    useState<Membership | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [leaving, setLeaving] =
    useState(false);

  const [showPopup, setShowPopup] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkMembership() {
      const token =
        sessionStorage.getItem("player_token");

      const roomCode =
        sessionStorage.getItem("room_code");

      /*
       * Không có session phòng
       * => không hiện nút
       */
      if (!token || !roomCode) {
        if (!cancelled) {
          setMembership(null);
          setLoading(false);
        }

        return;
      }

      try {
        const response = await fetch(
          `/api/rooms/${roomCode}/leave`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              "x-player-token": token,
            },
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Không tìm thấy phòng."
          );
        }

        if (!cancelled) {
          setMembership(data);
        }
      } catch (error) {
        console.error(
          "[LEAVE BUTTON]",
          error
        );

        if (!cancelled) {
          setMembership(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    checkMembership();

    return () => {
      cancelled = true;
    };
  }, []);

  async function leaveRoom(
    action: "leave" | "dissolve"
  ) {
    if (!membership || leaving) {
      return;
    }

    const token =
      sessionStorage.getItem("player_token");

    if (!token) {
      return;
    }

    setLeaving(true);

    try {
      const response = await fetch(
        `/api/rooms/${membership.room.code}/leave`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "x-player-token": token,
          },
          body: JSON.stringify({
            action,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Không thể rời phòng."
        );
      }

      /*
       * Xóa session phòng
       */
      sessionStorage.removeItem(
        "player_id"
      );

      sessionStorage.removeItem(
        "player_token"
      );

      sessionStorage.removeItem(
        "player_role"
      );

      sessionStorage.removeItem(
        "room_code"
      );

      setMembership(null);
      setShowPopup(false);

      router.replace("/");
    } catch (error) {
      console.error(
        "[LEAVE ROOM]",
        error
      );

      window.alert(
        error instanceof Error
          ? error.message
          : "Không thể rời phòng."
      );

      setLeaving(false);
    }
  }

  if (loading || !membership) {
    return null;
  }

  const isHost =
    membership.player.role === "host";

  return (
    <>
      {/* BUTTON */}

      <section className="mt-7">
        <p className="mb-3 px-1 text-sm font-medium text-muted">
          Phòng hiện tại
        </p>

        <div className="overflow-hidden rounded-2xl border border-red-500/20 bg-card shadow-sm">
          <button
            type="button"
            onClick={() =>
              setShowPopup(true)
            }
            className="
              flex
              w-full
              items-center
              justify-between
              px-4
              py-4
              text-left
              transition
              hover:bg-red-500/5
              active:scale-[0.99]
            "
          >
            <div className="flex items-center gap-3">
              <div
                className="
                  flex
                  h-10
                  w-10
                  items-center
                  justify-center
                  rounded-xl
                  bg-red-500/10
                  text-lg
                "
              >
                🚪
              </div>

              <div>
                <p className="font-medium text-red-500">
                  Thoát phòng
                </p>

                <p className="text-xs text-muted">
                  Phòng {membership.room.code}
                </p>
              </div>
            </div>

            <span className="text-muted">
              →
            </span>
          </button>
        </div>
      </section>

      {/* POPUP */}

      {showPopup && (
        <div
          className="
            fixed
            inset-0
            z-[100]
            flex
            items-center
            justify-center
            bg-black/70
            p-5
            backdrop-blur-sm
          "
        >
          <div
            className="
              w-full
              max-w-md
              rounded-3xl
              border
              border-border
              bg-card
              p-6
              shadow-2xl
            "
          >
            <div className="text-4xl">
              🚪
            </div>

            <h2 className="mt-4 text-2xl font-black">
              Thoát phòng?
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted">
              Bạn đang ở phòng{" "}
              <span className="font-bold text-foreground">
                {membership.room.code}
              </span>
              .
            </p>

            {isHost ? (
              <>
                <p className="mt-4 text-sm leading-6 text-muted">
                  Bạn đang là Host. Hãy chọn cách
                  rời phòng:
                </p>

                <div className="mt-6 space-y-3">

                  {/* DISSOLVE */}

                  <button
                    type="button"
                    disabled={leaving}
                    onClick={() =>
                      leaveRoom(
                        "dissolve"
                      )
                    }
                    className="
                      w-full
                      rounded-2xl
                      bg-red-500
                      px-4
                      py-4
                      font-bold
                      text-white
                      transition
                      hover:bg-red-600
                      disabled:opacity-50
                    "
                  >
                    {leaving
                      ? "Đang xử lý..."
                      : "💥 Thoát & giải tán phòng"}
                  </button>

                  {/* TRANSFER HOST */}

                  <button
                    type="button"
                    disabled={leaving}
                    onClick={() =>
                      leaveRoom(
                        "leave"
                      )
                    }
                    className="
                      w-full
                      rounded-2xl
                      border
                      border-border
                      bg-background
                      px-4
                      py-4
                      font-bold
                      transition
                      hover:bg-black/5
                      dark:hover:bg-white/5
                      disabled:opacity-50
                    "
                  >
                    👤 Thoát phòng
                  </button>

                  {/* CANCEL */}

                  <button
                    type="button"
                    disabled={leaving}
                    onClick={() =>
                      setShowPopup(false)
                    }
                    className="
                      w-full
                      rounded-2xl
                      px-4
                      py-3
                      font-semibold
                      text-muted
                      transition
                      hover:text-foreground
                      disabled:opacity-50
                    "
                  >
                    Hủy
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-4 text-sm leading-6 text-muted">
                  Bạn có chắc muốn rời phòng này
                  không?
                </p>

                <div className="mt-6 space-y-3">

                  <button
                    type="button"
                    disabled={leaving}
                    onClick={() =>
                      leaveRoom("leave")
                    }
                    className="
                      w-full
                      rounded-2xl
                      bg-red-500
                      px-4
                      py-4
                      font-bold
                      text-white
                      transition
                      hover:bg-red-600
                      disabled:opacity-50
                    "
                  >
                    {leaving
                      ? "Đang rời phòng..."
                      : "Thoát phòng"}
                  </button>

                  <button
                    type="button"
                    disabled={leaving}
                    onClick={() =>
                      setShowPopup(false)
                    }
                    className="
                      w-full
                      rounded-2xl
                      border
                      border-border
                      px-4
                      py-4
                      font-semibold
                      text-muted
                      disabled:opacity-50
                    "
                  >
                    Hủy
                  </button>

                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}