import { RescueAnimal, RescueAnimalsResponse } from "@/types/rescue-animal";
import { sampleRescueAnimals } from "@/data/sample-rescue-animals";

// ─────────────────────────────────────────────────────────────────────────────
// 공공 유기동물 데이터 수집 (data.go.kr 동물보호관리시스템)
// 서버 전용. API 키가 없거나 호출 실패/응답 이상 시 샘플 데이터로 폴백한다.
// API 라우트와 cron 라우트가 함께 재사용한다.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE_URL =
  "https://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2";

const NUM_OF_ROWS = 20;

/** 시도코드 매핑 (upr_cd) */
const REGION_CODE_MAP: Record<string, string> = {
  서울: "6110000",
  부산: "6260000",
  대구: "6270000",
  인천: "6280000",
  광주: "6290000",
  대전: "6300000",
  울산: "6310000",
  세종: "5690000",
  경기: "6410000",
  강원: "6420000",
  충북: "6430000",
  충남: "6440000",
  전북: "6450000",
  전남: "6460000",
  경북: "6470000",
  경남: "6480000",
  제주: "6500000",
};

/** 축종코드 매핑 (upkind) */
const SPECIES_CODE_MAP: Record<string, string> = {
  dog: "417000",
  cat: "422400",
  other: "429900",
};

function parseSexCd(value: unknown): "M" | "F" | "Q" {
  const s = String(value);
  if (s === "M" || s === "F") return s;
  return "Q";
}

function parseNeuterYn(value: unknown): "Y" | "N" | "U" {
  const s = String(value);
  if (s === "Y" || s === "N") return s;
  return "U";
}

function normalizeAnimal(raw: Record<string, unknown>): RescueAnimal {
  return {
    id: String(raw.desertionNo ?? ""),
    happenDate: String(raw.happenDt ?? ""),
    happenPlace: String(raw.happenPlace ?? ""),
    kindCd: String(raw.kindFullNm ?? raw.kindCd ?? ""),
    colorCd: String(raw.colorCd ?? ""),
    age: String(raw.age ?? ""),
    weight: String(raw.weight ?? ""),
    noticeNo: String(raw.noticeNo ?? ""),
    noticeSdt: String(raw.noticeSdt ?? ""),
    noticeEdt: String(raw.noticeEdt ?? ""),
    popfile: String(raw.popfile1 ?? raw.popfile ?? ""),
    processState: String(raw.processState ?? ""),
    sexCd: parseSexCd(raw.sexCd),
    neuterYn: parseNeuterYn(raw.neuterYn),
    specialMark: String(raw.specialMark ?? ""),
    careNm: String(raw.careNm ?? ""),
    careTel: String(raw.careTel ?? ""),
    careAddr: String(raw.careAddr ?? ""),
    orgNm: String(raw.orgNm ?? ""),
    officetel: String(raw.officetel ?? ""),
  };
}

function extractItemsFromResponse(
  data: unknown
): Record<string, unknown>[] | null {
  if (typeof data !== "object" || data === null) return null;
  const response = (data as Record<string, unknown>).response;
  if (typeof response !== "object" || response === null) return null;
  const body = (response as Record<string, unknown>).body;
  if (typeof body !== "object" || body === null) return null;
  const items = (body as Record<string, unknown>).items;
  if (typeof items !== "object" || items === null) return null;
  const item = (items as Record<string, unknown>).item;
  if (Array.isArray(item)) return item as Record<string, unknown>[];
  if (typeof item === "object" && item !== null)
    return [item as Record<string, unknown>];
  return null;
}

function filterSample(
  region: string | null,
  species: string | null
): RescueAnimal[] {
  let filtered = sampleRescueAnimals;
  if (region) {
    filtered = filtered.filter(
      (a) =>
        a.careAddr.includes(region) ||
        a.happenPlace.includes(region) ||
        a.orgNm.includes(region)
    );
  }
  if (species && species !== "any") {
    filtered = filtered.filter((a) => {
      if (species === "dog") return a.kindCd.includes("개");
      if (species === "cat") return a.kindCd.includes("고양이");
      return !a.kindCd.includes("개") && !a.kindCd.includes("고양이");
    });
  }
  return filtered.length === 0 ? sampleRescueAnimals : filtered;
}

export interface FetchRescueOptions {
  /** "demo" 면 샘플 데이터를 강제 사용 */
  source?: string | null;
  region?: string | null;
  species?: string | null;
}

/**
 * 공공 API에서 구조동물 데이터를 가져온다. 실패 시 샘플로 폴백.
 * 두 라우트(API, cron)가 공유하는 단일 진입점.
 */
export async function fetchRescueAnimals(
  opts: FetchRescueOptions = {}
): Promise<RescueAnimalsResponse> {
  const { source = null, region = null, species = null } = opts;

  if (source === "demo") {
    return { animals: filterSample(region, species), dataSource: "sample-fallback" };
  }

  const apiKey = process.env.PUBLIC_ANIMAL_API_KEY;
  if (!apiKey) {
    console.warn("[rescue-data] PUBLIC_ANIMAL_API_KEY not set. Using sample data.");
    return { animals: sampleRescueAnimals, dataSource: "sample-fallback" };
  }

  try {
    // serviceKey는 data.go.kr에서 이미 URL 인코딩되어 있으므로 재인코딩 금지
    const params = new URLSearchParams({
      numOfRows: String(NUM_OF_ROWS),
      pageNo: "1",
      _type: "json",
      state: "protect",
    });

    if (region) {
      const regionCode = Object.entries(REGION_CODE_MAP).find(([key]) =>
        region.includes(key)
      )?.[1];
      if (regionCode) params.set("upr_cd", regionCode);
    }
    if (species && species !== "any") {
      const speciesCode = SPECIES_CODE_MAP[species];
      if (speciesCode) params.set("upkind", speciesCode);
    }

    const url = `${API_BASE_URL}?serviceKey=${apiKey}&${params.toString()}`;
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data: unknown = await response.json();
    const rawItems = extractItemsFromResponse(data);
    if (!rawItems || rawItems.length === 0) {
      console.warn("[rescue-data] Invalid or empty API response. Using sample data.");
      return { animals: sampleRescueAnimals, dataSource: "sample-fallback" };
    }

    return { animals: rawItems.map(normalizeAnimal), dataSource: "public-api" };
  } catch (error) {
    console.error("[rescue-data] Failed to fetch from public API:", error);
    return { animals: sampleRescueAnimals, dataSource: "sample-fallback" };
  }
}
