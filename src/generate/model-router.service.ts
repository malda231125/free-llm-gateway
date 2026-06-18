import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, PROVIDERS } from './providers.config';
import { ModelCatalogService, ModelRouteCategory, ROUTE_CATEGORY_LABELS } from './model-catalog.service';
import { RateLimiterService } from './rate-limiter.service';
import { UsageStoreService } from './usage-store.service';

export interface Recommendation {
  provider: AiProvider;
  model: string | null;
  reason: string;
}

/** AI 라우터가 후보 중 적합 "프로바이더+모델"을 추천. 실패 시 null → 호출부가 정적 우선순위로 폴백. */
@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);
  /** 추천 호출에 쓰는 빠른 모델 (본 호출보다 가볍게) */
  static readonly ROUTER_MODEL = 'gemini-2.5-flash-lite';

  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly usageStore: UsageStoreService,
    private readonly catalog: ModelCatalogService,
  ) {}

  async recommend(prompt: string, candidates: AiProvider[], category?: ModelRouteCategory): Promise<Recommendation | null> {
    if (candidates.length < 2) return null;
    const highlights = category
      ? await this.catalog.categoryHighlights(candidates, category)
      : await this.catalog.highlights(candidates);
    const lines: string[] = [];
    for (const p of candidates) {
      const models = highlights.get(p) || [];
      if (category && models.length === 0) continue;
      lines.push(`- ${p} (${PROVIDERS[p].description})`);
      for (const m of models) {
        lines.push(`    * ${p}/${m.id}${m.description ? ` — ${m.description.slice(0, 60)}` : ''}`);
      }
    }
    if (!lines.length) return null;

    const routerPrompt = [
      '너는 AI 모델 라우터다. 아래 후보 중 사용자 요청을 처리하기에 가장 적합한 모델 하나를 골라라.',
      category ? `사용자가 먼저 선택한 카테고리: ${ROUTE_CATEGORY_LABELS[category]}. 이 카테고리 후보 범위 안에서만 골라라.` : '',
      '판단 기준: 속도가 중요한 짧은 작업은 빠른 프로바이더의 경량 모델, 복잡한 추론은 추론 특화 모델(DeepSeek-R1 등),',
      '코딩은 코드 특화 모델, 번역·긴 글·한국어는 품질 좋은 범용 모델. 모델 패밀리의 일반적 특성을 활용하라.',
      '반드시 JSON 한 줄로만 답하라: {"choice":"PROVIDER/모델ID (목록에 있는 것 그대로)","reason":"<한 문장 한국어 이유>"}',
      '',
      '[후보 모델 목록]',
      ...lines,
      '',
      '[사용자 요청 (일부일 수 있음)]',
      prompt.slice(0, 2000),
    ].join('\n');

    // 1차 라우터: 구글 flash-lite, 구글 한도/혼잡 시 2차 라우터: GROQ (둘 다 안 되면 null → 정적 폴백)
    const routerBackends: Array<{ provider: AiProvider; model: string }> = [
      { provider: AiProvider.GOOGLE, model: ModelRouterService.ROUTER_MODEL },
      { provider: AiProvider.GROQ, model: 'llama-3.3-70b-versatile' },
    ];
    let text = '';
    for (const backend of routerBackends) {
      const picked = this.rateLimiter.pickKey(backend.provider);
      if (!picked) continue;
      const startedAt = Date.now();
      try {
        const res = await fetch(`${PROVIDERS[backend.provider].baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${picked.key}` },
          body: JSON.stringify({
            model: backend.model,
            messages: [{ role: 'user', content: routerPrompt }],
            temperature: 0,
          }),
        });
        this.usageStore.record({
          provider: backend.provider,
          keyIndex: picked.index,
          model: backend.model,
          endpoint: 'router',
          status: res.ok ? 'ok' : 'error',
          httpStatus: res.status,
          latencyMs: Date.now() - startedAt,
        });
        if (!res.ok) continue;
        const body = await res.json();
        text = body.choices?.[0]?.message?.content ?? '';
        if (text) break;
      } catch (error) {
        this.logger.warn(`router backend ${backend.provider} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (!text) return null;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      const choice = String(parsed.choice || parsed.provider || '');
      const [head, ...rest] = choice.split('/');
      const provider = head.toUpperCase() as AiProvider;
      if (!candidates.includes(provider)) return null;
      const reason = String(parsed.reason || '');
      let model: string | null = rest.length ? rest.join('/') : null;
      if (model && !(await this.catalog.isValidModel(provider, model))) model = null;
      return { provider, model, reason };
    } catch (error) {
      this.logger.warn(`router parse failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
