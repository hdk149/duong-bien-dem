import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function hashOtp(otp: string) {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
}

function hashToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const otp =
      typeof body.otp === "string"
        ? body.otp.trim()
        : "";

    if (!email || !otp) {
      return NextResponse.json(
        {
          success: false,
          error: "Email và OTP là bắt buộc.",
        },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        {
          success: false,
          error: "OTP phải gồm 6 chữ số.",
        },
        { status: 400 }
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Thiếu cấu hình Supabase server.",
        },
        { status: 500 }
      );
    }

    /*
     * ==========================================
     * LẤY OTP GẦN NHẤT
     * ==========================================
     *
     * Global Developer:
     *
     * email
     *   ↓
     * developer_verifications
     *
     * Không còn phụ thuộc player_id.
     */

    const verificationResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/developer_verifications?email=eq.${encodeURIComponent(
          email
        )}&select=id,otp_hash,expires_at,verified_at,created_at&order=created_at.desc&limit=1`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          cache: "no-store",
        }
      );

    if (!verificationResponse.ok) {
      const errorText =
        await verificationResponse.text();

      console.error(
        "DEVELOPER VERIFICATION LOOKUP ERROR:",
        errorText
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể kiểm tra mã xác minh.",
        },
        { status: 500 }
      );
    }

    const verifications =
      await verificationResponse.json();

    if (
      !Array.isArray(verifications) ||
      !verifications.length
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Không tìm thấy mã OTP.",
        },
        { status: 400 }
      );
    }

    const verification =
      verifications[0];

    /*
     * ==========================================
     * OTP ĐÃ SỬ DỤNG?
     * ==========================================
     */

    if (verification.verified_at) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Mã OTP này đã được sử dụng.",
        },
        { status: 400 }
      );
    }

    /*
     * ==========================================
     * OTP HẾT HẠN?
     * ==========================================
     */

    const expiresTime =
      new Date(
        verification.expires_at
      ).getTime();

    if (
      !Number.isFinite(expiresTime) ||
      expiresTime <= Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Mã OTP đã hết hạn.",
        },
        { status: 400 }
      );
    }

    /*
     * ==========================================
     * KIỂM TRA OTP
     * ==========================================
     */

    const submittedHash =
      hashOtp(otp);

    if (
      submittedHash !==
      verification.otp_hash
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Mã OTP không chính xác.",
        },
        { status: 400 }
      );
    }

    /*
     * ==========================================
     * ĐÁNH DẤU OTP ĐÃ VERIFY
     * ==========================================
     */

    const verifiedAt =
      new Date().toISOString();

    const updateResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/developer_verifications?id=eq.${verification.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type":
              "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            verified_at: verifiedAt,
          }),
        }
      );

    if (!updateResponse.ok) {
      const errorText =
        await updateResponse.text();

      console.error(
        "DEVELOPER VERIFICATION UPDATE ERROR:",
        errorText
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể hoàn tất xác minh.",
        },
        { status: 500 }
      );
    }

    /*
     * ==========================================
     * TẠO GLOBAL DEVELOPER SESSION
     * ==========================================
     */

    const developerToken =
      crypto.randomBytes(32).toString("hex");

    const tokenHash =
      hashToken(developerToken);

    const expiresAt =
      new Date(
        Date.now() +
          24 * 60 * 60 * 1000
      ).toISOString();

    /*
     * ==========================================
     * LƯU SESSION
     * ==========================================
     *
     * player_id = null
     *
     * Vì Developer hiện tại là GLOBAL,
     * không phụ thuộc room/player.
     */

    const sessionResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/developer_sessions`,
        {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type":
              "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            player_id: null,
            token_hash: tokenHash,
            expires_at: expiresAt,
          }),
        }
      );

    if (!sessionResponse.ok) {
      const errorText =
        await sessionResponse.text();

      console.error(
        "DEVELOPER SESSION ERROR:",
        errorText
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể tạo Developer Session.",
        },
        { status: 500 }
      );
    }

    /*
     * ==========================================
     * TRẢ TOKEN
     * ==========================================
     */

    return NextResponse.json(
      {
        success: true,

        message:
          "Developer Mode đã được xác minh.",

        developer_token:
          developerToken,

        expires_at:
          expiresAt,

        developer: {
          email,
          type: "global",
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error(
      "VERIFY OTP ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Đã xảy ra lỗi khi xác minh OTP.",
      },
      { status: 500 }
    );
  }
}