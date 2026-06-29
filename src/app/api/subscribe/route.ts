import { NextRequest, NextResponse } from "next/server";
import { addSubscription, Slot } from "@/lib/subscriptions";
import { sendEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function regionLabel(r: string): string {
  return r && r !== "전국" && r !== "전체" ? r : "전국";
}
function speciesLabel(s: string): string {
  return s === "dog" ? "강아지" : s === "cat" ? "고양이" : s === "other" ? "기타" : "전체";
}

/**
 * POST /api/subscribe
 * body: { email, region, species, slot }
 * 사용자가 선택한 조건으로 이메일 구독을 등록하고 확인 메일을 보낸다.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; region?: string; species?: string; slot?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const email = (body.email || "").trim();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요." }, { status: 400 });
  }

  const slot: Slot = body.slot === "evening" ? "evening" : "morning";
  const region = body.region === "전체" ? "" : (body.region || "");
  const speciesIn = body.species || "any";
  const species = ["dog", "cat", "other", "any"].includes(speciesIn) ? speciesIn : "any";

  let sub;
  try {
    sub = await addSubscription({ email, region, species, slot });
  } catch (e) {
    console.error("[subscribe] 저장 실패:", e);
    return NextResponse.json({ error: "구독 저장에 실패했습니다." }, { status: 500 });
  }

  // 확인 메일 (실패해도 구독은 유지)
  const base = process.env.APP_BASE_URL || new URL(request.url).origin;
  const unsubscribeUrl = `${base}/api/unsubscribe?slot=${sub.slot}&id=${sub.id}&token=${sub.token}`;
  const slotLabel = slot === "morning" ? "매일 아침 9시" : "매일 저녁 6시";
  const rLabel = regionLabel(region);
  const sLabel = speciesLabel(species);

  sendEmail(
    email,
    "🐾 구조신호 알림 구독이 완료됐어요",
    `<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;">
       <h2 style="color:#FF6B6B;">구독 완료 🐾</h2>
       <p><b>${rLabel} · ${sLabel}</b> 조건으로 <b>${slotLabel}</b> 맞춤 구조신호를 보내드릴게요.</p>
       <p style="color:#999;font-size:12px;">해지: <a href="${unsubscribeUrl}">구독 해지</a></p>
     </div>`,
    `구독 완료: ${rLabel}·${sLabel} / ${slotLabel}\n해지: ${unsubscribeUrl}`
  ).catch(() => {});

  return NextResponse.json({ ok: true, id: sub.id, slot: sub.slot, region: rLabel, species: sLabel });
}
