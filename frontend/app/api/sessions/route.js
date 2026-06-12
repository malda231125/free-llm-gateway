import { isAuthed } from '../../../lib/auth';
import { prisma } from '../../../lib/db';

export async function GET(request) {
  if (!isAuthed(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const sessions = await prisma.chatSession.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
    take: 100,
  });
  return Response.json({ sessions });
}

export async function POST(request) {
  if (!isAuthed(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const session = await prisma.chatSession.create({ data: {} });
  return Response.json({ session });
}
