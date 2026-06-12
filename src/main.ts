import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { apiKeyAuth, docsBasicAuth } from './auth';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  const config = new DocumentBuilder()
    .setTitle('Free AI Gateway')
    .setDescription('무료 AI API들을 하나의 엔드포인트로 묶어주는 게이트웨이. /v1/*는 x-api-key 헤더 인증 필요.')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(Number(process.env.PORT || 3000));
}

void bootstrap();
