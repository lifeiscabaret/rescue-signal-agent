# 🏗️ TRD — Technical Requirements Document

> **심사 기준 2: Solution Design & Innovation (목표: 20/20)**  
> **심사 기준 3: Technical Execution (목표: 20/20)**

---

## 1. 시스템 아키텍처 개요

```
[Web UI]
사용자 조건 입력
        ↓
[Rescue Signal Agent — MAF Orchestrator]
사용자 조건 분석 / 우선순위 판단 / 문구 생성
        ↓
[Rescue Data Tool]
공공데이터 API or sample data fallback
        ↓
[Azure AI Search RAG]
안전 표현 정책 / 입양 문의 가이드 / 홍보 문구 가이드 검색
        ↓
[Notification Tool — MCP-ready]
Discord Webhook or MCP-ready messenger tool
        ↓
[Output]
TOP 3 추천 + 추천 이유 + 보호소 문의 문구 + SNS 공유 문구 + Discord 알림
```

### Agent 구성

```
[Orchestrator] ← MAF 기반 조율
   ├─ [Rescue Data Agent]       ← 공공데이터 수집 + sample fallback
   ├─ [Priority Analysis Agent] ← 공고 마감일·특이사항 기반 우선 확인 필요도
   ├─ [Match Reasoning Agent]   ← 사용자 조건 매칭 스코어링
   ├─ [Message Generation Agent]← 문의·SNS·Discord 문구 생성 (RAG grounding)
   └─ [Notification Agent]      ← Discord Webhook / MCP-ready 알림 발송
```

---

## 2. 기술 스택

| 레이어 | 기술 | 선택 이유 |
|--------|------|---------|
| **언어** | Python 3.11+ | Azure SDK, AI SDK 지원 최적 |
| **Agent Framework** | Microsoft Agent Framework (MAF) | 심사 요구사항, 프로덕션 검증됨 |
| **LLM** | Azure OpenAI GPT-4o | 한국어 성능, Azure 통합 |
| **스케줄러** | Azure Functions (Timer Trigger) | 서버리스, 비용 효율 |
| **메시지 큐** | Azure Service Bus | 에이전트 간 비동기 통신 |
| **데이터베이스** | Azure Cosmos DB (NoSQL) | 유연한 스키마, 빠른 쿼리 |
| **배포** | Azure Container Apps | 자동 스케일링 |
| **비밀 관리** | Azure Key Vault | 보안 API 키 관리 |
| **모니터링** | Azure Application Insights | 에이전트 실행 추적 |

---

## 3. 데이터 모델

### 3.1 유기동물 데이터 스키마

```json
{
  "id": "string",                    // 공공데이터 공고번호
  "name": "string",                  // 동물 이름 (있는 경우)
  "species": "dog | cat | other",    // 종류
  "breed": "string",                 // 품종
  "gender": "M | F | Q",            // 성별
  "age": "string",                   // 나이 추정
  "color": "string",                 // 색상
  "weight": "float",                 // 체중 (kg)
  "noticeDate": "date",              // 공고일
  "noticeDeadline": "date",          // 공고 종료일 (핵심!)
  "shelterName": "string",           // 보호소명
  "shelterRegion": "string",         // 지역
  "status": "pending | fostering | adopted | dead",
  "imageUrl": "string",              // 대표 이미지
  "specialNote": "string",           // 특이사항
  "urgencyScore": "float",           // AI 계산 긴급도 점수
  "updatedAt": "datetime"
}
```

### 3.2 긴급도 스코어 계산

```python
def calculate_urgency_score(animal: dict) -> float:
    """
    긴급도 점수 = 낮을수록 더 긴급
    0~100 범위, 20 이하 = 즉시 액션 필요
    """
    score = 100.0

    # 1. 공고 종료까지 남은 날수 (핵심 지표)
    days_left = (animal["noticeDeadline"] - today).days
    if days_left <= 0:
        score -= 60
    elif days_left <= 3:
        score -= 45
    elif days_left <= 7:
        score -= 30

    # 2. 공고 경과일 (오래될수록 관심 감소)
    days_elapsed = (today - animal["noticeDate"]).days
    score -= min(days_elapsed * 0.5, 15)

    # 3. 건강 상태 가중치
    if "치료중" in animal["specialNote"] or "부상" in animal["specialNote"]:
        score -= 10

    # 4. 재보호 이력
    if animal.get("rescueCount", 0) > 1:
        score -= 10

    return max(score, 0)
```

