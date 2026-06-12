# Frontend — Awsome AI Chat

free-llm-gateway용 미니멀 채팅 UI (Next.js). https://awsome-ai.com 에 배포되어 있습니다.

- 비밀번호 로그인 게이트 (env `SITE_PASSWORD`, httpOnly 세션 쿠키)
- 멀티 세션 채팅: 목록/새 채팅/삭제, 대화는 PostgreSQL(Prisma, 스키마 `free-llm`)에 저장
- SSE 스트리밍 + 모델 선택(auto/7개 프로바이더) + 답변별 라우팅 배지
- 게이트웨이 API 키는 서버사이드 프록시(`/api/chat`)에만 존재 — 브라우저 비노출

## 환경변수
`SITE_PASSWORD`, `SESSION_SECRET`, `GATEWAY_URL`, `GATEWAY_API_KEY`, `DATABASE_URL` (모두 서버사이드)

## 실행
```bash
npm install
npx prisma db push   # 최초 1회, DATABASE_URL 필요
npm run dev
```
