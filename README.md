# 🐾 Rescue Signal Agent

> **유기동물 구조신호 에이전트** — 흩어진 데이터를 연결해, 단 하루의 차이가 생사를 가르는 순간을 놓치지 않습니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built with GitHub Copilot](https://img.shields.io/badge/Built%20with-GitHub%20Copilot-blue)](https://github.com/features/copilot)
[![Microsoft Agent Framework](https://img.shields.io/badge/MAF-Multi--Agent-purple)](https://learn.microsoft.com/azure/ai-services/agents/)

---

## 📌 Problem

매년 **10만 마리 이상**의 유기동물이 전국 보호소에 입소합니다.  
하지만 공공데이터(농림축산식품부 API), SNS, 보호소 자체 공지가 **모두 분산**되어 있어  
입양·임보가 가장 급한 동물들이 **가시성 없이 안락사 위기**에 처합니다.

## 💡 Solution

**Rescue Signal Agent**는 GitHub Copilot + Microsoft Agent Framework(MAF) 기반  
**Multi-Agent 오케스트레이션 시스템**으로:

1. 🔍 **Rescue Data Agent** — 공공데이터 API 수집 + sample data fallback
2. 🧠 **Priority Analysis Agent** — 공고 마감일·특이사항 기반 우선 확인 필요도 판단
3. 🎯 **Match Reasoning Agent** — 사용자 조건(지역·종류·임보가능) 매칭 스코어링
4. ✍️ **Message Generation Agent** — 문의 문구·SNS 문구·Discord 알림 생성 (RAG grounding)
5. 🔔 **Notification Agent** — Discord Webhook / MCP-ready 알림 발송

```
[Web UI]
사용자 조건 입력
        ↓
[Rescue Signal Agent — MAF Orchestrator]
        ├─ 공공데이터 API or sample fallback
        ├─ Azure AI Search RAG (안전 표현 정책)
        └─ priorityScore × matchScore → TOP 3
        ↓
[Notification Tool — MCP-ready]
Discord 알림 전송
        ↓
[Output]
TOP 3 추천 + 추천 이유 + 보호소 문의 문구 + SNS 공유 문구
```

## 🚀 Quick Start

```bash
# 레포 클론
git clone https://github.com/lifeiscabaret/rescue-signal-agent.git
cd rescue-signal-agent

# 환경 설정
cp .env.example .env
# .env에 공공데이터 API 키, Azure 연결 정보 입력

# 의존성 설치
pip install -r requirements.txt

# 에이전트 실행
python main.py
```

## 📁 프로젝트 구조

```
rescue-signal-agent/
├── agents/                  # 각 에이전트 모듈
│   ├── collector_agent.py   # 데이터 수집
│   ├── priority_agent.py    # 우선순위 스코어링
│   ├── notifier_agent.py    # 알림 발송
│   └── reporter_agent.py    # 리포트 생성
├── data/                    # 데이터 모델 & 스키마
├── prompts/                 # Copilot 프롬프트 템플릿
├── tests/                   # 테스트 코드
├── AGENTS.md                # 에이전트 설계 명세
├── IDEATION.md              # 문제 정의 & 아이디어
├── PRD.md                   # 제품 요구사항 정의서
├── TRD.md                   # 기술 요구사항 정의서
└── PRESENTATION.md          # 발표 가이드
```

## 👥 팀 구성

| 역할 | 담당 |
|------|------|
| 기획 & 문서화 | 경윤 |
| 데이터 & 백엔드 구현 | 지현 |
| 배포 & 인프라 | 경윤 |
| AI Agent 설계 | GitHub Copilot + GPT |

## 📋 문서

- [IDEATION.md](IDEATION.md) — 문제 정의 & 아이디어 발굴
- [PRD.md](PRD.md) — 제품 요구사항 정의서
- [TRD.md](TRD.md) — 기술 아키텍처 & 구현 명세
- [AGENTS.md](AGENTS.md) — 에이전트 설계 & 오케스트레이션
- [PRESENTATION.md](PRESENTATION.md) — 발표 스크립트 & 데모 가이드

---

*Built at GitHub Copilot & Microsoft Agent Framework Hackathon 2026*
