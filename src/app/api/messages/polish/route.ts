import { NextRequest, NextResponse } from "next/server";
import {
  RescueAnimal,
  UserPreference,
  GeneratedMessages,
} from "@/types/rescue-animal";

interface PolishRequest {
  animal: RescueAnimal;
  userPreference: UserPreference;
  generatedMessages: GeneratedMessages;
}

interface PolishResponse {
  messages: GeneratedMessages;
  source: "foundry" | "local-fallback";
}

const SYSTEM_PROMPT = `당신은 유기동물 구조 알림 서비스 "Rescue Signal Agent"의 문구 개선 AI입니다.
사용자가 제공하는 보호소 문의 문구, SNS 공유 문구, Discord 알림 문구를 더 자연스럽고 따뜻하게 다듬어주세요.

반드시 지켜야 할 안전 규칙:
- 안락사가 예정되어 있다고 절대 표현하지 마세요.
- 죽음이 확실하다거나 구조/입양이 보장된다는 표현을 쓰지 마세요.
- 다음의 안전한 표현만 사용하세요:
  - "우선 확인 필요"
  - "공고 마감이 가까울 수 있음"
  - "보호소 직접 확인 필요"
  - "최신 상태 확인 필요"
  - "공유 가치가 높은 구조신호"
- 보호소 이름, 전화번호, 공고번호 등 팩트 정보를 변경하지 마세요.
- 원본 메시지에 포함된 해시태그, 연락처 등을 그대로 유지하세요.

JSON 형식으로만 응답하세요:
{
  "shelterInquiry": "개선된 보호소 문의 문구",
  "snsShare": "개선된 SNS 공유 문구",
  "discordNotification": "개선된 Discord 알림 문구"
}`;

export async function POST(request: NextRequest) {
  const body: PolishRequest = await request.json();
  const { animal, userPreference, generatedMessages } = body;

  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  // Fallback if credentials missing
  if (!apiKey || !endpoint || !deployment) {
    return NextResponse.json<PolishResponse>({
      messages: generatedMessages,
      source: "local-fallback",
    });
  }

  const species = animal.kindCd.includes("고양이") ? "고양이" : "강아지";
  const helpLabel = userPreference.helpType.includes("adoption")
    ? "입양"
    : userPreference.helpType.includes("foster")
    ? "임시보호"
    : "홍보 공유";

  const userMessage = `다음 유기동물 정보와 기존 문구를 참고하여 개선해주세요.

동물 정보:
- 종류: ${species} (${animal.kindCd})
- 나이: ${animal.age}
- 성별: ${animal.sexCd === "M" ? "수컷" : animal.sexCd === "F" ? "암컷" : "미상"}
- 특이사항: ${animal.specialMark || "없음"}
- 보호소: ${animal.careNm} (${animal.careTel})
- 공고번호: ${animal.noticeNo}
- 지역: ${animal.careAddr || animal.happenPlace}

사용자 의도: ${helpLabel}

기존 문구:
[보호소 문의]
${generatedMessages.shelterInquiry}

[SNS 공유]
${generatedMessages.snsShare}

[Discord 알림]
${generatedMessages.discordNotification}`;

  try {
    const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json<PolishResponse>({
        messages: generatedMessages,
        source: "local-fallback",
      });
    }

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";

    const parsed = JSON.parse(content) as Partial<GeneratedMessages>;

    // Validate all 3 fields exist and are strings, else fall back
    if (
      typeof parsed.shelterInquiry !== "string" ||
      typeof parsed.snsShare !== "string" ||
      typeof parsed.discordNotification !== "string"
    ) {
      return NextResponse.json<PolishResponse>({
        messages: generatedMessages,
        source: "local-fallback",
      });
    }

    return NextResponse.json<PolishResponse>({
      messages: {
        shelterInquiry: parsed.shelterInquiry,
        snsShare: parsed.snsShare,
        discordNotification: parsed.discordNotification,
      },
      source: "foundry",
    });
  } catch {
    return NextResponse.json<PolishResponse>({
      messages: generatedMessages,
      source: "local-fallback",
    });
  }
}
