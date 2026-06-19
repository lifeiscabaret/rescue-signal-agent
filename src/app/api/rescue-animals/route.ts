import { NextResponse } from "next/server";
import { RescueAnimal, RescueAnimalsResponse } from "@/types/rescue-animal";
import { sampleRescueAnimals } from "@/data/sample-rescue-animals";

// ─────────────────────────────────────────────────────────────────────────────
// Public Animal Rescue API Configuration
// ─────────────────────────────────────────────────────────────────────────────
// API endpoint from data.go.kr (동물보호관리시스템 유기동물 조회 서비스)
// Swagger UI: https://www.data.go.kr/data/15098931/openapi.do
//
// Base URL:
//   http://apis.data.go.kr/1543061/abandonmentPublicSrvc/abandonmentPublic
//
// Required query parameters (configure via Swagger UI):
//   - serviceKey: API key (URL-encoded, from environment variable)
//   - numOfRows: number of items per page (default: 10)
//   - pageNo: page number (default: 1)
//   - _type: response format ("json")
//
// Optional filtering parameters:
//   - bgnde: 유기날짜 시작 (YYYYMMDD)
//   - endde: 유기날짜 종료 (YYYYMMDD)
//   - upkind: 축종코드 (417000: 개, 422400: 고양이, 429900: 기타)
//   - kind: 품종코드
//   - upr_cd: 시도코드
//   - org_cd: 시군구코드
//   - care_reg_no: 보호소번호
//   - state: 상태 (notice: 공고중, protect: 보호중)
//   - neuter_yn: 중성화여부 (Y, N, U)
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE_URL =
  "https://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2";

/** Number of results to fetch per request */
const NUM_OF_ROWS = 20;

/** 시도코드 매핑 (upr_cd) — data.go.kr 동물보호관리시스템 */
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

/**
 * Normalize a single item from the public API response into our RescueAnimal type.
 * The raw API returns items with these field names directly.
 */
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

/**
 * Validate that the public API response has the expected shape.
 * Expected structure: { response: { body: { items: { item: [...] } } } }
 */
function extractItemsFromResponse(data: unknown): Record<string, unknown>[] | null {
  if (typeof data !== "object" || data === null) return null;

  const response = (data as Record<string, unknown>).response;
  if (typeof response !== "object" || response === null) return null;

  const body = (response as Record<string, unknown>).body;
  if (typeof body !== "object" || body === null) return null;

  const items = (body as Record<string, unknown>).items;
  if (typeof items !== "object" || items === null) return null;

  const item = (items as Record<string, unknown>).item;

  // API returns a single object when there's only one result
  if (Array.isArray(item)) return item as Record<string, unknown>[];
  if (typeof item === "object" && item !== null) return [item as Record<string, unknown>];

  return null;
}

/**
 * GET /api/rescue-animals
 *
 * Fetches rescue animal data from the Korean public API (data.go.kr).
 * Falls back to sample data if the API key is missing, request fails,
 * or response shape is invalid.
 *
 * The API key is never exposed to the client — this runs server-side only.
 */
export async function GET(request: Request): Promise<NextResponse<RescueAnimalsResponse>> {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source"); // "demo" | "live" | null
  const region = searchParams.get("region"); // e.g. "서울", "경기"
  const species = searchParams.get("species"); // "dog" | "cat" | "other" | "any"

  // If explicitly requesting demo data, return filtered sample data
  if (source === "demo") {
    let filtered = sampleRescueAnimals;

    // Filter by region
    if (region) {
      filtered = filtered.filter(
        (a) =>
          a.careAddr.includes(region) ||
          a.happenPlace.includes(region) ||
          a.orgNm.includes(region)
      );
    }

    // Filter by species
    if (species && species !== "any") {
      filtered = filtered.filter((a) => {
        if (species === "dog") return a.kindCd.includes("개");
        if (species === "cat") return a.kindCd.includes("고양이");
        return !a.kindCd.includes("개") && !a.kindCd.includes("고양이");
      });
    }

    // Fallback: if filters are too strict, return all sample data
    if (filtered.length === 0) {
      filtered = sampleRescueAnimals;
    }

    return NextResponse.json({
      animals: filtered,
      dataSource: "sample-fallback",
    });
  }

  const apiKey = process.env.PUBLIC_ANIMAL_API_KEY;

  // Requirement 1: Check for API key presence
  if (!apiKey) {
    console.warn("[rescue-animals] PUBLIC_ANIMAL_API_KEY not set. Using sample data.");
    return NextResponse.json({
      animals: sampleRescueAnimals,
      dataSource: "sample-fallback",
    });
  }

  try {
    // Requirement 2: Call the public API from server side only
    // The serviceKey is already URL-encoded from data.go.kr — must NOT be re-encoded
    // by URLSearchParams (which would turn %2F into %252F, causing 500 errors)
    const params = new URLSearchParams({
      numOfRows: String(NUM_OF_ROWS),
      pageNo: "1",
      _type: "json",
      state: "protect",
    });

    // Apply region filter if provided (upr_cd)
    if (region) {
      const regionCode = Object.entries(REGION_CODE_MAP).find(
        ([key]) => region.includes(key)
      )?.[1];
      if (regionCode) {
        params.set("upr_cd", regionCode);
      }
    }

    // Apply species filter if provided (upkind)
    if (species && species !== "any") {
      const speciesCode = SPECIES_CODE_MAP[species];
      if (speciesCode) {
        params.set("upkind", speciesCode);
      }
    }

    const url = `${API_BASE_URL}?serviceKey=${apiKey}&${params.toString()}`;
    const response = await fetch(url, {
      // Cache for 5 minutes to avoid hitting rate limits during demo
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      console.error(
        `[rescue-animals] API responded with status ${response.status}`
      );
      throw new Error(`API responded with status ${response.status}`);
    }

    const data: unknown = await response.json();

    // Requirement 4: Validate response shape
    const rawItems = extractItemsFromResponse(data);
    if (!rawItems || rawItems.length === 0) {
      console.warn("[rescue-animals] Invalid or empty API response shape. Using sample data.");
      return NextResponse.json({
        animals: sampleRescueAnimals,
        dataSource: "sample-fallback",
      });
    }

    // Requirement 3: Normalize into our RescueAnimal type
    const animals: RescueAnimal[] = rawItems.map(normalizeAnimal);

    // Requirement 5: Return animals with data source indicator
    return NextResponse.json({
      animals,
      dataSource: "public-api",
    });
  } catch (error) {
    // Requirement 4: Fallback on any failure
    console.error("[rescue-animals] Failed to fetch from public API:", error);
    return NextResponse.json({
      animals: sampleRescueAnimals,
      dataSource: "sample-fallback",
    });
  }
}
