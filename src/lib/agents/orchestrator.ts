import { RescueAnimal, UserPreference, RescueSignalResult } from "@/types/rescue-animal";
import { fetchRescueAnimals } from "@/lib/rescue-data";
import {
  calculatePriorityScore,
  calculateMatchScore,
  recommendTopRescueSignals,
} from "@/lib/scoring";
import { generateMessages } from "@/lib/messages";
import { runAgent, AgentRun, ToolSchema, ToolImpl } from "./runtime";

// ─────────────────────────────────────────────────────────────────────────────
// Rescue Signal — 멀티에이전트 오케스트레이션
//
// 오케스트레이터가 5개 에이전트를 조율한다. 결정론적 함수(데이터수집·스코어링·
// 문구생성)는 에이전트의 "도구(tool)"로 노출되어, 에이전트가 추론하며 호출한다.
//   1) RescueDataAgent      → get_rescue_animals
//   2) PriorityAnalysisAgent→ get_priority_scores  (+ 특이사항 LLM 해석)
//   3) MatchReasoningAgent  → get_match_scores
//   4) MessageGenerationAgent→ 문구 생성(LLM)
//   5) NotificationAgent    → send_discord / send_email (발송 컨텍스트에서만)
// 어떤 에이전트가 실패해도 결정론적 결과로 graceful fallback.
// ─────────────────────────────────────────────────────────────────────────────

function speciesKo(s: string): string {
  return s === "dog" ? "강아지" : s === "cat" ? "고양이" : s === "other" ? "기타" : "전체";
}

function compact(a: RescueAnimal) {
  return {
    id: a.id,
    kind: a.kindCd,
    region: a.careAddr || a.happenPlace,
    noticeEdt: a.noticeEdt,
    state: a.processState,
    weight: a.weight,
    specialMark: a.specialMark,
    hasPhoto: !!a.popfile && a.popfile.startsWith("http"),
  };
}

export interface OrchestrationResult {
  recommendations: RescueSignalResult[];
  trace: { agent: string; tools: string[]; summary: string }[];
  source: "agent-orchestration" | "fallback";
}

