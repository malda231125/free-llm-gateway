import { Module } from '@nestjs/common';
import { GenerateController } from './generate/generate.controller';
import { GenerateService } from './generate/generate.service';
import { ChatCompletionsService } from './generate/chat-completions.service';
import { EmbeddingsService } from './generate/embeddings.service';
import { ModelRouterService } from './generate/model-router.service';
import { ModelCatalogService } from './generate/model-catalog.service';
import { RateLimiterService } from './generate/rate-limiter.service';
import { KeyPoolService } from './generate/key-pool.service';
import { UsageStoreService } from './generate/usage-store.service';

@Module({
  controllers: [GenerateController],
  providers: [GenerateService, ChatCompletionsService, EmbeddingsService, ModelRouterService, ModelCatalogService, RateLimiterService, KeyPoolService, UsageStoreService],
})
export class AppModule {}
