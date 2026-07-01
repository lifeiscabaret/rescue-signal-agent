// ─────────────────────────────────────────────────────────────────────────────
// 멀티에이전트 런타임 — Azure OpenAI(gpt-5-mini) 기반 에이전트 + 도구 호출 루프
//
// 각 에이전트는 역할 instructions를 가진 LLM이며, 등록된 도구(function)를
// 스스로 호출하면서 작업을 수행한다. runAgent()가 "모델 호출 → 도구 실행 →
// 결과 회신 → 반복 → 최종 답변"의 tool-calling 루프를 담당한다.
// ─────────────────────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolImpl = (args: Record<string, unknown>) => Promise<unknown> | unknown;

export interface AgentDef {
  /** 에이전트 이름(트레이스용) */
  name: string;
  /** 역할 instructions(system 프롬프트) */
  instructions: string;
  /** 사용 가능한 도구 스키마 */
  tools?: ToolSchema[];
  /** 도구 구현 (name → fn) */
  toolImpls?: Record<string, ToolImpl>;
  /** JSON 객체 응답 강제 여부 */
  json?: boolean;
}

export interface AgentRun {
  name: string;
  output: string;
  /** 이 에이전트가 호출한 도구 목록(트레이스용) */
  toolCalls: { name: string; args: Record<string, unknown> }[];
  rounds: number;
}

async function callModel(
  messages: ChatMessage[],
  tools?: ToolSchema[],
  json?: boolean
): Promise<ChatMessage> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
  if (!endpoint || !apiKey || !deployment) {
    throw new Error("Azure OpenAI 미설정");
  }

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  const body: Record<string, unknown> = {
    messages,
    max_completion_tokens: 4000,
  };
  if (tools && tools.length > 0) body.tools = tools;
  if (json) body.response_format = { type: "json_object" };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message as ChatMessage;
}

/**
 * 한 에이전트를 tool-calling 루프로 실행한다.
 * 모델이 도구를 호출하면 실행 결과를 다시 모델에 넣어 최종 답변까지 진행한다.
 */
export async function runAgent(
  def: AgentDef,
  userContent: string,
  maxRounds = 4
): Promise<AgentRun> {
  const messages: ChatMessage[] = [
    { role: "system", content: def.instructions },
    { role: "user", content: userContent },
  ];
  const toolCalls: { name: string; args: Record<string, unknown> }[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    const msg = await callModel(messages, def.tools, def.json);
    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        toolCalls.push({ name: call.function.name, args });

        const impl = def.toolImpls?.[call.function.name];
        let result: unknown;
        try {
          result = impl ? await impl(args) : { error: "unknown tool" };
        } catch (e) {
          result = { error: String(e) };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result),
        });
      }
      continue; // 도구 결과를 넣고 다시 모델 호출
    }

    // 도구 호출이 없으면 최종 답변
    return { name: def.name, output: msg.content ?? "", toolCalls, rounds: round };
  }

  return { name: def.name, output: "", toolCalls, rounds: maxRounds };
}
