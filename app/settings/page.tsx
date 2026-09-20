"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../components/LanguageProvider";
import { useTheme } from "../components/ThemeProvider";

type CurrentRoom = {
  code: string;
  status: string;
  playerName: string;
  role: string;
};

type LeaveAction = "leave" | "dissolve";

const ROOM_CODE_KEY = "room_code";
const PLAYER_ID_KEY = "player_id";
const PLAYER_TOKEN_KEY = "player_token";
const PLAYER_ROLE_KEY = "player_role";
const DEVELOPER_SESSION_KEY = "developer_session_token";

function clearRoomSession() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(ROOM_CODE_KEY);
  sessionStorage.removeItem(PLAYER_ID_KEY);
  sessionStorage.removeItem(PLAYER_TOKEN_KEY);
  sessionStorage.removeItem(PLAYER_ROLE_KEY);

  // IMPORTANT:
  // Developer session is GLOBAL.
  // Không xoá developer session khi rời phòng.
}

export default function SettingsPage() {
  const router = useRouter();

  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  const isVietnamese = language === "vi";

  const [currentRoom, setCurrentRoom] =
    useState<CurrentRoom | null>(null);

  const [showLeaveConfirm, setShowLeaveConfirm] =
    useState(false);

  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  // ==========================================
  // DEVELOPER MODE
  // ==========================================

  const [showDeveloperConfirm, setShowDeveloperConfirm] =
    useState(false);

  const [developerEmail, setDeveloperEmail] = useState("");
  const [developerOtp, setDeveloperOtp] = useState("");

  const [developerStep, setDeveloperStep] =
    useState<"email" | "otp">("email");

  const [developerLoading, setDeveloperLoading] =
    useState(false);

  const [developerError, setDeveloperError] = useState("");
  const [developerSuccess, setDeveloperSuccess] =
    useState("");

  const [developerCountdown, setDeveloperCountdown] =
    useState(0);

  // ==========================================
  // CURRENT ROOM
  // ==========================================

  async function loadCurrentRoom() {
    if (typeof window === "undefined") {
      return;
    }

    const code = sessionStorage.getItem(ROOM_CODE_KEY);
    const token = sessionStorage.getItem(PLAYER_TOKEN_KEY);

    if (!code || !token || !/^\d{6}$/.test(code)) {
      setCurrentRoom(null);
      return;
    }

    try {
      const response = await fetch(
        `/api/rooms/${code}/leave`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            "x-player-token": token,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 404
        ) {
          clearRoomSession();
          setCurrentRoom(null);
          return;
        }

        throw new Error(
          data?.error ||
            (isVietnamese
              ? "Không thể kiểm tra phòng."
              : "Could not check room.")
        );
      }

      if (!data?.room || !data?.player) {
        setCurrentRoom(null);
        return;
      }

      const verifiedCode = String(
        data.room.code ?? ""
      ).trim();

      if (!/^\d{6}$/.test(verifiedCode)) {
        clearRoomSession();
        setCurrentRoom(null);
        return;
      }

      const role =
        data.player.role === "host"
          ? "host"
          : "player";

      setCurrentRoom({
        code: verifiedCode,
        status: data.room.status ?? "",
        playerName: data.player.playerName ?? "",
        role,
      });

      sessionStorage.setItem(
        ROOM_CODE_KEY,
        verifiedCode
      );

      sessionStorage.setItem(
        PLAYER_ROLE_KEY,
        role
      );
    } catch (error) {
      console.error(
        "[SETTINGS] Room check error:",
        error
      );
    }
  }

  useEffect(() => {
    loadCurrentRoom();

    const interval = window.setInterval(
      loadCurrentRoom,
      3000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  // ==========================================
  // LEAVE ROOM
  // ==========================================

  function openLeaveConfirm() {
    setLeaveError("");
    setShowLeaveConfirm(true);
  }

  function closeLeaveConfirm() {
    if (leaving) {
      return;
    }

    setShowLeaveConfirm(false);
    setLeaveError("");
  }

  async function leaveRoom(action: LeaveAction) {
    if (leaving || !currentRoom) {
      return;
    }

    const code =
      currentRoom.code ||
      sessionStorage.getItem(ROOM_CODE_KEY);

    const token =
      sessionStorage.getItem(PLAYER_TOKEN_KEY);

    if (
      !code ||
      !token ||
      !/^\d{6}$/.test(code)
    ) {
      clearRoomSession();
      setCurrentRoom(null);
      setShowLeaveConfirm(false);
      return;
    }

    setLeaving(true);
    setLeaveError("");

    try {
      const response = await fetch(
        `/api/rooms/${code}/leave`,
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

      const data = await response.json();

      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404
        ) {
          clearRoomSession();
          setCurrentRoom(null);
          setShowLeaveConfirm(false);
        }

        throw new Error(
          data?.error ||
            (isVietnamese
              ? "Không thể rời phòng."
              : "Could not leave the room.")
        );
      }

      clearRoomSession();
      setCurrentRoom(null);
      setShowLeaveConfirm(false);

      router.replace("/");
    } catch (error) {
      console.error(
        "[SETTINGS] Leave error:",
        error
      );

      setLeaveError(
        error instanceof Error
          ? error.message
          : isVietnamese
            ? "Không thể rời phòng."
            : "Could not leave the room."
      );
    } finally {
      setLeaving(false);
    }
  }

  // ==========================================
  // DEVELOPER MODE
  // ==========================================

  function openDeveloperConfirm() {
    setDeveloperError("");
    setDeveloperSuccess("");
    setDeveloperOtp("");
    setDeveloperStep("email");
    setDeveloperCountdown(0);

    setShowDeveloperConfirm(true);
  }

  function closeDeveloperConfirm() {
    if (developerLoading) {
      return;
    }

    setShowDeveloperConfirm(false);
    setDeveloperError("");
    setDeveloperSuccess("");
    setDeveloperOtp("");
    setDeveloperStep("email");
    setDeveloperCountdown(0);
  }

  // ==========================================
  // REQUEST OTP
  // ==========================================

  async function requestDeveloperOtp() {
    if (developerLoading) {
      return;
    }

    const email =
      developerEmail
        .trim()
        .toLowerCase();

    if (!email) {
      setDeveloperError(
        isVietnamese
          ? "Vui lòng nhập email."
          : "Please enter your email."
      );

      return;
    }

    // FIXED EMAIL REGEX
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      setDeveloperError(
        isVietnamese
          ? "Email không hợp lệ."
          : "Invalid email address."
      );

      return;
    }

    /*
     * GLOBAL DEVELOPER
     *
     * Không cần:
     * - player_token
     * - player_id
     * - room_code
     */

    setDeveloperLoading(true);
    setDeveloperError("");
    setDeveloperSuccess("");

    try {
      const response = await fetch(
        "/api/developer/request-otp",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
              "application/json",
          },
          body: JSON.stringify({
            email,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            (isVietnamese
              ? "Không thể gửi OTP."
              : "Could not send OTP.")
        );
      }

      setDeveloperStep("otp");
      setDeveloperOtp("");
      setDeveloperCountdown(60);

      setDeveloperSuccess(
        isVietnamese
          ? "Mã OTP đã được gửi tới email của bạn."
          : "The OTP has been sent to your email."
      );
    } catch (error) {
      console.error(
        "[SETTINGS] Developer OTP error:",
        error
      );

      setDeveloperError(
        error instanceof Error
          ? error.message
          : isVietnamese
            ? "Không thể gửi OTP."
            : "Could not send OTP."
      );
    } finally {
      setDeveloperLoading(false);
    }
  }

  // ==========================================
  // VERIFY OTP + OPEN GLOBAL CONTROL CENTER
  // ==========================================

  async function verifyDeveloperOtp() {
    if (developerLoading) {
      return;
    }

    const email =
      developerEmail
        .trim()
        .toLowerCase();

    const otp =
      developerOtp.trim();

    if (!email) {
      setDeveloperError(
        isVietnamese
          ? "Email không được để trống."
          : "Email is required."
      );

      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      setDeveloperError(
        isVietnamese
          ? "Email không hợp lệ."
          : "Invalid email address."
      );

      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setDeveloperError(
        isVietnamese
          ? "OTP phải gồm 6 chữ số."
          : "OTP must contain 6 digits."
      );

      return;
    }

    /*
     * ========================================
     * OPEN TAB BEFORE AWAIT
     * ========================================
     *
     * Safari có thể block popup nếu window.open()
     * được gọi sau await.
     *
     * Vì vậy mở tab trước khi fetch verify.
     */

    const developerTab = window.open(
      "",
      "_blank"
    );

    if (!developerTab) {
      setDeveloperError(
        isVietnamese
          ? "Trình duyệt đã chặn tab mới. Hãy cho phép popup rồi thử lại."
          : "The browser blocked the new tab. Allow popups and try again."
      );

      return;
    }

    /*
     * Không đóng tab trong catch nữa.
     *
     * Nếu verify fail:
     * → tab vẫn mở
     * → không bị Safari tự đóng
     *
     * Nếu verify success:
     * → tab chuyển sang Control Center.
     */

    let transferred = false;
    let attempts = 0;
    let transferInterval:
      number | null = null;
    let cleanupTimeout:
      number | null = null;

    function cleanupTransfer() {
      window.removeEventListener(
        "message",
        handleDeveloperReady
      );

      if (
        transferInterval !== null
      ) {
        window.clearInterval(
          transferInterval
        );

        transferInterval = null;
      }

      if (
        cleanupTimeout !== null
      ) {
        window.clearTimeout(
          cleanupTimeout
        );

        cleanupTimeout = null;
      }
    }

    function sendDeveloperToken(
      developerToken: string
    ) {
      if (
  transferred ||
  !developerTab ||
  developerTab.closed
) {
  return;
}

      try {
        developerTab.postMessage(
          {
            type:
              "developer-session-transfer",
            developerToken,
          },
          window.location.origin
        );

        console.log(
          "[SETTINGS] Developer token sent"
        );
      } catch (error) {
        console.error(
          "[SETTINGS] Token transfer failed:",
          error
        );
      }
    }

    let verifiedDeveloperToken =
      "";

    function handleDeveloperReady(
      event: MessageEvent
    ) {
      if (
        event.origin !==
        window.location.origin
      ) {
        return;
      }

      if (
        event.source !==
        developerTab
      ) {
        return;
      }

      /*
       * Accept both:
       *
       * developer-control-ready
       *
       * and
       *
       * developer-dashboard-ready
       *
       * để tránh lỗi nếu page cũ vẫn dùng
       * dashboard-ready.
       */

      if (
        event.data?.type !==
          "developer-control-ready" &&
        event.data?.type !==
          "developer-dashboard-ready"
      ) {
        return;
      }

      console.log(
        "[SETTINGS] Developer page READY"
      );

      if (
        verifiedDeveloperToken
      ) {
        sendDeveloperToken(
          verifiedDeveloperToken
        );

        transferred = true;

        cleanupTransfer();
      }
    }

    /*
     * Listener phải tồn tại trước navigate.
     */

    window.addEventListener(
      "message",
      handleDeveloperReady
    );

    /*
     * Loading page.
     */

    try {
      developerTab.document.title =
        "Developer Control Center";

      developerTab.document.body.innerHTML = `
        <div style="
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#0a0a0a;
          color:#ededed;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        ">
          <div style="
            text-align:center;
            padding:24px;
          ">
            <div style="
              font-size:42px;
              margin-bottom:16px;
            ">
              🛠️
            </div>

            <div style="
              font-size:18px;
              font-weight:700;
            ">
              ${
                isVietnamese
                  ? "Đang xác minh Developer..."
                  : "Verifying Developer..."
              }
            </div>

            <div style="
              margin-top:10px;
              font-size:13px;
              color:#a3a3a3;
            ">
              ${
                isVietnamese
                  ? "Vui lòng chờ..."
                  : "Please wait..."
              }
            </div>
          </div>
        </div>
      `;
    } catch (error) {
      console.error(
        "[SETTINGS] Loading page error:",
        error
      );
    }

    setDeveloperLoading(true);
    setDeveloperError("");
    setDeveloperSuccess("");

    try {
      console.log(
        "[SETTINGS] Verifying global Developer OTP..."
      );

      /*
       * GLOBAL VERIFY
       *
       * Chỉ gửi:
       * - email
       * - otp
       */

      const response =
        await fetch(
          "/api/developer/verify-otp",
          {
            method: "POST",
            cache: "no-store",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body: JSON.stringify({
              email,
              otp,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            (isVietnamese
              ? "Không thể xác minh OTP."
              : "Could not verify OTP.")
        );
      }

      const developerToken =
        typeof data?.developer_token ===
        "string"
          ? data.developer_token.trim()
          : "";

      if (!developerToken) {
        throw new Error(
          isVietnamese
            ? "Server không trả về Developer Token."
            : "The server did not return a Developer Token."
        );
      }

      verifiedDeveloperToken =
        developerToken;

      console.log(
        "[SETTINGS] Global Developer token received:",
        Boolean(
          verifiedDeveloperToken
        )
      );

      /*
       * SAVE GLOBAL SESSION
       */

      sessionStorage.setItem(
        DEVELOPER_SESSION_KEY,
        developerToken
      );

      console.log(
        "[SETTINGS] Global Developer session saved:",
        Boolean(
          sessionStorage.getItem(
            DEVELOPER_SESSION_KEY
          )
        )
      );

      /*
       * VERIFY SUCCESS
       */

      setDeveloperSuccess(
        isVietnamese
          ? "Xác minh thành công. Đang mở Developer Control Center..."
          : "Verification successful. Opening Developer Control Center..."
      );

      /*
       * ========================================
       * NAVIGATE GLOBAL CONTROL CENTER
       * ========================================
       */

      developerTab.location.href =
        "/developer/control";

      /*
       * ========================================
       * FALLBACK TOKEN TRANSFER
       * ========================================
       *
       * Gửi token liên tục trong vài giây.
       *
       * Cái này đặc biệt hữu ích với Safari
       * khi page mới load chậm.
       */

      transferInterval =
        window.setInterval(() => {
          if (
            transferred ||
            developerTab.closed ||
            attempts >= 30
          ) {
            if (
              transferInterval !==
              null
            ) {
              window.clearInterval(
                transferInterval
              );

              transferInterval = null;
            }

            return;
          }

          attempts++;

          sendDeveloperToken(
            developerToken
          );
        }, 250);

      /*
       * Cleanup sau 8 giây.
       */

      cleanupTimeout =
        window.setTimeout(() => {
          cleanupTransfer();
        }, 8000);
    } catch (error) {
      console.error(
        "[SETTINGS] Developer verify error:",
        error
      );

      /*
       * QUAN TRỌNG:
       *
       * KHÔNG developerTab.close()
       *
       * Đây là nguyên nhân chính khiến tab
       * trước đó tự đóng.
       */

      cleanupTransfer();

      setDeveloperError(
        error instanceof Error
          ? error.message
          : isVietnamese
            ? "Không thể xác minh Developer."
            : "Could not verify Developer."
      );

      /*
       * Tab vẫn mở.
       *
       * Hiển thị lỗi trực tiếp trong tab.
       */

      try {
        developerTab.document.body.innerHTML = `
          <div style="
            min-height:100vh;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#0a0a0a;
            color:#ededed;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            padding:24px;
          ">
            <div style="
              width:100%;
              max-width:520px;
              border:1px solid #2a2a2a;
              border-radius:24px;
              padding:24px;
              background:#171717;
            ">
              <div style="
                font-size:42px;
                margin-bottom:16px;
              ">
                ⚠️
              </div>

              <div style="
                font-size:20px;
                font-weight:800;
                margin-bottom:10px;
              ">
                ${
                  isVietnamese
                    ? "Không thể xác minh Developer"
                    : "Developer verification failed"
                }
              </div>

              <div style="
                font-size:14px;
                line-height:1.6;
                color:#a3a3a3;
              ">
                ${
                  error instanceof Error
                    ? error.message
                    : isVietnamese
                      ? "Đã xảy ra lỗi."
                      : "An error occurred."
                }
              </div>
            </div>
          </div>
        `;
      } catch (tabError) {
        console.error(
          "[SETTINGS] Failed to render error in developer tab:",
          tabError
        );
      }
    } finally {
      setDeveloperLoading(false);
    }
  }

  // ==========================================
  // RESEND OTP
  // ==========================================

  async function resendDeveloperOtp() {
    if (
      developerLoading ||
      developerCountdown > 0
    ) {
      return;
    }

    await requestDeveloperOtp();
  }

  // ==========================================
  // OTP COUNTDOWN
  // ==========================================

  useEffect(() => {
    if (developerCountdown <= 0) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setDeveloperCountdown(
          (current) =>
            Math.max(
              0,
              current - 1
            )
        );
      }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [developerCountdown]);

  // ==========================================
  // UI
  // ==========================================

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-foreground transition-colors duration-200">
      <div className="mx-auto w-full max-w-md">

        {/* HEADER */}

        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="
              flex
              h-10
              w-10
              items-center
              justify-center
              rounded-full
              bg-black/5
              text-xl
              transition
              hover:bg-black/10
              active:scale-95
              dark:bg-white/10
              dark:hover:bg-white/20
            "
            aria-label={
              isVietnamese
                ? "Quay lại"
                : "Back"
            }
          >
            ←
          </button>

          <div>
            <h1 className="text-2xl font-bold">
              {isVietnamese
                ? "Cài đặt"
                : "Settings"}
            </h1>

            <p className="mt-1 text-sm text-muted">
              {isVietnamese
                ? "Tùy chỉnh trò chơi"
                : "Customize your game"}
            </p>
          </div>
        </div>

        {/* CURRENT ROOM */}

        {currentRoom && (
          <section className="mb-7">
            <p className="mb-3 px-1 text-sm font-medium text-muted">
              {isVietnamese
                ? "Phòng hiện tại"
                : "Current room"}
            </p>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">
                      ROOM
                    </p>

                    <p className="mt-1 text-2xl font-black tracking-wider">
                      {currentRoom.code}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {currentRoom.playerName}
                    </p>

                    <p className="mt-1 text-xs text-muted">
                      {currentRoom.role ===
                      "host"
                        ? "👑 Host"
                        : isVietnamese
                          ? "Người chơi"
                          : "Player"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mx-4 border-t border-border" />

              <button
                type="button"
                onClick={openLeaveConfirm}
                disabled={leaving}
                className="
                  flex
                  w-full
                  items-center
                  justify-between
                  px-4
                  py-4
                  text-left
                  text-red-500
                  transition
                  hover:bg-red-500/5
                  active:bg-red-500/10
                  disabled:opacity-50
                "
              >
                <div>
                  <p className="font-semibold">
                    🚪{" "}
                    {isVietnamese
                      ? "Thoát phòng"
                      : "Leave room"}
                  </p>

                  <p className="mt-1 text-xs text-muted">
                    {isVietnamese
                      ? "Rời khỏi phòng hiện tại"
                      : "Leave the current room"}
                  </p>
                </div>

                <span className="text-xl">
                  ›
                </span>
              </button>
            </div>
          </section>
        )}

        {/* DEVELOPER TOOLS */}

        <section className="mb-7">
          <p className="mb-3 px-1 text-sm font-medium text-muted">
            {isVietnamese
              ? "Công cụ"
              : "Tools"}
          </p>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={openDeveloperConfirm}
              className="
                flex
                w-full
                items-center
                justify-between
                px-4
                py-4
                text-left
                transition
                hover:bg-black/5
                dark:hover:bg-white/5
                active:bg-black/10
                dark:active:bg-white/10
              "
            >
              <div className="flex items-center gap-3">
                <div className="
                  flex
                  h-10
                  w-10
                  items-center
                  justify-center
                  rounded-xl
                  bg-black/5
                  text-lg
                  dark:bg-white/10
                ">
                  🛠️
                </div>

                <div>
                  <p className="font-semibold">
                    Developer Tools
                  </p>

                  <p className="mt-1 text-xs text-muted">
                    {isVietnamese
                      ? "Xác minh để mở Developer Control Center"
                      : "Verify to open Developer Control Center"}
                  </p>
                </div>
              </div>

              <span className="text-xl">
                ›
              </span>
            </button>
          </div>
        </section>

        {/* THEME */}

        <section className="mb-7">
          <p className="mb-3 px-1 text-sm font-medium text-muted">
            {isVietnamese
              ? "Giao diện"
              : "Appearance"}
          </p>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className="
                flex
                w-full
                items-center
                justify-between
                px-4
                py-4
                transition
                hover:bg-black/5
                dark:hover:bg-white/5
              "
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-lg dark:bg-white/10">
                  🌙
                </div>

                <div className="text-left">
                  <p className="font-medium">
                    {isVietnamese
                      ? "Tối"
                      : "Dark"}
                  </p>

                  <p className="text-xs text-muted">
                    {isVietnamese
                      ? "Giao diện tối"
                      : "Dark appearance"}
                  </p>
                </div>
              </div>

              {theme === "dark" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-sm text-background">
                  ✓
                </span>
              )}
            </button>

            <div className="mx-4 border-t border-border" />

            <button
              type="button"
              onClick={() => setTheme("light")}
              className="
                flex
                w-full
                items-center
                justify-between
                px-4
                py-4
                transition
                hover:bg-black/5
                dark:hover:bg-white/5
              "
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 text-lg dark:bg-white/10">
                  ☀️
                </div>

                <div className="text-left">
                  <p className="font-medium">
                    {isVietnamese
                      ? "Sáng"
                      : "Light"}
                  </p>

                  <p className="text-xs text-muted">
                    {isVietnamese
                      ? "Giao diện sáng"
                      : "Light appearance"}
                  </p>
                </div>
              </div>

              {theme === "light" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-sm text-background">
                  ✓
                </span>
              )}
            </button>
          </div>
        </section>

        {/* LANGUAGE */}

        <section>
          <p className="mb-3 px-1 text-sm font-medium text-muted">
            {isVietnamese
              ? "Ngôn ngữ"
              : "Language"}
          </p>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => setLanguage("vi")}
              className="
                flex
                w-full
                items-center
                justify-between
                px-4
                py-4
                transition
                hover:bg-black/5
                dark:hover:bg-white/5
              "
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  🇻🇳
                </span>

                <div className="text-left">
                  <p className="font-medium">
                    Tiếng Việt
                  </p>

                  <p className="text-xs text-muted">
                    Vietnamese
                  </p>
                </div>
              </div>

              {language === "vi" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-sm text-background">
                  ✓
                </span>
              )}
            </button>

            <div className="mx-4 border-t border-border" />

            <button
              type="button"
              onClick={() => setLanguage("en")}
              className="
                flex
                w-full
                items-center
                justify-between
                px-4
                py-4
                transition
                hover:bg-black/5
                dark:hover:bg-white/5
              "
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  🇬🇧
                </span>

                <div className="text-left">
                  <p className="font-medium">
                    English
                  </p>

                  <p className="text-xs text-muted">
                    English
                  </p>
                </div>
              </div>

              {language === "en" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-sm text-background">
                  ✓
                </span>
              )}
            </button>
          </div>
        </section>
      </div>

      {/* LEAVE POPUP */}

      {showLeaveConfirm && currentRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="p-6">
              <div className="text-4xl">
                🚪
              </div>

              <h2 className="mt-4 text-2xl font-black">
                {isVietnamese
                  ? "Thoát phòng"
                  : "Leave room"}
              </h2>

              <p className="mt-3 text-sm leading-6 text-muted">
                {currentRoom.role ===
                "host"
                  ? isVietnamese
                    ? "Bạn đang là Host của phòng này. Bạn có thể giải tán phòng hoặc rời phòng và chuyển quyền Host cho người chơi khác."
                    : "You are the Host of this room. You can dissolve the room or leave and transfer Host to another player."
                  : isVietnamese
                    ? "Bạn có chắc muốn rời phòng?"
                    : "Are you sure you want to leave this room?"}
              </p>

              {leaveError && (
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
                  {leaveError}
                </div>
              )}

              <div className="mt-6 space-y-3">
                {currentRoom.role ===
                  "host" && (
                  <>
                    <button
                      type="button"
                      disabled={leaving}
                      onClick={() =>
                        leaveRoom("dissolve")
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
                        active:scale-[0.98]
                        disabled:opacity-50
                      "
                    >
                      {leaving
                        ? isVietnamese
                          ? "Đang xử lý..."
                          : "Processing..."
                        : isVietnamese
                          ? "Thoát & giải tán phòng"
                          : "Leave & dissolve room"}
                    </button>

                    <button
                      type="button"
                      disabled={leaving}
                      onClick={() =>
                        leaveRoom("leave")
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
                        active:scale-[0.98]
                        disabled:opacity-50
                      "
                    >
                      {leaving
                        ? isVietnamese
                          ? "Đang xử lý..."
                          : "Processing..."
                        : isVietnamese
                          ? "Thoát phòng"
                          : "Leave room"}
                    </button>
                  </>
                )}

                {currentRoom.role !==
                  "host" && (
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
                      active:scale-[0.98]
                      disabled:opacity-50
                    "
                  >
                    {leaving
                      ? isVietnamese
                        ? "Đang rời phòng..."
                        : "Leaving room..."
                      : isVietnamese
                        ? "Thoát phòng"
                        : "Leave room"}
                  </button>
                )}

                <button
                  type="button"
                  disabled={leaving}
                  onClick={
                    closeLeaveConfirm
                  }
                  className="
                    w-full
                    rounded-2xl
                    border
                    border-border
                    px-4
                    py-4
                    font-semibold
                    transition
                    hover:bg-black/5
                    dark:hover:bg-white/5
                    disabled:opacity-50
                  "
                >
                  {isVietnamese
                    ? "Hủy"
                    : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEVELOPER POPUP */}

      {showDeveloperConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-4xl">
                    🛠️
                  </div>

                  <h2 className="mt-4 text-2xl font-black">
                    Developer Tools
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-muted">
                    {developerStep ===
                    "email"
                      ? isVietnamese
                        ? "Xác minh email để mở Developer Control Center."
                        : "Verify your email to open Developer Control Center."
                      : isVietnamese
                        ? "Nhập mã OTP được gửi tới email."
                        : "Enter the OTP sent to your email."}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    developerLoading
                  }
                  onClick={
                    closeDeveloperConfirm
                  }
                  className="
                    flex
                    h-9
                    w-9
                    shrink-0
                    items-center
                    justify-center
                    rounded-full
                    bg-black/5
                    text-lg
                    transition
                    hover:bg-black/10
                    dark:bg-white/10
                    dark:hover:bg-white/20
                    disabled:opacity-50
                  "
                  aria-label={
                    isVietnamese
                      ? "Đóng"
                      : "Close"
                  }
                >
                  ×
                </button>
              </div>

              {developerError && (
                <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-500">
                  {developerError}
                </div>
              )}

              {developerSuccess && (
                <div className="mt-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm leading-6 text-green-500">
                  {developerSuccess}
                </div>
              )}

              <div className="mt-6">

                {/* EMAIL */}

                {developerStep ===
                  "email" && (
                  <>
                    <label className="mb-2 block text-sm font-semibold">
                      Email
                    </label>

                    <input
                      type="email"
                      value={
                        developerEmail
                      }
                      onChange={(event) =>
                        setDeveloperEmail(
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          requestDeveloperOtp();
                        }
                      }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      disabled={
                        developerLoading
                      }
                      className="
                        w-full
                        rounded-2xl
                        border
                        border-border
                        bg-background
                        px-4
                        py-4
                        text-foreground
                        outline-none
                        transition
                        placeholder:text-muted
                        focus:border-foreground/40
                        disabled:opacity-50
                      "
                    />

                    <button
                      type="button"
                      onClick={
                        requestDeveloperOtp
                      }
                      disabled={
                        developerLoading
                      }
                      className="
                        mt-4
                        w-full
                        rounded-2xl
                        bg-foreground
                        px-4
                        py-4
                        font-bold
                        text-background
                        transition
                        hover:opacity-90
                        active:scale-[0.98]
                        disabled:opacity-50
                      "
                    >
                      {developerLoading
                        ? isVietnamese
                          ? "Đang gửi OTP..."
                          : "Sending OTP..."
                        : isVietnamese
                          ? "Gửi mã OTP"
                          : "Send OTP"}
                    </button>
                  </>
                )}

                {/* OTP */}

                {developerStep ===
                  "otp" && (
                  <>
                    <div className="rounded-2xl border border-border bg-background/50 p-4">
                      <p className="text-xs text-muted">
                        Email
                      </p>

                      <p className="mt-1 break-all font-semibold">
                        {developerEmail}
                      </p>
                    </div>

                    <label className="mb-2 mt-5 block text-sm font-semibold">
                      OTP
                    </label>

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={developerOtp}
                      onChange={(event) =>
                        setDeveloperOtp(
                          event.target.value
                            .replace(
                              /\D/g,
                              ""
                            )
                            .slice(
                              0,
                              6
                            )
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          verifyDeveloperOtp();
                        }
                      }}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      disabled={
                        developerLoading
                      }
                      className="
                        w-full
                        rounded-2xl
                        border
                        border-border
                        bg-background
                        px-4
                        py-4
                        text-center
                        text-2xl
                        font-black
                        tracking-[0.35em]
                        text-foreground
                        outline-none
                        transition
                        placeholder:text-muted
                        focus:border-foreground/40
                        disabled:opacity-50
                      "
                    />

                    <button
                      type="button"
                      onClick={
                        verifyDeveloperOtp
                      }
                      disabled={
                        developerLoading ||
                        developerOtp.length !==
                          6
                      }
                      className="
                        mt-4
                        w-full
                        rounded-2xl
                        bg-foreground
                        px-4
                        py-4
                        font-bold
                        text-background
                        transition
                        hover:opacity-90
                        active:scale-[0.98]
                        disabled:opacity-50
                      "
                    >
                      {developerLoading
                        ? isVietnamese
                          ? "Đang xác minh..."
                          : "Verifying..."
                        : isVietnamese
                          ? "Xác minh & mở Control Center"
                          : "Verify & open Control Center"}
                    </button>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        disabled={
                          developerLoading
                        }
                        onClick={() => {
                          setDeveloperStep(
                            "email"
                          );
                          setDeveloperOtp(
                            ""
                          );
                          setDeveloperError(
                            ""
                          );
                          setDeveloperSuccess(
                            ""
                          );
                        }}
                        className="
                          text-sm
                          font-semibold
                          text-muted
                          transition
                          hover:text-foreground
                          disabled:opacity-50
                        "
                      >
                        ←{" "}
                        {isVietnamese
                          ? "Đổi email"
                          : "Change email"}
                      </button>

                      <button
                        type="button"
                        disabled={
                          developerLoading ||
                          developerCountdown >
                            0
                        }
                        onClick={
                          resendDeveloperOtp
                        }
                        className="
                          text-sm
                          font-semibold
                          text-muted
                          transition
                          hover:text-foreground
                          disabled:opacity-50
                        "
                      >
                        {developerCountdown >
                        0
                          ? isVietnamese
                            ? `Gửi lại sau ${developerCountdown}s`
                            : `Resend in ${developerCountdown}s`
                          : isVietnamese
                            ? "Gửi lại OTP"
                            : "Resend OTP"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={
                  developerLoading
                }
                onClick={
                  closeDeveloperConfirm
                }
                className="
                  mt-5
                  w-full
                  rounded-2xl
                  border
                  border-border
                  px-4
                  py-4
                  font-semibold
                  transition
                  hover:bg-black/5
                  dark:hover:bg-white/5
                  disabled:opacity-50
                "
              >
                {isVietnamese
                  ? "Hủy"
                  : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}