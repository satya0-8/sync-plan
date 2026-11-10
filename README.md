# SyncPlan — Claude-Powered Client Onboarding & Mutual Action Plans (MAPs)

> **Submission for Founder's Office, Product & Growth at Volopay**  
> Built strictly under the assignment constraints: Zero AI keys inside the app, customer's Claude pays for and runs all intelligence via Model Context Protocol (MCP), app handles persistence, interactive editing, and keeps the live client portal running after the chat ends.

---

## 1. Executive Summary & Product Vision

### The Problem
In B2B SaaS (and especially fintech spend management like Volopay), **60%+ of customer churn happens during the first 60 days of onboarding**. Sales closes a deal, but implementation gets stuck in messy email chains, buried attachments, and static Google Sheets that customers never update. Existing Mutual Action Plan (MAP) software (e.g., Accord, Dock, Arrows) charges **$200–$500/month** and requires implementation leads to spend 2 hours manually clicking around to set up each plan.

### The Solution: SyncPlan
1. **Claude Does the Thinking**: The Account Exec / Implementation Lead pastes raw kickoff call notes, meeting transcripts, or handoff emails into their own Claude:  
   *"Here are the onboarding notes for Acme Corp. Target go-live is Dec 15. Create a 4-phase onboarding plan for NetSuite integration and issuing 150 corporate cards."*
2. **MCP Bridges Claude to SyncPlan**: Claude structures the messy input into phases, tasks, deadlines, and responsibilities (`client` vs. `vendor`), then calls the `create_action_plan` MCP tool.
3. **SyncPlan Does What Claude Can't**:
   - Generates a persistent, live, interactive client portal (`/plan/acme-corp-onboarding`).
   - Provides an internal dashboard for the team to edit dates, reassign tasks, and modify scope.
   - Serves the external customer with interactive checkboxes, real-time completion percentages, and live milestone tracking.
   - **Zero AI inside the app**: 100% deterministic Node.js + storage. Zero API keys. Zero token costs. 97%+ gross margins.

---

## 2. Technical Architecture & Zero-AI Guarantee

```
┌─────────────────────────────────┐
│     Customer's Own Claude       │  <-- Customer pays Anthropic subscription ($20/mo)
│  (Claude Desktop / Claude Web)  │      Does all NLP, reasoning, structuring & writing
└────────────────┬────────────────┘
                 │
                 │ Model Context Protocol (MCP) [JSON-RPC 2.0 / stdio / SSE]
                 ▼
┌─────────────────────────────────┐
│     SyncPlan MCP Server         │  <-- Translates Claude tool calls to REST endpoints
│     (mcp-server.js / /sse)      │      Zero LLM keys, zero inference costs
└────────────────┬────────────────┘
                 │
                 │ Local / Remote HTTP REST API
                 ▼
┌─────────────────────────────────┐
│     SyncPlan Core Platform      │  <-- Node.js + Atomic Storage Engine
│     (server.js)                 │      Zero-AI, deterministic CRUD, static serving
├────────────────┬────────────────┤
│ Admin Editor   │ Client Portal  │
│ (/admin)       │ (/plan/:slug)  │  <-- Publicly accessible to external client stakeholders
└────────────────┴────────────────┘
```

---

## 3. Quickstart & Local Setup

### Running the App Locally (Zero external dependencies)
```bash
cd syncplan
node server.js
```
Open your browser:
- **Admin Workspace & Editor**: `http://localhost:3000/admin`
- **Public Client Portal**: `http://localhost:3000/plan/fintech-corp-onboarding`

---

## 4. Connecting Claude Desktop via MCP

1. Open Claude Desktop's configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the `syncplan` MCP server entry:
```json
{
  "mcpServers": {
    "syncplan": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/syncplan/mcp-server.js"],
      "env": {
        "SYNCPLAN_API_URL": "http://localhost:3000"
      }
    }
  }
}
```
*(If deployed on the internet, replace `http://localhost:3000` with your live deployment URL, e.g. `https://syncplan-live.onrender.com`)*

3. Restart Claude Desktop. You will see a hammer icon indicating the `syncplan` tools are loaded:
   - `create_action_plan`
   - `list_active_plans`
   - `get_plan_details`
   - `add_task_to_milestone`

4. **Test Prompt in Claude**:
> "We just closed a new customer, Apex Logistics. They need to onboard 75 drivers for fuel cards and connect QuickBooks. Kickoff is next Monday and target go-live is Dec 20. Create a complete Mutual Action Plan."

Claude will immediately format the project, invoke `create_action_plan`, and output the live shareable URL!

---

## 5. 3-Minute Free Deployment to Render (Live on Internet)

1. Push this folder to a GitHub repository (e.g. `github.com/your-username/syncplan`).
2. Go to [Render.com](https://render.com) and click **New + > Web Service**.
3. Connect your GitHub repo.
4. Settings:
   - **Environment**: `Node`
   - **Build Command**: `echo "No build needed"`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
5. Click **Create Web Service**. Your app is live in ~90 seconds at `https://syncplan-xxxx.onrender.com`!

*(Alternative: You can also deploy instantly to Railway, Fly.io, or run via ngrok: `ngrok http 3000`)*

---

## 6. Business Model & Unit Economics (The Money)

| Metric | SyncPlan Math | Industry Benchmark (Accord / Dock) |
|---|---|---|
| **AI Ingestion / Token Cost** | **$0.00** (Customer brings own Claude) | $0.08–$0.25 per plan generation |
| **Hosting & Compute Cost** | **~$0.04 / customer / month** ($5/mo for 100+ active plans) | $15–$30 / customer |
| **Pricing** | **$29 / user / month** (Boutique) / **$79 / team / month** (5 seats) | $200–$500 / month |
| **Gross Margin** | **97.5%** | 65%–75% (burdened by OpenAI/Claude API bills) |

### Customer Acquisition & Trajectory:
- **First 100 Customers**: Target B2B SaaS founders & Customer Success leads on LinkedIn/Twitter by demonstrating "Kickoff Call Transcript to Live Client Portal in 30 Seconds". Post open-source MCP templates in the Anthropic MCP directory and GitHub showcase.
- **Year 1 Target**: 450 paying companies ($35k MRR / ~$420k ARR) at 97% gross margin.
- **Year 3 Target**: 2,800 companies ($220k MRR / ~$2.6M ARR) expanding into automated ERP webhooks, Slack Connect bots, and vendor spend verification.
