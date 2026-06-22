# 🐾 Rescue Signal Agent

> **Rescue Signal Agent** — connecting scattered shelter data so the one-day difference between life and death is never missed.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Azure OpenAI](https://img.shields.io/badge/Azure_AI-Foundry-0078D4?logo=microsoftazure)](https://azure.microsoft.com/products/ai-services/openai-service)

---

## 📌 Problem

Every year **more than 100,000 abandoned animals** enter shelters across Korea.
But the data that could save them — the **government public API** (Ministry of Agriculture, Food and Rural Affairs), SNS posts, and individual shelter notices — is **completely fragmented**.
As a result, the animals most urgently in need of adoption or fostering reach the end of their notice period **without anyone seeing them**.

## 💡 Solution

**Rescue Signal Agent** is a web app that runs an **agent-style pipeline** over public rescue-animal data.
Given a user's conditions (region, species, size, how they can help), it:

1. 🔍 **Collects** rescue-animal records from the public API (with a sample-data fallback)
2. 🧠 **Scores priority** — how urgently each animal needs attention (notice deadline, protection status, special notes, image availability)
3. 🎯 **Scores match** — how well each animal fits the user's conditions
4. ✍️ **Generates messages** — a shelter inquiry, an SNS share post, and a Discord notification, all under strict safety-wording rules
5. ✨ **Polishes** the messages with **Azure AI Foundry (Azure OpenAI)** — with a graceful local fallback
6. 🔔 **Notifies** — sends the result to **Discord** via webhook, plus a scheduled-alert demo

The result: **TOP 3 rescue signals** with transparent scoring, ready-to-send messages, and one-click Discord alerts.

```
[Web UI] — user sets conditions (region / species / size / help type)
        ↓
[GET /api/rescue-animals]   ── public data.go.kr API  →  fallback: sample data
        ↓
[lib/scoring.ts]            ── priorityScore (0–100) + matchScore (0–100)
                               totalScore = priority × 0.5 + match × 0.5  →  TOP 3
        ↓
[lib/messages.ts]           ── shelter inquiry · SNS post · Discord message (safe wording)
        ↓
[POST /api/messages/polish] ── Azure AI Foundry refinement  →  fallback: local copy
        ↓
[POST /api/notifications/discord] ── Discord webhook  +  scheduled-alert demo
        ↓
[Output] TOP 3 + reasoning + shelter inquiry + SNS copy + Discord alert
```

> ⚠️ **Safety first.** The app never claims an animal is scheduled for euthanasia. It uses neutral wording such as *"needs to be checked first"* and *"the notice period may be closing soon"*, and always tells users to confirm the latest status directly with the shelter.

---

## 🧩 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| UI | React 19, Tailwind CSS v4, lucide-react |
| Language | TypeScript 5 |
| Data source | data.go.kr public rescue-animal API (`abandonmentPublicService_v2`) |
| AI | Azure AI Foundry / Azure OpenAI (message polishing) |
| Notifications | Discord Webhook |
| Hosting | Azure App Service (deploy via standalone bundle) |

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.local.example .env.local
# fill in the values listed in the table below

# 3. Run the dev server (http://localhost:3002)
npm run dev

# 4. Build & start for production
npm run build
npm run start
```

> The app runs on **port 3002**. With no environment variables set, it still works fully on **sample data** and **locally generated messages** — perfect for a quick demo.

### Environment variables

| Variable | Required | Purpose | Fallback if missing |
|----------|:--------:|---------|---------------------|
| `PUBLIC_ANIMAL_API_KEY` | optional | data.go.kr service key (URL-encoded) | sample data |
| `AZURE_OPENAI_ENDPOINT` | optional | Azure OpenAI endpoint | local message generation |
| `AZURE_OPENAI_API_KEY` | optional | Azure OpenAI API key | local message generation |
| `AZURE_OPENAI_DEPLOYMENT` | optional | Azure OpenAI deployment name | local message generation |
| `AZURE_OPENAI_API_VERSION` | optional | API version (default `2024-12-01-preview`) | — |
| `DISCORD_WEBHOOK_URL` | optional | Discord webhook for notifications | send button returns 503 |

Every external dependency degrades gracefully — the app is always demoable.

---

## 📁 Project Structure

```
rescue-signal-agent/
├── src/
│   ├── app/
│   │   ├── page.tsx                         # UI + client-side agent pipeline orchestration
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── rescue-animals/route.ts      # public API collection + sample fallback
│   │       ├── messages/polish/route.ts     # Azure Foundry message polishing + fallback
│   │       └── notifications/discord/route.ts  # Discord webhook delivery
│   ├── lib/
│   │   ├── scoring.ts                        # priorityScore + matchScore + TOP-N ranking
│   │   └── messages.ts                       # safe-wording message generation
│   ├── data/
│   │   └── sample-rescue-animals.ts          # 30 demo animals across 7 regions
│   └── types/
│       └── rescue-animal.ts                  # shared domain types
├── AGENTS.md          # agent design & orchestration spec
├── IDEATION.md        # problem definition & ideation
├── PRD.md             # product requirements
├── TRD.md             # technical requirements & architecture
└── PRESENTATION.md    # demo script & presentation guide
```

---

## 🧠 How the Scoring Works

**Priority Score (0–100)** — *how urgently this animal needs attention*
- Notice deadline approaching (up to 40 pts)
- Currently under protection (15 pts)
- Care-need signals in special notes — injury, senior, illness, etc. (up to 25 pts)
- Has a photo, so it's easy to share on SNS (10 pts)
- Located in the user's preferred region (10 pts)

**Match Score (0–100)** — *how well this animal fits the user*
- Species match (25 pts) · Region match (25 pts) · Size preference (15 pts)
- Can foster (15 pts) · Can share on SNS (10 pts)
- Can care for senior / medical cases (5 pts each)

**Total** = `priorityScore × 0.5 + matchScore × 0.5` → top 3 are shown, each with a transparent breakdown of *why* it ranked where it did.

---

## 👥 Team

| Member | Responsibilities |
|--------|-----------------|
| **지현** (me) | Ideation · Planning · Agent design · UI · Data secondary filtering · Deployment |
| **경윤** | Instruction/guideline design · Data collection · Data primary filtering |

---

## 📋 Documents

- [IDEATION.md](IDEATION.md) — problem definition & ideation
- [PRD.md](PRD.md) — product requirements
- [TRD.md](TRD.md) — technical architecture & implementation spec
- [AGENTS.md](AGENTS.md) — agent design & orchestration
- [PRESENTATION.md](PRESENTATION.md) — presentation script & demo guide

---

*Built at the GitHub Copilot & Microsoft Agent Framework Hackathon 2026.*
*Public data source: Ministry of Agriculture, Food and Rural Affairs — Animal Protection Management System (data.go.kr).*
</content>
</invoke>
