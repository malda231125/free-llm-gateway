import { BadGatewayException, BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AiProvider, PROVIDERS } from './providers.config';
import { KeyPoolService } from './key-pool.service';
import { RateLimiterService } from './rate-limiter.service';
import { UsageStoreService } from './usage-store.service';

/**
 * OpenAI 호환 /v1/embeddings. 무료 임베딩을 지원하는 프로바이더(GOOGLE/MISTRAL/NVIDIA/GITHUB)만 대상.
 * model 규칙은 chat과 동일: 미지정/"auto" = GOOGLE 기본, "PROVIDER" = 기본 임베딩 모델, "PROVIDER/모델ID" = 정확히 지정.
 */
@Injectable()
export class EmbeddingsService {
  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly keyPool: KeyPoolService,
    private readonly usageStore: UsageStoreService,
  ) {}

  async handle(body: any) {
    if (body?.input === undefined || body?.input === null || body?.input === '') {
      throw new BadRequestException({ error: { message: 'input is required', type: 'invalid_request_error' } });
    }
    const { provider, model } = this.resolveTarget(String(body?.model || 'auto').trim());
    const config = PROVIDERS[provider];
    if (!this.keyPool.keyCount(provider)) {
      throw new ServiceUnavailableException({
        error: { message: `${provider} API key not configured (${config.apiKeyEnv})`, type: 'invalid_request_error' },
        signupUrl: config.signupUrl,
      });
    }
    const picked = this.rateLimiter.pickKey(provider);
    if (!picked) {
      const limit = this.rateLimiter.check(provider);
      throw new HttpException(
        { error: { message: `${provider} gateway quota exceeded, retry in ${limit.retryAfterSeconds ?? 60}s`, type: 'rate_limit_error' }, usage: limit.usage },
        429,
      );
    }

    const { model: _m, ...passthrough } = body;
    // NVIDIA 임베딩은 input_type 필수 — 미지정 시 query로 기본 설정
    if (provider === AiProvider.NVIDIA && !passthrough.input_type) passthrough.input_type = 'query';

    const startedAt = Date.now();
    const res = await fetch(`${config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${picked.key}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({ ...passthrough, model }),
    });
    const text = await res.text();
    if (!res.ok) {
      this.usageStore.record({ provider, keyIndex: picked.index, model, endpoint: 'embeddings', status: 'error', httpStatus: res.status, latencyMs: Date.now() - startedAt, error: text.slice(0, 200) });
      throw new BadGatewayException({ error: { message: `${provider} embeddings failed (HTTP ${res.status})`, type: 'upstream_error' }, upstream: text.slice(0, 300) });
    }
    let json: any;
    try { json = JSON.parse(text); } catch {
      throw new BadGatewayException({ error: { message: `${provider} embeddings parse failure`, type: 'upstream_error' } });
    }
    this.usageStore.record({
      provider, keyIndex: picked.index, model, endpoint: 'embeddings', status: 'ok', httpStatus: 200,
      latencyMs: Date.now() - startedAt,
      promptTokens: json.usage?.prompt_tokens ?? json.usage?.total_tokens ?? null,
    });
    return { ...json, gateway: { provider, model } };
  }

  private resolveTarget(raw: string): { provider: AiProvider; model: string } {
    const embeddable = Object.entries(PROVIDERS)
      .filter(([, c]) => c.embeddingModel)
      .map(([name]) => name as AiProvider);
    if (!raw || raw.toLowerCase() === 'auto') {
      const provider = embeddable.includes(AiProvider.GOOGLE) ? AiProvider.GOOGLE : embeddable[0];
      return { provider, model: PROVIDERS[provider].embeddingModel! };
    }
    const [head, ...rest] = raw.split('/');
    const provider = head.toUpperCase() as AiProvider;
    if (PROVIDERS[provider]?.embeddingModel || (PROVIDERS[provider] && rest.length)) {
      return { provider, model: rest.length ? rest.join('/') : PROVIDERS[provider].embeddingModel! };
    }
    throw new BadRequestException({
      error: {
        message: `unknown embeddings model "${raw}". Use "auto", a provider (${embeddable.join(', ')}), or "PROVIDER/model-id".`,
        type: 'invalid_request_error',
      },
    });
  }
}
