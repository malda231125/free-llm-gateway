import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CallRecord {
  provider: string;
  keyIndex: number;
  model: string;
  endpoint: 'generate' | 'chat' | 'router' | 'embeddings';
  status: 'ok' | 'error';
  httpStatus?: number | null;
  latencyMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  error?: string | null;
}

/**
 * 호출 기록을 SQLite에 영속화하고, 분당/일간 카운터를 기록에서 계산한다.
 * (재시작/슬립 후에도 사용량 유지) SQLite를 못 열면 인메모리로 폴백한다.
 */
@Injectable()
export class UsageStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(UsageStoreService.name);
  private db: any = null;
  private memory: Array<{ ts: number; provider: string; keyIndex: number }> = [];

  constructor() {
    try {
      const dataDir = process.env.GATEWAY_DATA_DIR || path.resolve(process.cwd(), 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require('better-sqlite3');
      this.db = new Database(path.join(dataDir, 'usage.db'));
      this.db.pragma('journal_mode = WAL');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          provider TEXT NOT NULL,
          key_idx INTEGER NOT NULL DEFAULT 0,
          model TEXT,
          endpoint TEXT,
          status TEXT,
          http_status INTEGER,
          latency_ms INTEGER,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_calls_provider_ts ON calls(provider, ts);
      `);
    } catch (error) {
      this.logger.warn(`SQLite unavailable, falling back to in-memory usage tracking: ${error instanceof Error ? error.message : error}`);
      this.db = null;
    }
  }

  onModuleDestroy() {
    this.db?.close?.();
  }

  isPersistent() {
    return Boolean(this.db);
  }

  record(entry: CallRecord) {
    const ts = Date.now();
    if (this.db) {
      this.db
        .prepare(`INSERT INTO calls (ts, provider, key_idx, model, endpoint, status, http_status, latency_ms, prompt_tokens, completion_tokens, error)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(ts, entry.provider, entry.keyIndex, entry.model, entry.endpoint, entry.status,
          entry.httpStatus ?? null, entry.latencyMs ?? null, entry.promptTokens ?? null, entry.completionTokens ?? null,
          entry.error ? String(entry.error).slice(0, 300) : null);
    } else {
      this.memory.push({ ts, provider: entry.provider, keyIndex: entry.keyIndex });
      if (this.memory.length > 50_000) this.memory.splice(0, 10_000);
    }
  }

  countSince(provider: string, keyIndex: number, sinceMs: number): number {
    if (this.db) {
      const row = this.db
        .prepare('SELECT count(*) AS c FROM calls WHERE provider = ? AND key_idx = ? AND ts >= ?')
        .get(provider, keyIndex, sinceMs);
      return Number(row?.c || 0);
    }
    return this.memory.filter((m) => m.provider === provider && m.keyIndex === keyIndex && m.ts >= sinceMs).length;
  }

  tokensSince(provider: string, keyIndex: number, sinceMs: number): number {
    if (this.db) {
      const row = this.db
        .prepare('SELECT sum(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) AS t FROM calls WHERE provider = ? AND key_idx = ? AND ts >= ?')
        .get(provider, keyIndex, sinceMs);
      return Number(row?.t || 0);
    }
    return 0; // 인메모리 폴백은 토큰 미추적 (요청 수 한도만 적용)
  }

  tokensProviderSince(provider: string, sinceMs: number): number {
    if (this.db) {
      const row = this.db
        .prepare('SELECT sum(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)) AS t FROM calls WHERE provider = ? AND ts >= ?')
        .get(provider, sinceMs);
      return Number(row?.t || 0);
    }
    return 0;
  }

  countProviderSince(provider: string, sinceMs: number): number {
    if (this.db) {
      const row = this.db.prepare('SELECT count(*) AS c FROM calls WHERE provider = ? AND ts >= ?').get(provider, sinceMs);
      return Number(row?.c || 0);
    }
    return this.memory.filter((m) => m.provider === provider && m.ts >= sinceMs).length;
  }

  summary() {
    if (!this.db) return { persistent: false, note: 'in-memory mode (SQLite unavailable)' };
    const dayStart = Date.now() - 86_400_000;
    const perProvider = this.db
      .prepare(`SELECT provider, count(*) AS calls,
                       sum(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok,
                       sum(COALESCE(prompt_tokens,0)) AS prompt_tokens,
                       sum(COALESCE(completion_tokens,0)) AS completion_tokens,
                       round(avg(latency_ms)) AS avg_latency_ms
                FROM calls WHERE ts >= ? GROUP BY provider ORDER BY calls DESC`)
      .all(dayStart);
    const recent = this.db
      .prepare(`SELECT ts, provider, key_idx, model, endpoint, status, http_status, latency_ms, prompt_tokens, completion_tokens, error
                FROM calls ORDER BY id DESC LIMIT 20`)
      .all()
      .map((r: any) => ({ ...r, at: new Date(r.ts).toISOString() }));
    return { persistent: true, last24h: perProvider, recent };
  }
}
