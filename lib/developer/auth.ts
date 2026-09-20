import crypto from "crypto";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const developerAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashToken(token: string) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

export async function verifyDeveloperSession(
  request: NextRequest
) {
  const developerToken =
    request.headers
      .get("x-developer-session")
      ?.trim() || "";

  if (!developerToken) {
    return {
      ok: false as const,
      error: "Missing developer session.",
    };
  }

  const tokenHash = hashToken(developerToken);

  const {
    data: developerSession,
    error,
  } = await developerAdmin
    .from("developer_sessions")
    .select(
      "id, player_id, expires_at"
    )
    .eq("token_hash", tokenHash)
    .gt(
      "expires_at",
      new Date().toISOString()
    )
    .maybeSingle();

  if (error) {
    console.error(
      "Developer session lookup error:",
      error
    );

    return {
      ok: false as const,
      error:
        "Failed to validate developer session.",
    };
  }

  if (!developerSession) {
    return {
      ok: false as const,
      error:
        "Developer session expired or invalid.",
    };
  }

  return {
    ok: true as const,
    session: developerSession,
  };
}

export default developerAdmin;
