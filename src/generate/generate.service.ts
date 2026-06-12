import { BadGatewayException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GenerateDto } from './dto';
import { AiProvider, PROVIDERS } from './providers.config';
import { KeyPoolService } from './key-pool.service';
import { ModelRouterService } from './model-router.service';
import { RateLimiterService } from './rate-limiter.service';
import { UsageStoreService } from './usage-store.service';

/** AI 라우터를 못 쓸 때 사용하는 정적 우선순위 (품질·한도·가용성 종합) */
const FALLBACK_ORDER: AiProvider[] = [
  AiProvider.GOOGLE,
  AiProvider.GROQ,
  AiProvider.CEREBRAS,
  AiProvider.NVIDIA,
  AiProvider.GITHUB,
  AiProvider.OPENROUTER,
  AiProvider.MISTRAL,
];

@Injectable()
export class GenerateService {
  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly router: ModelRouterService,
    private readonly keyPool: KeyPoolService,
    private readonly usageStore: UsageStoreService,
  ) {}

  async generate(dto: GenerateDto) {
    // provider를 명시하면 해당 프로바이더 직접 호출 (기존 동작)
    if (dto.provider) {
      this.assertConfigured(dto.provider);
      this.assertWithinLimit(dto.provider);
      const result = await this.callProvider(dto.provider, dto.model, dto.prompt);
      return { ...result, routing: { mode: 'manual' } };
    }

    // 미지정 시: 키 보유 + 한도 잔여 프로바이더만 후보로 → AI 추론 라우팅 → 실패 시 폴백 체인
    const candidates = FALLBACK_ORDER.filter(
      (p) => this.keyPool.keyCount(p) > 0 && this.rateLimiter.check(p).allowed,
    );
    if (!candidates.length) {
      throw new HttpException({ message: '사용 가능한 프로바이더가 없습니다 (키 미설정 또는 전부 한도 도달).', usage: this.rateLimiter.snapshot() }, 429);
    }

    const recommendation = await this.router.recommend(dto.prompt, candidates);
    const ordered = recommendation
      ? [recommendation.provider, ...candidates.filter((p) => p !== recommendation.provider)]
      : candidates;

    const attempts: Array<{ provider: AiProvider; error: string }> = [];
    for (const provider of ordered) {
      try {
        this.assertWithinLimit(provider);
        const modelOverride = provider === recommendation?.provider ? recommendation?.model || undefined : undefined;
        const result = await this.callProvider(provider, modelOverride, dto.prompt);
        return {
          ...result,
          routing: {
            mode: 'auto',
            recommended: recommendation ? `${recommendation.provider}${recommendation.model ? '/' + recommendation.model : ''}` : null,
            reason: recommendation?.reason ?? '정적 우선순위 사용 (AI 라우터 생략/실패)',
            routerModel: recommendation ? ModelRouterService.ROUTER_MODEL : null,
            fallbackUsed: provider !== (recommendation?.provider ?? ordered[0]) || attempts.length > 0,
            attempts,
          },
        };
      } catch (error) {
        attempts.push({ provider, error: this.errorSummary(error) });
      }
    }
    throw new BadGatewayException({ message: '모든 후보 프로바이더 호출 실패', attempts });
  }

  private assertConfigured(provider: AiProvider) {
    const config = PROVIDERS[provider];
    if (!this.keyPool.keyCount(provider)) {
      throw new ServiceUnavailableException({
        message: `${provider} API 키가 설정되지 않았습니다. 환경변수 ${config.apiKeyEnv}를 설정하세요.`,
        signupUrl: config.signupUrl,
      });
    }
  }

  private assertWithinLimit(provider: AiProvider) {
    const limit = this.rateLimiter.check(provider);
    if (!limit.allowed) {
      throw new HttpException(
        {
          message: `${provider} 무료 한도 도달(${limit.reason}). ${limit.retryAfterSeconds ?? 60}초 후 재시도하세요.`,
          provider,
          usage: limit.usage,
          retryAfterSeconds: limit.retryAfterSeconds ?? 60,
        },
        429,
      );
    }
  }

  private async callProvider(provider: AiProvider, modelOverride: string | undefined, prompt: string) {
    const config = PROVIDERS[provider];
    this.assertConfigured(provider);
    const picked = this.rateLimiter.pickKey(provider);
    if (!picked) this.assertWithinLimit(provider); // 일관된 429 응답 생성
    const model = modelOverride || config.defaultModel;
    const startedAt = Date.now();

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${picked!.key}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const bodyText = await res.text();
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 60;
        this.keyPool.reportRateLimited(provider, picked!.index, retryAfter);
      }
      this.usageStore.record({ provider, keyIndex: picked!.index, model, endpoint: 'generate', status: 'error', httpStatus: res.status, latencyMs: Date.now() - startedAt, error: bodyText.slice(0, 200) });
      throw new BadGatewayException({
        message: `${provider} 호출 실패 (HTTP ${res.status})`,
        provider,
        model,
        upstream: bodyText.slice(0, 500),
      });
    }

    let body: any;
    try {
      body = JSON.parse(bodyText);
    } catch {
      this.usageStore.record({ provider, keyIndex: picked!.index, model, endpoint: 'generate', status: 'error', httpStatus: res.status, latencyMs: Date.now() - startedAt, error: 'parse failure' });
      throw new BadGatewayException({ message: `${provider} 응답 파싱 실패`, upstream: bodyText.slice(0, 300) });
    }

    this.usageStore.record({
      provider,
      keyIndex: picked!.index,
      model,
      endpoint: 'generate',
      status: 'ok',
      httpStatus: res.status,
      latencyMs: Date.now() - startedAt,
      promptTokens: body.usage?.prompt_tokens ?? null,
      completionTokens: body.usage?.completion_tokens ?? null,
    });

    return {
      provider,
      model,
      text: body.choices?.[0]?.message?.content ?? '',
      usage: body.usage ?? null,
      latencyMs: Date.now() - startedAt,
      gatewayUsage: this.rateLimiter.check(provider).usage,
    };
  }

  private errorSummary(error: unknown): string {
    if (error instanceof HttpException) {
      const res = error.getResponse();
      if (typeof res === 'object' && res && 'message' in res) return String((res as any).message);
      return String(res);
    }
    return error instanceof Error ? error.message : String(error);
  }

  providers() {
    const usage = this.rateLimiter.snapshot();
    return Object.entries(PROVIDERS).map(([name, c]) => ({
      provider: name,
      defaultModel: c.defaultModel,
      configured: this.keyPool.keyCount(name as AiProvider) > 0,
      keys: this.keyPool.keyCount(name as AiProvider),
      gatewayLimits: c.limits,
      gatewayUsage: usage[name],
      signupUrl: c.signupUrl,
      description: c.description,
    }));
  }

  usage() {
    return this.usageStore.summary();
  }
}
