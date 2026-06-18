import { isAuthed } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

export async function GET(request, { params }) {
  if (!isAuthed(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { id } = await params;
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, provider: true, reason: true },
  });
  return Response.json({ messages });
}

export async function POST(request, { params }) {
  if (!isAuthed(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { id } = await params;
  const { role = 'user', content } = await request.json().catch(() => ({}));
  if (!content || typeof content !== 'string') return Response.json({ error: 'content가 필요합니다.' }, { status: 400 });
  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: { _count: { select: { messages: true } } },
  });
  if (!session) return Response.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  const message = await prisma.chatMessage.create({
    data: { sessionId: id, role, content },
  });
  await prisma.chatSession.update({
    where: { id },
    data: session._count.messages === 0
      ? { title: content.slice(0, 40) || '새 채팅' }
      : { updatedAt: new Date() },
  });
  return Response.json({ message });
}

export async function DELETE(request, { params }) {
  if (!isAuthed(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { id } = await params;
  await prisma.chatSession.delete({ where: { id } }).catch(() => {});
  return Response.json({ ok: true });
}
