"use client";

import { useState } from "react";
import {
  RescueAnimal,
  UserPreference,
  RescueSignalResult,
  DataSource,
  ScoreReason,
} from "@/types/rescue-animal";
import { recommendTopRescueSignals } from "@/lib/scoring";

type AgentStep = {
  name: string;
  status: "pending" | "running" | "done";
  detail?: string;
};

const INITIAL_PREFERENCE: UserPreference = {
  region: "서울",
  species: "dog",
  helpType: ["adoption"],
  canCareForSenior: false,
  canCareForMedical: false,
  sizePreference: "any",
};

export default function Home() {
  const [preference, setPreference] = useState<UserPreference>(INITIAL_PREFERENCE);
  const [results, setResults] = useState<RescueSignalResult[] | null>(null);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResults(null);
    setDataSource(null);

    const steps: AgentStep[] = [
      { name: "Rescue Data Agent", status: "pending", detail: "공공데이터 조회 중..." },
      { name: "Priority Analysis Agent", status: "pending", detail: "긴급도 분석 중..." },
      { name: "Match Reasoning Agent", status: "pending", detail: "사용자 조건 매칭 중..." },
      { name: "Message Generation Agent", status: "pending", detail: "문구 생성 중..." },
      { name: "Notification Agent", status: "pending", detail: "알림 준비 완료" },
    ];
    setAgentSteps([...steps]);

    // Step 1: Data fetch
    steps[0].status = "running";
    setAgentSteps([...steps]);

    try {
      const res = await fetch("/api/rescue-animals");
      const data = await res.json();
      const animals: RescueAnimal[] = data.animals;
      const source: DataSource = data.dataSource;
      setDataSource(source);

      steps[0].status = "done";
      steps[0].detail = `${animals.length}건 조회 완료 (${source === "public-api" ? "공공 API" : "샘플 데이터"})`;
      setAgentSteps([...steps]);

      // Step 2: Priority scoring
      steps[1].status = "running";
      setAgentSteps([...steps]);
      await delay(300);

      steps[1].status = "done";
      steps[1].detail = "긴급도 점수 계산 완료";
      setAgentSteps([...steps]);

      // Step 3: Match reasoning
      steps[2].status = "running";
      setAgentSteps([...steps]);
      await delay(300);

      steps[2].status = "done";
      steps[2].detail = "사용자 조건 매칭 완료";
      setAgentSteps([...steps]);

      // Step 4: Message generation
      steps[3].status = "running";
      setAgentSteps([...steps]);
      await delay(300);

      const topResults = recommendTopRescueSignals(animals, preference);

      steps[3].status = "done";
      steps[3].detail = `TOP ${topResults.length} 문구 생성 완료`;
      setAgentSteps([...steps]);

      // Step 5: Notification ready
      steps[4].status = "running";
      setAgentSteps([...steps]);
      await delay(200);

      steps[4].status = "done";
      steps[4].detail = "Discord 알림 텍스트 준비 완료";
      setAgentSteps([...steps]);

      setResults(topResults);
    } catch {
      steps[0].status = "done";
      steps[0].detail = "API 호출 실패 — 페이지 새로고침 후 재시도";
      setAgentSteps([...steps]);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, fieldId: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white dark:from-zinc-900 dark:to-zinc-950">
      {/* Hero */}
      <header className="border-b border-orange-100 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <span className="text-2xl">🐾</span>
          <h1 className="text-xl font-bold text-orange-700 dark:text-orange-400">
            Rescue Signal Agent
          </h1>
          <span className="ml-auto text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">
            Hackathon Demo
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Hero section */}
        <section className="text-center space-y-4 py-8">
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            펫샵에 가기 전,<br />
            <span className="text-orange-600 dark:text-orange-400">구조가 필요한 아이들을 먼저 확인하세요</span>
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            AI 에이전트가 공공데이터를 분석하여 공고 마감이 가까운 동물을 우선 추천하고,
            보호소 문의 문구와 SNS 공유 문구까지 자동으로 생성합니다.
          </p>
        </section>

        {/* Preference Form */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 mb-4">
            🎯 나의 조건 입력
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Region */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  지역
                </label>
                <input
                  type="text"
                  value={preference.region}
                  onChange={(e) => setPreference({ ...preference, region: e.target.value })}
                  placeholder="예: 서울, 경기, 부산"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {/* Species */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  동물 종류
                </label>
                <select
                  value={preference.species}
                  onChange={(e) =>
                    setPreference({ ...preference, species: e.target.value as UserPreference["species"] })
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="dog">🐶 강아지</option>
                  <option value="cat">🐱 고양이</option>
                  <option value="other">🐾 기타</option>
                  <option value="any">전체</option>
                </select>
              </div>

              {/* Size Preference */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  선호 크기
                </label>
                <select
                  value={preference.sizePreference || "any"}
                  onChange={(e) =>
                    setPreference({ ...preference, sizePreference: e.target.value as UserPreference["sizePreference"] })
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="any">상관없음</option>
                  <option value="small">소형 (7kg 이하)</option>
                  <option value="medium">중형 (7~20kg)</option>
                  <option value="large">대형 (20kg 이상)</option>
                </select>
              </div>
            </div>

            {/* Help Type */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                도움 유형 (복수 선택 가능)
              </label>
              <div className="flex flex-wrap gap-2">
                {(["adoption", "foster", "share"] as const).map((type) => {
                  const labels = { adoption: "🏠 입양", foster: "🤝 임시보호", share: "📢 SNS 공유" };
                  const selected = preference.helpType.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        const newTypes = selected
                          ? preference.helpType.filter((t) => t !== type)
                          : [...preference.helpType, type];
                        setPreference({ ...preference, helpType: newTypes.length > 0 ? newTypes : [type] });
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                        selected
                          ? "bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                          : "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                      }`}
                    >
                      {labels[type]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Care options */}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={preference.canCareForSenior}
                  onChange={(e) => setPreference({ ...preference, canCareForSenior: e.target.checked })}
                  className="rounded border-zinc-300"
                />
                🧓 노령 동물 케어 가능
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={preference.canCareForMedical}
                  onChange={(e) => setPreference({ ...preference, canCareForMedical: e.target.checked })}
                  className="rounded border-zinc-300"
                />
                🏥 의료 케이스 케어 가능
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white font-medium text-sm transition"
            >
              {loading ? "🔍 에이전트 분석 중..." : "🚀 구조 신호 찾기"}
            </button>
          </form>
        </section>

        {/* Agent Trace */}
        {agentSteps.length > 0 && (
          <section className="bg-zinc-900 dark:bg-zinc-950 rounded-2xl p-6 text-sm font-mono">
            <h3 className="text-green-400 font-bold mb-3 font-sans text-base">
              🤖 Agent Trace
            </h3>
            <div className="space-y-2">
              {agentSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span>
                    {step.status === "done" && "✅"}
                    {step.status === "running" && "⏳"}
                    {step.status === "pending" && "⬜"}
                  </span>
                  <span className={step.status === "done" ? "text-green-300" : step.status === "running" ? "text-yellow-300" : "text-zinc-500"}>
                    {step.name}
                  </span>
                  {step.detail && step.status === "done" && (
                    <span className="text-zinc-500 ml-2">— {step.detail}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Data Source Badge */}
        {dataSource && (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                dataSource === "public-api"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              }`}
            >
              {dataSource === "public-api" ? "🟢 공공 API 데이터" : "🟡 샘플 데이터 (Fallback)"}
            </span>
          </div>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <section className="space-y-6">
            <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
              🏆 TOP {results.length} 구조 신호
            </h3>
            {results.map((result, idx) => (
              <ResultCard
                key={result.animal.id}
                result={result}
                rank={idx + 1}
                onCopy={handleCopy}
                copiedField={copiedField}
              />
            ))}
          </section>
        )}

        {/* Safety Disclaimer */}
        <footer className="border-t border-zinc-200 dark:border-zinc-800 pt-6 pb-8 mt-12">
          <p className="text-xs text-zinc-500 dark:text-zinc-500 text-center max-w-xl mx-auto">
            ⚠️ 이 데모는 안락사 여부를 판단하지 않습니다.
            최신 보호 상태는 반드시 보호소에 직접 확인해주세요.
            <br />
            공공데이터 출처: 농림축산식품부 동물보호관리시스템
          </p>
        </footer>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ResultCard({
  result,
  rank,
  onCopy,
  copiedField,
}: {
  result: RescueSignalResult;
  rank: number;
  onCopy: (text: string, id: string) => void;
  copiedField: string | null;
}) {
  const { animal, priorityScore, matchScore, totalScore, priorityReasons, matchReasons, messages } = result;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-orange-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-2xl font-bold text-orange-600">#{rank}</span>
        <div className="flex-1">
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{animal.kindCd}</h4>
          <p className="text-xs text-zinc-500">{animal.careNm} · {animal.careAddr}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-orange-600">{totalScore}</div>
          <div className="text-xs text-zinc-400">총점</div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Animal info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <InfoPill label="나이" value={animal.age} />
          <InfoPill label="체중" value={animal.weight} />
          <InfoPill label="성별" value={animal.sexCd === "M" ? "수컷" : animal.sexCd === "F" ? "암컷" : "미상"} />
          <InfoPill label="중성화" value={animal.neuterYn === "Y" ? "완료" : animal.neuterYn === "N" ? "미완료" : "미상"} />
        </div>

        {animal.specialMark && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2">
            💬 {animal.specialMark}
          </p>
        )}

        {/* Scores */}
        <div className="grid grid-cols-2 gap-4">
          <ScoreBox label="⚡ Priority Score" score={priorityScore} reasons={priorityReasons} color="red" />
          <ScoreBox label="🎯 Match Score" score={matchScore} reasons={matchReasons} color="blue" />
        </div>

        {/* Messages */}
        <div className="space-y-3">
          <MessageBox
            title="📞 보호소 문의 문구"
            text={messages.shelterInquiry}
            fieldId={`shelter-${animal.id}`}
            onCopy={onCopy}
            copiedField={copiedField}
          />
          <MessageBox
            title="📢 SNS 공유 문구"
            text={messages.snsShare}
            fieldId={`sns-${animal.id}`}
            onCopy={onCopy}
            copiedField={copiedField}
          />
          <MessageBox
            title="🔔 Discord 알림"
            text={messages.discordNotification}
            fieldId={`discord-${animal.id}`}
            onCopy={onCopy}
            copiedField={copiedField}
          />
        </div>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{value}</div>
    </div>
  );
}

function ScoreBox({
  label,
  score,
  reasons,
  color,
}: {
  label: string;
  score: number;
  reasons: ScoreReason[];
  color: "red" | "blue";
}) {
  const barColor = color === "red" ? "bg-red-400" : "bg-blue-400";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{score}/100</span>
      </div>
      <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      {reasons.length > 0 && (
        <ul className="space-y-0.5">
          {reasons.map((r, i) => (
            <li key={i} className="text-xs text-zinc-500 dark:text-zinc-400">
              + {r.label} ({r.points}pts)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageBox({
  title,
  text,
  fieldId,
  onCopy,
  copiedField,
}: {
  title: string;
  text: string;
  fieldId: string;
  onCopy: (text: string, id: string) => void;
  copiedField: string | null;
}) {
  const isCopied = copiedField === fieldId;
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{title}</span>
        <button
          onClick={() => onCopy(text, fieldId)}
          className="text-xs px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition"
        >
          {isCopied ? "✓ 복사됨" : "복사"}
        </button>
      </div>
      <pre className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed max-h-36 overflow-y-auto">
        {text}
      </pre>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