---

## 4. 에이전트 파이프라인 상세

### 4.1 데이터 수집 흐름

```
[Azure Functions Timer] 
    ↓ (1시간 주기)
[Collector Agent]
    → GET 농림축산식품부 API /abandonmentPublicSrvc/abandonmentPublic
    → 파라미터: 지역코드, 날짜범위, 페이지네이션
    → 응답 파싱 → Azure Cosmos DB upsert
    ↓
[Priority Agent]
    → 긴급도 스코어 재계산 (변경된 항목만)
    → 상위 긴급 케이스 Azure Service Bus 발행
    ↓
[Notifier Agent]
    → Service Bus 구독
    → 사용자 매칭 조건 확인
    → 알림 메시지 생성 (GPT-4o)
    → 채널별 발송
    ↓
[Reporter Agent]
    → 일별 통계 집계
    → 보호소별 현황 요약 생성
    → 관리자 리포트 발송
```

---

## 5. 공공데이터 API 연동

### 5.1 사용 API

| API | 제공기관 | 엔드포인트 |
|-----|---------|----------|
| 유기동물 공고 조회 | 농림축산식품부 | `http://apis.data.go.kr/1543061/abandonmentPublicSrvc/abandonmentPublic` |
| 동물보호센터 조회 | 농림축산식품부 | `http://apis.data.go.kr/1543061/abandonmentPublicSrvc/shelter` |
| 유기동물 통계 | 농림축산식품부 | `http://apis.data.go.kr/1543061/abandonmentPublicSrvc/abandonmentPublicStat` |

### 5.2 API 호출 예시

```python
import httpx

async def fetch_abandoned_animals(
    region_code: str,
    start_date: str,
    end_date: str,
    page_no: int = 1
) -> dict:
    params = {
        "serviceKey": settings.PUBLIC_DATA_API_KEY,
        "upr_cd": region_code,
        "bgnde": start_date,    # YYYYMMDD
        "endde": end_date,
        "pageNo": page_no,
        "numOfRows": 100,
        "type": "json"
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://apis.data.go.kr/1543061/abandonmentPublicSrvc/abandonmentPublic",
            params=params
        )
        return response.json()
```

---

## 6. GitHub Copilot 활용 전략

### 6.1 개발 과정에서의 Copilot 활용

| 작업 | Copilot 활용 방식 |
|------|-----------------|
| API 클라이언트 코드 | Copilot Chat: "공공데이터 API 비동기 클라이언트 생성" |
| 긴급도 알고리즘 | Copilot Inline: 점수 계산 함수 자동완성 |
| 테스트 코드 생성 | Copilot Chat: "이 함수에 대한 pytest 테스트 작성" |
| 오류 처리 | Copilot Fix: API 오류 응답 핸들링 |
| 문서화 | Copilot Docs: docstring 자동 생성 |

### 6.2 프롬프트 엔지니어링

```
# prompts/urgency_analysis.txt
당신은 유기동물 보호 전문가입니다.
다음 동물의 정보를 분석하고 입양/임보 홍보 메시지를 작성하세요.

동물 정보: {animal_data}
공고 종료일: {deadline}
보호소: {shelter_name}

요구사항:
1. 100자 이내 SNS 홍보 문구 (긴급도 반영)
2. 핵심 특징 3가지 (이모지 포함)
3. 행동 유도 문구 (CTA)

출력 형식: JSON
```

---

## 7. 보안 & 컴플라이언스

| 항목 | 구현 방법 |
|------|---------|
| API 키 관리 | Azure Key Vault + Managed Identity |
| 데이터 암호화 | Azure Cosmos DB 기본 암호화 (AES-256) |
| 접근 제어 | Azure RBAC |
| 개인정보 | 공공데이터만 수집, PII 저장 없음 |
| 로깅 | Azure Application Insights (비식별화) |

---

## 8. 테스트 전략

```
tests/
├── unit/
│   ├── test_urgency_score.py     # 긴급도 계산 단위 테스트
│   ├── test_api_client.py        # API 클라이언트 목 테스트
│   └── test_message_generator.py # 메시지 생성 테스트
├── integration/
│   ├── test_collector_agent.py   # 수집 에이전트 통합 테스트
│   └── test_pipeline.py          # 전체 파이프라인 E2E 테스트
└── fixtures/
    └── sample_animals.json        # 테스트용 샘플 데이터
```

