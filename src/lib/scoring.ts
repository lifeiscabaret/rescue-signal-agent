import {
  RescueAnimal,
  UserPreference,
  ScoreReason,
  RescueSignalResult,
} from "@/types/rescue-animal";
import { generateMessages } from "./messages";

// ─────────────────────────────────────────────────────────────────────────────
// Priority Score (0–100): How urgently this animal needs attention
// ─────────────────────────────────────────────────────────────────────────────

const CARE_NEED_KEYWORDS = [
  "노령", "노견", "노묘", "old", "senior",
  "부상", "상처", "injury",
  "마름", "thin", "야윔",
  "겁많음", "겁", "timid", "scared", "경계",
  "치료", "medical", "질병", "disease", "피부병",
  "약함", "weak", "허약",
];

function parseDateYYYYMMDD(dateStr: string): Date | null {
  if (!dateStr || dateStr.length < 8) return null;
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(4, 6)) - 1;
  const d = parseInt(dateStr.slice(6, 8));
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

function getDaysUntilNoticeEnd(animal: RescueAnimal): number | null {
  const endDate = parseDateYYYYMMDD(animal.noticeEdt);
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = endDate.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function calculatePriorityScore(
  animal: RescueAnimal,
  userPreference: UserPreference
): { score: number; reasons: ScoreReason[] } {
  let score = 0;
  const reasons: ScoreReason[] = [];

  // Rule 1: Notice deadline approaching (max 40 points)
  const daysLeft = getDaysUntilNoticeEnd(animal);
  if (daysLeft !== null) {
    if (daysLeft <= 0) {
      score += 40;
      reasons.push({ label: "공고 마감 기한이 지남 — 우선 확인 필요", points: 40 });
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

  // Rule 2: Currently under protection
  if (animal.processState.includes("보호중")) {
    score += 15;
    reasons.push({ label: "현재 보호중 상태", points: 15 });
  }

  // Rule 3: Special mark contains care-need signals (max 25 points)
  const specialLower = animal.specialMark.toLowerCase();
  const matchedKeywords = CARE_NEED_KEYWORDS.filter((kw) =>
    specialLower.includes(kw.toLowerCase())
  );
  if (matchedKeywords.length > 0) {
    const pts = Math.min(matchedKeywords.length * 8, 25);
    score += pts;
    reasons.push({
      label: `특이사항에 돌봄 필요 신호 감지 (${matchedKeywords.slice(0, 3).join(", ")})`,
      points: pts,
    });
  }

  // Rule 4: Has image (SNS sharing easier)
  if (animal.popfile && animal.popfile.startsWith("http")) {
    score += 10;
    reasons.push({ label: "이미지 보유 — SNS 공유 용이", points: 10 });
  }

  // Rule 5: Region matches user preference
  const regionMatch =
    userPreference.region &&
    (animal.careAddr.includes(userPreference.region) ||
      animal.happenPlace.includes(userPreference.region) ||
      animal.orgNm.includes(userPreference.region));
  if (regionMatch) {
    score += 10;
    reasons.push({ label: "사용자 선호 지역과 일치", points: 10 });
  }

  return { score: Math.min(score, 100), reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Match Score (0–100): How well this animal matches user preference
// ─────────────────────────────────────────────────────────────────────────────

function inferSpecies(kindCd: string): "dog" | "cat" | "other" {
  if (kindCd.includes("개") || kindCd.includes("dog")) return "dog";
  if (kindCd.includes("고양이") || kindCd.includes("cat")) return "cat";
  return "other";
}

function inferWeightKg(weight: string): number | null {
  const match = weight.match(/([\d.]+)/);
  if (!match) return null;
  return parseFloat(match[1]);
}

function inferSize(weightKg: number): "small" | "medium" | "large" {
  if (weightKg <= 7) return "small";
  if (weightKg <= 20) return "medium";
  return "large";
}

export function calculateMatchScore(
  animal: RescueAnimal,
  userPreference: UserPreference
): { score: number; reasons: ScoreReason[] } {
  let score = 0;
  const reasons: ScoreReason[] = [];

  // Rule 1: Species matches (25 points)
  const animalSpecies = inferSpecies(animal.kindCd);
  if (
    userPreference.species === "any" ||
    userPreference.species === animalSpecies
  ) {
    score += 25;
    reasons.push({ label: "선호 동물 종류 일치", points: 25 });
  }

  // Rule 2: Region matches (25 points)
  const regionMatch =
    userPreference.region &&
    (animal.careAddr.includes(userPreference.region) ||
      animal.happenPlace.includes(userPreference.region) ||
      animal.orgNm.includes(userPreference.region));
  if (regionMatch) {
    score += 25;
    reasons.push({ label: "선호 지역 일치", points: 25 });
  }

  // Rule 3: Size preference matches (15 points)
  const weightKg = inferWeightKg(animal.weight);
  if (weightKg !== null && userPreference.sizePreference && userPreference.sizePreference !== "any") {
    const animalSize = inferSize(weightKg);
    if (animalSize === userPreference.sizePreference) {
      score += 15;
      reasons.push({ label: `선호 크기(${userPreference.sizePreference}) 일치`, points: 15 });
    }
  }

  // Rule 4: User can foster (15 points)
  if (userPreference.helpType.includes("foster")) {
    score += 15;
    reasons.push({ label: "임시보호 가능 — 보호 전환 기여", points: 15 });
  }

  // Rule 5: User can share on SNS (10 points)
  if (userPreference.helpType.includes("share") && animal.popfile) {
    score += 10;
    reasons.push({ label: "SNS 공유 가능 — 홍보 기여", points: 10 });
  }

  // Rule 6: User can care for senior (5 points)
  const specialLower = animal.specialMark.toLowerCase();
  if (
    userPreference.canCareForSenior &&
    (specialLower.includes("노령") ||
      specialLower.includes("노견") ||
      specialLower.includes("노묘") ||
      specialLower.includes("senior") ||
      specialLower.includes("old"))
  ) {
    score += 5;
    reasons.push({ label: "노령 동물 케어 가능", points: 5 });
  }

  // Rule 7: User can care for medical cases (5 points)
  if (
    userPreference.canCareForMedical &&
    (specialLower.includes("치료") ||
      specialLower.includes("질병") ||
      specialLower.includes("피부병") ||
      specialLower.includes("부상") ||
      specialLower.includes("medical"))
  ) {
    score += 5;
    reasons.push({ label: "의료 케이스 케어 가능", points: 5 });
  }

  return { score: Math.min(score, 100), reasons };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top Recommendation
// ─────────────────────────────────────────────────────────────────────────────

export function recommendTopRescueSignals(
  animals: RescueAnimal[],
  userPreference: UserPreference,
  topN: number = 3
): RescueSignalResult[] {
  const results: RescueSignalResult[] = animals.map((animal) => {
    const priority = calculatePriorityScore(animal, userPreference);
    const match = calculateMatchScore(animal, userPreference);
    const totalScore = priority.score * 0.5 + match.score * 0.5;
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
