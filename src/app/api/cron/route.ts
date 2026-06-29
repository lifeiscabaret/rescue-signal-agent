import { NextRequest, NextResponse } from "next/server";
import { UserPreference } from "@/types/rescue-animal";
import { recommendTopRescueSignals } from "@/lib/scoring";
import { fetchRescueAnimals } from "@/lib/rescue-data";
import {
  AlertChannel,
  AlertSlot,
  SLOT_LABEL,
  channelsForSlot,
} from "@/lib/alert-channels";
import { listBySlot, Subscription } from "@/lib/subscriptions";
import { sendEmail, buildDigestEmail } from "@/lib/email";

function speciesLabel(s: string): string {
  return s === "dog" ? "강아지" : s === "cat" ? "고양이" : s === "other" ? "기타" : "전체";
}

/** 한 구독자에게 본인 조건에 맞춘 개인 이메일 발송 */
async function dispatchSubscriber(
  sub: Subscription,
  base: string
): Promise<{ email: string; sent: boolean; reason?: string }> {
  const region = sub.region && sub.region !== "전국" ? sub.region : "";
  const pref: UserPreference = {
    region,
    species: (["dog", "cat", "other", "any"].includes(sub.species)
      ? sub.species
      : "any") as UserPreference["species"],
    helpType: ["adoption", "foster", "share"],
    canCareForSenior: true,
    canCareForMedical: true,
    sizePreference: "any",
  };

  const { animals } = await fetchRescueAnimals({
    region: region || null,
    species: sub.species !== "any" ? sub.species : null,
  });
  if (animals.length === 0) return { email: sub.email, sent: false, reason: "대상 없음" };

  const top = recommendTopRescueSignals(animals, pref, 3);
  if (top.length === 0) return { email: sub.email, sent: false, reason: "대상 없음" };

  const unsubscribeUrl = `${base}/api/unsubscribe?slot=${sub.slot}&id=${sub.id}&token=${sub.token}`;
  const { subject, html, plainText } = buildDigestEmail(top, {
    regionLabel: region || "전국",
    speciesLabel: speciesLabel(sub.species),
    slotLabel: SLOT_LABEL[sub.slot],
    unsubscribeUrl,
  });
  const sent = await sendEmail(sub.email, subject, html, plainText);
  return { email: sub.email, sent, reason: sent ? undefined : "발송 실패" };
}

/**
 * 자동 알림(스케줄) 엔드포인트.
 *
 * 외부 스케줄러(GitHub Actions)가 시각별로 호출한다.
 *   GET /api/cron?slot=morning   → morning 슬롯의 모든 지역 채널에 발송
 *   GET /api/cron?slot=evening&region=서울  → 특정 채널만 (테스트용)
 *
 * 보안: CRON_SECRET 과 일치하는 토큰(헤더 x-cron-secret 또는 ?key=) 필요.
 * 채널: @/lib/alert-channels 의 설정을 따른다. 웹훅 env 미설정 채널은 건너뛴다.
 */

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

/** 한 채널에 대해 데이터 수집 → 스코어링 → Discord 발송 */
async function dispatchChannel(
  channel: AlertChannel
): Promise<{ id: string; sent: boolean; reason?: string; count?: number; dataSource?: string }> {
  const webhook = process.env[channel.webhookEnv];
  if (!webhook) {
    return { id: channel.id, sent: false, reason: "webhook 미설정" };
  }

  const region = channel.region === "전국" ? "" : channel.region;
  const pref: UserPreference = {
    region,
    species: "any",
    helpType: ["adoption", "foster", "share"],
    canCareForSenior: true,
    canCareForMedical: true,
    sizePreference: "any",
  };

  const { animals, dataSource } = await fetchRescueAnimals({
    region: region || null,
  });
  if (animals.length === 0) {
    return { id: channel.id, sent: false, reason: "추천 대상 없음" };
  }

  const top = recommendTopRescueSignals(animals, pref, 3);
  if (top.length === 0) {
    return { id: channel.id, sent: false, reason: "추천 대상 없음" };
  }

  const fields = top.map((r, i) => {
    const a = r.animal;
    const place = a.careAddr || a.happenPlace || "지역 미상";
    const dl = daysLeft(a.noticeEdt);
    const dtag = dl !== null ? ` · ⏰ D-${dl}` : "";
    const reason = r.priorityReasons[0]?.label ?? "우선 확인 필요";
    const note = (a.specialMark || "").slice(0, 50);
    return {
      name: `${i + 1}. ${a.kindCd}`,
      value: `📍 ${place}${dtag}\n${reason}${note ? ` · ${note}` : ""}`,
      inline: false,
    };
  });

  const payload = {
    username: "🐾 구조신호 에이전트",
    embeds: [
      {
        title: `${SLOT_LABEL[channel.slot]} · ${channel.region} 구조신호 TOP ${top.length}`,
        description: `우선 확인이 필요한 아이들을 찾았어요.${
          channel.invite ? `\n알림 더 받기: ${channel.invite}` : ""
        }`,
        color: 0xff6b6b,
        fields,
        footer: { text: "보호소에 직접 확인 후 입양·임보를 결정해주세요." },
      },
    ],
    allowed_mentions: { parse: [] },
  };

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[cron] ${channel.id} webhook failed:`, res.status, text);
    return { id: channel.id, sent: false, reason: `발송 실패 ${res.status}` };
  }

  return { id: channel.id, sent: true, count: top.length, dataSource };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // 1) 인증
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") || url.searchParams.get("key");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) 슬롯
  const slotParam = url.searchParams.get("slot") || "morning";
  if (slotParam !== "morning" && slotParam !== "evening") {
    return NextResponse.json(
      { error: `Unknown slot: ${slotParam}` },
      { status: 400 }
    );
  }
  const slot = slotParam as AlertSlot;

  // 3) 대상 채널 — region 지정 시 그 채널만(테스트), 아니면 슬롯 전체
  const regionFilter = url.searchParams.get("region");
  let targets = channelsForSlot(slot);
  if (regionFilter) {
    targets = targets.filter((c) => c.region === regionFilter);
  }
  if (targets.length === 0) {
    return NextResponse.json(
      { ok: true, sent: 0, reason: "대상 채널 없음" },
      { status: 200 }
    );
  }

  // 4) 채널별 발송 (병렬)
  const results = await Promise.all(targets.map((c) => dispatchChannel(c)));
  const sentCount = results.filter((r) => r.sent).length;

  // 5) 구독자별 개인 이메일 발송 (region 지정 테스트 호출이 아닐 때만 전체 처리)
  const base = process.env.APP_BASE_URL || url.origin;
  let emailResults: { email: string; sent: boolean; reason?: string }[] = [];
  if (!regionFilter) {
    const subs = await listBySlot(slot);
    emailResults = await Promise.all(subs.map((s) => dispatchSubscriber(s, base)));
  }
  const emailsSent = emailResults.filter((r) => r.sent).length;

  return NextResponse.json({
    ok: true,
    slot,
    channels: { sent: sentCount, total: targets.length, results },
    emails: { sent: emailsSent, total: emailResults.length, results: emailResults },
  });
}
