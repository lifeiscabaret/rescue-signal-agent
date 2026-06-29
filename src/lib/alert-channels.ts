// ─────────────────────────────────────────────────────────────────────────────
// 조건별 알림 채널 설정 (시간대 × 지역)
//
// 단일 소스 오브 트루스. UI(참여 버튼)와 cron(자동 발송)이 함께 사용한다.
//  - invite: 공개 Discord 초대 링크 → 안전하므로 여기에 직접 적는다. "" 면 '준비 중'.
//  - webhookEnv: 서버 전용 웹훅 env 변수명 → 비밀이므로 값은 Azure 앱 설정에만 둔다.
//
// 새 채널 추가법:
//  1) Discord에 채널 + 웹훅 + 초대링크 생성
//  2) 아래 배열에 한 줄 추가 (invite 채우고, webhookEnv 이름 정함)
//  3) Azure 앱 설정에 그 webhookEnv 값 등록
// ─────────────────────────────────────────────────────────────────────────────

export type AlertSlot = "morning" | "evening";

export interface AlertChannel {
  id: string;
  slot: AlertSlot;
  /** "전국" 이면 지역 필터 없음 */
  region: string;
  label: string;
  /** 공개 초대 링크 (없으면 준비 중) */
  invite: string;
  /** 서버 전용 웹훅 env 변수명 */
  webhookEnv: string;
}

export const SLOT_LABEL: Record<AlertSlot, string> = {
  morning: "🌅 아침 9시",
  evening: "🌙 저녁 6시",
};

export const ALERT_CHANNELS: AlertChannel[] = [
  // 전국 — 기존 알리미 채널을 그대로 사용 (바로 동작)
  {
    id: "all-morning",
    slot: "morning",
    region: "전국",
    label: "전국 · 아침",
    invite: "https://discord.gg/9ReYqFQtm",
    webhookEnv: "DISCORD_WEBHOOK_URL",
  },
  {
    id: "all-evening",
    slot: "evening",
    region: "전국",
    label: "전국 · 저녁",
    invite: "https://discord.gg/9ReYqFQtm",
    webhookEnv: "DISCORD_WEBHOOK_URL",
  },
  // 서울 — 채널/웹훅/초대링크 준비되면 invite 채우고 Azure에 webhookEnv 등록
  {
    id: "seoul-morning",
    slot: "morning",
    region: "서울",
    label: "서울 · 아침",
    invite: "",
    webhookEnv: "DISCORD_WEBHOOK_SEOUL_MORNING",
  },
  {
    id: "seoul-evening",
    slot: "evening",
    region: "서울",
    label: "서울 · 저녁",
    invite: "",
    webhookEnv: "DISCORD_WEBHOOK_SEOUL_EVENING",
  },
  // 경기
  {
    id: "gyeonggi-morning",
    slot: "morning",
    region: "경기",
    label: "경기 · 아침",
    invite: "",
    webhookEnv: "DISCORD_WEBHOOK_GYEONGGI_MORNING",
  },
  {
    id: "gyeonggi-evening",
    slot: "evening",
    region: "경기",
    label: "경기 · 저녁",
    invite: "",
    webhookEnv: "DISCORD_WEBHOOK_GYEONGGI_EVENING",
  },
];

/** 설정된 모든 지역 (UI 셀렉트용, 중복 제거) */
export function alertRegions(): string[] {
  return Array.from(new Set(ALERT_CHANNELS.map((c) => c.region)));
}

/** 특정 슬롯의 채널들 (cron용) */
export function channelsForSlot(slot: AlertSlot): AlertChannel[] {
  return ALERT_CHANNELS.filter((c) => c.slot === slot);
}

/** 지역+슬롯으로 채널 찾기 (UI용) */
export function findChannel(
  region: string,
  slot: AlertSlot
): AlertChannel | undefined {
  return ALERT_CHANNELS.find((c) => c.region === region && c.slot === slot);
}
