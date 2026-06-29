import { NextResponse } from "next/server";
import { RescueAnimalsResponse } from "@/types/rescue-animal";
import { fetchRescueAnimals } from "@/lib/rescue-data";

/**
 * GET /api/rescue-animals
 *
 * 공공 API(data.go.kr)에서 구조동물 데이터를 조회한다. 키 부재/실패/응답 이상 시
 * 샘플 데이터로 폴백한다. 실제 수집 로직은 @/lib/rescue-data 에서 공유한다.
 * API 키는 클라이언트로 노출되지 않으며 서버에서만 사용된다.
 */
export async function GET(
  request: Request
): Promise<NextResponse<RescueAnimalsResponse>> {
  const { searchParams } = new URL(request.url);
  const result = await fetchRescueAnimals({
    source: searchParams.get("source"),
    region: searchParams.get("region"),
    species: searchParams.get("species"),
  });
  return NextResponse.json(result);
}
