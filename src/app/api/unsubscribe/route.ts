import { NextRequest, NextResponse } from "next/server";
import { removeSubscription, Slot } from "@/lib/subscriptions";

/**
 * GET /api/unsubscribe?slot=&id=&token=
 * 이메일의 해지 링크에서 호출. id+token 일치 시 구독 삭제.
 * 사람이 클릭하는 링크이므로 간단한 HTML 페이지를 반환한다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slotParam = searchParams.get("slot");
  const id = searchParams.get("id") || "";
  const token = searchParams.get("token") || "";
  const slot: Slot = slotParam === "evening" ? "evening" : "morning";

  let ok = false;
  if (id && token) {
    ok = await removeSubscription(slot, id, token);
  }

  const msg = ok
    ? "구독이 해지되었습니다. 그동안 함께해 주셔서 감사합니다. 🐾"
    : "해지 처리에 실패했습니다. 링크가 만료되었거나 이미 해지되었을 수 있어요.";

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>구독 해지</title></head>
    <body style="font-family:-apple-system,'Segoe UI',sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#fafafa;">
      <div style="text-align:center;padding:32px;">
        <div style="font-size:40px;">🐾</div>
        <p style="color:#333;font-size:15px;max-width:360px;">${msg}</p>
        <a href="${process.env.APP_BASE_URL || "/"}" style="color:#6366f1;font-size:13px;">홈으로</a>
      </div>
    </body></html>`;

  return new NextResponse(html, {
    status: ok ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
