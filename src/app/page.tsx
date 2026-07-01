"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  RescueAnimal,
  UserPreference,
  RescueSignalResult,
  DataSource,
  ScoreReason,
  GeneratedMessages,
} from "@/types/rescue-animal";
import { recommendTopRescueSignals } from "@/lib/scoring";
import {
  AlertSlot,
  SLOT_LABEL,
  alertRegions,
  findChannel,
} from "@/lib/alert-channels";
import {
  PawPrint,
  MapPin,
  Bell,
  Share2,
  MessageCircle,
  HeartHandshake,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Send,
  CheckCircle2,
  Search,
  ChevronRight,
  Database,
  BarChart3,
  Target,
  FileText,
  Radio,
  Sparkles,
  ExternalLink,
  Mail,
  Maximize2,
  ChevronLeft,
  X,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Types                                                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

type AgentStep = {
  name: string;
  icon: React.ReactNode;
  status: "pending" | "running" | "done";
  detail?: string;
};

/** 오케스트레이터가 반환하는 에이전트 실행 트레이스 항목 */
type AgentTraceEntry = { agent: string; tools: string[]; summary: string };

type ActionTab = "inquiry" | "sns" | "discord";

const INITIAL_PREFERENCE: UserPreference = {
  region: "서울",
  species: "dog",
  helpType: ["adoption"],
  canCareForSenior: false,
  canCareForMedical: false,
  sizePreference: "any",
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Main Component                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

export default function Home() {
  const [preference, setPreference] = useState<UserPreference>(INITIAL_PREFERENCE);
  const [results, setResults] = useState<RescueSignalResult[] | null>(null);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentTrace, setAgentTrace] = useState<AgentTraceEntry[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<ActionTab>("inquiry");
  const [messageSource, setMessageSource] = useState<"foundry" | "local-fallback" | null>(null);

  const formRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToResults() {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  }

  const currentStep = !results ? (loading ? 2 : 1) : 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResults(null);
    setDataSource(null);
    setSelectedIdx(0);
    setActiveTab("inquiry");
    setMessageSource(null);

    // 멀티에이전트 오케스트레이션의 4개 에이전트 단계
    const steps: AgentStep[] = [
      { name: "데이터 수집", icon: <Database size={14} />, status: "pending", detail: "RescueDataAgent" },
      { name: "우선 확인 분석", icon: <BarChart3 size={14} />, status: "pending", detail: "PriorityAnalysisAgent" },
      { name: "조건 매칭 추론", icon: <Target size={14} />, status: "pending", detail: "MatchReasoningAgent" },
      { name: "문구 생성", icon: <FileText size={14} />, status: "pending", detail: "MessageGenerationAgent" },
    ];
    setAgentSteps(steps.map((s) => ({ ...s })));

    // 단일 요청이라 실시간 스트리밍은 아니므로, 에이전트 진행을 대략적으로 표시
    let cur = 0;
    const render = () =>
      setAgentSteps(
        steps.map((s, i) => ({
          ...s,
          status: i < cur ? "done" : i === cur ? "running" : "pending",
        }))
      );
    render();
    const timer = setInterval(() => {
      if (cur < steps.length - 1) {
        cur += 1;
        render();
      }
    }, 9000);

    try {
      const res = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPreference: preference }),
      });
      clearInterval(timer);
      if (!res.ok) throw new Error("orchestrate failed");
      const data = await res.json();
      const recs: RescueSignalResult[] = data.recommendations ?? [];
      const trace: AgentTraceEntry[] = data.trace ?? [];

      setAgentTrace(trace);
      setAgentSteps(
        steps.map((s, i) => ({
          ...s,
          status: "done",
          detail: trace[i]?.tools?.length ? `도구: ${trace[i].tools.join(", ")}` : "완료",
        }))
      );
      setMessageSource(data.source === "agent-orchestration" ? "foundry" : "local-fallback");
      setResults(recs);
      if (recs.length > 0) scrollToResults();
    } catch {
      clearInterval(timer);
      setAgentSteps(
        steps.map((s, i) => ({
          ...s,
          status: i === 0 ? "done" : "pending",
          detail: i === 0 ? "오케스트레이션 실패 — 재시도" : s.detail,
        }))
      );
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, fieldId: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-200 dark:border-zinc-700 px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-400/40 transition";

  const selected = results?.[selectedIdx] ?? null;

  return (
    <div className="min-h-screen bg-[#FFFCF7] dark:bg-zinc-950">
      {/* ══ Sticky Header ══ */}
      <header className="border-b border-orange-100/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Rescue Signal Agent 로고" className="h-8 w-auto" />
          <span className="font-bold text-orange-700 dark:text-orange-400 text-base tracking-tight">
            Rescue Signal Agent
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6">
        {/* ══ SECTION 1 — Landing ══ */}
        <section className="pt-16 pb-12 text-center space-y-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-zinc-900 dark:text-zinc-50 leading-tight tracking-tight">
            펫샵에 가기 전,
            <br />
            <span className="text-orange-600 dark:text-orange-400">
              오늘의 구조신호를 먼저 확인하세요
            </span>
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            공공 구조동물 데이터를 바탕으로 조건에 맞는 아이를 찾고,
            <br className="hidden sm:block" />
            보호소 문의 · SNS 공유 · Discord 알림까지 바로 이어집니다.
          </p>

          <button
            onClick={scrollToForm}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-[0.97] text-white font-semibold text-sm shadow-lg shadow-orange-200/50 dark:shadow-none transition-all"
          >
            <Search size={16} />
            내 구조신호 찾기
            <ChevronRight size={16} />
          </button>

          {/* Value cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 max-w-3xl mx-auto">
            <ValueCard
              icon={<Database size={20} />}
              title="공공데이터 기반"
              desc="구조동물 공고 정보를 바탕으로 확인합니다."
            />
            <ValueCard
              icon={<BarChart3 size={20} />}
              title="우선 확인 필요도 분석"
              desc="공고 기간, 보호 상태, 특이사항을 기준으로 우선순위를 계산합니다."
            />
            <ValueCard
              icon={<MessageCircle size={20} />}
              title="문의·공유 문구 자동 생성"
              desc="입양/임보/홍보 액션으로 바로 이어질 수 있게 돕습니다."
            />
          </div>
        </section>

        {/* ══ Step Indicator ══ */}
        <div className="flex items-center justify-center gap-1 pb-8" ref={formRef}>
          {["조건 설정", "구조신호 분석", "문의/공유 액션"].map((label, i) => {
            const stepNum = i + 1;
            const isActive = currentStep >= stepNum;
            return (
              <div key={label} className="flex items-center gap-1">
                {i > 0 && (
                  <div className={`w-8 h-px ${isActive ? "bg-orange-400" : "bg-zinc-200 dark:bg-zinc-700"}`} />
                )}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      isActive ? "bg-orange-500 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {stepNum}
                  </span>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${
                      isActive ? "text-zinc-700 dark:text-zinc-200" : "text-zinc-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══ SECTION 2 — Condition Form ══ */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200/70 dark:border-zinc-800 p-6 sm:p-8 mb-10">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                <Bell size={16} className="text-orange-600 dark:text-orange-400" />
              </span>
              내 구조신호 조건 설정
            </h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5 ml-10">
              조건에 맞는 아이 중 먼저 확인하면 좋은 구조신호를 찾아드려요.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="지역">
                <select
                  value={preference.region}
                  onChange={(e) => setPreference({ ...preference, region: e.target.value })}
                  className={inputClass}
                >
                  <option value="">전체</option>
                  <option value="서울">서울</option>
                  <option value="경기">경기</option>
                  <option value="인천">인천</option>
                  <option value="부산">부산</option>
                  <option value="대구">대구</option>
                  <option value="대전">대전</option>
                  <option value="광주">광주</option>
                  <option value="울산">울산</option>
                  <option value="세종">세종</option>
                  <option value="강원">강원</option>
                  <option value="충북">충북</option>
                  <option value="충남">충남</option>
                  <option value="전북">전북</option>
                  <option value="전남">전남</option>
                  <option value="경북">경북</option>
                  <option value="경남">경남</option>
                  <option value="제주">제주</option>
                </select>
              </FormField>
              <FormField label="동물 종류">
                <select
                  value={preference.species}
                  onChange={(e) =>
                    setPreference({ ...preference, species: e.target.value as UserPreference["species"] })
                  }
                  className={inputClass}
                >
                  <option value="dog">강아지</option>
                  <option value="cat">고양이</option>
                  <option value="other">기타</option>
                  <option value="any">전체</option>
                </select>
              </FormField>
              <FormField label="선호 크기">
                <select
                  value={preference.sizePreference || "any"}
                  onChange={(e) =>
                    setPreference({
                      ...preference,
                      sizePreference: e.target.value as UserPreference["sizePreference"],
                    })
                  }
                  className={inputClass}
                >
                  <option value="any">상관없음</option>
                  <option value="small">소형 (7kg 이하)</option>
                  <option value="medium">중형 (7~20kg)</option>
                  <option value="large">대형 (20kg 이상)</option>
                </select>
              </FormField>
            </div>

            <FormField label="도움 유형">
              <div className="flex flex-wrap gap-2">
                {(["adoption", "foster", "share"] as const).map((type) => {
                  const meta = {
                    adoption: { label: "입양", icon: <HeartHandshake size={14} /> },
                    foster: { label: "임시보호", icon: <PawPrint size={14} /> },
                    share: { label: "SNS 공유", icon: <Share2 size={14} /> },
                  };
                  const m = meta[type];
                  const on = preference.helpType.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        const next = on
                          ? preference.helpType.filter((t) => t !== type)
                          : [...preference.helpType, type];
                        setPreference({ ...preference, helpType: next.length > 0 ? next : [type] });
                      }}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                        on
                          ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                          : "bg-white text-zinc-600 border-zinc-200 hover:border-orange-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                      }`}
                    >
                      {m.icon}
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </FormField>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preference.canCareForSenior}
                  onChange={(e) => setPreference({ ...preference, canCareForSenior: e.target.checked })}
                  className="rounded border-zinc-300 text-orange-500 focus:ring-orange-400"
                />
                노령 동물 케어 가능
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preference.canCareForMedical}
                  onChange={(e) => setPreference({ ...preference, canCareForMedical: e.target.checked })}
                  className="rounded border-zinc-300 text-orange-500 focus:ring-orange-400"
                />
                의료 케이스 케어 가능
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-[0.98] disabled:bg-orange-300 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-sm transition-all"
            >
              {loading ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                  분석 중...
                </>
              ) : (
                <>
                  <Search size={15} />
                  구조신호 분석하기
                </>
              )}
            </button>
          </form>
        </section>

        {/* ══ SECTION 3 — Results ══ */}
        {results && results.length > 0 && (
          <section className="mb-10 space-y-6" ref={resultsRef}>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                  <Radio size={18} className="text-orange-500" />
                  오늘의 구조신호 TOP {results.length}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  점수는 공고 기간, 보호 상태, 특이사항, 지역/조건 매칭을 기반으로 계산됩니다.
                </p>
              </div>
              {dataSource && (
                <span
                  className={`self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                    dataSource === "public-api"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
                      : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${dataSource === "public-api" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {dataSource === "public-api" ? "공공데이터 연결" : "샘플 데이터(폴백)"}
                </span>
              )}
              {messageSource && (
                <span
                  className={`self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                    messageSource === "foundry"
                      ? "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800"
                      : "bg-zinc-50 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                  }`}
                >
                  <Sparkles size={11} />
                  {messageSource === "foundry" ? "멀티에이전트 오케스트레이션" : "로컬 폴백"}
                </span>
              )}
            </div>

            {/* Compact selectable cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {results.map((r, idx) => (
                <CompactCard
                  key={r.animal.id}
                  result={r}
                  rank={idx + 1}
                  isSelected={idx === selectedIdx}
                  isSampleData={dataSource === "sample-fallback"}
                  onClick={() => { setSelectedIdx(idx); setActiveTab("inquiry"); }}
                />
              ))}
            </div>

            {/* ══ SECTION 4 — Detail / Action Panel ══ */}
            {selected && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <HeartHandshake size={16} className="text-orange-600 dark:text-orange-400" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-zinc-800 dark:text-zinc-100 text-sm">선택한 구조신호 액션</h3>
                    <p className="text-xs text-zinc-400 truncate">{selected.animal.kindCd} · {selected.animal.careNm}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100 dark:divide-zinc-800">
                  {/* Left — detail */}
                  <div className="lg:col-span-2 p-5 space-y-4">
                    <PhotoViewer
                      key={selected.animal.id}
                      photos={[selected.animal.popfile, selected.animal.popfile2]}
                      alt={selected.animal.kindCd}
                      isSampleData={dataSource === "sample-fallback"}
                    />
                    <div className="space-y-3">
                      <MiniScore label="종합 점수" value={selected.totalScore} max={100} color="orange" />
                      <MiniScore label="우선 확인 필요도" value={selected.priorityScore} max={100} color="red" />
                      <MiniScore label="내 조건 매칭도" value={selected.matchScore} max={100} color="blue" />
                    </div>
                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
                      <ReasonsList title="우선 확인 이유" reasons={selected.priorityReasons} accent="orange" />
                      <ReasonsList title="내 조건과 맞는 점" reasons={selected.matchReasons} accent="blue" />
                    </div>
                  </div>

                  {/* Right — action tabs */}
                  <div className="lg:col-span-3 p-5 space-y-4">
                    <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
                      {([
                        { key: "inquiry" as ActionTab, label: "보호소 문의", icon: <MessageCircle size={13} /> },
                        { key: "sns" as ActionTab, label: "SNS 공유", icon: <Share2 size={13} /> },
                        { key: "discord" as ActionTab, label: "Discord 알림", icon: <Bell size={13} /> },
                      ]).map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                            activeTab === tab.key
                              ? "bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm"
                              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                          }`}
                        >
                          {tab.icon}
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {activeTab === "inquiry" && (
                      <MessagePanel
                        text={selected.messages.shelterInquiry}
                        fieldId={`shelter-${selected.animal.id}`}
                        onCopy={handleCopy}
                        copiedField={copiedField}
                      />
                    )}
                    {activeTab === "sns" && (
                      <MessagePanel
                        text={selected.messages.snsShare}
                        fieldId={`sns-${selected.animal.id}`}
                        onCopy={handleCopy}
                        copiedField={copiedField}
                      />
                    )}
                    {activeTab === "discord" && (
                      <div className="space-y-3">
                        <MessagePanel
                          text={selected.messages.discordNotification}
                          fieldId={`discord-${selected.animal.id}`}
                          onCopy={handleCopy}
                          copiedField={copiedField}
                        />
                        <DiscordSendButton message={selected.messages.discordNotification} />
                        <AlertChannelPicker />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ══ SECTION 5 — Email Subscription ══ */}
        {results && results.length > 0 && (
          <EmailSubscribeForm
            region={preference.region}
            species={preference.species}
          />
        )}

        {/* ══ SECTION 6 — Agent Trace ══ */}
        {agentSteps.length > 0 && (
          <section className="mb-10 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-5 sm:p-6">
            <h3 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 mb-4 flex items-center gap-2">
              <ShieldCheck size={15} className="text-zinc-400" />
              멀티에이전트가 이렇게 협업했어요
            </h3>
            <div className="flex flex-col sm:flex-row gap-2">
              {agentSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 sm:flex-1">
                  {i > 0 && <div className="hidden sm:block w-full h-px bg-zinc-200 dark:bg-zinc-700 flex-1 max-w-6" />}
                  <div
                    className={`flex items-center gap-2 sm:flex-col sm:items-center sm:gap-1 rounded-xl px-3 py-2.5 sm:py-3 sm:flex-1 text-center w-full transition-all ${
                      step.status === "done"
                        ? "bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/80 dark:border-zinc-700"
                        : step.status === "running"
                        ? "bg-orange-50 dark:bg-orange-900/15 border border-orange-200/60 dark:border-orange-800/40"
                        : "bg-zinc-100/60 dark:bg-zinc-800/30 border border-transparent"
                    }`}
                  >
                    <span className={`${step.status === "done" ? "text-emerald-500" : step.status === "running" ? "text-orange-500" : "text-zinc-300 dark:text-zinc-600"}`}>
                      {step.status === "done" ? <CheckCircle2 size={15} /> : step.icon}
                    </span>
                    <span className={`text-xs font-semibold ${step.status === "done" ? "text-zinc-700 dark:text-zinc-200" : step.status === "running" ? "text-orange-600" : "text-zinc-400"}`}>
                      {step.name}
                    </span>
                    {step.status === "done" && step.detail && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight hidden sm:block">{step.detail}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 실제 에이전트 실행 트레이스 (오케스트레이터 반환값) */}
            {agentTrace.length > 0 && (
              <div className="mt-5 space-y-2">
                {agentTrace.map((t, i) => (
                  <div key={i} className="rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-700 px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{t.agent}</span>
                      {t.tools.map((tool, j) => (
                        <span key={j} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                          🛠 {tool}
                        </span>
                      ))}
                    </div>
                    {t.summary && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">{t.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ══ Safety Notice ══ */}
        <footer className="border-t border-zinc-200/50 dark:border-zinc-800 pt-6 pb-12">
          <div className="max-w-xl mx-auto bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/40 dark:border-amber-800/20 rounded-2xl px-5 py-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                이 서비스는 안락사 여부를 판단하지 않습니다. 최신 상태는 반드시 보호소에 직접 확인해주세요.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck size={14} className="text-zinc-400 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
                실제 공고에 사진이 없는 경우, 임의의 동물 사진을 붙이지 않고 placeholder로 표시합니다.
                <br />
                공공데이터 출처: 농림축산식품부 동물보호관리시스템 (data.go.kr)
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Sub-components                                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ValueCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-5 text-left space-y-2 shadow-sm">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/25 text-orange-600 dark:text-orange-400">
        {icon}
      </span>
      <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{title}</h4>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

function CompactCard({
  result,
  rank,
  isSelected,
  isSampleData,
  onClick,
}: {
  result: RescueSignalResult;
  rank: number;
  isSelected: boolean;
  isSampleData: boolean;
  onClick: () => void;
}) {
  const { animal, totalScore, priorityScore, matchScore, priorityReasons, matchReasons } = result;
  const sexLabel = animal.sexCd === "M" ? "수컷" : animal.sexCd === "F" ? "암컷" : "미상";
  const topReason = [...priorityReasons, ...matchReasons][0];

  return (
    <button
      onClick={onClick}
      className={`text-left w-full bg-white dark:bg-zinc-900 rounded-2xl border overflow-hidden shadow-sm transition-all hover:shadow-md ${
        isSelected
          ? "border-orange-400 ring-2 ring-orange-200/60 dark:ring-orange-800/40 dark:border-orange-600"
          : "border-zinc-200/70 dark:border-zinc-800"
      }`}
    >
      <div className="h-36 overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative">
        <AnimalImage src={animal.popfile} alt={animal.kindCd} isSampleData={isSampleData} />
      </div>
      <div className="p-4 space-y-2.5">
        <div className="flex items-start gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-extrabold flex-shrink-0">
            {rank}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 truncate">{animal.kindCd}</p>
            <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1 mt-0.5">
              <MapPin size={10} />
              {animal.careNm}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Pill>{animal.age}</Pill>
          <Pill>{sexLabel}</Pill>
          <Pill>{animal.weight}</Pill>
          <Pill>{animal.processState}</Pill>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <ScoreBadge label="종합" value={totalScore} />
          <ScoreBadge label="긴급" value={priorityScore} />
          <ScoreBadge label="매칭" value={matchScore} />
        </div>
        {topReason && (
          <p className="text-[11px] text-zinc-400 leading-relaxed truncate">{topReason.label}</p>
        )}
      </div>
    </button>
  );
}

/**
 * 사진 뷰어 — 대표/추가 사진을 썸네일로 보여주고, 클릭 시 전체보기(라이트박스).
 * 사진이 여러 장이면 좌우 화살표·썸네일·도트로 넘겨본다. (key로 동물별 remount)
 */
function PhotoViewer({
  photos,
  alt,
  isSampleData,
}: {
  photos: (string | undefined)[];
  alt: string;
  isSampleData: boolean;
}) {
  const valid = photos.filter((p): p is string => !!p && p.startsWith("http"));
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open || valid.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowRight") setIdx((i) => (i + 1) % valid.length);
      else if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + valid.length) % valid.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, valid.length]);

  if (valid.length === 0) {
    return (
      <div className="w-full aspect-[4/3] rounded-xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center gap-1.5 text-zinc-300 dark:text-zinc-600">
        <PawPrint size={28} />
        <span className="text-[10px] text-center leading-tight">
          사진 준비 중<br />보호소 공고에서 직접 확인
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => { setIdx(0); setOpen(true); }}
        className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 group"
        aria-label="사진 전체보기"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={valid[0]} alt={alt} className="w-full h-full object-cover" />
        <span className="absolute inset-0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-white text-xs font-semibold bg-black/55 px-2.5 py-1 rounded-full transition-opacity">
            <Maximize2 size={12} /> 전체보기
          </span>
        </span>
        {isSampleData && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/50 text-white px-2 py-0.5 rounded-full">샘플 이미지</span>
        )}
        {valid.length > 1 && (
          <span className="absolute bottom-2 right-2 text-[10px] font-semibold bg-black/60 text-white px-2 py-0.5 rounded-full">📷 {valid.length}장</span>
        )}
      </button>

      {valid.length > 1 && (
        <div className="flex gap-1.5">
          {valid.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setIdx(i); setOpen(true); }}
              className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:border-orange-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
        >
          <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="닫기">
            <X size={28} />
          </button>
          {valid.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + valid.length) % valid.length); }}
              className="absolute left-3 sm:left-6 text-white/80 hover:text-white"
              aria-label="이전 사진"
            >
              <ChevronLeft size={36} />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={valid[idx]}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
          {valid.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % valid.length); }}
              className="absolute right-3 sm:right-6 text-white/80 hover:text-white"
              aria-label="다음 사진"
            >
              <ChevronRight size={36} />
            </button>
          )}
          {valid.length > 1 && (
            <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {valid.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/40"}`}
                  aria-label={`${i + 1}번 사진`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnimalImage({ src, alt, isSampleData }: { src: string; alt: string; isSampleData: boolean }) {
  const [failed, setFailed] = useState(false);
  const hasImage = src && src.startsWith("http") && !failed;

  if (!hasImage) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-zinc-300 dark:text-zinc-600">
        <PawPrint size={28} />
        <span className="text-[10px] text-center leading-tight">
          사진 준비 중<br />보호소 공고에서 직접 확인 필요
        </span>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} onError={() => setFailed(true)} className="w-full h-full object-cover" />
      {isSampleData && (
        <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/50 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
          샘플 이미지
        </span>
      )}
    </>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
      {children}
    </span>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-sm font-extrabold text-orange-600 dark:text-orange-400 leading-none">{value}</p>
      <p className="text-[9px] text-zinc-400 mt-0.5">{label}</p>
    </div>
  );
}

function MiniScore({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: "orange" | "red" | "blue";
}) {
  const barColors = { orange: "bg-orange-400", red: "bg-red-400", blue: "bg-blue-400" };
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
          {value}<span className="text-zinc-300 dark:text-zinc-600">/{max}</span>
        </span>
      </div>
      <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${barColors[color]}`}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ReasonsList({
  title,
  reasons,
  accent,
}: {
  title: string;
  reasons: ScoreReason[];
  accent: "orange" | "blue";
}) {
  if (reasons.length === 0) return null;
  const dotColor = accent === "orange" ? "bg-orange-400" : "bg-blue-400";
  return (
    <div>
      <h5 className="text-xs font-bold text-zinc-600 dark:text-zinc-300 mb-1.5">{title}</h5>
      <ul className="space-y-1">
        {reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
            {r.label}
            <span className="text-zinc-300 dark:text-zinc-600 ml-auto flex-shrink-0">+{r.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessagePanel({
  text,
  fieldId,
  onCopy,
  copiedField,
}: {
  text: string;
  fieldId: string;
  onCopy: (text: string, id: string) => void;
  copiedField: string | null;
}) {
  const isCopied = copiedField === fieldId;
  return (
    <div className="border border-zinc-200/80 dark:border-zinc-700 rounded-xl overflow-hidden">
      <pre className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed max-h-44 overflow-y-auto">
        {text}
      </pre>
      <div className="border-t border-zinc-200/80 dark:border-zinc-700 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/60 flex justify-end">
        <button
          onClick={() => onCopy(text, fieldId)}
          className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg font-medium transition-all ${
            isCopied
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600"
          }`}
        >
          {isCopied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
          {isCopied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}

function DiscordSendButton({ message }: { message: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSend() {
    setState("sending");
    try {
      const res = await fetch("/api/notifications/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        setState("sent");
        setTimeout(() => setState("idle"), 3000);
      } else {
        setState("error");
        setTimeout(() => setState("idle"), 3000);
      }
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <button
      onClick={handleSend}
      disabled={state === "sending"}
      className={`w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
        state === "sent"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : state === "error"
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
          : state === "sending"
          ? "bg-indigo-100 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300 cursor-not-allowed"
          : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
      }`}
    >
      {state === "sending" && (
        <>
          <span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />
          전송 중...
        </>
      )}
      {state === "sent" && <><CheckCircle2 size={13} /> Discord 전송 완료</>}
      {state === "error" && "전송 실패 — 다시 시도"}
      {state === "idle" && <><Send size={13} /> Discord로 알림 보내기</>}
    </button>
  );
}

/**
 * 조건별(시간대 × 지역) Discord 알림 채널 참여 피커.
 * 사용자가 지역과 시간대를 고르면 해당 채널의 공개 초대 링크로 입장한다.
 * 채널 설정은 @/lib/alert-channels 의 단일 소스를 따른다.
 * 초대 링크는 공개해도 안전한 값(웹훅 비밀과 다름).
 */
function AlertChannelPicker() {
  const regions = alertRegions();
  const [region, setRegion] = useState(regions[0] ?? "전국");
  const [slot, setSlot] = useState<AlertSlot>("morning");

  const channel = findChannel(region, slot);
  const ready = !!channel?.invite;

  const selectClass =
    "rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 p-3 space-y-2.5">
      <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
        <Bell size={12} /> 원하는 시간대·지역으로 자동 알림 받기
      </p>
      <div className="flex gap-2">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className={`flex-1 ${selectClass}`}
          aria-label="알림 지역"
        >
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={slot}
          onChange={(e) => setSlot(e.target.value as AlertSlot)}
          className={`flex-1 ${selectClass}`}
          aria-label="알림 시간대"
        >
          {(["morning", "evening"] as AlertSlot[]).map((s) => (
            <option key={s} value={s}>
              {SLOT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {ready ? (
        <a
          href={channel!.invite}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
        >
          <ExternalLink size={13} /> {region} · {SLOT_LABEL[slot]} 채널 참여하기
        </a>
      ) : (
        <div className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed">
          이 조건 채널은 준비 중이에요
        </div>
      )}
    </div>
  );
}

/**
 * 이메일 맞춤 구독 폼.
 * 현재 선택한 지역·동물 조건을 그대로 사용해 "이 조건으로 매일 메일 받기"를 등록한다.
 * → 사용자가 UI에서 고른 조건에 맞춰 그 사람에게 알림이 가는 구조.
 */
function EmailSubscribeForm({
  region,
  species,
}: {
  region: string;
  species: UserPreference["species"];
}) {
  const [email, setEmail] = useState("");
  const [slot, setSlot] = useState<AlertSlot>("morning");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const regionLabel = region && region !== "전체" ? region : "전국";
  const speciesLabel =
    species === "dog" ? "강아지" : species === "cat" ? "고양이" : species === "other" ? "기타" : "전체";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, region, species, slot }),
      });
      const data = await res.json();
      if (res.ok) {
        setState("done");
        setMsg(
          `${data.region} · ${data.species} / ${slot === "morning" ? "매일 아침 9시" : "매일 저녁 6시"} 구독 완료! 확인 메일을 보냈어요 (스팸함도 확인).`
        );
      } else {
        setState("error");
        setMsg(data.error || "구독에 실패했습니다.");
      }
    } catch {
      setState("error");
      setMsg("네트워크 오류가 발생했습니다.");
    }
  }

  const selectClass =
    "rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <section className="mb-10 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-200/60 dark:border-indigo-800/40 p-5 sm:p-6">
      <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-200 mb-1.5 flex items-center gap-2">
        <Mail size={15} className="text-indigo-500" />
        이 조건으로 매일 이메일 받기
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        지금 선택한 <b className="text-indigo-600 dark:text-indigo-300">{regionLabel} · {speciesLabel}</b> 조건에 맞춰, 매일 정해진 시간에 맞춤 추천을 메일로 보내드려요.
      </p>

      {state === "done" ? (
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} /> {msg}
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            className={`flex-1 ${selectClass}`}
          />
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value as AlertSlot)}
            className={selectClass}
            aria-label="알림 시간대"
          >
            {(["morning", "evening"] as AlertSlot[]).map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={state === "sending"}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-60"
          >
            {state === "sending" ? "등록 중..." : "구독하기"}
          </button>
        </form>
      )}
      {state === "error" && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{msg}</p>
      )}
    </section>
  );
}


function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
