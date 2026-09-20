import { NextResponse } from "next/server";
import { Resend } from "resend";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

/* =========================
   EMAIL CONFIG
========================= */

const RECEIVER_EMAIL = "hoangkhoa121310@gmail.com";

// Dùng đúng sender đã test thành công
const FROM_EMAIL = "onboarding@resend.dev";

/* =========================
   RATE LIMIT
========================= */

const RATE_LIMIT_VERSION = "v6";
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60 * 10; // 10 phút

/* =========================
   HELPERS
========================= */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getClientIp(request: Request) {
  const forwardedFor =
    request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor
      .split(",")[0]
      .trim();
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/* =========================
   POST
========================= */

export async function POST(request: Request) {
  try {
    /* =========================
       ENV
    ========================= */

    const resendApiKey =
      process.env.RESEND_API_KEY;

    const redisUrl =
      process.env.UPSTASH_REDIS_REST_URL;

    const redisToken =
      process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!resendApiKey) {
      console.error(
        "[FEEDBACK] Missing RESEND_API_KEY"
      );

      return NextResponse.json(
        {
          error:
            "Server chưa cấu hình email.",
        },
        { status: 500 }
      );
    }

    if (!redisUrl || !redisToken) {
      console.error(
        "[FEEDBACK] Missing Upstash configuration"
      );

      return NextResponse.json(
        {
          error:
            "Server chưa cấu hình rate limit.",
        },
        { status: 503 }
      );
    }

    /* =========================
       CONTENT TYPE
    ========================= */

    const contentType =
      request.headers.get("content-type") ||
      "";

    if (
      !contentType.includes(
        "application/json"
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Dữ liệu gửi lên không hợp lệ.",
        },
        { status: 415 }
      );
    }

    /* =========================
       BODY SIZE
    ========================= */

    const contentLength =
      request.headers.get("content-length");

    if (
      contentLength &&
      Number(contentLength) > 20_000
    ) {
      return NextResponse.json(
        {
          error:
            "Nội dung gửi lên quá lớn.",
        },
        { status: 413 }
      );
    }

    /* =========================
       PARSE BODY
    ========================= */

    let body: {
      type?: unknown;
      name?: unknown;
      message?: unknown;
      website?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "Dữ liệu không hợp lệ.",
        },
        { status: 400 }
      );
    }

    /* =========================
       HONEYPOT
    ========================= */

    if (
      typeof body.website === "string" &&
      body.website.trim() !== ""
    ) {
      // Bot → giả vờ thành công
      return NextResponse.json({
        success: true,
      });
    }

    /* =========================
       NORMALIZE
    ========================= */

    const type =
      typeof body.type === "string"
        ? body.type.trim()
        : "";

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    /* =========================
       VALIDATION
    ========================= */

    const allowedTypes = [
      "Góp ý",
      "Báo lỗi",
      "Ý tưởng",
    ];

    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        {
          error:
            "Loại feedback không hợp lệ.",
        },
        { status: 400 }
      );
    }

    /*
      Name đang optional ở UI,
      nên server cũng cho phép name rỗng.
    */

    if (name.length > 50) {
      return NextResponse.json(
        {
          error:
            "Tên không được vượt quá 50 ký tự.",
        },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        {
          error:
            "Vui lòng nhập nội dung feedback.",
        },
        { status: 400 }
      );
    }

    if (message.length > 1000) {
      return NextResponse.json(
        {
          error:
            "Feedback không được vượt quá 1000 ký tự.",
        },
        { status: 400 }
      );
    }

    /* =========================
       RATE LIMIT
    ========================= */

    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    const ip = getClientIp(request);

    const rateLimitKey =
      `feedback:${RATE_LIMIT_VERSION}:${ip}`;

    try {
      const currentCount =
        await redis.incr(rateLimitKey);

      if (currentCount === 1) {
        await redis.expire(
          rateLimitKey,
          RATE_LIMIT_WINDOW
        );
      }

      console.log(
        `[FEEDBACK] Rate limit: ${currentCount}/${RATE_LIMIT_MAX}`
      );

      if (
        currentCount > RATE_LIMIT_MAX
      ) {
        return NextResponse.json(
          {
            error:
              "Bạn gửi feedback quá nhanh. Vui lòng thử lại sau.",
          },
          { status: 429 }
        );
      }
    } catch (redisError) {
      console.error(
        "[FEEDBACK] Redis error:",
        redisError
      );

      return NextResponse.json(
        {
          error:
            "Hệ thống đang bận. Vui lòng thử lại sau.",
        },
        { status: 503 }
      );
    }

    /* =========================
       PREPARE EMAIL
    ========================= */

    const safeType =
      escapeHtml(type);

    const safeName =
      escapeHtml(
        name || "Anonymous"
      );

    const safeMessage =
      escapeHtml(message).replace(
        /\n/g,
        "<br>"
      );

    console.log(
      "[FEEDBACK] About to send email:",
      {
        from: FROM_EMAIL,
        to: RECEIVER_EMAIL,
        type,
        name: name || "Anonymous",
        messageLength: message.length,
      }
    );

    /* =========================
       RESEND
    ========================= */

    const resend =
      new Resend(resendApiKey);

    const { data, error } =
      await resend.emails.send({
        from: FROM_EMAIL,

        to: [RECEIVER_EMAIL],

        subject:
          `[Đường Biên Đêm] ${type}`,

        html: `
          <!DOCTYPE html>

          <html>
            <body
              style="
                margin: 0;
                padding: 24px;
                background: #f5f5f5;
                font-family:
                  Arial,
                  Helvetica,
                  sans-serif;
                color: #222;
              "
            >

              <div
                style="
                  max-width: 680px;
                  margin: 0 auto;
                  background: #ffffff;
                  border-radius: 16px;
                  padding: 24px;
                "
              >

                <h2
                  style="
                    margin-top: 0;
                  "
                >
                  Feedback mới từ
                  Đường Biên Đêm
                </h2>

                <p>
                  <strong>
                    Loại:
                  </strong>

                  ${safeType}
                </p>

                <p>
                  <strong>
                    Người gửi:
                  </strong>

                  ${safeName}
                </p>

                <p>
                  <strong>
                    Nội dung:
                  </strong>
                </p>

                <div
                  style="
                    padding: 16px;
                    background: #f5f5f5;
                    border-radius: 10px;
                    line-height: 1.6;
                  "
                >
                  ${safeMessage}
                </div>

                <hr
                  style="
                    margin: 24px 0;
                    border: 0;
                    border-top:
                      1px solid #ddd;
                  "
                />

                <p
                  style="
                    margin-bottom: 0;
                    color: #888;
                    font-size: 12px;
                  "
                >
                  Email tự động từ hệ thống
                  feedback của
                  Đường Biên Đêm.
                </p>

              </div>

            </body>
          </html>
        `,
      });

    /* =========================
       RESEND ERROR
    ========================= */

    if (error) {
      console.error(
        "[FEEDBACK] Resend error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Không thể gửi email feedback. Vui lòng thử lại sau.",
        },
        { status: 500 }
      );
    }

    /* =========================
       SUCCESS
    ========================= */

    console.log(
      "[FEEDBACK] Email sent successfully:",
      data?.id
    );

    return NextResponse.json({
      success: true,
      message:
        "Đã gửi feedback thành công.",
    });
  } catch (error) {
    console.error(
      "[FEEDBACK] Unexpected error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Không thể gửi feedback. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}