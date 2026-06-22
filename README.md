# Free LLM Gateway

**The AI-routed gateway for free LLM APIs — it reads your prompt and picks the right one out of 200+ free models.**

[![CI](https://github.com/malda231125/free-llm-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/malda231125/free-llm-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Language**: English | [한국어](README.ko.md)

Most free-tier aggregators rotate keys by *quota*. This gateway routes by **what your prompt actually needs**: a fast AI router (Gemini Flash-Lite) reads each request and dispatches it to the best free model — Groq for speed-critical short tasks, Gemini for translation and complex reasoning, NVIDIA for code. One OpenAI-compatible endpoint, seven free providers, per-key quota tracking (requests *and* tokens), automatic 429 cooldowns and fallback.

- 🧠 **Prompt-aware AI routing** — not round-robin; an LLM picks the right model per request, at the *model* level (e.g. reasoning → DeepSeek-R1, speed → Groq) across a live catalog of 200+ free models
- 🔌 **OpenAI-compatible** — point any OpenAI SDK at it, streaming included
- 🔑 **Key pooling** — stack multiple keys per provider, limits scale automatically
- 📊 **Persistent quota tracking** — SQLite audit log; request- and token-based limits survive restarts
- 🔍 **Terms transparency** — we read all 7 providers' ToS/privacy policies so you know [who trains on your free-tier data](#data-policy-at-a-glance-as-of-2026-06-12)

```bash
curl -X POST http://localhost:3000/v1/generate \
  -H 'content-type: application/json' \
  -d '{"prompt": "Translate hello into French"}'
```

```bash
# Pin a specific provider
curl -X POST http://localhost:3000/v1/generate \
  -H 'content-type: application/json' \
  -d '{"prompt": "Translate hello into French", "provider": "GROQ"}'
```

Example response:

```json
{
  "provider": "GOOGLE",
  "model": "gemini-2.5-flash",
  "text": "Bonjour",
  "usage": { "prompt_tokens": 12, "completion_tokens": 2 },
  "latencyMs": 820,
  "gatewayUsage": { "rpm": "1/10", "rpd": "1/1500" },
  "routing": {
    "mode": "auto",
    "recommended": "GOOGLE",
    "reason": "Translation benefits from the highest-quality general model.",
    "routerModel": "gemini-2.5-flash-lite",
    "fallbackUsed": false,
    "attempts": []
  }
}
```

## Supported Services & Free Limits

All of them issue API keys **without a credit card**. Limits below are approximate as of June 2026 — check each service's docs for the latest numbers.

| Provider (enum) | Service | Free limits (approx.) | Default model | Get a key |
|---|---|---|---|---|
| `GOOGLE` (also the router) | [Google AI Studio](https://aistudio.google.com) | Flash models: 1,500 req/day, 1M-token context, multimodal | `gemini-2.5-flash` | [Get key](https://aistudio.google.com/apikey) |
| `GROQ` | [Groq](https://groq.com) | Llama 70B at 30 req/min, 1,000 req/day, ultra-fast inference | `llama-3.3-70b-versatile` | [Get key](https://console.groq.com/keys) |
| `CEREBRAS` | [Cerebras](https://cloud.cerebras.ai) | 1M tokens/day, ~2,000 tokens/sec (fastest in the industry) | `gpt-oss-120b` | [Get key](https://cloud.cerebras.ai) |
| `MISTRAL` | [Mistral La Plateforme](https://mistral.ai) | 1B tokens/month (but 2 req/min — best for batch) | `mistral-small-latest` | [Get key](https://console.mistral.ai/api-keys) |
| `NVIDIA` | [NVIDIA Build (NIM)](https://build.nvidia.com) | 1,000 credits on signup (up to 5,000 on request), 40 req/min, many large open models | `meta/llama-3.3-70b-instruct` | [Get key](https://build.nvidia.com) |
| `OPENROUTER` | [OpenRouter](https://openrouter.ai) | `:free` models 50 req/day (1,000/day with $10+ balance) | `google/gemma-4-26b-a4b-it:free` | [Get key](https://openrouter.ai/settings/keys) |
| `GITHUB` | [GitHub Models](https://github.com/marketplace/models) | 100+ models incl. GPT-4o-mini with just a GitHub account (per-tier daily limits) | `openai/gpt-4o-mini` | [Create PAT](https://github.com/settings/tokens) |

### Which one should I pick?

- **Quality / general purpose**: `GOOGLE` — the strongest frontier model available for free, with generous limits
- **Raw speed**: `GROQ` or `CEREBRAS` — open models served on custom hardware at extreme speed
- **Large batch jobs**: `MISTRAL` — 1B tokens/month, but capped at 2 req/min
- **Experimenting with big open models**: `NVIDIA` — even DeepSeek-R1 671B-class models on free credits
- **Zero signup friction**: `GITHUB` — reuse the GitHub token you already have

## Getting Started

```bash
npm install
cp .env.example .env   # fill in keys only for the providers you use
npm run build
npm start              # http://localhost:3000
```

Swagger UI: `http://localhost:3000/docs`

See `.env.example` for environment variables. **You only need keys for the providers you actually use.**
Calling a provider without a key returns 503 with a signup URL.

Local runs load `.env` automatically. Deployment environment variables still take precedence
when set by your platform (Render, Cloud Run, etc.).

### Docker

```bash
cp .env.example .env   # fill in your keys
docker compose up -d   # http://localhost:3000
```

Usage data persists in `./data` via the compose volume. Or build manually: `docker build -t free-ai-gateway . && docker run -p 3000:3000 --env-file .env free-ai-gateway`.

## Free Deployment Options

Tested free ways to host this gateway (as of June 2026):

| Where | Cost | Sleep / cold start | Usage DB persists? | Notes |
|---|---|---|---|---|
| **Your own server + [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** | $0 | Never sleeps | ✅ | Best overall: `docker compose up -d`, free HTTPS domain, server IP stays hidden |
| **[Render](https://render.com)** (free) | $0 | Sleeps after 15 min, 30–60s wake | ❌ (resets on deploy) | Easiest: connect repo, no card. This repo runs on it |
| **[Google Cloud Run](https://cloud.google.com/run)** | $0 within free tier | Scale-to-zero, 1–3s wake | ❌ | 2M req/month free; needs a card and the Dockerfile (already included) |
| **[Hugging Face Spaces](https://huggingface.co/spaces)** (Docker) | $0 | Sleeps after 48h idle | ❌ (persistent storage is paid) | Surprisingly beefy free tier: 2 vCPU / 16GB RAM / 50GB disk |
| **[Oracle Cloud Always Free](https://www.oracle.com/cloud/free/)** | $0 | Never sleeps | ✅ | ARM 4-core/24GB VM forever-free; signup is picky, you manage the VM |

Avoid for free use: **Fly.io** (free tier discontinued — new accounts get a 2-hour trial) and **Railway** (one-time $5 credit, then paid).

A good combo: Render for a public demo URL + your own server (via Tunnel) for real always-on usage.

## OpenAI-Compatible Endpoint (drop-in)

`POST /v1/chat/completions` speaks the standard OpenAI protocol — multi-turn `messages`, `temperature`, `stream`, etc. Point any OpenAI SDK at the gateway and it just works:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-gateway.example.com/v1",
    api_key="YOUR_GATEWAY_API_KEY",  # sent as Bearer; x-api-key also accepted
)

resp = client.chat.completions.create(
    model="auto",  # "auto" = AI routing | "GROQ" = provider default | "GROQ/llama-3.3-70b-versatile" = exact model
    messages=[{"role": "user", "content": "Translate hello into French"}],
)
print(resp.choices[0].message.content)
```

- `model: "auto"` (or omitted) → the AI router picks the best provider for the prompt
- `model: "GROQ"` → that provider's default model; `model: "PROVIDER/model-id"` → exact model
- `stream: true` → SSE passthrough from the upstream provider (works with auto routing too)
- Responses are standard OpenAI format with an extra `gateway` field (provider used, routing reason, fallback attempts) that OpenAI clients safely ignore

## API

### `POST /v1/generate`

| Field | Required | Description |
|---|---|---|
| `prompt` | Yes | The prompt to send to the model |
| `provider` | No | `GOOGLE` `GROQ` `CEREBRAS` `MISTRAL` `NVIDIA` `OPENROUTER` `GITHUB` (AI auto-routing when omitted) |
| `model` | No | Model ID to use instead of the provider default |

### `POST /v1/embeddings`

OpenAI-compatible embeddings across free providers (GOOGLE `gemini-embedding-001`, MISTRAL `mistral-embed`, NVIDIA, GITHUB). Same `model` semantics: `"auto"`, `"MISTRAL"`, or `"PROVIDER/model-id"`. Counted in quota tracking.

### `GET /v1/models`

Live catalog of every free model across all configured providers (~200+, cached 10 min). Use any entry as `"PROVIDER/model-id"` in `model`.

### `GET /v1/providers`

Returns per-provider key counts, gateway limits, and current usage.

### `GET /v1/usage`

Last-24h per-provider stats (calls, tokens, avg latency) and the 20 most recent audit-log entries.

### `GET /health`

Health check (always public).

## AI Smart Routing (when no provider is specified)

1. **Candidate selection** — only providers with a configured API key and remaining gateway quota become candidates.
2. **AI recommendation** — a fast model (`gemini-2.5-flash-lite`) receives highlighted models from the live catalog (DeepSeek, Qwen3-coder, Llama 4, GPT-4.1, …) plus your prompt, and returns the best-fit `PROVIDER/model` as JSON. Invalid picks fall back to the provider default. If Google is rate-limited, Groq takes over as the backup router.
3. **Call + fallback** — the recommended provider is called; on failure (upstream congestion, etc.) the remaining candidates are tried in static priority order.
4. **Safety net** — if the router call fails or Google quota is exhausted, AI recommendation is skipped and the static priority order applies (GOOGLE → GROQ → CEREBRAS → NVIDIA → GITHUB → OPENROUTER → MISTRAL).
5. The `routing` block in the response transparently reports the recommended model, reason, and fallback history.

Specifying `provider` bypasses routing and calls that provider directly (`routing.mode: "manual"`).

## Built-in Quota Management & Persistence

The gateway **counts requests per minute/day AND tokens per day for every provider × key** (token caps apply where the provider's real limit is token-based: Groq, Cerebras, Mistral), blocking with a 429 (including a retry-after hint) before you blow through a free quota. Every call is recorded in a **SQLite audit log** (provider, key, model, status, latency, tokens), and the counters are computed from those records — so **usage survives restarts and sleep/wake cycles**. If SQLite is unavailable it falls back to in-memory tracking. Data lives in `./data/usage.db` (override with `GATEWAY_DATA_DIR`). Adjust the limits in [`src/generate/providers.config.ts`](src/generate/providers.config.ts).

Check usage anytime via `GET /v1/usage` — per-provider calls/tokens/avg latency for the last 24h plus the 20 most recent calls.

## Key Pooling (multiply your free quota)

Register **multiple keys per provider** as a comma-separated list:

```bash
GROQ_API_KEY="gsk_key1,gsk_key2,gsk_key3"
```

- Limits scale with the pool: 3 Groq keys → 90 req/min, 3,000 req/day at the gateway level
- Each key's usage is tracked separately; the gateway picks a key with remaining headroom (round-robin)
- When an upstream returns 429, **only that key is put on cooldown** (respecting `retry-after`) and the next key takes over immediately

## Auth (optional, enabled via environment variables)

- `DOCS_USER` / `DOCS_PASSWORD` — protects `/docs`, `/docs-json`, `/docs-yaml` with HTTP Basic Auth.
- `GATEWAY_API_KEY` — requires an `x-api-key` header on all `/v1/*` calls (timing-safe comparison). `/health` stays public. Use the Authorize button in Swagger to set the key.
- When unset (e.g. local development), everything stays open.

## Frontend (chat UI)

A minimal Next.js chat UI lives in [`frontend/`](frontend/) — login gate, multi-session chat history (PostgreSQL + Prisma), streaming, markdown/code highlighting, image input (vision), two-stage model picker, side-by-side model comparison (⚖️), and per-answer routing badges. Deployed separately (e.g. Vercel) with the gateway URL/API key as server-side env vars.

## How It Works

All seven services expose OpenAI-compatible `chat/completions` endpoints, so a single adapter covers them all. Only the base URL, key, and default model differ per provider.

## Google Terms & Policy Summary (router/default provider)

Key takeaways from the three documents that apply when using `GOOGLE` (**analyzed: 2026-06-12**).
These summaries are for reference only — always check the original documents.

### 1) Gemini API Additional Terms of Service

Source: [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) (published revision of 2025-04-03)

- **The free tier trains on your data.** Prompts and responses submitted to unpaid services are used to improve Google products (including model training), and human reviewers may read and process your inputs/outputs. **Do not submit sensitive, confidential, or personal information to the free tier.** If you route business data through this gateway, use a paid-tier key.
- **The paid tier does not train on your data.** Prompts/responses are not used for product improvement and are retained only briefly for abuse detection and legal compliance.
- **Age/region restrictions**: 18+ only; cannot be used in services aimed at minors. EEA/UK/Switzerland users cannot use the free tier (paid services only), but get paid-level data protection even on free offerings.
- **Prohibited**: building competing models, reverse engineering or replicating the models/data, bypassing safety measures; the Prohibited Use Policy applies.
- **Professional-domain restrictions**: no use as a substitute for medical (clinical advice), mental health, legal, or financial professionals; no use under medical-device regulatory oversight.
- **Output rights**: Google claims no ownership of outputs, but reserves the right to generate identical/similar content for other users. You are responsible for how outputs are used and shared; attribution duties may apply by law.
- **Misc**: Google Search grounding results cannot be cached/copied/used for training (separate conditions incl. 30-day prompt retention); prices can change 30 days after posting. Via Vertex AI (GCP), the GCP terms apply instead.

### 2) Google Cloud Starter Tier Additional Terms of Service

Source: [Starter Tier Additional Terms](https://cloud.google.com/terms/starter-tier-additional-terms-of-service) (last modified 2026-05-11)

- **It is not GCP.** Starter Tier offerings are not Google Cloud Platform services — they're governed by the general Google ToS plus these additional terms, and aren't managed by any organization's GCP contract.
- **Data handling is more conservative than free AI Studio.** Submitted content and generated responses ("Your Content") are processed under the DPA (Data Processing Addendum). Operational data (account, billing, usage) falls under the Privacy Policy.
- **Eligibility**: 18+ and **business purposes only** (trade/business/craft/professional). Consumer use is out of scope.
- **Prohibited**: high-risk activities (life/safety), AUP violations, quota circumvention, crypto mining, PSTN telephony services, ITAR materials, export-control violations, HIPAA health data without a BAA, copying/modifying/derivative works of the offerings.
- **Agentic AI responsibility**: you are solely responsible for configuring, authorizing, and supervising AI agents — and for everything they do or fail to do.
- **Operational risk**: Google can discontinue or change Starter Tier with 30 days' notice, and suspend immediately for security reasons. Platforms hosting third-party content must publish prohibited-content policies and run a notice channel.

### 3) Google Privacy Policy

Source: [Google Privacy Policy](https://policies.google.com/privacy) (effective 2026-05-26)

- **Collected**: account info, created/uploaded content, device info (unique IDs/browser/OS), activity (search terms, watch history, purchases, location via GPS/IP, call/message logs). Essentially all service usage.
- **Purposes**: six categories — provide/maintain/improve services, develop new ones, personalization, measurement, safety/abuse prevention.
- **User controls**: My Activity browsing/deletion, auto-delete periods, Google Takeout export, ad settings, Privacy Checkup; per-service and full-account deletion.
- **Third-party sharing**: consent-based in principle; exceptions for legal requests, domain admins (Workspace), and processors. **Explicitly states it does not sell personally identifying info (name/email) to advertisers.**
- **Retention**: varies by data type — user-deletable / auto-deleted or anonymized after set periods / kept until account deletion / longer for security & legal purposes.
- **Korea residents**: a separate supplemental notice exists ([link](https://policies.google.com/privacy/additional)).
- **Developer view**: this is a general policy; for Gemini API data handling, document 1) above is the operative text.

## NVIDIA Terms & Policy Summary (`NVIDIA` provider)

Key takeaways from the two documents that apply when signing up for `NVIDIA` (build.nvidia.com) (**analyzed: 2026-06-12**).

### 1) NVIDIA Account Terms of Use

Source: [NVIDIA Account Terms](https://www.nvidia.com/en-us/about-nvidia/nv-accounts/) (last updated 2019-03-26)

- **Accounts are provided "as is"**: no warranty of availability, security, or freedom from errors; NVIDIA may revoke account access at any time for any reason. No guarantee of data preservation or copies upon loss — **back up anything important yourself**.
- **Liability capped at USD $100** total for any damages.
- **Feedback assignment**: all rights to opinions/ideas/suggestions ("Feedback") sent to NVIDIA are assigned to NVIDIA, and you waive claims even if similar ideas get used. Don't send core technical ideas through feedback channels.
- **Prohibited**: unauthorized access, unlawful use, selling/renting/transferring/commercial use of accounts without prior written approval.
- **Disputes**: Delaware law, binding JAMS arbitration in Santa Clara County, CA ($250 filing fee) — arbitration instead of court by default.
- **Changes**: NVIDIA may change the terms at its sole discretion; account services may carry extra terms and fees.
- Note: this is the generic account ToS; NIM API usage (build.nvidia.com) may be subject to additional service evaluation terms.

### 2) NVIDIA Privacy Policy

Source: [NVIDIA Privacy Policy](https://www.nvidia.com/en-us/about-nvidia/privacy-policy/) (effective 2025-09-22)

- **Collected**: account info (name/email/birth date/IP/login activity), web visit data (incl. mouse movements), software/hardware/network configuration, error/crash data, chatbot messages. Also explicit lead-generation collection of personal data from public sources.
- **Whether API prompts are used for training is not stated in this document.** AV/AI research data (vehicle surroundings footage, etc.) is scoped to those projects, but NIM API input handling requires checking separate service terms.
- **Sale/sharing**: states it does not use/sell/share "sensitive personal information" (as defined by California law). However, hashed name/email/job-title data is shared with ad companies (e.g. Google) and lead-enrichment vendors (e.g. 6Sense).
- **Retention**: kept while the relationship is active; deleted after 5+ years of inactivity.
- **Rights**: access/correct/delete/opt out via the NVIDIA Privacy Center or privacy@nvidia.com, with non-discrimination.
- **Transfers**: data goes to the US (SCCs, EU-US DPF); possible disclosure to US law enforcement. No Korea-specific provisions.
- **Age**: not aimed at children under 13; interest-based ads restricted under 16.

## OpenRouter Terms & Policy Summary (`OPENROUTER` provider)

Key takeaways from three documents (**analyzed: 2026-06-12**).

### 1) Terms of Service

Source: [OpenRouter Terms](https://openrouter.ai/terms) (last updated 2026-05-06)

- **Whether prompts get used for training depends on the downstream model provider.** OpenRouter says it opts out of training where possible, but some models may store/train on inputs under their own Model Terms — and reviewing those terms is your responsibility.
- **Opting into prompt logging grants broad rights**: a license to host/reproduce/modify your content, including **selling it in anonymized form**. Think twice before enabling logging. (Separately, inputs are categorized in anonymized form for metrics and not stored after categorization.)
- **Credits**: $5–$25,000 per transaction; refunds only within 24 hours; crypto payments are never refundable; credits may expire 365 days after purchase.
- **Prohibited**: multiple accounts to bypass free limits, reselling API access, building competing services, scraping, unapproved red-teaming, using VPNs to reach Restricted Models (immediate suspension), reverse engineering.
- **Liability cap**: the greater of your last 12 months of payments or $100. No warranty on output accuracy/quality; human review is on you.
- **Disputes**: New York law, binding AAA arbitration, jury/class-action waiver. Feedback is licensed to OpenRouter perpetually and without restriction.

### 2) Privacy Policy

Source: [OpenRouter Privacy Policy](https://openrouter.ai/privacy) (last updated 2025-04-15)

- Prompt/response handling defers to ToS Section 5 (above), and **OpenRouter explicitly does not control or take responsibility for whether downstream LLM providers train on your inputs** — check each provider's terms.
- Retention is only described as "as long as reasonably necessary" (no concrete periods). Deletion/access requests: privacy@openrouter.ai.
- Data may be transferred to US servers (SCC basis); 13+.

### 3) Provider Routing Docs — Data Protection Options (practically important)

Source: [Provider Selection guide](https://openrouter.ai/docs/guides/routing/provider-selection)

- Default routing is price-based load balancing (cheapest among providers with no recent outage), so different requests may hit different downstream providers.
- **`provider.data_collection: "deny"`**: excludes providers that store/train on inputs (the default is "allow"!).
- **`provider.zdr: true`**: routes only to Zero Data Retention endpoints.
- `order`/`only`/`ignore` pin or exclude specific providers; `max_price` enforces a price ceiling.
- **Bottom line**: for sensitive data on OpenRouter, `data_collection: "deny"` + `zdr: true` is effectively mandatory. Protection is off by default.

## Groq · Cerebras · Mistral · GitHub Models Terms Summary

Key takeaways for the remaining four providers (**analyzed: 2026-06-12**).

### Groq

Sources: [Terms of Use](https://groq.com/terms-of-use) (2025-10-15) · [Privacy Policy](https://groq.com/privacy-policy) (2025-11-12) · [Your Data in GroqCloud](https://console.groq.com/docs/your-data) · [Services Agreement](https://console.groq.com/docs/legal/services-agreement)

- **One of the best data policies among free providers.** The Services Agreement states inputs/outputs cannot be used for model training/fine-tuning unless the customer explicitly allows it.
- **Inference requests are not retained by default.** Logging happens only for troubleshooting/abuse investigation, capped at 30 days; **ZDR (Zero Data Retention)** can be enabled in console Data Controls.
- Customers retain IP rights in inputs/outputs.
- Website ToS: liability capped at $100, California law (Santa Clara County).

### Cerebras

Sources: [Privacy Policy](https://www.cerebras.ai/privacy-policy) · [Pricing/free limits](https://www.cerebras.ai/pricing)

- The privacy policy states **inference inputs/outputs are not retained**, and logs are deleted when no longer needed.
- Free tier: ~1M tokens/day, ~30 req/min, no card required. Industry-fastest inference (~2,000 tokens/sec).
- The free model catalog changes often (check `/v1/models`) — refresh the default model if you hit a 404.

### Mistral (La Plateforme)

Sources: [Legal hub](https://legal.mistral.ai/terms) (2025-11-28) · [Privacy Policy](https://legal.mistral.ai/terms/privacy-policy) (effective 2026-04-08)

- **The paid API explicitly does not train on your inputs/outputs** ("we do not use your Input and Output to train ... the paid version of our APIs").
- Conversely, **the free tier (Experiment plan) is not covered by that guarantee.** Free-tier access may be conditioned on data-training consent — keep sensitive data out. (Free Le Chat users can opt out in account settings.)
- Retention: regular API inputs/outputs for 30 days after generation; agent API until account closure.
- EU-vendor-first processing (GDPR); broad user rights (access/deletion/objection); voice cloning prohibited; Usage Policy applies.

### GitHub Models

Sources: [Additional Product Terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) · [Responsible Use of GitHub Models](https://docs.github.com/en/github-models/responsible-use-of-github-models)

- The Models clause is short: **"your use is subject to the terms of the company hosting the model and the model license"** — so training usage isn't guaranteed at the GitHub level and varies per hosting company (OpenAI, etc.).
- **Not for production.** Official docs state it's designed for "learning, experimentation and proof-of-concept activities", not production use cases.
- Always-on content filters that cannot be disabled; free limits span requests/min, requests/day, tokens, and concurrency (varies by model tier).

## Data Policy At a Glance (as of 2026-06-12)

| Provider | Free-tier inputs used for training? | Notes |
|---|---|---|
| Google AI Studio | **Yes** (explicit) | Paid tier explicitly does not train |
| Groq | **No** (explicit) | No retention by default + ZDR option |
| Cerebras | Effectively no (no input/output retention) | |
| Mistral | Only paid tier is guaranteed — **free tier has no guarantee** | 30-day retention |
| NVIDIA | **Unclear** (not stated in public docs) | Use for public-data experiments only |
| OpenRouter | Varies by downstream provider | Use `data_collection: "deny"` + `zdr: true` |
| GitHub Models | Varies by model host | Production use prohibited |

## License

MIT
