# Incident Response Agent

An AI-powered incident response system that uses **Hindsight biomimetic memory** and **Groq LLM** to analyze production incidents, detect recurring root cause patterns, and suggest resolution steps based on your organization's own historical incident data.

## What It Does

When a new production incident arrives, the agent:
1. **Queries Hindsight memory** for past incidents with similar error signatures and affected services.
2. **Detects patterns** — if 2 or more past incidents share the same root cause, it flags this explicitly (e.g. *"This looks like the 5th occurrence of database connection pool exhaustion."*).
3. **Invokes Groq LLM** (`openai/gpt-oss-120b`) with the recalled incidents as context, producing a structured diagnosis, recommended resolution steps, and an estimated MTTR.
4. **Retains the new incident** back into Hindsight memory, growing the knowledge base with every analysis.
5. Serves all of this through a **dark-themed engineering dashboard** with real-time results, pattern banners, and a full incident history table.

## How Hindsight Memory Is Used

Hindsight is a biomimetic memory system that extracts structured facts from natural-language content using LLMs. In this project, each incident is retained as a document: Hindsight decomposes it into knowledge graph nodes covering root cause entities, service relationships, and resolution facts. When a new incident arrives, `recallSimilar()` issues a semantic + keyword + graph recall query against the `incident-response-agent` memory bank, returning the most contextually relevant past incidents. This is fundamentally different from a simple vector search — Hindsight synthesizes multi-hop relationships, enabling pattern detection across services that share the same underlying root cause even if their error logs look different on the surface.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js |
| API Framework | Express.js |
| LLM Provider | Groq (`openai/gpt-oss-120b`) |
| Memory System | Hindsight by Vectorize |
| HTTP Client | Axios |
| Frontend | Vanilla JS + CSS (no framework) |
| Config | dotenv |

## Project Structure

```
incident-response-agent/
├── src/
│   ├── server.js        # Express app entry point
│   ├── routes.js        # API routes (POST /api/incident, GET /api/incidents)
│   ├── agent.js         # Core agent: recall → LLM → pattern detection → retain
│   └── memory.js        # Hindsight API integration (retainIncident, recallSimilar)
├── public/
│   ├── index.html       # Dashboard UI
│   ├── style.css        # Dark engineering theme
│   └── app.js           # Frontend: form, fetch calls, result rendering
├── data/
│   └── incidents.json   # 15 synthetic SaaS incidents (4 share a common root cause)
├── scripts/
│   ├── loadData.js      # Bulk-loads incidents.json into Hindsight memory
│   ├── demo.js          # Simulates two demo scenarios via API calls
│   └── diagnose.js      # Verifies all API keys and connections
├── .env.example         # Environment variable template
└── package.json
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
copy .env.example .env   # Windows
cp .env.example .env     # macOS/Linux
```

Edit `.env`:

```env
GROQ_API_KEY=gsk_...          # https://console.groq.com/keys
HINDSIGHT_API_KEY=hsk_...     # https://hindsight.vectorize.io
HINDSIGHT_API_URL=https://api.hindsight.vectorize.io
HINDSIGHT_BANK_ID=incident-response-agent
PORT=3000
```

> **Note:** The Hindsight bank `incident-response-agent` is created automatically when you first access the Hindsight dashboard. Ensure it exists before running `loadData.js`.

### 3. Load Incident History into Hindsight Memory

```bash
node scripts/loadData.js
```

This ingests all 15 synthetic incidents into Hindsight. Each incident is processed by the LLM for fact extraction, producing ~66 structured memory entries across the knowledge graph.

### 4. Start the Server

```bash
npm start
```

Open **http://localhost:3000** in your browser.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/incident` | Analyze a new incident |
| `GET` | `/api/incidents` | List all past incidents |

### POST /api/incident

**Request:**
```json
{
  "serviceAffected": "payments-api",
  "errorLog": "TimeoutAcquiringConnectionError: pool size 20 active 20 waiting 142",
  "severity": "P1"
}
```

**Response:**
```json
{
  "incidentId": "INC-1234567890",
  "diagnosis": "### Incident Assessment...",
  "suggestedFix": "PATTERN ALERT: This looks like the 5th occurrence of...",
  "similarIncidents": 7,
  "patternDetected": "This looks like the 5th occurrence of database connection pool exhaustion.",
  "recalledIncidentDetails": [
    {
      "incidentId": "INC-2026-001",
      "serviceAffected": "payments-api",
      "rootCause": "database connection pool exhaustion",
      "date": "2026-01-14T08:23:11Z",
      "timeToResolveMinutes": 45,
      "resolutionSteps": ["Increased PostgreSQL max_connections...", "..."]
    }
  ]
}
```

## Demo Scenarios

Run the two-scenario demo simulation:

```bash
node scripts/demo.js
```

- **Scenario 1**: Brand-new unseen error → generic diagnosis
- **Scenario 2**: Connection pool exhaustion → immediate pattern detection + known fix

## Diagnostics

Verify all API keys and connections:

```bash
node scripts/diagnose.js
```
