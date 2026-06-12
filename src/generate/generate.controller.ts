import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { GenerateDto } from './dto';
import { GenerateService } from './generate.service';
import { ModelCatalogService } from './model-catalog.service';
import { ChatCompletionsService } from './chat-completions.service';

@ApiTags('gateway')
@Controller()
export class GenerateController {
  constructor(
    private readonly service: GenerateService,
    private readonly chatCompletions: ChatCompletionsService,
    private readonly modelCatalog: ModelCatalogService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: '헬스체크' })
  health() {
    return { ok: true, app: 'free-llm-gateway' };
  }

  @Get('v1/providers')
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: '프로바이더별 설정/한도/사용량 조회' })
  providers() {
    return this.service.providers();
  }

  @Get('v1/models')
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: '프로바이더별 사용 가능 모델 카탈로그 (10분 캐시)' })
  models() {
    return this.modelCatalog.catalog();
  }

  @Get('v1/usage')
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: '최근 24시간 사용량 요약 + 최근 호출 이력 (SQLite 감사 로그)' })
  usage() {
    return this.service.usage();
  }

  @Post('v1/chat/completions')
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: 'OpenAI 호환 chat completions (model: "auto" | "GROQ" | "GROQ/모델ID", stream 지원)' })
  chatCompletionsEndpoint(@Body() body: any, @Res() res: Response) {
    return this.chatCompletions.handle(body, res);
  }

  @Post('v1/generate')
  @ApiSecurity('apiKey')
  @ApiOperation({ summary: '프롬프트 실행 (provider 미지정 시 AI 자동 라우팅)' })
  generate(@Body() dto: GenerateDto) {
    return this.service.generate(dto);
  }
}
