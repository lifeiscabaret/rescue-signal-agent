import { NextRequest, NextResponse } from "next/server";
import { UserPreference } from "@/types/rescue-animal";
import { orchestrateRecommendation } from "@/lib/agents/orchestrator";

/**
 * POST /api/agent/orchestrate
 * body: { userPreference }
 * 멀티에이전트 오케스트레이션을 실행해 TOP 추천 + 에이전트 실행 트레이스를 반환한다.
 * gpt-5-mini 추론 모델 기반이라 수십 초 소요될 수 있다.
 */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let body: { userPreference?: UserPreference };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const pref = body.userPreference;
  if (!pref || typeof pref.region !== "string" || !Array.isArray(pref.helpType)) {
    return NextResponse.json({ error: "userPreference 형식 오류" }, { status: 400 });
  }

  try {
    const result = await orchestrateRecommendation(pref);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/agent/orchestrate] error:", e);
    return NextResponse.json({ error: "오케스트레이션 실패" }, { status: 500 });
  }
}
