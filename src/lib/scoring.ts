import {
  RescueAnimal,
  UserPreference,
  ScoreReason,
  RescueSignalResult,
} from "@/types/rescue-animal";
import { generateMessages } from "./messages";

// ─────────────────────────────────────────────────────────────────────────────
// 돌봄 신호 키워드
// ─────────────────────────────────────────────────────────────────────────────

const SENIOR_KEYWORDS = ["노령", "노견", "노묘", "senior", "old"];
const MEDICAL_KEYWORDS = [
  "치료", "질병", "피부병", "부상", "상처", "수술", "골절", "medical", "disease", "injury",
];
const CARE_NEED_KEYWORDS = [
  ...SENIOR_KEYWORDS,
  ...MEDICAL_KEYWORDS,
  "마름", "야윔", "thin", "겁많음", "겁", "경계", "timid", "scared", "약함", "허약", "weak",
];

function hasKeyword(specialMark: string, keywords: string[]): boolean {
  const s = (specialMark || "").toLowerCase();
  return keywords.some((kw) => s.includes(kw.toLowerCase()));
}

function isSenior(animal: RescueAnimal): boolean {
  return hasKeyword(animal.specialMark, SENIOR_KEYWORDS);
}

function needsMedical(animal: RescueAnimal): boolean {
  return hasKeyword(animal.specialMark, MEDICAL_KEYWORDS);
}

// ─────────────────────────────────────────────────────────────────────────────
// 날짜 유틸
// ─────────────────────────────────────────────────────────────────────────────

function parseDateYYYYMMDD(dateStr: string): Date | null {
  const digits = (dateStr || "").replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  const y = parseInt(digits.slice(0, 4));
  const m = parseInt(digits.slice(4, 6)) - 1;
  const d = parseInt(digits.slice(6, 8));
  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? null : date;
}

