import path from 'node:path';

export interface Config {
  host: string;
  port: number;
  databaseFile: string;
  webDir: string | null;
  allowRegistration: boolean;
  trustProxy: boolean;
  corsOrigins: string[];
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  llm: {
    provider: 'anthropic' | 'openai' | null;
    model: string | null;
    baseUrl: string | null;
    /** For anthropic: optional (falls back to ANTHROPIC_API_KEY); for openai: optional bearer key. */
    apiKey: string | undefined;
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
  };
  insights: {
    /** Run scheduled weekly reports. */
    scheduler: boolean;
    /** Allow users to configure webhook notifications (ntfy, Discord, generic JSON). */
    allowWebhooks: boolean;
    /** Max AI requests per user per hour. */
    aiRequestsPerHour: number;
  };
}

const bool = (v: string | undefined, d: boolean) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.DATA_DIR ?? path.resolve('data');
  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number(env.PORT ?? 8080),
    databaseFile: env.DATABASE_FILE ?? path.join(dataDir, 'open-workouts.db'),
    webDir: env.WEB_DIR ?? null,
    // The very first account can always be created (and becomes admin).
    allowRegistration: bool(env.ALLOW_REGISTRATION, false),
    trustProxy: bool(env.TRUST_PROXY, false),
    corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    logLevel: (env.LOG_LEVEL as Config['logLevel']) ?? 'info',
    llm: {
      provider: env.LLM_PROVIDER === 'anthropic' || env.LLM_PROVIDER === 'openai' ? env.LLM_PROVIDER : null,
      model: env.LLM_MODEL || null,
      baseUrl: env.LLM_BASE_URL || null,
      apiKey: env.LLM_API_KEY || undefined,
      effort: ((): Config['llm']['effort'] => {
        const e = env.LLM_EFFORT ?? (env.LLM_PROVIDER === 'anthropic' ? 'medium' : '');
        return e === 'low' || e === 'medium' || e === 'high' || e === 'xhigh' || e === 'max' ? e : null;
      })(),
    },
    insights: {
      scheduler: bool(env.INSIGHTS_SCHEDULER, true),
      allowWebhooks: bool(env.INSIGHTS_ALLOW_WEBHOOKS, true),
      aiRequestsPerHour: Math.max(1, Number(env.INSIGHTS_AI_REQUESTS_PER_HOUR ?? 30) || 30),
    },
  };
}