---

## 9. 배포 아키텍처 (Azure)

```
GitHub Actions CI/CD
    ↓
Azure Container Registry
    ↓
Azure Container Apps
    ├── collector-agent (Timer: 1h)
    ├── priority-agent  (Service Bus Consumer)
    ├── notifier-agent  (Service Bus Consumer)
    └── reporter-agent  (Timer: 24h)

Azure Service Bus (메시지 큐)
Azure Cosmos DB (데이터 저장)
Azure Key Vault (비밀 관리)
Azure Application Insights (모니터링)
```

---

## 10. Azure AI Search for RAG

RAG는 구조동물 목록 자체보다, **안전한 설명과 입양 문의 가이드 grounding**에 사용합니다.

### RAG에 넣을 문서

```
docs/adoption-inquiry-guide.md    ← 보호소 문의 시 확인할 질문
docs/safety-wording-policy.md     ← 안전 표현 정책 (금지/권장)
docs/animal-welfare-guide.md      ← 동물복지 표현 가이드
docs/public-api-field-guide.md    ← 공공데이터 필드 해설
```

### RAG 사용 목적

에이전트가 추천 이유와 문의 문구를 만들 때 다음 내용을 grounding합니다:

- 안전한 표현 정책 (과장 표현 금지, 안락사 여부 단정 금지)
- 입양/임보 문의 시 확인해야 할 질문
- 보호소 직접 확인 필요 문구
- SNS 홍보 문구 작성 가이드

### 안전 표현 예시

사용자가 "긴급한 아이 알려줘"라고 입력해도, 에이전트는 RAG 문서를 참고해:

> 공공데이터만으로 안락사 여부를 단정할 수는 없습니다.  
> 다만 공고 마감일이 가까워 우선 확인이 필요한 아이로 분류됩니다.  
> 현재 보호 상태는 보호소에 직접 확인해주세요.

---

## 11. MCP-ready Tool Layer

MCP는 에이전트와 도구 사이의 연결 계층으로 사용합니다.

### Tool 후보

```python
getRescueAnimals(region, species)              # 공공데이터 or sample 조회
calculatePriorityScore(animal)                  # 우선 확인 필요도 계산
calculateMatchScore(animal, userPreference)     # 사용자 매칭 점수
generateShelterInquiry(animal, userPreference)  # 보호소 문의 문구 생성
sendDiscordNotification(message)                # Discord 알림 전송
```

### 목적

- 구조동물 데이터 조회 기능을 에이전트와 분리
- Discord/메신저 알림 기능을 도구로 분리
- 향후 Teams, Slack, KakaoTalk, Email 등으로 확장 가능
- Agent Framework에서 tool 호출 흐름을 명확히 보여줄 수 있음

---

## 12. Azure Functions

Azure Functions는 MCP 또는 알림 도구를 가볍게 배포하는 데 사용합니다.

### 사용 가능 시나리오

```
Azure Function: /api/rescue-animals
  → 공공데이터 API 또는 sample data 조회

Azure Function: /api/send-notification
  → Discord Webhook으로 알림 전송

Azure Function MCP endpoint
  → 향후 Foundry Agent가 MCP tool로 호출 가능
```

MVP에서는 최소한 `sendNotification` 도구 구조를 만들고, 가능하면 Discord Webhook과 연결합니다.

---

## 13. Azure Container Apps

웹 UI와 Agent API를 배포하는 데 사용합니다.

### 배포 목표

```
RescueSignal.WebUI        ← 사용자 조건 입력 UI
RescueSignal.Agent API    ← 에이전트 오케스트레이션 API
Notification Tool         ← Discord/MCP 알림 서비스
```

### 해커톤 배포 우선순위

1. 로컬 데모 안정화
2. Discord 알림 실제 동작
3. Azure 배포 시도
4. 실패 시 README에 로컬 실행 및 Azure 배포 계획 명시

---

## 14. Azure Developer CLI (azd up)

가능하면 `azd up`으로 배포 가능하도록 구조를 잡습니다.

### 목표

```
clone → configure env → azd up → deployed web app / agent API
```

### 발표 시 설명

> 로컬 MVP를 먼저 안정화했고, Azure 배포는 `azd up` 기반으로 확장 가능하도록 설계했습니다.

---

*이 문서는 Rescue Signal Agent의 기술 아키텍처와 구현 명세를 정의합니다.*
