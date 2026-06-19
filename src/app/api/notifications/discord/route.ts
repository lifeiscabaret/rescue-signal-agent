import { NextRequest, NextResponse } from "next/server";

interface DiscordRequestBody {
  message: string;
}

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Discord webhook이 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  let body: DiscordRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 형식입니다." },
      { status: 400 }
    );
  }

  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json(
      { error: "message 필드가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: body.message.slice(0, 1900),
        allowed_mentions: { parse: [] },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[discord] Webhook failed:", res.status, text);
      return NextResponse.json(
        { error: "Discord 전송에 실패했습니다." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[discord] Webhook error:", error);
    return NextResponse.json(
      { error: "Discord 연결에 실패했습니다." },
      { status: 502 }
    );
  }
}
