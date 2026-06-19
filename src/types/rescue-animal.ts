/**
 * Normalized rescue animal type used across the application.
 * Both public API data and sample data conform to this shape.
 */
export interface RescueAnimal {
  /** Unique identifier (desertionNo from public API) */
  id: string;
  /** 접수일시 */
  happenDate: string;
  /** 발견장소 */
  happenPlace: string;
  /** 품종 */
  kindCd: string;
  /** 색상 */
  colorCd: string;
  /** 나이 */
  age: string;
  /** 체중 */
  weight: string;
  /** 공고번호 */
  noticeNo: string;
  /** 공고시작일 */
  noticeSdt: string;
  /** 공고종료일 */
  noticeEdt: string;
  /** 이미지 URL */
  popfile: string;
  /** 상태 (보호중, 종료 등) */
  processState: string;
  /** 성별 (M: 수컷, F: 암컷, Q: 미상) */
  sexCd: "M" | "F" | "Q";
  /** 중성화여부 (Y, N, U) */
  neuterYn: "Y" | "N" | "U";
  /** 특징 */
  specialMark: string;
  /** 보호소명 */
  careNm: string;
  /** 보호소 전화번호 */
  careTel: string;
  /** 보호소 주소 */
  careAddr: string;
  /** 관할기관 */
  orgNm: string;
  /** 담당자 연락처 */
  officetel: string;
}

export type DataSource = "public-api" | "sample-fallback";

export interface RescueAnimalsResponse {
  animals: RescueAnimal[];
  dataSource: DataSource;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation & Scoring Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UserPreference {
  region: string;
  species: "dog" | "cat" | "other" | "any";
  helpType: ("adoption" | "foster" | "share")[];
  canCareForSenior: boolean;
  canCareForMedical: boolean;
  sizePreference?: "small" | "medium" | "large" | "any";
}

export interface ScoreReason {
  label: string;
  points: number;
}

export interface GeneratedMessages {
  shelterInquiry: string;
  snsShare: string;
  discordNotification: string;
}

export interface RescueSignalResult {
  animal: RescueAnimal;
  priorityScore: number;
  matchScore: number;
  totalScore: number;
  priorityReasons: ScoreReason[];
  matchReasons: ScoreReason[];
  messages: GeneratedMessages;
}