/** 주어진 사용자 조건으로 멀티에이전트 오케스트레이션을 실행한다. */
export async function orchestrateRecommendation(
  pref: UserPreference
): Promise<OrchestrationResult> {
  // 에이전트들이 공유하는 실행 컨텍스트
  const ctx: { animals: RescueAnimal[] } = { animals: [] };
  const trace: { agent: string; tools: string[]; summary: string }[] = [];
  const pushTrace = (run: AgentRun) =>
    trace.push({
      agent: run.name,
      tools: run.toolCalls.map((t) => t.name),
      summary: (run.output || "").slice(0, 200),
    });

  try {
    // ── 도구 정의 ──────────────────────────────────────────────
    const getAnimalsTool: ToolSchema = {
      type: "function",
      function: {
        name: "get_rescue_animals",
        description: "공공 구조동물 데이터를 조회한다. region은 시도명(예:서울), species는 dog/cat/other/any.",
        parameters: {
          type: "object",
          properties: {
            region: { type: "string", description: '시도명. 전국이면 "전국"' },
            species: { type: "string", enum: ["dog", "cat", "other", "any"] },
          },
          required: ["region", "species"],
        },
      },
    };
    const getAnimalsImpl: ToolImpl = async (args) => {
      const region = String(args.region ?? "");
      const species = String(args.species ?? "any");
      const { animals, dataSource } = await fetchRescueAnimals({
        region: region && region !== "전국" ? region : null,
        species: species !== "any" ? species : null,
      });
      ctx.animals = animals;
      return { count: animals.length, dataSource, animals: animals.slice(0, 12).map(compact) };
    };

    const priorityTool: ToolSchema = {
      type: "function",
      function: {
        name: "get_priority_scores",
        description: "조회된 동물들의 우선 확인 필요도(priorityScore, 0~100)와 사유를 결정론적으로 계산해 반환한다.",
        parameters: { type: "object", properties: {} },
      },
    };
    const priorityImpl: ToolImpl = () =>
      ctx.animals.slice(0, 12).map((a) => ({
        id: a.id,
        kind: a.kindCd,
        specialMark: a.specialMark,
        ...calculatePriorityScore(a, pref),
      }));

    const matchTool: ToolSchema = {
      type: "function",
      function: {
        name: "get_match_scores",
        description: "조회된 동물들이 사용자 조건에 얼마나 맞는지(matchScore, 0~100)와 사유를 결정론적으로 계산해 반환한다.",
        parameters: { type: "object", properties: {} },
      },
    };
    const matchImpl: ToolImpl = () =>
      ctx.animals.slice(0, 12).map((a) => ({
        id: a.id,
        kind: a.kindCd,
        ...calculateMatchScore(a, pref),
      }));

    const prefSummary = `지역=${pref.region || "전국"}, 종=${speciesKo(pref.species)}, 도움유형=${pref.helpType.join("/")}, 노령케어=${pref.canCareForSenior}, 의료케어=${pref.canCareForMedical}, 크기선호=${pref.sizePreference ?? "any"}`;

    // ── 1) RescueDataAgent ─────────────────────────────────────
    const dataRun = await runAgent(
      {
        name: "RescueDataAgent",
        instructions:
          "당신은 공공 구조동물 데이터 수집 에이전트입니다. 사용자 조건에 맞춰 get_rescue_animals 도구를 호출해 데이터를 수집하세요. 수집 후 몇 건을 가져왔는지 한 문장으로 보고하세요.",
        tools: [getAnimalsTool],
        toolImpls: { get_rescue_animals: getAnimalsImpl },
      },
      `사용자 조건: ${prefSummary}. 이 조건으로 구조동물을 조회하세요.`
    );
    pushTrace(dataRun);

    if (ctx.animals.length === 0) {
      // 데이터 없음 → 결정론적 폴백(샘플)도 비었으면 빈 결과
      return { recommendations: [], trace, source: "agent-orchestration" };
    }

    // ── 2,3) Priority / Match 에이전트 병렬 ─────────────────────
    const [priorityRun, matchRun] = await Promise.all([
      runAgent(
        {
          name: "PriorityAnalysisAgent",
          instructions:
            "당신은 구조동물 우선순위 분석 에이전트입니다. get_priority_scores 도구로 점수를 받은 뒤, 특이사항(specialMark)의 심각도를 함께 고려해 '오늘 먼저 확인이 필요한 아이' 관점의 분석을 2~3문장으로 요약하세요. '안락사 예정' 같은 단정 표현은 금지하고 '우선 확인 필요'로 표현하세요.",
          tools: [priorityTool],
          toolImpls: { get_priority_scores: priorityImpl },
        },
        `사용자 조건: ${prefSummary}. 우선 확인이 필요한 동물을 분석하세요.`
      ),
      runAgent(
        {
          name: "MatchReasoningAgent",
          instructions:
            "당신은 사용자-동물 매칭 분석 에이전트입니다. get_match_scores 도구로 점수를 받은 뒤, 어떤 아이가 사용자 조건에 잘 맞는지 2~3문장으로 요약하세요. 완벽한 일치보다 '도움을 줄 수 있는 가능성'을 우선합니다.",
          tools: [matchTool],
          toolImpls: { get_match_scores: matchImpl },
        },
        `사용자 조건: ${prefSummary}. 조건에 맞는 동물을 분석하세요.`
      ),
    ]);
    pushTrace(priorityRun);
    pushTrace(matchRun);

    // ── 최종 선정: 결정론적 스코어링이 권위 있는 TOP-N 백본 ──────
    const ranked = recommendTopRescueSignals(ctx.animals, pref, 3);

    // ── 4) MessageGenerationAgent — 최종 TOP-N 문구 생성(LLM) ───
    let llmMessages: Record<string, { shelterInquiry?: string; snsShare?: string; discordNotification?: string }> = {};
    const msgRun = await runAgent(
      {
        name: "MessageGenerationAgent",
        instructions:
          '당신은 입양·임보·홍보 문구 작성 에이전트입니다. 각 동물에 대해 보호소 문의 문구(shelterInquiry), 인스타 게시글(snsShare), Discord 알림(discordNotification)을 한국어로 작성하세요. 금지 표현: 안락사 예정/곧 죽을 아이/구조하지 않으면 사망. 권장: 우선 확인 필요, 공고 마감 임박 가능성, 보호소에 직접 확인. 반드시 JSON으로만 응답: {"<animalId>": {"shelterInquiry":"...","snsShare":"...","discordNotification":"..."}}',
        json: true,
      },
      `사용자 조건: ${prefSummary}\n대상 동물(JSON): ${JSON.stringify(
        ranked.map((r) => ({ id: r.animal.id, kind: r.animal.kindCd, region: r.animal.careAddr || r.animal.happenPlace, noticeEdt: r.animal.noticeEdt, specialMark: r.animal.specialMark }))
      )}\n각 동물 id를 키로 하는 문구 JSON을 생성하세요.`
    );
    pushTrace(msgRun);
    try {
      llmMessages = JSON.parse(msgRun.output || "{}");
    } catch {
      llmMessages = {};
    }

    // 에이전트 문구가 유효하면 적용, 아니면 결정론적 문구 유지
    const recommendations = ranked.map((r) => {
      const m = llmMessages[r.animal.id];
      if (
        m &&
        typeof m.shelterInquiry === "string" &&
        typeof m.snsShare === "string" &&
        typeof m.discordNotification === "string"
      ) {
        return { ...r, messages: { shelterInquiry: m.shelterInquiry, snsShare: m.snsShare, discordNotification: m.discordNotification } };
      }
      return r;
    });

    return { recommendations, trace, source: "agent-orchestration" };
  } catch (e) {
    console.error("[orchestrator] 실패 → 결정론적 폴백:", e);
    // graceful fallback: 결정론적 파이프라인
    let animals = ctx.animals;
    if (animals.length === 0) {
      animals = (await fetchRescueAnimals({
        region: pref.region && pref.region !== "전국" ? pref.region : null,
        species: pref.species !== "any" ? pref.species : null,
      })).animals;
    }
    const recommendations = recommendTopRescueSignals(animals, pref, 3).map((r) => ({
      ...r,
      messages: generateMessages(r.animal, pref),
    }));
    return { recommendations, trace, source: "fallback" };
  }
}