function getDaysUntilNoticeEnd(animal: RescueAnimal): number | null {
  const endDate = parseDateYYYYMMDD(animal.noticeEdt);
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// 종(種) 추론
// ─────────────────────────────────────────────────────────────────────────────

function inferSpecies(kindCd: string): "dog" | "cat" | "other" {
  if (kindCd.includes("개") || kindCd.toLowerCase().includes("dog")) return "dog";
  if (kindCd.includes("고양이") || kindCd.toLowerCase().includes("cat")) return "cat";
  return "other";
}

function inferWeightKg(weight: string): number | null {
  const match = (weight || "").match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

function inferSize(weightKg: number): "small" | "medium" | "large" {
  if (weightKg <= 7) return "small";
  if (weightKg <= 20) return "medium";
  return "large";
}

function regionMatches(animal: RescueAnimal, region: string): boolean {
  if (!region) return false;
  return (
    animal.careAddr.includes(region) ||
    animal.happenPlace.includes(region) ||
    animal.orgNm.includes(region)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 우선순위 점수 (0–100): 이 아이가 얼마나 시급히 확인이 필요한가
//   지역은 제외 — 지역은 '매칭'에서만 평가(이중 계산 방지)
// ─────────────────────────────────────────────────────────────────────────────

export function calculatePriorityScore(
  animal: RescueAnimal,
  _userPreference: UserPreference
): { score: number; reasons: ScoreReason[] } {
  let score = 0;
  const reasons: ScoreReason[] = [];

  // Rule 1: 공고 마감 임박 (max 40)
  const daysLeft = getDaysUntilNoticeEnd(animal);
  if (daysLeft !== null) {
    if (daysLeft <= 0) {
      score += 40;
      reasons.push({ label: "공고 마감 기한 지남 — 우선 확인 필요", points: 40 });
    } else if (daysLeft <= 3) {
      score += 35;
      reasons.push({ label: `공고 마감 ${daysLeft}일 남음 — 우선 확인 필요`, points: 35 });
    } else if (daysLeft <= 7) {
      score += 25;
      reasons.push({ label: `공고 마감 ${daysLeft}일 남음`, points: 25 });
    } else if (daysLeft <= 14) {
      score += 15;
      reasons.push({ label: `공고 마감 ${daysLeft}일 남음`, points: 15 });
    }
  }

  // Rule 2: 보호중 상태 (+15)
  if (animal.processState.includes("보호중")) {
    score += 15;
    reasons.push({ label: "현재 보호중 상태", points: 15 });
  }

  // Rule 3: 특이사항에 돌봄 필요 신호 (max 25)
  const matched = CARE_NEED_KEYWORDS.filter((kw) =>
    (animal.specialMark || "").toLowerCase().includes(kw.toLowerCase())
  );
  if (matched.length > 0) {
    const pts = Math.min(matched.length * 8, 25);
    score += pts;
    reasons.push({
      label: `특이사항에 돌봄 신호 (${matched.slice(0, 3).join(", ")})`,
      points: pts,
    });
  }

  // Rule 4: 이미지 보유 (+10, SNS 공유 용이)
  if (animal.popfile && animal.popfile.startsWith("http")) {
    score += 10;
    reasons.push({ label: "이미지 보유 — SNS 공유 용이", points: 10 });
  }

  return { score: clamp(score), reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// 매칭 점수 (0–100): 이 아이가 '이 사용자'에게 얼마나 맞는가
//   helpType가 평가 기준을 바꾼다:
//     - 입양/임보(직접 데려감) → 케어 적합성이 중요 (부적합 시 감점)
//     - 홍보(share, 데려가지 않음) → 케어 무관, 이미지 있으면 가점
// ─────────────────────────────────────────────────────────────────────────────

export function calculateMatchScore(
  animal: RescueAnimal,
  userPreference: UserPreference
): { score: number; reasons: ScoreReason[] } {
  let score = 0;
  const reasons: ScoreReason[] = [];

  // 사용자가 직접 동물을 책임지는 모드인지 (입양/임보)
  const takesIn =
    userPreference.helpType.includes("adoption") ||
    userPreference.helpType.includes("foster");
  const sharesOnly = !takesIn && userPreference.helpType.includes("share");

  // Rule 1: 종 일치 (max 35)
  const animalSpecies = inferSpecies(animal.kindCd);
  if (userPreference.species === "any") {
    score += 20;
    reasons.push({ label: "종 무관 선호", points: 20 });
  } else if (userPreference.species === animalSpecies) {
    score += 35;
    reasons.push({ label: "선호 동물 종류 일치", points: 35 });
  }
  // 불일치는 0점 (recommendTopRescueSignals에서 하드 필터로 제외됨)

  // Rule 2: 지역 일치 (+30)
  if (regionMatches(animal, userPreference.region)) {
    score += 30;
    reasons.push({ label: "선호 지역 일치", points: 30 });
  }

  // Rule 3: 크기 선호 (max 15, 불일치 시 약한 감점)
  const weightKg = inferWeightKg(animal.weight);
  if (
    weightKg !== null &&
    userPreference.sizePreference &&
    userPreference.sizePreference !== "any"
  ) {
    const animalSize = inferSize(weightKg);
    if (animalSize === userPreference.sizePreference) {
      score += 15;
      reasons.push({ label: `선호 크기(${userPreference.sizePreference}) 일치`, points: 15 });
    } else {
      score -= 5;
      reasons.push({ label: "선호 크기와 다름", points: -5 });
    }
  }

  // Rule 4: 케어 적합 보너스 / 부적합 감점
  const senior = isSenior(animal);
  const medical = needsMedical(animal);

  if (senior) {
    if (userPreference.canCareForSenior) {
      score += 10;
      reasons.push({ label: "노령 동물 — 케어 가능과 부합", points: 10 });
    } else if (takesIn) {
      score -= 25;
      reasons.push({ label: "노령 동물 — 현재 케어 어려움(우선순위 낮춤)", points: -25 });
    }
  }

  if (medical) {
    if (userPreference.canCareForMedical) {
      score += 10;
      reasons.push({ label: "의료 케어 필요 — 케어 가능과 부합", points: 10 });
    } else if (takesIn) {
      score -= 30;
      reasons.push({ label: "의료 케어 필요 — 현재 케어 어려움(우선순위 낮춤)", points: -30 });
    }
  }

  // Rule 5: 홍보(share) 적합 — 이미지가 있어야 홍보 효과 (+10)
  if (userPreference.helpType.includes("share") && animal.popfile) {
    score += 10;
    reasons.push({ label: "이미지 보유 — SNS 홍보 적합", points: 10 });
  }

  // 홍보 전용 사용자: 케어 부담이 없으므로 종/지역 일치만으로도 충분히 적합
  if (sharesOnly && animalSpecies && regionMatches(animal, userPreference.region)) {
    score += 5;
    reasons.push({ label: "홍보 가능 — 지역 내 공유 효과", points: 5 });
  }

  return { score: clamp(score), reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP 추천
//   - 종을 지정한 경우 다른 종은 후보에서 하드 제외
//   - 총점 = 매칭 0.6 + 우선순위 0.4 (개인화에 무게)
// ─────────────────────────────────────────────────────────────────────────────

const MATCH_WEIGHT = 0.6;
const PRIORITY_WEIGHT = 0.4;

export function recommendTopRescueSignals(
  animals: RescueAnimal[],
  userPreference: UserPreference,
  topN: number = 3
): RescueSignalResult[] {
  // 하드 필터: 종을 지정하면 다른 종은 제외 (강아지 요청에 고양이가 나오지 않도록)
  const candidates =
    userPreference.species === "any"
      ? animals
      : animals.filter((a) => inferSpecies(a.kindCd) === userPreference.species);

  const results: RescueSignalResult[] = candidates.map((animal) => {
    const priority = calculatePriorityScore(animal, userPreference);
    const match = calculateMatchScore(animal, userPreference);
    const totalScore =
      match.score * MATCH_WEIGHT + priority.score * PRIORITY_WEIGHT;
    const messages = generateMessages(animal, userPreference);

    return {
      animal,
      priorityScore: priority.score,
      matchScore: match.score,
      totalScore: Math.round(totalScore * 10) / 10,
      priorityReasons: priority.reasons,
      matchReasons: match.reasons,
      messages,
    };
  });

  results.sort((a, b) => b.totalScore - a.totalScore);
  return results.slice(0, topN);
}
