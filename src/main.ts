import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Agent, setGlobalDispatcher } from 'undici';
import { AppModule } from './app.module';
import { apiKeyAuth, docsBasicAuth } from './auth';

// 업스트림 fetch가 응답 헤더·본문을 기다리는 한도. 내장 기본값(각 5분)으로는 로컬 Ollama의 긴 요약(대기열 포함 몇 분)이 끊긴다.
const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS) || 15 * 60 * 1000;
setGlobalDispatcher(new Agent({ headersTimeout: upstreamTimeoutMs, bodyTimeout: upstreamTimeoutMs }));

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // DOCS_USER/DOCS_PASSWORD가 설정된 환경(예: Render)에서만 Swagger 접근을 Basic Auth로 보호한다.
  const docsUser = process.env.DOCS_USER;
  const docsPassword = process.env.DOCS_PASSWORD;
  if (docsUser && docsPassword) {
    app.use(['/docs', '/docs-json', '/docs-yaml'], docsBasicAuth(docsUser, docsPassword));
  }

  // GATEWAY_API_KEY가 설정되면 실제 API(/v1/*)는 x-api-key 헤더 인증을 요구한다. /health는 공개.
  const gatewayApiKey = process.env.GATEWAY_API_KEY;
  if (gatewayApiKey) {
    app.use('/v1', apiKeyAuth(gatewayApiKey));
  }

  // 자막·요약·이전 대화를 함께 보내는 요청은 Express 기본 한도(100kb)를 넘는다. 인증 뒤에 둬서 키 없는 /v1 요청은 본문을 읽기 전에 거절한다.
  const bodyLimit = process.env.BODY_LIMIT || '2mb';
  app.useBodyParser('json', { limit: bodyLimit });

  const config = new DocumentBuilder()
    .setTitle('Free LLM Gateway')
    .setDescription('무료 AI API들을 하나의 엔드포인트로 묶어주는 게이트웨이. /v1/*는 x-api-key 헤더 인증 필요.')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  const port = process.env.PORT || 3000;
  console.log('free llm api :', port, '| body limit', bodyLimit, '| upstream timeout', `${upstreamTimeoutMs}ms`);
  await app.listen(Number(port));
  
}

void bootstrap();
