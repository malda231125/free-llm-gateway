import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, PROVIDERS } from './providers.config';
import { KeyPoolService } from './key-pool.service';

export interface ProviderCatalog {
  provider: AiProvider;
  defaultModel: string;
  models: string[];
  error?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_MODELS_PER_PROVIDER = 80;

/** 라우터에게 보여줄 주목 모델 패턴 (지능/특화 순) */
const HIGHLIGHT_PATTERNS = [
  /deepseek-r1/i, /deepseek/i, /qwen3.*coder/i, /qwen3/i, /llama-4/i, /llama-3\.3/i,
  /gpt-oss/i, /nemotron.*ultra/i, /nemotron/i, /gemini-3/i, /gemini-2\.5/i,
  /gpt-4\.1/i, /gpt-4o/i, /mistral-large/i, /glm/i, /gemma/i, /kimi/i,
];

/**
 * 프로바이더별 모델 카탈로그를 OpenAI 호환 /models 엔드포인트에서 수집한다 (10분 캐시).
 * 무료 등급에서 쓸 수 없는 모델(임베딩/TTS/이미지, OpenRouter 유료 등)은 걸러낸다.
 */
@Injectable()
export class ModelCatalogService {
  private readonly logger = new Logger(ModelCatalogService.name);
  private cache: { at: number; data: ProviderCatalog[] } | null = null;
  private inflight: Promise<ProviderCatalog[]> | null = null;

  constructor(private readonly keyPool: KeyPoolService) {}

  async catalog(): Promise<ProviderCatalog[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.data;
    if (!this.inflight) {
      this.inflight = this.fetchAll().finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }

  /** AI 라우터 프롬프트용: 프로바이더별 주목 모델 최대 limit개 (기본 모델은 항상 포함) */
  async highlights(providers: AiProvider[], limit = 6): Promise<Map<AiProvider, string[]>> {
    const out = new Map<AiProvider, string[]>();
    let data: ProviderCatalog[] = [];
    try {
      data = await this.catalog();
    } catch { /* 카탈로그 실패 시 기본 모델만 */ }
    for (const provider of providers) {
      const entry = data.find((c) => c.provider === provider);
      const picks: string[] = [PROVIDERS[provider].defaultModel];
      if (entry) {
        for (const pattern of HIGHLIGHT_PATTERNS) {
          if (picks.length >= limit) break;
          const found = entry.models.find((m) => pattern.test(m) && !picks.includes(m));
          if (found) picks.push(found);
        }
      }
      out.set(provider, picks);
    }
    return out;
  }

  async isValidModel(provider: AiProvider, model: string): Promise<boolean> {
    if (model === PROVIDERS[provider].defaultModel) return true;
    try {
      const data = await this.catalog();
      const entry = data.find((c) => c.provider === provider);
      return Boolean(entry?.models.includes(model));
    } catch {
      return false;
    }
  }

  private async fetchAll(): Promise<ProviderCatalog[]> {
    const providers = Object.values(AiProvider).filter((p) => this.keyPool.keyCount(p) > 0);
    const results = await Promise.all(providers.map((p) => this.fetchProvider(p)));
    this.cache = { at: Date.now(), data: results };
    return results;
  }

  private async fetchProvider(provider: AiProvider): Promise<ProviderCatalog> {
    const config = PROVIDERS[provider];
    const base = { provider, defaultModel: config.defaultModel };
    const key = this.keyPool.keys(provider)[0];
    // GitHub Models는 OpenAI 호환 /models 대신 별도 카탈로그 엔드포인트를 쓴다
    const url = provider === AiProvider.GITHUB
      ? 'https://models.github.ai/catalog/models'
      : `${config.baseUrl}/models`;
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ...base, models: [config.defaultModel], error: `HTTP ${res.status}` };
      const body: any = await res.json();
      const list = Array.isArray(body) ? body : body.data || body.models || [];
      const ids: string[] = list
        .map((m: any) => String(m.id || m.name || ''))
        .filter(Boolean);
      const filtered = this.filterForProvider(provider, ids);
      const models = [...new Set([config.defaultModel, ...filtered])].slice(0, MAX_MODELS_PER_PROVIDER);
      return { ...base, models };
    } catch (error) {
      this.logger.warn(`${provider} catalog fetch failed: ${error instanceof Error ? error.message : error}`);
      return { ...base, models: [config.defaultModel], error: 'fetch failed' };
    }
  }

  private filterForProvider(provider: AiProvider, ids: string[]): string[] {
    switch (provider) {
      case AiProvider.GOOGLE:
        return ids
          .map((id) => id.replace(/^models\//, ''))
          .filter((id) => /^gemini-/.test(id))
          .filter((id) => !/(embedding|tts|image|audio|live|veo|imagen|robotics|computer-use)/i.test(id));
      case AiProvider.OPENROUTER:
        return ids.filter((id) => id.endsWith(':free'));
      case AiProvider.MISTRAL:
        return ids.filter((id) => !/(embed|moderation|ocr|transcribe|voxtral)/i.test(id));
      case AiProvider.NVIDIA:
        return ids.filter((id) => !/(embed|rerank|retriever|nemoguard|safety|clip|vista|parakeet|fastpitch)/i.test(id));
      case AiProvider.GROQ:
        return ids.filter((id) => !/(whisper|tts|guard)/i.test(id));
      default:
        return ids;
    }
  }
}
