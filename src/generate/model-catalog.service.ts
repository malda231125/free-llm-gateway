import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, PROVIDERS } from './providers.config';
import { KeyPoolService } from './key-pool.service';

export interface CatalogModel {
  id: string;
  description: string;
}

export type ModelRouteCategory = 'reasoning' | 'fast' | 'vision' | 'long';

export const ROUTE_CATEGORY_LABELS: Record<ModelRouteCategory, string> = {
  reasoning: '강한 추론',
  fast: '빠른 응답',
  vision: '이미지/비전',
  long: '긴 컨텍스트',
};

export interface ProviderCatalog {
  provider: AiProvider;
  defaultModel: string;
  models: CatalogModel[];
  error?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

/** 모델 ID에서 패밀리를 추정해 간략 한국어 설명 생성 (업스트림 설명이 없을 때) */
const FAMILY_DESCRIPTIONS: Array<[RegExp, string]> = [
  [/deepseek.*v4/i, 'DeepSeek V4 — 최신 고성능 범용/추론 모델'],
  [/deepseek.*r1/i, 'DeepSeek-R1 — 깊은 사고가 필요한 추론 특화'],
  [/deepseek.*coder/i, 'DeepSeek Coder — 코드 생성 특화'],
  [/deepseek/i, 'DeepSeek — 고성능 오픈 모델'],
  [/qwen.*coder/i, 'Qwen Coder — 코드 생성 특화'],
  [/qwen/i, 'Qwen — 알리바바의 다국어 강점 오픈 모델'],
  [/llama-?4/i, 'Llama 4 — Meta 최신 멀티모달 오픈 모델'],
  [/llama-?3\.3/i, 'Llama 3.3 70B — Meta 범용 오픈 모델, 균형 좋음'],
  [/llama/i, 'Llama — Meta 오픈 모델'],
  [/gpt-oss/i, 'GPT-OSS — OpenAI 오픈웨이트 추론 모델'],
  [/nemotron.*ultra/i, 'Nemotron Ultra — NVIDIA 대형 고성능'],
  [/nemotron.*nano/i, 'Nemotron Nano — NVIDIA 경량 고속'],
  [/nemotron/i, 'Nemotron — NVIDIA 튜닝 모델'],
  [/gemma/i, 'Gemma — 구글 경량 오픈 모델'],
  [/gemini/i, 'Gemini — 구글 멀티모달'],
  [/mistral-large/i, 'Mistral Large — 미스트랄 플래그십'],
  [/mixtral/i, 'Mixtral — MoE 구조 효율 모델'],
  [/mistral/i, 'Mistral — 효율 좋은 유럽산 모델'],
  [/codestral/i, 'Codestral — 미스트랄 코드 특화'],
  [/glm/i, 'GLM — Zhipu 고성능 모델'],
  [/kimi/i, 'Kimi — Moonshot 긴 컨텍스트 강점'],
  [/phi/i, 'Phi — MS 경량 고효율'],
  [/granite/i, 'Granite — IBM 기업용 모델'],
  [/gpt-4\.1/i, 'GPT-4.1 — 코딩/장문 강화'],
  [/gpt-4o-mini/i, 'GPT-4o mini — 빠르고 저렴한 범용'],
  [/gpt-4o/i, 'GPT-4o — OpenAI 멀티모달 범용'],
  [/o[134](-|$)/i, 'OpenAI o시리즈 — 추론 특화'],
  [/seed|doubao/i, 'ByteDance 계열 모델'],
];

function familyDescription(id: string): string {
  for (const [pattern, desc] of FAMILY_DESCRIPTIONS) {
    if (pattern.test(id)) return desc;
  }
  return '';
}
const MAX_MODELS_PER_PROVIDER = 80;

/** 라우터에게 보여줄 주목 모델 패턴 (지능/특화 순) */
const HIGHLIGHT_PATTERNS = [
  /deepseek-r1/i, /deepseek/i, /qwen3.*coder/i, /qwen3/i, /llama-4/i, /llama-3\.3/i,
  /gpt-oss/i, /nemotron.*ultra/i, /nemotron/i, /gemini-3/i, /gemini-2\.5/i,
  /gpt-4\.1/i, /gpt-4o/i, /mistral-large/i, /glm/i, /gemma/i, /kimi/i,
];

const CATEGORY_PATTERNS: Record<ModelRouteCategory, RegExp[]> = {
  reasoning: [/deepseek-r1/i, /r1/i, /reason/i, /thinking/i, /qwq/i, /qwen3/i, /gpt-oss/i, /nemotron.*ultra/i, /o[134](-|$)/i, /magistral/i, /gemini-2\.5-pro/i],
  fast: [/flash/i, /flash-lite/i, /lite/i, /mini/i, /small/i, /nano/i, /8b/i, /7b/i, /3b/i, /instant/i, /haiku/i, /llama-3\.1-8b/i],
  vision: [/vision/i, /visual/i, /\bvl\b/i, /v[- ]?l/i, /multimodal/i, /pixtral/i, /llava/i, /qwen.*vl/i, /gemini/i, /llama-4/i, /maverick/i, /scout/i],
  long: [/long/i, /context/i, /128k/i, /200k/i, /256k/i, /1m/i, /million/i, /gemini/i, /llama-4/i, /mistral-large/i, /command-r/i, /kimi/i],
};

function matchesCategory(model: CatalogModel, category: ModelRouteCategory): boolean {
  const text = `${model.id} ${model.description}`;
  return CATEGORY_PATTERNS[category].some((pattern) => pattern.test(text));
}

function modelRank(provider: AiProvider, model: CatalogModel): number {
  const text = `${model.id} ${model.description}`.toLowerCase();
  let score = 0;

  // 최신 세대/상위 모델 우선
  if (/gemini-3|gpt-5|claude-4|llama-4|deepseek.*v4|qwen3|kimi-k2/.test(text)) score += 120;
  if (/gemini-2\.5|gpt-4\.1|gpt-4o|llama-3\.3|deepseek-r1|gpt-oss-120b|mistral-large|magistral|nemotron.*ultra/.test(text)) score += 95;
  if (/llama-3\.1|mixtral|codestral|devstral|gemma-3|gemma-4|phi-4/.test(text)) score += 70;

  // 성능/특화 힌트
  if (/pro|large|ultra|120b|70b|72b|405b|671b|reason|thinking|r1/.test(text)) score += 28;
  if (/coder|code|codestral|devstral/.test(text)) score += 20;
  if (/vision|visual|\bvl\b|multimodal|pixtral|llava|maverick|scout/.test(text)) score += 16;
  if (/long|128k|200k|256k|1m|million|context/.test(text)) score += 12;
  if (/latest|preview|experimental|exp/.test(text)) score += 10;

  // 너무 작은/레거시/특수 목적 모델은 아래로
  if (/mini|small|lite|nano|8b|7b|3b|1b/.test(text)) score -= 12;
  if (/embedding|embed|rerank|guard|moderation|tts|whisper|audio|image|ocr|transcribe/.test(text)) score -= 100;
  if (/deprecated|legacy|old/.test(text)) score -= 60;

  // provider별 체감 우선순위 보정
  if (provider === AiProvider.GOOGLE) {
    if (/gemini-2\.5-pro/.test(text)) score += 35;
    if (/gemini-2\.5-flash/.test(text)) score += 25;
    if (/flash-lite/.test(text)) score -= 8;
  }
  if (provider === AiProvider.GROQ) {
    if (/llama-3\.3-70b/.test(text)) score += 35;
    if (/deepseek-r1|qwen.*32b|openai\/gpt-oss-120b|gpt-oss-120b/.test(text)) score += 28;
    if (/instant|8b/.test(text)) score += 8; // Groq에서는 빠른 응답용 상위 노출 가치가 있음
  }
  if (provider === AiProvider.CEREBRAS) {
    if (/gpt-oss-120b/.test(text)) score += 40;
    if (/qwen-3|qwen3/.test(text)) score += 28;
  }
  if (provider === AiProvider.MISTRAL) {
    if (/large-latest|mistral-large|magistral|codestral|devstral/.test(text)) score += 34;
    if (/small-latest/.test(text)) score += 18;
  }
  if (provider === AiProvider.NVIDIA) {
    if (/llama-3\.3-70b|nemotron.*ultra|deepseek-r1|qwen3/.test(text)) score += 35;
  }
  if (provider === AiProvider.OPENROUTER) {
    if (/deepseek|qwen3|llama-4|gemini|gpt-oss|kimi/.test(text)) score += 32;
  }
  if (provider === AiProvider.GITHUB) {
    if (/gpt-4\.1|gpt-4o|o[134]|claude|mistral-large|llama-3\.3/.test(text)) score += 35;
    if (/gpt-4o-mini/.test(text)) score += 12;
  }

  // 같은 점수면 새 버전 문자열이 조금 더 위로 가도록 작은 보정
  const version = text.match(/(?:gemini|llama|qwen|gemma|phi|gpt|mistral|deepseek)[^0-9]*(\d+(?:\.\d+)?)/)?.[1];
  if (version) score += Number(version) || 0;
  return score;
}

function sortModels(provider: AiProvider, models: CatalogModel[]): CatalogModel[] {
  return [...models].sort((a, b) => {
    const diff = modelRank(provider, b) - modelRank(provider, a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

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
  async highlights(providers: AiProvider[], limit = 6): Promise<Map<AiProvider, CatalogModel[]>> {
    const out = new Map<AiProvider, CatalogModel[]>();
    let data: ProviderCatalog[] = [];
    try {
      data = await this.catalog();
    } catch { /* 카탈로그 실패 시 기본 모델만 */ }
    for (const provider of providers) {
      const entry = data.find((c) => c.provider === provider);
      const picks: CatalogModel[] = [
        entry?.models.find((m) => m.id === PROVIDERS[provider].defaultModel)
          || { id: PROVIDERS[provider].defaultModel, description: '' },
      ];
      if (entry) {
        for (const pattern of HIGHLIGHT_PATTERNS) {
          if (picks.length >= limit) break;
          const found = entry.models.find((m) => pattern.test(m.id) && !picks.some((x) => x.id === m.id));
          if (found) picks.push(found);
        }
      }
      out.set(provider, picks);
    }
    return out;
  }

  /** 특정 자동 라우팅 카테고리에 맞는 후보를 라우터 프롬프트용으로 압축한다. */
  async categoryHighlights(providers: AiProvider[], category: ModelRouteCategory, limit = 8): Promise<Map<AiProvider, CatalogModel[]>> {
    const out = new Map<AiProvider, CatalogModel[]>();
    let data: ProviderCatalog[] = [];
    try {
      data = await this.catalog();
    } catch { /* 카탈로그 실패 시 기본 모델만 */ }
    for (const provider of providers) {
      const entry = data.find((c) => c.provider === provider);
      const categoryModels = (entry?.models || []).filter((m) => matchesCategory(m, category));
      const picks: CatalogModel[] = categoryModels.slice(0, limit);
      const defaultModel = entry?.models.find((m) => m.id === PROVIDERS[provider].defaultModel)
        || { id: PROVIDERS[provider].defaultModel, description: familyDescription(PROVIDERS[provider].defaultModel) };
      if (!picks.length && matchesCategory(defaultModel, category)) picks.push(defaultModel);
      out.set(provider, picks);
    }
    return out;
  }

  async isValidModel(provider: AiProvider, model: string): Promise<boolean> {
    if (model === PROVIDERS[provider].defaultModel) return true;
    try {
      const data = await this.catalog();
      const entry = data.find((c) => c.provider === provider);
      return Boolean(entry?.models.some((m) => m.id === model));
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
    const fallback = [{ id: config.defaultModel, description: familyDescription(config.defaultModel) }];
    // GitHub은 별도 카탈로그(설명 포함), Google은 네이티브 엔드포인트(설명 포함) 사용
    const url = provider === AiProvider.GITHUB
      ? 'https://models.github.ai/catalog/models'
      : provider === AiProvider.GOOGLE
        ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200'
        : `${config.baseUrl}/models`;
    const headers: Record<string, string> = provider === AiProvider.GOOGLE
      ? { 'x-goog-api-key': key }
      : { authorization: `Bearer ${key}` };
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return { ...base, models: fallback, error: `HTTP ${res.status}` };
      const body: any = await res.json();
      const list = Array.isArray(body) ? body : body.data || body.models || [];
      const raw: CatalogModel[] = list
        .map((m: any) => ({
          id: String(m.id || m.name || '').replace(/^models\//, ''),
          description: this.describe(provider, m),
        }))
        .filter((m: CatalogModel) => m.id);
      const filtered = this.filterForProvider(provider, raw);
      const seen = new Set<string>();
      const unique: CatalogModel[] = [];
      const defaultEntry = filtered.find((m) => m.id === config.defaultModel)
        || { id: config.defaultModel, description: familyDescription(config.defaultModel) };
      for (const m of [defaultEntry, ...filtered]) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        unique.push(m);
      }
      const models = sortModels(provider, unique).slice(0, MAX_MODELS_PER_PROVIDER);
      return { ...base, models };
    } catch (error) {
      this.logger.warn(`${provider} catalog fetch failed: ${error instanceof Error ? error.message : error}`);
      return { ...base, models: fallback, error: 'fetch failed' };
    }
  }

  /** 업스트림이 주는 설명을 우선 쓰고, 없으면 모델 패밀리 기반 설명 생성 */
  private describe(provider: AiProvider, m: any): string {
    const upstream = String(m.description || m.summary || '').replace(/\s+/g, ' ').trim();
    if (upstream) return upstream.slice(0, 140);
    const id = String(m.id || m.name || '');
    const parts: string[] = [];
    const family = familyDescription(id);
    if (family) parts.push(family);
    if (m.owned_by && !/system|user/i.test(String(m.owned_by))) parts.push(`${m.owned_by} 제공`);
    if (m.context_window) parts.push(`컨텍스트 ${Math.round(Number(m.context_window) / 1024)}K`);
    return parts.join(' · ').slice(0, 140);
  }

  private filterForProvider(provider: AiProvider, models: CatalogModel[]): CatalogModel[] {
    const byId = (fn: (id: string) => boolean) => models.filter((m) => fn(m.id));
    switch (provider) {
      case AiProvider.GOOGLE:
        return byId((id) => /^gemini-/.test(id) && !/(embedding|tts|image|audio|live|veo|imagen|robotics|computer-use)/i.test(id));
      case AiProvider.OPENROUTER:
        return byId((id) => id.endsWith(':free'));
      case AiProvider.MISTRAL:
        return byId((id) => !/(embed|moderation|ocr|transcribe|voxtral)/i.test(id));
      case AiProvider.NVIDIA:
        return byId((id) => !/(embed|rerank|retriever|nemoguard|safety|clip|vista|parakeet|fastpitch)/i.test(id));
      case AiProvider.GROQ:
        return byId((id) => !/(whisper|tts|guard)/i.test(id));
      default:
        return models;
    }
  }
}
