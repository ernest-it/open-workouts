// Pluggable LLM providers for AI insights.
//
//   LLM_PROVIDER=anthropic  -> Claude via the official Anthropic SDK (ANTHROPIC_API_KEY)
//   LLM_PROVIDER=openai     -> any OpenAI-compatible /chat/completions endpoint:
//                              Ollama, LM Studio, vLLM, llama.cpp server, OpenRouter...
//   unset                   -> insights run without an LLM (digests and comparisons only)

import Anthropic from '@anthropic-ai/sdk';
import type { Config } from './config';

export interface CompletionRequest {
  /** Stable instructions (cached). */
  system: string;
  /** Large, per-user data context, e.g. a training digest (cached after the instructions). */
  context: string;
  /** The specific task or question. */
  prompt: string;
}

export interface CompletionResult {
  text: string;
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** Models that accept server-side refusal fallbacks with `fallbacks: "default"`. */
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(
    readonly model: string,
    private effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null,
    apiKey?: string,
    clientOptions: ConstructorParameters<typeof Anthropic>[0] = {},
  ) {
    // Without an explicit key the SDK resolves credentials from the environment.
    this.client = new Anthropic({ ...clientOptions, ...(apiKey ? { apiKey } : {}) });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    try {
      const fallback = FALLBACK_MODELS.has(this.model);
      const res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 16000,
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        ...(this.effort ? { output_config: { effort: this.effort } } : {}),
        // Instructions first, then the data context with a cache breakpoint, so
        // follow-up questions over the same digest re-use the cached prefix.
        system: [
          { type: 'text', text: req.system },
          { type: 'text', text: req.context, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: req.prompt }],
      });
      if (res.stop_reason === 'refusal') {
        throw new LlmError('The model declined to answer this request.');
      }
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (!text) throw new LlmError('The model returned an empty response.');
      return { text, model: res.model };
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new LlmError('Anthropic API key is missing or invalid.');
      if (e instanceof Anthropic.RateLimitError) throw new LlmError('Anthropic rate limit reached; try again shortly.', true);
      if (e instanceof Anthropic.BadRequestError) throw new LlmError(`Anthropic rejected the request: ${e.message}`);
      if (e instanceof Anthropic.APIConnectionError) throw new LlmError('Could not reach the Anthropic API.', true);
      if (e instanceof Anthropic.APIError) throw new LlmError(`Anthropic API error ${e.status}: ${e.message}`, (e.status ?? 0) >= 500);
      throw e;
    }
  }
}

/** OpenAI-compatible chat completions (local models via Ollama, LM Studio, vLLM...). */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  constructor(
    readonly model: string,
    private baseUrl: string,
    private apiKey?: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: `${req.system}\n\n${req.context}` },
            { role: 'user', content: req.prompt },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(10 * 60_000), // local models can be slow
      });
    } catch (e) {
      throw new LlmError(`Could not reach the LLM at ${this.baseUrl}: ${(e as Error).message}`, true);
    }
    if (!res.ok) throw new LlmError(`LLM endpoint returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status >= 500);
    const body = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new LlmError('The LLM returned an empty response.');
    // Some reasoning models wrap their scratchpad in <think> tags; drop it.
    return { text: text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim(), model: body.model ?? this.model };
  }
}

export function createLlmProvider(config: Config): LlmProvider | null {
  const { provider, model, baseUrl, apiKey, effort } = config.llm;
  if (provider === 'anthropic') return new AnthropicProvider(model ?? 'claude-opus-5-5', effort, apiKey);
  if (provider === 'openai') {
    if (!baseUrl) throw new Error('LLM_PROVIDER=openai requires LLM_BASE_URL (e.g. http://ollama:11434/v1)');
    if (!model) throw new Error('LLM_PROVIDER=openai requires LLM_MODEL (e.g. llama3.1:8b)');
    return new OpenAICompatibleProvider(model, baseUrl, apiKey);
  }
  return null;
}
