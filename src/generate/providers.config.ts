export enum AiProvider {
  GOOGLE = 'GOOGLE',
  GROQ = 'GROQ',
  CEREBRAS = 'CEREBRAS',
  MISTRAL = 'MISTRAL',
  NVIDIA = 'NVIDIA',
  OPENROUTER = 'OPENROUTER',
  GITHUB = 'GITHUB',
}

export interface ProviderConfig {
  /** OpenAI 호환 chat/completions 베이스 URL */
  baseUrl: string;
  /** API 키를 읽을 환경변수 이름 */
  apiKeyEnv: string;
  /** model 미지정 시 사용할 무료 등급 기본 모델 */
  defaultModel: string;
  /** 게이트웨이 자체 한도(보수적 추정치, 키 1개 기준). 실제 한도는 각 서비스 문서 기준. tpd = 일간 토큰. */
  limits: { rpm: number; rpd: number; tpd?: number };
  /** 키 발급 안내 URL */
  signupUrl: string;
  /** AI 라우터에게 제공할 모델 특성 설명 */
  description: string;
  /** 요청에 추가로 필요한 헤더 */
  extraHeaders?: Record<string, string>;
  /** 무료 임베딩 지원 시 기본 임베딩 모델 */
  embeddingModel?: string;
}

export const PROVIDERS: Record<AiProvider, ProviderConfig> = {
  [AiProvider.GOOGLE]: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GOOGLE_AI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    limits: { rpm: 10, rpd: 1500 },
    signupUrl: 'https://aistudio.google.com/apikey',
    embeddingModel: 'gemini-embedding-001',
    description: '구글 Gemini Flash. 종합 품질 최상, 멀티모달/긴 컨텍스트(100만 토큰), 한국어 우수. 복잡한 추론·번역·요약·일반 질문에 최적.',
  },
  [AiProvider.GROQ]: {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    limits: { rpm: 30, rpd: 1000, tpd: 100_000 },
    signupUrl: 'https://console.groq.com/keys',
    description: 'Llama 3.3 70B를 초고속(200ms급) 서빙. 짧은 답변·실시간성이 중요한 작업·간단한 질문에 최적. 한국어 보통.',
  },
  [AiProvider.CEREBRAS]: {
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    defaultModel: 'gpt-oss-120b',
    limits: { rpm: 30, rpd: 1000, tpd: 1_000_000 },
    signupUrl: 'https://cloud.cerebras.ai',
    description: '오픈 모델(gpt-oss-120b)을 업계 최속(초당 2,000토큰)으로 서빙. 긴 출력 생성을 빠르게 받을 때 최적. 혼잡 잦음.',
  },
  [AiProvider.MISTRAL]: {
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-small-latest',
    limits: { rpm: 2, rpd: 1000, tpd: 30_000_000 },
    signupUrl: 'https://console.mistral.ai/api-keys',
    embeddingModel: 'mistral-embed',
    description: 'Mistral Small. 분당 2회 제한으로 느리지만 월 한도가 매우 큼. 급하지 않은 배치성 작업에 적합. 유럽어 강점.',
  },
  [AiProvider.NVIDIA]: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    limits: { rpm: 40, rpd: 5000 },
    signupUrl: 'https://build.nvidia.com',
    embeddingModel: 'nvidia/nv-embedqa-e5-v5',
    description: 'Llama 3.3 70B 등 대형 오픈모델. 무료 크레딧 소모형. 코드·기술 질문에 무난.',
  },
  [AiProvider.OPENROUTER]: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'google/gemma-4-26b-a4b-it:free',
    limits: { rpm: 20, rpd: 50 },
    signupUrl: 'https://openrouter.ai/settings/keys',
    description: '여러 무료 오픈모델 중계(현재 Gemma 4). 가용성 변동 큼. 다른 후보가 없을 때 차선.',
  },
  [AiProvider.GITHUB]: {
    baseUrl: 'https://models.github.ai/inference',
    apiKeyEnv: 'GITHUB_TOKEN',
    defaultModel: 'openai/gpt-4o-mini',
    limits: { rpm: 15, rpd: 150 },
    signupUrl: 'https://github.com/settings/tokens',
    embeddingModel: 'openai/text-embedding-3-small',
    description: 'GPT-4o-mini. OpenAI 계열 품질, 영어/코드 강점. 일일 한도 낮아 아껴 쓰는 게 좋음.',
  },
};

export const DEFAULT_PROVIDER = AiProvider.GOOGLE;
