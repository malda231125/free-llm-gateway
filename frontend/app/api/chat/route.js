import { isAuthed } from '../../../lib/auth';
import { prisma } from '../../../lib/db';

export const maxDuration = 120; // Render 무료 슬립 콜드스타트(30-60초) + 생성 시간 대비

function parseSse(raw) {
  let content = '';
  let meta = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith(': gateway ')) {
      try { meta = JSON.parse(line.slice(10)); } catch {}
    } else if (line.startsWith('data: ')) {
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try { content += JSON.parse(payload).choices?.[0]?.delta?.content || ''; } catch {}
    }
  }
  return { content, meta };
}

export async function POST(request) {
  if (!isAuthed(request)) {
    return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { messages, model, sessionId } = await request.json().catch(() => ({}));
  if (!Array.isArray(messages) || !messages.length) {
    return Response.json({ error: 'messages가 필요합니다.' }, { status: 400 });
  }

  // 세션 확인 + 사용자 메시지 저장 (첫 메시지면 제목 자동 지정)
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  let session = null;
  if (sessionId) {
    session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { messages: true } } },
    });
  }
  const userText = typeof lastUser?.content === 'string'
    ? lastUser.content
    : (lastUser?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ') +
      ((lastUser?.content || []).some((c) => c.type === 'image_url') ? ' [이미지 첨부]' : '');
  if (session && lastUser) {
    await prisma.chatMessage.create({ data: { sessionId: session.id, role: 'user', content: userText } });
    if (session._count.messages === 0) {
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { title: userText.slice(0, 40) || '새 채팅' },
      });
    } else {
      await prisma.chatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
    }
  }

  const upstream = await fetch(`${process.env.GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.GATEWAY_API_KEY || '',
    },
    body: JSON.stringify({ model: model || 'auto', messages, stream: true }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return Response.json({ error: `게이트웨이 오류 (HTTP ${upstream.status})`, detail: text.slice(0, 300) }, { status: 502 });
  }

  // 클라이언트로 패스스루하면서 서버에서도 누적 → 완료 시 어시스턴트 메시지 DB 저장
  const decoder = new TextDecoder();
  let raw = '';
  const sessionIdToSave = session?.id || null;
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          controller.enqueue(value);
        }
        // 주의: 서버리스는 응답 종료 직후 함수를 동결시키므로, 스트림을 닫기 전에 DB 저장을 끝낸다.
        if (sessionIdToSave) {
          const { content, meta } = parseSse(raw);
          if (content) {
            await prisma.chatMessage.create({
              data: {
                sessionId: sessionIdToSave,
                role: 'assistant',
                content,
                provider: meta?.provider || null,
                reason: meta?.mode === 'auto' ? meta?.reason || null : null,
              },
            }).catch(() => {});
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}
