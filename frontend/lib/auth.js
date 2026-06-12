import { createHash } from 'node:crypto';

export function sessionToken() {
  const password = process.env.SITE_PASSWORD || '';
  const secret = process.env.SESSION_SECRET || 'awsome-ai-default-salt';
  return createHash('sha256').update(`${password}:${secret}`).digest('hex');
}

export function isAuthed(request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)auth=([a-f0-9]{64})/);
  return Boolean(match && match[1] === sessionToken());
}
