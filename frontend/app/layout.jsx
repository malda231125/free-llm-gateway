export const metadata = {
  title: 'Awsome AI — Free LLM Chat',
  description: 'free-llm-gateway 기반 무료 AI 채팅. 프롬프트에 맞는 무료 모델로 자동 라우팅됩니다.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: '#0f1117', color: '#e6e6e6', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
