import { RescueAnimal, UserPreference, GeneratedMessages } from "@/types/rescue-animal";

/**
 * Generate messages for a recommended rescue animal.
 *
 * Safety rules:
 * - Never claim an animal is scheduled for euthanasia unless the source data explicitly says so.
 * - Do not use fear-based or definitive death-related language.
 * - Use safe wording: "우선 확인 필요", "공고 마감이 다가올 수 있음",
 *   "먼저 확인이 필요합니다", "보호소에 직접 확인해주세요",
 *   "공유할 만한 구조 신호"
 */
export function generateMessages(
  animal: RescueAnimal,
  userPreference: UserPreference
): GeneratedMessages {
  const species = animal.kindCd.includes("고양이") ? "고양이" : "강아지";
  const region = animal.careAddr || animal.happenPlace;
  const helpTypeLabel = userPreference.helpType.includes("adoption")
    ? "입양"
    : userPreference.helpType.includes("foster")
    ? "임시보호"
    : "홍보 공유";

  // Shelter inquiry message
  const shelterInquiry = [
    `안녕하세요, ${animal.careNm} 담당자님.`,
    `공고번호 ${animal.noticeNo}로 등록된 ${animal.kindCd}에 대해 문의드립니다.`,
    `현재 보호 상태와 ${helpTypeLabel} 가능 여부를 확인하고 싶습니다.`,
    animal.specialMark
      ? `특이사항에 "${animal.specialMark.slice(0, 30)}" 기재가 있어, 현재 건강 상태도 여쭤봅니다.`
      : "",
    `연락 가능한 시간대 알려주시면 감사하겠습니다.`,
    `감사합니다.`,
  ]
    .filter(Boolean)
    .join("\n");

  // SNS sharing copy (safe wording)
  const snsShare = [
    `🐾 구조 신호 — 공유할 만한 아이가 있어요!`,
    ``,
    `📍 ${region}`,
    `🐕 ${animal.kindCd} / ${animal.colorCd} / ${animal.age}`,
    animal.specialMark ? `💬 "${animal.specialMark.slice(0, 40)}"` : "",
    `🏠 ${animal.careNm}`,
    `📞 ${animal.careTel}`,
    ``,
    `⏰ 공고 마감이 다가올 수 있습니다 — 먼저 확인이 필요합니다.`,
    `보호소에 직접 최신 상태를 확인해주세요.`,
    ``,
    `#유기동물 #입양 #임시보호 #${species} #구조신호 #RescueSignal`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  // Discord notification message
  const discordNotification = [
    `🚨 **Rescue Signal — 우선 확인 필요**`,
    ``,
    `**${animal.kindCd}** | ${animal.colorCd} | ${animal.age}`,
    `📍 ${region}`,
    `🏠 보호소: ${animal.careNm} (${animal.careTel})`,
    animal.specialMark ? `📝 특이사항: ${animal.specialMark.slice(0, 50)}` : "",
    `📋 공고번호: ${animal.noticeNo}`,
    `📅 공고기간: ${formatDate(animal.noticeSdt)} ~ ${formatDate(animal.noticeEdt)}`,
    ``,
    `> 이 알림은 공고 마감이 가까워 우선 확인이 필요한 동물입니다.`,
    `> 최신 상태는 보호소에 직접 확인해주세요.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { shelterInquiry, snsShare, discordNotification };
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return dateStr;
  return `${dateStr.slice(0, 4)}.${dateStr.slice(4, 6)}.${dateStr.slice(6, 8)}`;
}
