# 🤖 AGENTS.md — 에이전트 설계 명세

> **심사 보너스: Multi-agent Orchestration (목표: +10점)**  
> **심사 기준 2: Solution Design & Innovation**

---

## 1. 에이전트 시스템 개요

Rescue Signal Agent는 **Microsoft Agent Framework(MAF)** 기반의  
5개 전문 에이전트가 협력하는 **Multi-Agent Orchestration 시스템**입니다.

```
사용자 조건 입력
        ↓
[Orchestrator] ← MAF 기반 조율
   ├─ [Rescue Data Agent]       ← 데이터 수집
   ├─ [Priority Analysis Agent] ← 긴급도 판단
   ├─ [Match Reasoning Agent]   ← 사용자 매칭
   ├─ [Message Generation Agent]← 문구 생성 + RAG
   └─ [Notification Agent]      ← Discord/메신저 알림
        ↓
   TOP 3 추천 + 문의 문구 + SNS 문구 + Discord 알림
```

---

## 2. 에이전트 상세 명세

### 2.1 Rescue Data Agent

**역할**: 공공 구조동물 데이터 수집 및 정규화

**Instructions**:
```
당신은 공공 구조동물 데이터를 수집하는 에이전트입니다.
농림축산식품부 유기동물 공공데이터 API를 호출하거나,
API 연결이 불가능한 경우 샘플 데이터 fallback을 사용합니다.
수집한 데이터는 표준 스키마로 정규화하여 반환합니다.
```

**Tools**:
```python
getRescueAnimals(region: str, species: str, page: int = 1) -> list[Animal]
getShelterInfo(shelter_id: str) -> Shelter
```

**Fallback 전략**:
```
1차: 공공데이터 API (농림축산식품부)
2차: 캐시된 최근 데이터
3차: sample_animals.json (데모용)
```

---

### 2.2 Priority Analysis Agent

**역할**: 구조동물별 우선 확인 필요도(priorityScore) 계산

**Instructions**:
```
당신은 구조동물 우선순위 분석 전문 에이전트입니다.
공고 종료일, 보호 상태, 특이사항, 이미지 유무를 분석하여
우선 확인이 필요한 동물을 선별합니다.
'안락사 예정', '곧 죽을 아이' 같은 단정 표현은 절대 사용하지 않습니다.
공고 마감이 가까운 아이를 '우선 확인 필요'로 표현합니다.
```

**Priority Score 알고리즘**:
```python
def calculate_priority_score(animal: dict) -> float:
    """
    priorityScore: 0~100, 높을수록 더 긴급
    """
    score = 0.0

    # 1. 공고 종료일 (최대 40점)
    days_left = (animal["noticeDeadline"] - today).days
    if days_left <= 0:   score += 40
    elif days_left <= 3: score += 35
    elif days_left <= 7: score += 25
    elif days_left <= 14: score += 15

    # 2. 특이사항 분석 (최대 30점) - LLM으로 판단
    keywords = ["질병", "부상", "치료중", "마름", "노령", "겁많음", "상처"]
    for kw in keywords:
        if kw in animal.get("specialNote", ""):
            score += 5
            break
    # LLM: 특이사항 심각도 0~20 추가 스코어

    # 3. 이미지 유무 (SNS 홍보 가능성)
    if animal.get("imageUrl"):
        score += 10

    # 4. 보호 상태
    if animal["status"] == "보호중":
        score += 20

    return min(score, 100)
```

**Tools**:
```python
analyzePriorityScore(animal: dict) -> float
extractCareKeywords(special_note: str) -> list[str]
```

---

### 2.3 Match Reasoning Agent

**역할**: 사용자 조건 vs 구조동물 매칭 점수(matchScore) 계산

