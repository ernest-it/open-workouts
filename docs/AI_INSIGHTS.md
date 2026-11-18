# AI insights

There are two ways to have an LLM look over your training. You can use either one or both.

| | **Built-in insights** | **MCP (bring your own assistant)** |
|---|---|---|
| What you get | Weekly updates (optionally pushed to your phone), period reports, "compare with previous workout", ask a question | Chat freely with Claude Desktop, Claude Code or another MCP client. It explores your data with tools |
| Where it runs | Your server calls an LLM: Claude, or a local model through Ollama | Your assistant calls your server's `/mcp` endpoint |
| Setup | Set `LLM_PROVIDER` on the server | Create an API token, add the server to your assistant |

## How it works (and why the numbers stay correct)

The LLM never sees raw database rows. The server first builds a **training digest** in code (`packages/shared/src/insights.ts`). The LLM's job is to *interpret* that digest, not to compute.

**What the digest contains:**
- totals versus the previous period: workouts, working sets, volume, training time
- working sets per body part
- for every exercise trained: best set, best estimated 1RM, and how it compares with the previous period and with your all-time best
- **plateaus**: lifts trained at least 3 times in the last 6 weeks without beating the 6 weeks before
- consistency (workouts per week over 8 weeks) and body-weight trend
- every workout in the period, set by set, with RPE, notes and PRs

**Why this design:**
- **Cheap:** a week of training is about 1–4k tokens.
- **Fast:** the model reads a summary, not your whole history.
- **No made-up numbers:** the system prompt tells the model to quote figures exactly as they appear in the digest.

You can read exactly what gets sent with **Insights → Show data summary**, or with `GET /api/v1/insights/digest?days=7`.

Comparisons work the same way. `compare_workouts` builds an exercise-by-exercise table (sets, volume change, e1RM change) before the model sees it. Without a second workout ID, it picks the most similar earlier session: the same template, then the most exercises in common.

## Built-in insights: choosing a model

### Claude (Anthropic API)

```yaml
environment:
  LLM_PROVIDER: anthropic
  ANTHROPIC_API_KEY: sk-ant-...      # or LLM_API_KEY
  # LLM_MODEL: claude-opus-5-5       # default
  # LLM_EFFORT: medium               # low | medium | high | xhigh | max ('' to omit)
```

**Model choice:**
- The default model is `claude-opus-5-5`.
- For cheaper weekly reports, `LLM_MODEL=claude-sonnet-5-5` or `claude-haiku-5-5` work well. The digest does the heavy lifting.

**Request details:**
- Requests use the official `@anthropic-ai/sdk`.
- **Prompt caching:** the digest is placed after the stable instructions with a cache breakpoint, so follow-up questions over the same data re-use it.
- **Refusal fallbacks:** on the newest models, server-side refusal fallbacks are enabled (`fallbacks: "default"`).

**Cost:** a weekly report is typically a few thousand input tokens and a few hundred output tokens. That's well under a cent on Sonnet or Haiku.

**Privacy:** your training digest (exercise names, sets, notes, body weight) is sent to Anthropic's API. If that's not acceptable, use a local model.

### Local model (Ollama, LM Studio, vLLM, llama.cpp…)

Any OpenAI-compatible `/chat/completions` endpoint works:

```yaml
environment:
  LLM_PROVIDER: openai
  LLM_BASE_URL: http://ollama:11434/v1
  LLM_MODEL: qwen3:14b                # anything you've pulled
  # LLM_API_KEY: ...                  # if your endpoint needs one
```

`docker-compose.yml` has a commented-out `ollama` service you can enable.

**Tips:**
- **Raise Ollama's context window.** Its default is small, and the digest gets silently truncated. Set `OLLAMA_CONTEXT_LENGTH=16384` on the Ollama container.
- **Model size:**
  - 7–8B models handle short weekly summaries.
  - 14B+ models write noticeably better advice.
  - Reasoning models work too; `<think>` blocks are stripped from the output.
- **Timeouts:** requests time out after 10 minutes, to allow for CPU-only inference.

### Other settings

| Variable | Default | Meaning |
|---|---|---|
| `INSIGHTS_SCHEDULER` | `true` | Generate scheduled weekly reports (checked every 10 minutes) |
| `INSIGHTS_ALLOW_WEBHOOKS` | `true` | Let users configure notification URLs. The server POSTs to whatever URL a user enters. On a server with untrusted users, set this to `false` |
| `TZ` | `UTC` | Time zone for "weekly on Monday after 07:00" |

## Weekly updates and notifications

In **Insights → Weekly updates**, choose a day and an hour; a report is written automatically every week. Each user's settings sync like any other setting.

To get the update on your phone, add a notification URL:

- **ntfy** (recommended; self-hostable, with free iOS and Android apps): `https://ntfy.sh/<long-random-topic>` or `https://ntfy.your-domain/<topic>`.
- **Discord**: a channel webhook URL. Long reports are truncated to Discord's limit.
- **JSON**: anything else, e.g. Home Assistant, n8n or Gotify via a bridge. The server sends `{title, content, kind, createdAt}`.

The **Test** button sends a sample notification.

## API

All endpoints require `Authorization: Bearer <token>`.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/insights/status` | `{enabled, provider, model, webhooks}` |
| `GET /api/v1/insights/digest?days=7` | The digest as Markdown (no LLM needed) |
| `POST /api/v1/insights/report` `{days}` | Write and store a report |
| `POST /api/v1/insights/compare` `{a, b?}` | Compare two workouts (`b` optional) |
| `POST /api/v1/insights/ask` `{question, days?}` | Answer a question; uses a 28-day digest by default |
| `GET /api/v1/insights/reports` · `DELETE …/reports/:id` | Stored reports |
| `POST /api/v1/insights/webhook/test` | Send a test notification |

If no LLM is configured, the AI endpoints return `501`. Errors from the provider (bad key, rate limit, refusal) come back as `502` with a readable message.

## MCP: use Claude Desktop, Claude Code or another assistant

The server exposes a **read-only** [Model Context Protocol](https://modelcontextprotocol.io) endpoint at `/mcp`. It uses Streamable HTTP, is stateless, and authenticates with a bearer token. It's always on, and needs no LLM configured on the server.

**Tools:**

| Tool | What it returns |
|---|---|
| `get_training_digest` | The digest described above, for any period (1–365 days) |
| `list_workouts` | Workouts filtered by date range or name, with IDs, duration, volume |
| `get_workout` | One workout, set by set, with PRs |
| `compare_workouts` | Exercise-by-exercise comparison (auto-picks the previous session) |
| `get_exercise_history` | Records, rep maxes and recent sessions for an exercise (fuzzy name match) |
| `list_exercises` | Exercises you've logged (or the whole library) |
| `get_measurements` | Body weight, body fat and circumferences over time |

**Setup:**

1. In the web UI, open **Settings → Devices & tokens → Create API token**.
2. Add the server to your assistant:

   ```bash
   # Claude Code
   claude mcp add --transport http open-workouts https://workouts.example.com/mcp \
     --header "Authorization: Bearer ow_..."
   ```

   For other clients, use the URL `https://<your-server>/mcp` with an `Authorization: Bearer <token>` header. Claude Desktop needs a remote MCP connector that supports custom headers, or an `mcp-remote`-style bridge.

3. Ask things like:
   - "Compare my last two leg days."
   - "Which lifts have stalled this quarter and what should I change?"
   - "How has my bench e1RM moved since I started tracking body weight?"

**Security:**
- The token gives read access to that user's data only. Revoke it any time under Settings → Devices & tokens.
- Put the server behind HTTPS before exposing `/mcp` to the internet.
