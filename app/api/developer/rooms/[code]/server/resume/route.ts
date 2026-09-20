import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const url = new URL(
    `/api/developer/rooms/${code}/server`,
    request.url
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-developer-session":
        request.headers.get("x-developer-session") ?? "",
    },
    body: JSON.stringify({
      action: "resume",
    }),
    cache: "no-store",
  });

  const data = await response.json();

  return NextResponse.json(data, {
    status: response.status,
  });
}