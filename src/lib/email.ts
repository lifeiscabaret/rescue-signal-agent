import { EmailClient } from "@azure/communication-email";
import { RescueSignalResult } from "@/types/rescue-animal";

// ─────────────────────────────────────────────────────────────────────────────
// Azure Communication Services 이메일 발송 + 다이제스트 HTML 빌더
// ─────────────────────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  plainText: string
): Promise<boolean> {
  const conn = process.env.ACS_EMAIL_CONN;
  const sender = process.env.ACS_EMAIL_SENDER;
  if (!conn || !sender) {
    console.error("[email] ACS_EMAIL_CONN/SENDER 미설정");
    return false;
  }
  try {
    const client = new EmailClient(conn);
    const poller = await client.beginSend({
      senderAddress: sender,
      content: { subject, html, plainText },
      recipients: { to: [{ address: to }] },
    });
    const result = await poller.pollUntilDone();
    return result.status === "Succeeded";
  } catch (e) {
    console.error("[email] 발송 실패:", e);
    return false;
  }
}

function daysLeft(noticeEdt: string): number | null {
  const digits = (noticeEdt || "").replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  const end = new Date(
    Number(digits.slice(0, 4)),
    Number(digits.slice(4, 6)) - 1,
    Number(digits.slice(6, 8))
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}

function esc(s: string): string {
  return (s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

/** 맞춤 추천 다이제스트 이메일 (HTML + plainText) */
export function buildDigestEmail(
  results: RescueSignalResult[],
  opts: { regionLabel: string; speciesLabel: string; slotLabel: string; unsubscribeUrl: string }
): { subject: string; html: string; plainText: string } {
  const subject = `🐾 ${opts.slotLabel} 맞춤 구조신호 TOP ${results.length} (${opts.regionLabel}·${opts.speciesLabel})`;

  const cards = results
    .map((r, i) => {
      const a = r.animal;
      const place = esc(a.careAddr || a.happenPlace || "지역 미상");
      const dl = daysLeft(a.noticeEdt);
      const dtag = dl !== null ? ` · ⏰ D-${dl}` : "";
      const reason = esc(r.priorityReasons[0]?.label ?? r.matchReasons[0]?.label ?? "우선 확인 필요");
      const note = esc((a.specialMark || "").slice(0, 80));
      const img = a.popfile && a.popfile.startsWith("http")
        ? `<img src="${esc(a.popfile)}" alt="" width="96" height="96" style="border-radius:8px;object-fit:cover;float:left;margin-right:12px;">`
        : "";
      return `
        <div style="border:1px solid #eee;border-radius:12px;padding:14px;margin-bottom:12px;overflow:hidden;">
          ${img}
          <div style="font-weight:700;font-size:15px;color:#111;">${i + 1}. ${esc(a.kindCd)}</div>
          <div style="color:#555;font-size:13px;margin-top:4px;">📍 ${place}${dtag}</div>
          <div style="color:#777;font-size:12px;margin-top:6px;">${reason}${note ? ` · ${note}` : ""}</div>
        </div>`;
    })
    .join("");

  const html = `
  <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:8px;">
    <h2 style="color:#FF6B6B;">🐾 ${esc(opts.slotLabel)} 맞춤 구조신호</h2>
    <p style="color:#555;font-size:13px;">선택하신 조건 <b>${esc(opts.regionLabel)} · ${esc(opts.speciesLabel)}</b>에 맞춰 우선 확인이 필요한 아이들을 찾았어요.</p>
    ${cards}
    <p style="color:#999;font-size:12px;margin-top:8px;">보호소에 직접 확인 후 입양·임보를 결정해주세요.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
    <p style="color:#bbb;font-size:11px;">더 이상 받고 싶지 않으시면 <a href="${esc(opts.unsubscribeUrl)}" style="color:#bbb;">구독 해지</a></p>
  </div>`;

  const plainText =
    `${opts.slotLabel} 맞춤 구조신호 (${opts.regionLabel}·${opts.speciesLabel})\n\n` +
    results
      .map((r, i) => {
        const a = r.animal;
        const dl = daysLeft(a.noticeEdt);
        return `${i + 1}. ${a.kindCd} | ${a.careAddr || a.happenPlace}${dl !== null ? ` | D-${dl}` : ""}`;
      })
      .join("\n") +
    `\n\n보호소에 직접 확인 후 결정해주세요.\n구독 해지: ${opts.unsubscribeUrl}`;

  return { subject, html, plainText };
}
