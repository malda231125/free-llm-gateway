# Free AI Gateway

**프롬프트를 읽고 알맞은 무료 모델로 보내주는 AI 라우팅 게이트웨이.**

[![CI](https://github.com/malda231125/free-ai-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/malda231125/free-ai-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**언어**: [English](README.md) | 한국어

대부분의 무료 티어 통합 도구는 "어느 키가 한도가 남았나"로 돌립니다. 이 게이트웨이는 **프롬프트가 실제로 필요로 하는 것**으로 라우팅합니다: 빠른 AI 라우터(Gemini Flash-Lite)가 요청을 읽고 가장 적합한 무료 모델로 보냅니다 — 속도가 생명인 짧은 작업은 Groq, 번역·복잡한 추론은 Gemini, 코드는 NVIDIA. OpenAI 호환 엔드포인트 하나, 무료 프로바이더 7개, 키별 사용량 추적(요청 수 + 토큰 수), 자동 429 쿨다운과 폴백까지.

- 🧠 **프롬프트 인식 AI 라우팅** — 라운드로빈이 아니라 LLM이 요청마다 적합 모델을 선택
- 🔌 **OpenAI 호환** — OpenAI SDK를 그대로 연결, 스트리밍 지원
- 🔑 **키 풀링** — 프로바이더당 키 여러 개, 한도가 자동으로 늘어남
- 📊 **영속 사용량 추적** — SQLite 감사 로그, 요청·토큰 기준 한도가 재시작 후에도 유지
- 🔍 **약관 투명성** — 7개사 약관을 직접 분석해 [무료 등급에서 누가 내 데이터를 학습하는지](#데이터-정책-한눈-비교-분석일-2026-06-12-기준) 정리

```bash
curl -X POST http://localhost:3000/v1/generate \
  -H 'content-type: application/json' \
  -d '{"prompt": "안녕을 영어로 번역해줘"}'
```

```bash
# 프로바이더 지정
curl -X POST http://localhost:3000/v1/generate \
  -H 'content-type: application/json' \
  -d '{"prompt": "안녕을 영어로 번역해줘", "provider": "GROQ"}'
```

응답 예시:

```json
{
  "provider": "GOOGLE",
  "model": "gemini-2.5-flash",
  "text": "Hello",
  "usage": { "prompt_tokens": 12, "completion_tokens": 2 },
  "latencyMs": 820,
  "gatewayUsage": { "rpm": "1/10", "rpd": "1/1500" },
  "routing": {
    "mode": "auto",
    "recommended": "GOOGLE",
    "reason": "한국어 번역은 종합 품질 최상인 Gemini가 가장 적합합니다.",
    "routerModel": "gemini-2.5-flash-lite",
    "fallbackUsed": false,
    "attempts": []
  }
}
```

## 지원 서비스 및 무료 한도

모두 **카드 등록 없이** 키를 발급받을 수 있습니다. 아래 한도는 2026년 6월 기준 추정치이며, 정확한 최신 한도는 각 서비스 문서를 확인하세요.

| Provider (enum) | 서비스 | 무료 한도 (대략) | 기본 모델 | 키 발급 |
|---|---|---|---|---|
| `GOOGLE` (라우터 겸용) | [Google AI Studio](https://aistudio.google.com) | Flash 계열 일 1,500요청, 100만 토큰 컨텍스트, 멀티모달 | `gemini-2.5-flash` | [발급](https://aistudio.google.com/apikey) |
| `GROQ` | [Groq](https://groq.com) | Llama 70B 분당 30회 / 일 1,000회, 초고속 추론 | `llama-3.3-70b-versatile` | [발급](https://console.groq.com/keys) |
| `CEREBRAS` | [Cerebras](https://cloud.cerebras.ai) | 일 100만 토큰, 초당 2,000토큰(업계 최속) | `gpt-oss-120b` | [발급](https://cloud.cerebras.ai) |
| `MISTRAL` | [Mistral La Plateforme](https://mistral.ai) | 월 10억 토큰 (분당 2회로 느림 — 배치용) | `mistral-small-latest` | [발급](https://console.mistral.ai/api-keys) |
| `NVIDIA` | [NVIDIA Build (NIM)](https://build.nvidia.com) | 가입 시 1,000크레딧(신청 시 최대 5,000), 분당 40회, 대형 오픈모델 다수 | `meta/llama-3.3-70b-instruct` | [발급](https://build.nvidia.com) |
| `OPENROUTER` | [OpenRouter](https://openrouter.ai) | `:free` 모델 일 50회 (잔액 $10 보유 시 일 1,000회) | `google/gemma-4-26b-a4b-it:free` | [발급](https://openrouter.ai/settings/keys) |
| `GITHUB` | [GitHub Models](https://github.com/marketplace/models) | GitHub 계정만으로 GPT-4o-mini 등 100+ 모델 (등급별 일일 한도) | `openai/gpt-4o-mini` | [PAT 발급](https://github.com/settings/tokens) |

### 어떤 걸 골라야 하나

- **품질/일반 용도**: `GOOGLE` — 무료 중 가장 강한 프론티어 모델, 한도도 넉넉
- **속도가 생명**: `GROQ` 또는 `CEREBRAS` — 오픈모델을 전용 하드웨어로 초고속 서빙
- **대량 배치 작업**: `MISTRAL` — 월 10억 토큰이지만 분당 2회 제한
- **대형 오픈모델 실험**: `NVIDIA` — DeepSeek-R1 671B급 모델도 무료 크레딧으로
- **키 발급이 귀찮을 때**: `GITHUB` — 이미 있는 GitHub 토큰으로 바로 사용

## 실행 방법

```bash
npm install
cp .env.example .env   # 사용할 프로바이더의 키만 채우면 됩니다
npm run build
npm start              # http://localhost:3000
```

Swagger 문서: `http://localhost:3000/docs`

환경변수는 `.env.example` 참고. **사용할 프로바이더의 키만 설정하면 됩니다.**
키가 없는 프로바이더를 호출하면 503과 함께 발급 안내 URL을 돌려줍니다.

> dotenv를 따로 안 쓰므로 `.env`는 셸에서 로드하거나(`export $(cat .env | xargs)`),
> 배포 플랫폼(Render, Cloud Run 등)의 환경변수 설정을 사용하세요.

### Docker

```bash
cp .env.example .env   # 키 채우기
docker compose up -d   # http://localhost:3000
```

사용량 데이터는 compose 볼륨으로 `./data`에 영속화됩니다. 수동 빌드: `docker build -t free-ai-gateway . && docker run -p 3000:3000 --env-file .env free-ai-gateway`

## 무료 배포 옵션

이 게이트웨이를 무료로 호스팅하는 검증된 방법들입니다 (2026년 6월 기준):

| 어디에 | 비용 | 슬립/콜드스타트 | 사용량 DB 영속? | 비고 |
|---|---|---|---|---|
| **자기 서버 + [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** | 0원 | 슬립 없음 | ✅ | 종합 최고: `docker compose up -d` 한 줄, 무료 HTTPS 도메인, 서버 IP 비노출 |
| **[Render](https://render.com)** (free) | 0원 | 15분 유휴 시 슬립, 깨우기 30-60초 | ❌ (재배포 시 초기화) | 가장 간단: 레포 연결만, 카드 불필요. 이 레포도 Render에서 구동 중 |
| **[Google Cloud Run](https://cloud.google.com/run)** | 무료 한도 내 0원 | scale-to-zero, 깨우기 1-3초 | ❌ | 월 200만 요청 무료. 카드 필요, Dockerfile은 이미 포함돼 있음 |
| **[Hugging Face Spaces](https://huggingface.co/spaces)** (Docker) | 0원 | 48시간 유휴 시 슬립 | ❌ (영속 스토리지 유료) | 무료 스펙이 의외로 강력: 2 vCPU / 16GB RAM / 50GB 디스크 |
| **[Oracle Cloud Always Free](https://www.oracle.com/cloud/free/)** | 0원 | 슬립 없음 | ✅ | ARM 4코어/24GB VM 평생 무료. 가입 까다롭고 VM 직접 관리 |

무료로 쓰기엔 피할 곳: **Fly.io**(무료 티어 종료 — 신규는 2시간 체험뿐), **Railway**(1회성 $5 크레딧 후 유료).

추천 조합: Render로 공개 데모 URL 유지 + 자기 서버(Tunnel)로 슬립 없는 실사용 인스턴스.

## OpenAI 호환 엔드포인트 (드롭인)

`POST /v1/chat/completions`는 표준 OpenAI 프로토콜을 그대로 지원합니다 — 멀티턴 `messages`, `temperature`, `stream` 등. OpenAI SDK의 base_url만 게이트웨이로 바꾸면 코드 수정 없이 동작합니다:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-gateway.example.com/v1",
    api_key="게이트웨이_API_키",  # Bearer로 전송됨, x-api-key 헤더도 허용
)

resp = client.chat.completions.create(
    model="auto",  # "auto"=AI 라우팅 | "GROQ"=프로바이더 기본 모델 | "GROQ/llama-3.3-70b-versatile"=정확히 지정
    messages=[{"role": "user", "content": "안녕을 프랑스어로 번역해줘"}],
)
print(resp.choices[0].message.content)
```

- `model: "auto"`(또는 생략) → AI 라우터가 프롬프트에 맞는 프로바이더 선택
- `model: "GROQ"` → 해당 프로바이더 기본 모델, `model: "PROVIDER/모델ID"` → 정확히 지정
- `stream: true` → 업스트림 SSE 패스스루 (자동 라우팅과 조합 가능)
- 응답은 표준 OpenAI 형식 + `gateway` 메타 필드(사용된 프로바이더, 라우팅 이유, 폴백 이력) — OpenAI 클라이언트는 이 필드를 무시하므로 안전합니다

## API

### `POST /v1/generate`

| 필드 | 필수 | 설명 |
|---|---|---|
| `prompt` | O | 모델에 전달할 프롬프트 |
| `provider` | X | `GOOGLE` `GROQ` `CEREBRAS` `MISTRAL` `NVIDIA` `OPENROUTER` `GITHUB` (미지정 시 AI 자동 라우팅) |
| `model` | X | 프로바이더 기본 모델 대신 사용할 모델 ID |

### `GET /v1/providers`

프로바이더별 키 수, 게이트웨이 한도, 현재 사용량을 반환합니다.

### `GET /v1/usage`

최근 24시간 프로바이더별 통계(호출/토큰/평균 지연)와 최근 감사 로그 20건을 반환합니다.

### `GET /health`

헬스체크.

## AI 스마트 라우팅 (provider 미지정 시)

1. **후보 선정** — API 키가 설정돼 있고 게이트웨이 한도가 남은 프로바이더만 후보로 추립니다.
2. **AI 추천** — 빠른 모델(`gemini-2.5-flash-lite`)에게 후보 목록(모델별 강점 설명 포함)과 사용자 프롬프트를 주고 가장 적합한 프로바이더를 JSON으로 추천받습니다. 이 호출도 구글 한도로 카운트됩니다.
3. **호출 + 폴백** — 추천 프로바이더를 호출하고, 실패(업스트림 혼잡 등)하면 나머지 후보를 정적 우선순위로 순차 시도합니다.
4. **안전장치** — 라우터 호출이 실패하거나 구글 한도가 없으면 AI 추천을 건너뛰고 정적 우선순위(GOOGLE → GROQ → CEREBRAS → NVIDIA → GITHUB → OPENROUTER → MISTRAL)로 동작합니다.
5. 응답의 `routing` 블록에 추천 모델·이유·폴백 이력이 투명하게 담깁니다.

`provider`를 명시하면 라우팅 없이 해당 프로바이더를 직접 호출합니다(`routing.mode: "manual"`).

## 내장 한도 관리 & 영속화

게이트웨이가 **프로바이더×키 단위로 분당/일간 요청 수와 일간 토큰 수를 카운트**해서(실제 한도가 토큰 기준인 Groq·Cerebras·Mistral은 토큰 상한 적용), 무료 한도를 넘기 전에 429로 차단하고 재시도 가능 시각을 알려줍니다. 모든 호출은 **SQLite 감사 로그**(프로바이더/키/모델/상태/지연시간/토큰)에 기록되고 카운터도 이 기록에서 계산되므로, **재시작·슬립 후에도 사용량이 유지**됩니다. SQLite를 못 쓰는 환경에선 인메모리로 폴백합니다. 데이터는 `./data/usage.db`에 저장됩니다(`GATEWAY_DATA_DIR`로 변경 가능). 한도 값은 [`src/generate/providers.config.ts`](src/generate/providers.config.ts)에서 조정할 수 있습니다.

`GET /v1/usage`로 최근 24시간 프로바이더별 호출 수/토큰/평균 지연시간과 최근 호출 20건을 언제든 확인할 수 있습니다.

## 키 풀링 (무료 한도 늘리기)

프로바이더당 **키 여러 개**를 쉼표로 등록할 수 있습니다:

```bash
GROQ_API_KEY="gsk_키1,gsk_키2,gsk_키3"
```

- 한도가 키 수만큼 늘어납니다: Groq 키 3개면 게이트웨이 기준 분당 90회 / 일 3,000회
- 키마다 사용량을 따로 추적해서 여유 있는 키를 라운드로빈으로 선택합니다
- 업스트림이 429를 주면 **그 키만 쿨다운**(retry-after 존중)되고 다음 키가 즉시 이어받습니다

## 동작 원리

7개 서비스 모두 OpenAI 호환 `chat/completions` 엔드포인트를 제공하기 때문에, 어댑터 하나로 통합됩니다. 프로바이더별로 베이스 URL / 키 / 기본 모델만 다릅니다.

## Google 약관/정책 요약 (기본 프로바이더 관련)

기본값인 `GOOGLE` 사용 시 적용·연관되는 문서 3종의 핵심 요약입니다 (**분석일: 2026-06-12**).
요약은 참고용이며, 정확한 내용은 반드시 각 원문을 확인하세요.

### 1) Gemini API 추가 서비스 약관

원문: [Gemini API 추가 서비스 약관](https://ai.google.dev/gemini-api/terms?hl=ko) (게시 기준 2025-04-03 업데이트본)

- **무료 등급은 데이터가 학습에 사용됩니다.** 무료(unpaid) 서비스에 제출한 프롬프트와 응답은 구글 제품 개선(모델 학습 포함)에 사용되며, 인적 검토자가 입력/출력을 읽고 처리할 수 있습니다. **민감정보·기밀·개인정보를 무료 등급에 넣지 마세요.** 이 게이트웨이로 업무 데이터를 다룬다면 유료 등급 키 사용을 권장합니다.
- **유료 등급은 학습에 사용하지 않습니다.** 프롬프트/응답을 제품 개선에 쓰지 않고, 정책 위반 감지 등 제한된 목적으로만 일정 기간 보관합니다.
- **연령/지역 제한**: 만 18세 이상만 사용 가능하고, 18세 미만 대상 서비스에 쓸 수 없습니다. 유럽경제지역(EEA)·영국·스위스 사용자는 무료 등급을 쓸 수 없으며(유료 서비스만 제공), 대신 무료 제공분에도 유료 수준의 데이터 보호가 적용됩니다.
- **금지 사항**: 경쟁 모델 개발에 사용 금지, 모델/데이터 리버스 엔지니어링·복제 금지, 안전장치 우회 금지, 금지된 사용 정책(Prohibited Use Policy) 준수 의무.
- **전문 분야 사용 제한**: 의료(임상 자문)·정신건강·법률·재무 등 전문가 조언 대체 용도 사용 금지. 의료기기 규제 감독 대상 방식의 사용 금지.
- **생성물 권리**: 구글은 출력물의 소유권을 주장하지 않지만, 다른 사용자에게 동일·유사한 콘텐츠를 생성할 권리를 보유합니다. 생성물 사용·공유에 대한 책임은 개발자에게 있으며, 법규에 따라 출처 인용 의무가 생길 수 있습니다.
- **기타**: Google 검색 그라운딩 결과는 캐시·복제·학습 사용 금지(프롬프트 30일 보관 등 별도 조건), 가격은 게시 30일 후 변경 적용 가능. Vertex AI(GCP) 경유 사용 시에는 이 약관이 아닌 GCP 약관이 적용됩니다.

### 2) Google Cloud 스타터 등급(Starter Tier) 추가 서비스 약관

원문: [Starter Tier Additional Terms of Service](https://cloud.google.com/terms/starter-tier-additional-terms-of-service?hl=ko) (최종 수정 2026-05-11)

- **GCP가 아닙니다.** 스타터 등급(ST Offerings)은 Google Cloud Platform 서비스가 아니며, GCP 약관이 아니라 일반 Google ToS + 이 추가약관의 적용을 받습니다. 회사가 GCP 계약을 맺고 있어도 그 조직이 스타터 등급 계정을 관리하지 못합니다.
- **데이터 처리가 무료 AI Studio보다 보수적입니다.** 제출 콘텐츠와 생성 응답("Your Content")은 DPA(데이터 처리 부속약정)에 따라 처리됩니다. 계정/결제/사용량 등 운영 데이터는 개인정보처리방침 기준으로 수집됩니다.
- **자격**: 만 18세 이상 + **업무 목적(trade/business/professional) 전용**. 개인 소비자 용도는 약관상 범위 밖입니다.
- **금지 사항**: 고위험 활동(생명·안전 관련), AUP 위반, 쿼터 우회, 암호화폐 채굴, 전화망(PSTN) 연결 서비스, ITAR 대상 자료, 수출통제 위반, BAA 없는 HIPAA 의료정보 처리, ST 서비스의 복제·수정·파생물 제작.
- **AI 에이전트 책임**: 에이전트의 구성·권한 부여·감독과 에이전트가 수행한(또는 못한) 모든 행위의 책임은 사용자에게 있습니다.
- **운영 리스크**: 구글이 30일 예고로 스타터 등급 자체를 종료하거나 변경할 수 있고, 보안 사유 등으로는 즉시 정지될 수 있습니다. 제3자 콘텐츠 호스팅 플랫폼이면 금지 콘텐츠 정책 게시 + 신고 채널 운영 의무가 있습니다.

### 3) Google 개인정보처리방침

원문: [Google Privacy Policy](https://policies.google.com/privacy?hl=en) (발효 2026-05-26)

- **수집 항목**: 계정 정보, 생성·업로드 콘텐츠, 기기 정보(고유 식별자/브라우저/OS), 활동 정보(검색어, 시청 기록, 구매, 위치(GPS/IP), 통화·메시지 로그 등). 서비스 이용 전반이 수집 대상입니다.
- **사용 목적**: 서비스 제공·유지·개선, 신규 개발, 개인 맞춤화, 성과 측정, 사기·악용 방지 등 6대 목적.
- **사용자 통제 수단**: My Activity에서 활동 조회·삭제, 자동 삭제 주기 설정, Google Takeout으로 데이터 내보내기, 광고 설정, 프라이버시 진단. 계정·서비스 단위 삭제 가능.
- **제3자 제공**: 원칙적으로 동의 기반. 예외는 법적 요청, 도메인 관리자(Workspace 등), 위탁 처리업체. **이름·이메일 등 개인 식별 정보를 광고주에게 팔지 않는다고 명시**.
- **보관**: 데이터 유형별 상이 — 즉시 삭제 가능 / 일정 기간 후 자동 삭제·익명화 / 계정 삭제 시까지 / 보안·법적 목적의 장기 보관.
- **한국 거주자**: 한국 거주자용 추가 고지가 별도로 있습니다 ([링크](https://policies.google.com/privacy/additional?hl=ko)).
- **개발자 관점**: 이 방침은 일반 정책이라 API별 세부 사항은 다루지 않으므로, Gemini API는 위 1)번 약관이 데이터 취급의 실질 기준입니다.

## NVIDIA 약관/정책 요약 (`NVIDIA` 프로바이더 관련)

`NVIDIA`(build.nvidia.com) 가입 시 적용되는 문서 2종의 핵심 요약입니다 (**분석일: 2026-06-12**).
요약은 참고용이며, 정확한 내용은 반드시 각 원문을 확인하세요.

### 1) NVIDIA 계정(NV Account) 사용 약관

원문: [NVIDIA 계정 약관](https://www.nvidia.com/ko-kr/about-nvidia/nv-accounts/) (최종 갱신 2019-03-26)

- **계정은 "있는 그대로(as-is)" 제공**: 가용성·보안·무오류를 보증하지 않으며, NVIDIA는 언제든 어떤 이유로든 계정 권한을 취소할 수 있습니다. 데이터 영구 보존이나 분실 시 사본 제공도 보장하지 않으므로 **중요 데이터는 직접 백업**해야 합니다.
- **책임 한도 미화 $100**: 어떤 손해든 NVIDIA의 총 배상 책임이 미화 100달러로 제한됩니다.
- **피드백 권리 양도**: NVIDIA에 보낸 의견·아이디어·제안("피드백")의 모든 권리는 NVIDIA에 양도되며, 유사한 아이디어가 사용돼도 청구권을 포기하는 조항이 있습니다. 핵심 기술 아이디어를 피드백 채널로 보내지 마세요.
- **금지**: 무단 접근, 불법 사용, 사전 서면 승인 없는 계정 판매·임대·양도·상업적 이용.
- **분쟁**: 델라웨어주법 준거, 캘리포니아 산타클라라 카운티 JAMS 구속력 있는 중재(신청료 $250), 소송 대신 중재가 기본입니다.
- **약관 변경**: NVIDIA 단독 재량으로 변경 가능. 계정 서비스별 추가 약관·추가 비용이 있을 수 있습니다.
- 참고: 이 문서는 계정 일반 약관이고, NIM API(build.nvidia.com) 사용에는 별도의 서비스 평가 약관이 추가 적용될 수 있습니다.

### 2) NVIDIA 개인정보처리방침

원문: [NVIDIA Privacy Policy](https://www.nvidia.com/ko-kr/about-nvidia/privacy-policy/) (발효 2025-09-22)

- **수집 항목**: 계정 정보(이름/이메일/생년월일/IP/로그인 활동), 웹 방문 정보(IP, 마우스 움직임 포함), 소프트웨어·하드웨어·네트워크 구성, 오류/충돌 데이터, 챗봇 대화 메시지 등. 공개 출처에서 영업 목적의 개인 데이터 수집(리드 생성)도 명시돼 있습니다.
- **API 프롬프트의 학습 사용 여부는 이 문서에 명시가 없습니다.** AV/AI 연구 데이터(차량 주변 영상 등)는 해당 프로젝트 목적으로만 쓴다고 한정하지만, NIM API 입력 데이터 처리는 별도 서비스 약관을 확인해야 합니다.
- **판매/공유**: 캘리포니아법상 "민감한 개인정보"는 판매·공유하지 않는다고 명시. 다만 해시 처리된 이름/이메일/직무 등을 광고사(Google 등)와 공유하고, 리드 보강 업체(6Sense 등)와도 공유합니다.
- **보관**: 교류가 지속되는 동안 보관, 5년 이상 무활동 시 삭제.
- **사용자 권리**: NVIDIA Privacy Center 또는 privacy@nvidia.com 으로 열람·수정·삭제·판매 거부 행사 가능, 행사에 따른 차별 금지.
- **국외 이전**: 미국으로 이전(SCC, EU-미국 DPF 근거). 미국 법 집행기관 공유 가능성 명시. 한국 개인정보보호법 관련 별도 조항은 없습니다.
- **연령**: 13세 미만 사용 대상 아님, 16세 미만 관심 기반 광고 제한.

## OpenRouter 약관/정책 요약 (`OPENROUTER` 프로바이더 관련)

`OPENROUTER` 사용 시 적용되는 문서 3종의 핵심 요약입니다 (**분석일: 2026-06-12**).
요약은 참고용이며, 정확한 내용은 반드시 각 원문을 확인하세요.

### 1) 이용약관

원문: [OpenRouter Terms of Service](https://openrouter.ai/terms) (최종 수정 2026-05-06)

- **프롬프트의 학습 사용은 "하위 모델 프로바이더별"로 다릅니다.** OpenRouter는 가능한 곳에서는 학습을 옵트아웃했다고 하지만, 일부 모델은 자체 약관(Model Terms)에 따라 입력을 저장·학습할 수 있고, 각 모델 약관 확인 책임은 사용자에게 있습니다.
- **프롬프트 로깅을 옵트인하면 권리 범위가 큽니다**: 사용자 콘텐츠의 호스팅·복제·수정 라이선스에 더해 **익명화 형태의 판매까지 허용**됩니다. 로깅 옵트인은 신중히 결정하세요. (입력을 익명화해 분류·메트릭에 쓰되 분류 후 저장하지 않는다는 조항은 별도)
- **크레딧**: 1회 $5-$25,000, 미사용 크레딧 환불은 결제 후 24시간 이내만, 암호화폐 결제는 환불 불가, 구매 365일 후 만료될 수 있음.
- **금지**: 다중 계정으로 무료 한도 우회, API 접근 재판매·경쟁 서비스 개발, 스크래핑, 사전 승인 없는 모델 레드티밍, VPN으로 제한 모델(Restricted Models) 우회(즉시 정지 사유), 리버스 엔지니어링.
- **책임 한도**: 최근 12개월 결제액 또는 $100 중 큰 금액. 출력물의 정확성·품질은 보증하지 않으며 인적 검토 의무는 사용자에게.
- **분쟁**: 뉴욕주법, AAA 강제 중재, 배심·집단소송 포기. 피드백은 OpenRouter가 무제한·영구적으로 사용 가능.

### 2) 개인정보처리방침

원문: [OpenRouter Privacy Policy](https://openrouter.ai/privacy) (최종 수정 2025-04-15)

- 프롬프트/응답 취급은 약관 5조(위 1번)로 위임되며, **하위 LLM 프로바이더가 입력을 학습에 쓰는지에 대해 OpenRouter는 통제·책임지지 않는다고 명시** — 각 프로바이더 약관을 직접 확인해야 합니다.
- 보관 기간은 "합리적으로 필요한 기간"으로만 명시(구체적 기간 없음). 삭제·열람 요청은 privacy@openrouter.ai.
- 데이터는 미국 등 국외 서버로 이전될 수 있고(SCC 근거), 13세 이상 사용 가능.

### 3) 프로바이더 라우팅 문서 — 데이터 보호 옵션 (실전 중요)

원문: [Provider Selection 가이드](https://openrouter.ai/docs/guides/routing/provider-selection)

- 기본 라우팅은 가격 기반 로드밸런싱(최근 30초 장애 없는 프로바이더 중 저가 우선)이며, 요청마다 어느 하위 프로바이더로 갈지 바뀔 수 있습니다.
- **`provider.data_collection: "deny"`**: 입력을 저장·학습에 쓰는 프로바이더를 라우팅에서 제외합니다 (기본값 "allow"!).
- **`provider.zdr: true`**: Zero Data Retention(무보관) 엔드포인트로만 라우팅.
- `order`/`only`/`ignore`로 특정 프로바이더 고정·제외, `max_price`로 가격 상한 강제 가능.
- **시사점**: OpenRouter에서 민감한 데이터를 다룬다면 `data_collection: "deny"` + `zdr: true`를 켜는 것이 사실상 필수입니다. 기본값은 보호가 꺼진 상태입니다.

## Groq · Cerebras · Mistral · GitHub Models 약관/정책 요약

나머지 4개 프로바이더의 핵심 요약입니다 (**분석일: 2026-06-12**). 요약은 참고용이며, 정확한 내용은 반드시 각 원문을 확인하세요.

### Groq

원문: [이용약관](https://groq.com/terms-of-use) (2025-10-15) · [개인정보처리방침](https://groq.com/privacy-policy) (2025-11-12) · [Your Data in GroqCloud](https://console.groq.com/docs/your-data) · [Services Agreement](https://console.groq.com/docs/legal/services-agreement)

- **무료 프로바이더 중 데이터 정책이 가장 좋은 편입니다.** 고객이 명시적으로 허용하지 않는 한 입력/출력을 모델 학습·파인튜닝에 사용할 수 없다고 Services Agreement에 명시돼 있습니다.
- **추론 요청은 기본적으로 보관하지 않습니다.** 장애 해결·악용 조사 시에만 최대 30일 로깅하며, 콘솔 Data Controls에서 **ZDR(Zero Data Retention)**을 켤 수 있습니다.
- 입력/출력의 지식재산권은 고객이 보유합니다.
- 웹사이트 약관 기준 책임 한도 미화 $100, 캘리포니아법 준거(산타클라라 카운티 관할).

### Cerebras

원문: [개인정보처리방침](https://www.cerebras.ai/privacy-policy) · [요금/무료 한도](https://www.cerebras.ai/pricing)

- 개인정보처리방침에 **추론 서비스의 입력/출력을 보관하지 않으며**, 서비스 제공에 불필요해진 로그는 삭제한다고 명시돼 있습니다.
- 무료 등급: 일 100만 토큰, 분당 30요청 수준(카드 불필요). 업계 최속(초당 2,000토큰급) 추론이 강점입니다.
- 무료 등급의 모델 카탈로그가 자주 바뀌니(`/v1/models`로 확인) 모델 404가 나면 기본 모델을 갱신하세요.

### Mistral (La Plateforme)

원문: [법률 센터](https://legal.mistral.ai/terms) (2025-11-28) · [개인정보처리방침](https://legal.mistral.ai/terms/privacy-policy) (발효 2026-04-08)

- **유료 API는 입력/출력을 학습에 사용하지 않는다고 명시**돼 있습니다 ("we do not use your Input and Output to train ... the paid version of our APIs").
- 뒤집어 말하면 **무료 등급(Experiment 플랜)은 이 보장의 대상이 아닙니다.** 무료 등급은 데이터 학습 활용 동의가 조건일 수 있으니 민감 데이터를 넣지 마세요. (Le Chat 무료는 계정 설정에서 학습 사용 거부 가능)
- 보관: 일반 API 입력/출력은 생성 후 30일, 에이전트 API는 계정 종료 시까지.
- EU 업체 우선 사용 원칙(GDPR), 사용자 권리(접근·삭제·거부 등) 폭넓게 보장. 음성 복제 금지, 사용 정책(Usage Policy) 준수 의무.

### GitHub Models

원문: [추가 제품 약관](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) · [Responsible Use of GitHub Models](https://docs.github.com/en/github-models/responsible-use-of-github-models)

- 약관상 GitHub Models 조항은 짧습니다: **"모델을 호스팅하는 회사의 약관과 모델 라이선스가 적용된다"** — 즉 데이터의 학습 사용 여부가 GitHub 차원에서 보장되지 않고 모델별(OpenAI 등 호스팅사)로 다릅니다.
- **프로덕션 용도가 아닙니다.** 공식 문서에 "학습·실험·개념 증명(PoC) 활동용으로 설계되었고 프로덕션 사용 사례용이 아니다"라고 명시돼 있습니다.
- 끌 수 없는 콘텐츠 필터가 항상 적용되며, 무료 한도는 분당/일간/토큰/동시성 등 여러 축으로 제한됩니다(구체 수치는 모델 등급별 상이).

## 데이터 정책 한눈 비교 (분석일 2026-06-12 기준)

| Provider | 무료 등급 입력의 학습 사용 | 비고 |
|---|---|---|
| Google AI Studio | **사용함** (명시) | 유료 등급은 미사용 명시 |
| Groq | **사용 안 함** (명시) | 기본 무보관 + ZDR 옵션 |
| Cerebras | 사용 안 함으로 해석 (입출력 미보관 명시) | |
| Mistral | 유료만 미사용 보장 — **무료는 보장 없음** | 보관 30일 |
| NVIDIA | **불명** (공개 문서에 명시 없음) | 공개 데이터 실험용 권장 |
| OpenRouter | 하위 프로바이더별 상이 | `data_collection: "deny"` + `zdr: true` 권장 |
| GitHub Models | 모델 호스팅사별 상이 | 프로덕션 용도 금지 |

## License

MIT