**Instructions**:
```
당신은 사용자 조건과 구조동물을 매칭하는 에이전트입니다.
사용자의 지역, 동물 종류, 크기 선호, 임보/입양/홍보 가능 여부를
구조동물 정보와 비교하여 matchScore를 계산합니다.
완벽한 조건 일치보다 '도움을 줄 수 있는 가능성'을 우선합니다.
```

**사용자 조건 스키마**:
```json
{
  "region": "서울/경기",
  "species": "dog",
  "helpType": ["foster", "share"],
  "sizePreference": "small",
  "canCareSenior": true,
  "canCareMedical": false
}
```

**Match Score 알고리즘**:
```python
def calculate_match_score(animal: dict, user_pref: dict) -> float:
    score = 0.0

    # 지역 일치 (30점)
    if user_pref["region"] in animal["shelterRegion"]:
        score += 30

    # 동물 종류 일치 (25점)
    if user_pref["species"] == animal["species"]:
        score += 25

    # 크기/품종 선호 (20점)
    if matches_size_preference(animal, user_pref["sizePreference"]):
        score += 20

    # 도움 유형 매칭 (25점)
    if "foster" in user_pref["helpType"]:
        score += 15
    if "share" in user_pref["helpType"] and animal.get("imageUrl"):
        score += 10

    # 케어 가능 여부
    if is_senior(animal) and not user_pref["canCareSenior"]:
        score -= 20
    if needs_medical(animal) and not user_pref["canCareMedical"]:
        score -= 25

    return max(min(score, 100), 0)
```

---

### 2.4 Message Generation Agent

**역할**: 보호소 문의 문구, SNS 홍보 문구, Discord 알림 메시지 생성

**Instructions**:
```
당신은 구조동물 입양·임보 문구를 작성하는 에이전트입니다.
Azure AI Search RAG를 통해 안전 표현 정책과 입양 문의 가이드를 참조합니다.

[필수 안전 정책]
금지 표현: 안락사 예정, 곧 죽을 아이, 구조하지 않으면 사망, 이미 늦었습니다
권장 표현: 우선 확인 필요, 공고 마감 임박 가능성, 보호소에 직접 확인 필요

생성 항목:
1. 보호소 문의 문구 (정중하고 구체적으로)
2. 인스타그램 게시글 문구 (감성적, 100자 이내)
3. 스토리용 짧은 문구 (30자 이내)
4. Discord 알림 메시지
5. 해시태그 초안 (5개)
```

**RAG 연동 문서**:
```
docs/safety-wording-policy.md    ← 안전 표현 정책
docs/adoption-inquiry-guide.md   ← 보호소 문의 가이드
docs/animal-welfare-guide.md     ← 동물복지 표현 가이드
docs/public-api-field-guide.md   ← 공공데이터 필드 해설
```

**Tools**:
```python
searchRAGDocuments(query: str) -> list[Document]  # Azure AI Search
generateShelterInquiry(animal: dict, user_pref: dict) -> str
generateSNSPost(animal: dict, style: str) -> str
generateDiscordMessage(recommendations: list) -> str
```

**출력 예시**:
```text
📋 보호소 문의 문구:
안녕하세요. 공고번호 [번호] 아이와 관련해 문의드립니다.
현재 보호 상태와 임시보호 가능 여부를 확인하고 싶습니다.
가능하시면 연락 부탁드립니다. 감사합니다.

📸 인스타그램 게시글:
오늘 먼저 확인이 필요한 구조신호입니다 🐾
경기 성남에서 기다리고 있는 초코를 소개합니다.
관심 있으신 분은 보호소에 직접 문의해주세요.

🔔 Discord 알림:
🐾 오늘의 구조신호 | TOP 3 우선 확인 동물이 도착했어요!
```

---

### 2.5 Notification Agent

**역할**: Discord Webhook 또는 MCP Notification Tool로 알림 발송

**Instructions**:
```
당신은 구조신호 알림을 외부 채널로 전송하는 에이전트입니다.
Message Generation Agent가 생성한 메시지를
Discord Webhook 또는 MCP-ready notification tool로 전송합니다.
전송 실패 시 3회 재시도 후 오류를 기록합니다.
```

