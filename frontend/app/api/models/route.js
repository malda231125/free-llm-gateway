import { isAuthed } from '../../../lib/auth';

let cache = null; // { at, data } — 서버리스 웜 인스턴스 단위 캐시

export async function GET(request) {
  if (!isAuthed(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return Response.json(cache.data);
  const res = await fetch(`${process.env.GATEWAY_URL}/v1/models`, {
    headers: { 'x-api-key': process.env.GATEWAY_API_KEY || '' },
  });
  if (!res.ok) return Response.json({ error: `게이트웨이 오류 (HTTP ${res.status})` }, { status: 502 });
  const data = await res.json();
  cache = { at: Date.now(), data };
  return Response.json(data);
}
