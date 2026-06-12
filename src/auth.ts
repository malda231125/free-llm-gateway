import { timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** DOCS_USER/DOCS_PASSWORD 설정 시 Swagger 경로를 Basic Auth로 보호 */
export function docsBasicAuth(user: string, password: string) {
  const expected = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  return (req, res, next) => {
    if (safeEqual(String(req.headers.authorization || ''), expected)) return next();
    res.set('WWW-Authenticate', 'Basic realm="docs"');
    res.status(401).send('Authentication required');
  };
}

/** GATEWAY_API_KEY 설정 시 /v1/* 호출에 x-api-key 헤더 검증 */
export function apiKeyAuth(apiKey: string) {
  return (req, res, next) => {
    if (safeEqual(String(req.headers['x-api-key'] || ''), apiKey)) return next();
    res.status(401).json({ message: '유효한 x-api-key 헤더가 필요합니다.', code: 'INVALID_API_KEY' });
  };
}