**MCP-ready Tools**:
```python
sendRescueSignalNotification(
    channel: str,           # "discord" | "teams" | "slack"
    message: str,
    attachments: list = []
) -> NotificationResult

# MVP: Discord Webhook 구현
# v2: Teams, Slack, KakaoTalk, Email 확장
```

**Discord Webhook 메시지 형식**:
```python
discord_payload = {
    "username": "🐾 구조신호 에이전트",
    "embeds": [
        {
            "title": "오늘의 구조신호 TOP 3",
            "description": "우선 확인이 필요한 아이들을 찾았어요.",
            "color": 0xFF6B6B,
            "fields": [
                {
                    "name": f"1. {animal['name']} ({animal['breed']})",
                    "value": f"📍 {animal['region']} | ⏰ D-{days_left}일\n{reason}",
                    "inline": False
                }
            ],
            "footer": {"text": "보호소에 직접 확인 후 입양/임보 결정해주세요."}
        }
    ]
}
```

---

## 3. 오케스트레이션 흐름

```python
# MAF Orchestrator 기반 파이프라인
async def rescue_signal_pipeline(user_input: UserCondition) -> RescueResult:

    # Step 1: 데이터 수집
    animals = await rescue_data_agent.run(
        region=user_input.region,
        species=user_input.species
    )

    # Step 2: 우선순위 계산 (병렬 처리)
    priority_scores = await asyncio.gather(*[
        priority_agent.score(animal) for animal in animals
    ])

    # Step 3: 매칭 점수 계산 (병렬 처리)
    match_scores = await asyncio.gather(*[
        match_agent.score(animal, user_input) for animal in animals
    ])

    # Step 4: TOP 3 선정
    ranked = sorted(
        zip(animals, priority_scores, match_scores),
        key=lambda x: x[1] * 0.6 + x[2] * 0.4,  # 가중 합산
        reverse=True
    )[:3]

    # Step 5: 문구 생성 (병렬)
    messages = await asyncio.gather(*[
        message_agent.generate(animal, user_input) for animal, _, _ in ranked
    ])

    # Step 6: Discord 알림 발송
    await notification_agent.send(
        channel="discord",
        recommendations=list(zip(ranked, messages))
    )

    return RescueResult(recommendations=ranked, messages=messages)
```

---

## 4. GitHub Copilot 활용 내역

| 작업 | Copilot 활용 |
|------|-------------|
| 에이전트 기본 구조 | Copilot Chat: "MAF 기반 멀티 에이전트 파이프라인 생성" |
| 스코어링 함수 | Copilot Inline: 알고리즘 자동완성 |
| Discord Webhook | Copilot Chat: "Discord embed 메시지 Python 구현" |
| 공공데이터 파싱 | Copilot Fix: API 응답 필드 매핑 |
| 테스트 코드 | Copilot Chat: "priority_score 함수 pytest 테스트" |
| 에러 핸들링 | Copilot Inline: try/except 자동완성 |

---

## 5. 재사용 가능한 에이전트 패턴 (보너스 포인트)

이 프로젝트의 에이전트 패턴은 유기동물 외 다양한 공공데이터 알림 서비스에 재사용 가능합니다:

```
공공데이터 수집 → 우선순위 판단 → 사용자 매칭 → 문구 생성 → 알림 발송
```

**적용 가능 도메인**:
- 청년주택/공공임대 공고 알림
- 취업/채용공고 매칭 알림
- 재난/안전 정보 우선순위 알림
- 문화행사/복지 혜택 알림

→ **공공데이터 기반 개인화 알림 에이전트 템플릿**으로 오픈소스화 예정

---

*이 문서는 Rescue Signal Agent의 에이전트 설계 및 오케스트레이션 명세를 정의합니다.*
