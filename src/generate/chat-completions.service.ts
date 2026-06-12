import { BadGatewayException, BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { AiProvider, PROVIDERS } from './providers.config';
import { KeyPoolService } from './key-pool.service';
import { ModelRouterService, Recommendation } from './model-router.service';
import { RateLimiterService } from './rate-limiter.service';
import { UsageStoreService } from './usage-store.service';

const FALLBACK_ORDER: AiProvider[] = [
  AiProvider.GOOGLE,
  AiProvider.GROQ,
  AiProvider.CEREBRAS,
  AiProvider.NVIDIA,
  AiProvider.GITHUB,
  AiProvider.OPENROUTER,
  AiProvider.MISTRAL,
];

interface ResolvedTarget {
  provider: AiProvider;
  model: string;
}

/**
 * OpenAI 호환 /v1/chat/completions 처리.
 * model 규칙: "auto"(또는 미지정) = AI 라우팅, "GROQ" = 프로바이더 기본 모델, "GROQ/모델ID" = 정확히 지정.
 * 업스트림이 전부 OpenAI 호환이므로 응답은 패스스루하고 gateway 메타만 덧붙인다. stream:true면 SSE 패스스루.
 */
@Injectable()
export class ChatCompletionsService {
  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly router: ModelRouterService,
    private readonly keyPool: KeyPoolService,
    private readonly usageStore: UsageStoreService,
  ) {}

  async handle(body: any, res: Response) {
    const messages = body?.messages;
    if (!Array.isArray(messages) || !messages.length) {
      throw new BadRequestException({ error: { message: 'messages array is required', type: 'invalid_request_error' } });
    }
    const stream = Boolean(body?.stream);
    const targets = await this.resolveTargets(body);

    const attempts: Array<{ provider: AiProvider; model: string; error: string }> = [];
    for (const target of targets.ordered) {
      try {
        this.assertUsable(target.provider);
        const picked = this.rateLimiter.pickKey(target.provider);
        if (!picked) { this.assertUsable(target.provider); continue; }
        const startedAt = Date.now();
        const upstream = await this.callUpstream(target, body, picked.key);
        if (!upstream.ok) {
          const text = await upstream.text();
          if (upstream.status === 429) {
            const retryAfter = Number(upstream.headers.get('retry-after')) || 60;
            this.keyPool.reportRateLimited(target.provider, picked.index, retryAfter);
          }
          this.usageStore.record({ provider: target.provider, keyIndex: picked.index, model: target.model, endpoint: 'chat', status: 'error', httpStatus: upstream.status, latencyMs: Date.now() - startedAt, error: text.slice(0, 200) });
          attempts.push({ provider: target.provider, model: target.model, error: `HTTP ${upstream.status}: ${text.slice(0, 200)}` });
          continue;
        }
        const gateway = {
          provider: target.provider,
          model: target.model,
          mode: targets.mode,
          recommended: targets.recommendation
            ? `${targets.recommendation.provider}${targets.recommendation.model ? '/' + targets.recommendation.model : ''}`
            : null,
          reason: targets.recommendation?.reason ?? null,
          attempts,
        };
        if (stream) {
          this.usageStore.record({ provider: target.provider, keyIndex: picked.index, model: target.model, endpoint: 'chat', status: 'ok', httpStatus: 200, latencyMs: Date.now() - startedAt });
          return this.pipeSse(upstream, res, gateway);
        }
        const json = await upstream.json();
        this.usageStore.record({ provider: target.provider, keyIndex: picked.index, model: target.model, endpoint: 'chat', status: 'ok', httpStatus: 200, latencyMs: Date.now() - startedAt, promptTokens: json.usage?.prompt_tokens ?? null, completionTokens: json.usage?.completion_tokens ?? null });
        return res.json({ ...json, gateway });
      } catch (error) {
        attempts.push({ provider: target.provider, model: target.model, error: this.errorSummary(error) });
      }
    }
    throw new BadGatewayException({ error: { message: 'all candidate providers failed', type: 'upstream_error' }, attempts });
  }

  /** model 파라미터 해석 + 후보 순서 결정 */
  private async resolveTargets(body: any): Promise<{
    ordered: ResolvedTarget[];
    mode: 'auto' | 'manual';
    recommendation: Recommendation | null;
  }> {
    const raw = String(body?.model || 'auto').trim();

    if (raw && raw.toLowerCase() !== 'auto') {
      const [head, ...rest] = raw.split('/');
      const providerName = head.toUpperCase() as AiProvider;
      if (PROVIDERS[providerName]) {
        const model = rest.length ? rest.join('/') : PROVIDERS[providerName].defaultModel;
        return { ordered: [{ provider: providerName, model }], mode: 'manual', recommendation: null };
      }
      throw new BadRequestException({
        error: {
          message: `unknown model "${raw}". Use "auto", a provider name (e.g. "GROQ"), or "PROVIDER/model-id" (e.g. "GROQ/llama-3.3-70b-versatile").`,
          type: 'invalid_request_error',
        },
      });
    }

    const candidates = FALLBACK_ORDER.filter(
      (p) => this.keyPool.keyCount(p) > 0 && this.rateLimiter.check(p).allowed,
    );
    if (!candidates.length) {
      throw new HttpException({ error: { message: 'no provider available (keys missing or all quotas exhausted)', type: 'rate_limit_error' } }, 429);
    }

    const lastUserMessage = [...body.messages].reverse().find((m: any) => m?.role === 'user');
    const routePrompt = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : JSON.stringify(lastUserMessage?.content ?? '');
    const recommendation = await this.router.recommend(routePrompt, candidates);
    const orderedProviders = recommendation
      ? [recommendation.provider, ...candidates.filter((p) => p !== recommendation!.provider)]
      : candidates;
    return {
      ordered: orderedProviders.map((p) => ({
        provider: p,
        model: p === recommendation?.provider && recommendation?.model ? recommendation.model : PROVIDERS[p].defaultModel,
      })),
      mode: 'auto',
      recommendation,
    };
  }

  private assertUsable(provider: AiProvider) {
    const config = PROVIDERS[provider];
    if (!this.keyPool.keyCount(provider)) {
      throw new ServiceUnavailableException({
        error: { message: `${provider} API key not configured (${config.apiKeyEnv})`, type: 'invalid_request_error' },
        signupUrl: config.signupUrl,
      });
    }
    const limit = this.rateLimiter.check(provider);
    if (!limit.allowed) {
      throw new HttpException(
        { error: { message: `${provider} gateway quota exceeded, retry in ${limit.retryAfterSeconds}s`, type: 'rate_limit_error' }, usage: limit.usage },
        429,
      );
    }
  }

  private async callUpstream(target: ResolvedTarget, body: any, apiKey: string) {
    const config = PROVIDERS[target.provider];
    // 게이트웨이 제어 필드만 빼고 표준 파라미터(messages/temperature/stream 등)는 그대로 전달
    const { model: _model, gateway: _gateway, ...passthrough } = body;
    return fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({ ...passthrough, model: target.model }),
    });
  }

  /** 업스트림 SSE를 그대로 패스스루. 시작 전에 gateway 메타를 주석 이벤트로 먼저 보낸다. */
  private async pipeSse(upstream: globalThis.Response, res: Response, gateway: any) {
    res.status(200);
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`: gateway ${JSON.stringify(gateway)}\n\n`);
    const reader = upstream.body?.getReader();
    if (!reader) {
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      res.end();
    }
  }

  private errorSummary(error: unknown): string {
    if (error instanceof HttpException) {
      const r = error.getResponse();
      if (typeof r === 'object' && r) return JSON.stringify(r).slice(0, 200);
      return String(r);
    }
    return error instanceof Error ? error.message : String(error);
  }
}
