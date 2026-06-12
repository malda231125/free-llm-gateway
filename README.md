# Free AI Gateway

무료로 제공되는 AI API들을 **하나의 엔드포인트**로 묶어주는 NestJS 게이트웨이입니다.
프롬프트 하나만 보내면 되고, 원하는 서비스를 enum으로 골라 쓸 수 있습니다. 따로 지정하지 않으면 Google Gemini를 사용합니다.

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
  "model": "gemini-3.5-flash",
  "text": "Hello",
  "usage": { "prompt_tokens": 12, "completion_tokens": 2 },
  "latencyMs": 820,
  "gatewayUsage": { "rpm": "1/10", "rpd": "1/1500" }
}
```

## 지원 서비스 및 무료 한도

모두 **카드 등록 없이** 키를 발급받을 수 있습니다. 아래 한도는 2026년 6월 기준 추정치이며, 정확한 최신 한도는 각 서비스 문서를 확인하세요.

| Provider (enum) | 서비스 | 무료 한도 (대략) | 기본 모델 | 키 발급 |
|---|---|---|---|---|
| `GOOGLE` (기본값) | [Google AI Studio](https://aistudio.google.com) | Flash 계열 일 1,500요청, 100만 토큰 컨텍스트, 멀티모달 | `gemini-3.5-flash` | [발급](https://aistudio.google.com/apikey) |
| `GROQ` | [Groq](https://groq.com) | Llama 70B 분당 30회 / 일 1,000회, 초고속 추론 | `llama-3.3-70b-versatile` | [발급](https://console.groq.com/keys) |
| `CEREBRAS` | [Cerebras](https://cloud.cerebras.ai) | 일 100만 토큰, 초당 2,000토큰(업계 최속) | `llama-3.3-70b` | [발급](https://cloud.cerebras.ai) |
| `MISTRAL` | [Mistral La Plateforme](https://mistral.ai) | 월 10억 토큰 (분당 2회로 느림 — 배치용) | `mistral-small-latest` | [발급](https://console.mistral.ai/api-keys) |
| `NVIDIA` | [NVIDIA Build (NIM)](https://build.nvidia.com) | 가입 시 1,000크레딧(신청 시 최대 5,000), 분당 40회, 대형 오픈모델 다수 | `meta/llama-3.3-70b-instruct` | [발급](https://build.nvidia.com) |
| `OPENROUTER` | [OpenRouter](https://openrouter.ai) | `:free` 모델 일 50회 (잔액 $10 보유 시 일 1,000회) | `meta-llama/llama-3.3-70b-instruct:free` | [발급](https://openrouter.ai/settings/keys) |
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

## API

### `POST /v1/generate`

| 필드 | 필수 | 설명 |
|---|---|---|
| `prompt` | O | 모델에 전달할 프롬프트 |
| `provider` | X | `GOOGLE` `GROQ` `CEREBRAS` `MISTRAL` `NVIDIA` `OPENROUTER` `GITHUB` (기본 `GOOGLE`) |
| `model` | X | 프로바이더 기본 모델 대신 사용할 모델 ID |

### `GET /v1/providers`

프로바이더별 키 설정 여부, 게이트웨이 한도, 현재 사용량을 반환합니다.

### `GET /health`

헬스체크.

## 내장 한도 관리

게이트웨이가 프로바이더별 **분당/일간 요청 수를 자체 카운트**해서, 무료 한도를 넘기 전에 429로 차단하고 재시도 가능 시각을 알려줍니다. 카운터는 인메모리라 재시작 시 초기화됩니다(개인/소규모 사용 전제). 한도 값은 [`src/generate/providers.config.ts`](src/generate/providers.config.ts)에서 조정할 수 있습니다.

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

> 다른 프로바이더(Groq, Cerebras, Mistral, OpenRouter, GitHub Models)도 각자 약관이 있으며, 특히 **무료 등급의 데이터 학습 사용 여부**는 서비스마다 다르니 민감한 데이터를 다루기 전에 각 약관을 확인하세요.

## License

MIT
