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

export async function DELETE(request, { params }) {
  if (!isAuthed(request)) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { id } = await params;
  await prisma.chatSession.delete({ where: { id } }).catch(() => {});
  return Response.json({ ok: true });
}
