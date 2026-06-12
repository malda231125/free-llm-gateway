import { sessionToken } from '../../../lib/auth';

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  if (!process.env.SITE_PASSWORD || password !== process.env.SITE_PASSWORD) {
    return Response.json({ ok: false, message: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': `auth=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure`,
    },
  });
}
