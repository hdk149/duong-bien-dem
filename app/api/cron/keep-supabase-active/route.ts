
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (
    !secret ||
    request.headers.get("authorization") !== `Bearer ${secret}`
  ) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await supabase
    .from("rooms")
    .select("id")
    .limit(1);

  if (error) {
    console.error("[KEEP ALIVE]", error);

    return NextResponse.json(
      { error: "Database query failed" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Supabase is active",
    checkedAt: new Date().toISOString(),
  });
}
