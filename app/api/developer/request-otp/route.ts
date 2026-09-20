import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(
  process.env.RESEND_API_KEY
);

function hashOtp(otp: string) {
  return crypto
    .createHash("sha256")
    .update(otp)
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

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "Email là bắt buộc.",
        },
        { status: 400 }
      );
    }

    /*
     * ==========================================
     * SUPABASE SERVER CONFIG
     * ==========================================
     */

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
     * TẠO OTP
     * ==========================================
     */

    const otp = crypto
      .randomInt(100000, 1000000)
      .toString();

    const otpHash = hashOtp(otp);

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString();

    /*
     * ==========================================
     * LƯU OTP
     * ==========================================
     *
     * Global Developer nên không phụ thuộc
     * room_players nữa.
     *
     * player_id = null
     */

    const insertResponse = await fetch(
      `${supabaseUrl}/rest/v1/developer_verifications`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          player_id: null,
          email,
          otp_hash: otpHash,
          expires_at: expiresAt,
          verified_at: null,
        }),
      }
    );

    if (!insertResponse.ok) {
      const errorText =
        await insertResponse.text();

      console.error(
        "DEVELOPER OTP INSERT ERROR:",
        errorText
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể lưu mã xác minh.",
        },
        { status: 500 }
      );
    }

    /*
     * ==========================================
     * GỬI EMAIL
     * ==========================================
     */

    const { error } =
      await resend.emails.send({
        from: "onboarding@resend.dev",
        to: email,
        subject:
          "Mã xác minh Developer Mode — Đường Biên Đêm",
        html: `
          <div
            style="
              font-family:Arial,sans-serif;
              max-width:520px;
              margin:auto;
              padding:24px
            "
          >
            <h2>Developer Mode</h2>

            <p>
              Mã xác minh Developer Mode của bạn:
            </p>

            <div
              style="
                font-size:32px;
                font-weight:700;
                letter-spacing:8px;
                margin:24px 0;
              "
            >
              ${otp}
            </div>

            <p>
              Mã này có hiệu lực trong
              <strong>10 phút</strong>.
            </p>

            <p
              style="
                color:#777;
                font-size:13px
              "
            >
              Nếu bạn không yêu cầu mã này,
              hãy bỏ qua email này.
            </p>
          </div>
        `,
      });

    if (error) {
      console.error(
        "RESEND ERROR:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Không thể gửi email OTP.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Đã gửi mã OTP.",
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
      "REQUEST OTP ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Đã xảy ra lỗi khi yêu cầu OTP.",
      },
      { status: 500 }
    );
  }
}