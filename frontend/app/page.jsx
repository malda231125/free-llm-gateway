'use client';

import { useEffect, useRef, useState } from 'react';

const MODELS = [
  { value: 'auto', label: '🧠 자동 (AI 라우팅)' },
  { value: 'GOOGLE', label: 'Google Gemini' },
  { value: 'GROQ', label: 'Groq (Llama 70B, 초고속)' },
  { value: 'CEREBRAS', label: 'Cerebras (GPT-OSS 120B)' },
  { value: 'MISTRAL', label: 'Mistral Small' },
  { value: 'NVIDIA', label: 'NVIDIA (Llama 70B)' },
  { value: 'OPENROUTER', label: 'OpenRouter (Gemma 4)' },
  { value: 'GITHUB', label: 'GitHub Models (GPT-4o-mini)' },
];

const inputStyle = {
  flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #2c3140',
  background: '#1a1e29', color: '#e6e6e6', fontSize: 15, outline: 'none',
};
const buttonStyle = {
  padding: '12px 20px', borderRadius: 10, border: 'none', background: '#4f7cff',
  color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
};

export default function Page() {
  const [authed, setAuthed] = useState(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((d) => setAuthed(d.authed)).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) refreshSessions();
  }, [authed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function refreshSessions() {
    const d = await fetch('/api/sessions').then((r) => r.json()).catch(() => ({ sessions: [] }));
    setSessions(d.sessions || []);
  }

  async function login(e) {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) setAuthed(true);
    else setLoginError('비밀번호가 올바르지 않습니다.');
  }

  async function newChat() {
    const d = await fetch('/api/sessions', { method: 'POST' }).then((r) => r.json());
    if (d.session) {
      setSessionId(d.session.id);
      setMessages([]);
      setSidebarOpen(false);
      refreshSessions();
    }
  }

  async function openChat(id) {
    setSessionId(id);
    setSidebarOpen(false);
    const d = await fetch(`/api/sessions/${id}`).then((r) => r.json()).catch(() => ({ messages: [] }));
    setMessages((d.messages || []).map((m) => ({
      role: m.role, content: m.content,
      meta: m.provider ? { provider: m.provider, reason: m.reason } : null,
    })));
  }

  async function deleteChat(id, e) {
    e.stopPropagation();
    if (!confirm('이 채팅을 삭제할까요?')) return;
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (sessionId === id) { setSessionId(null); setMessages([]); }
    refreshSessions();
  }

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    // 세션이 없으면 자동 생성
    let sid = sessionId;
    if (!sid) {
      const d = await fetch('/api/sessions', { method: 'POST' }).then((r) => r.json()).catch(() => ({}));
      sid = d.session?.id || null;
      setSessionId(sid);
    }

    const history = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setBusy(true);
    setStatus('연결 중… (잠들어 있던 서버를 깨우는 중이면 30초쯤 걸릴 수 있어요)');

    let assistantText = '';
    let meta = null;
    const apiMessages = history.map(({ role, content }) => ({ role, content }));
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, model, sessionId: sid }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setStatus('응답 생성 중…');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      setMessages([...history, { role: 'assistant', content: '', meta: null }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (line.startsWith(': gateway ')) {
              try { meta = JSON.parse(line.slice(10)); } catch {}
            } else if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') continue;
              try {
                const chunk = JSON.parse(payload);
                assistantText += chunk.choices?.[0]?.delta?.content || '';
              } catch {}
            }
          }
          setMessages([...history, { role: 'assistant', content: assistantText, meta: meta ? { provider: meta.provider, reason: meta.mode === 'auto' ? meta.reason : null } : null }]);
        }
      }
      const finalMeta = meta ? { provider: meta.provider, reason: meta.mode === 'auto' ? meta.reason : null } : null;
      setMessages([...history, { role: 'assistant', content: assistantText || '(빈 응답)', meta: finalMeta }]);
      refreshSessions();
    } catch (err) {
      setMessages([...history, { role: 'assistant', content: `⚠️ 오류: ${err.message}`, meta: null }]);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  if (authed === null) {
    return <main style={{ paddingTop: 120, textAlign: 'center', color: '#8b93a7' }}>불러오는 중…</main>;
  }

  if (!authed) {
    return (
      <main style={{ maxWidth: 380, margin: '0 auto', padding: '120px 16px 0' }}>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>🔒 Awsome AI</h1>
        <p style={{ color: '#8b93a7', marginBottom: 24 }}>비밀번호를 입력하면 채팅을 시작할 수 있습니다.</p>
        <form onSubmit={login} style={{ display: 'flex', gap: 8 }}>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호" style={inputStyle} autoFocus
          />
          <button type="submit" style={buttonStyle}>입장</button>
        </form>
        {loginError && <p style={{ color: '#ff7b7b', marginTop: 12 }}>{loginError}</p>}
      </main>
    );
  }

  const sidebar = (
    <aside style={{
      width: 260, minWidth: 260, borderRight: '1px solid #232838', display: 'flex', flexDirection: 'column',
      background: '#12141c', height: '100dvh',
    }}>
      <div style={{ padding: 14 }}>
        <button onClick={newChat} style={{ ...buttonStyle, width: '100%', padding: '11px 0' }}>＋ 새 채팅</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 14px' }}>
        {sessions.map((s) => (
          <div key={s.id} onClick={() => openChat(s.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              padding: '10px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2,
              background: s.id === sessionId ? '#222738' : 'transparent', fontSize: 14,
            }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
            <button onClick={(e) => deleteChat(s.id, e)} title="삭제"
              style={{ border: 'none', background: 'transparent', color: '#5b6275', cursor: 'pointer', fontSize: 14, padding: 2 }}>🗑</button>
          </div>
        ))}
        {sessions.length === 0 && <p style={{ color: '#5b6275', fontSize: 13, textAlign: 'center', marginTop: 24 }}>아직 채팅이 없습니다</p>}
      </div>
    </aside>
  );

  return (
    <div style={{ display: 'flex', height: '100dvh' }}>
      <style>{`
        .desktop-sidebar { display: none; }
        @media (min-width: 900px) {
          .desktop-sidebar { display: block; }
          .mobile-menu { display: none; }
        }
      `}</style>

      <div className="desktop-sidebar">{sidebar}</div>
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, top: 0, zIndex: 21 }}>{sidebar}</div>
        </div>
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100dvh', maxWidth: 860, margin: '0 auto', padding: '0 16px', width: '100%', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #232838', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setSidebarOpen(true)} className="mobile-menu"
              style={{ border: '1px solid #2c3140', background: '#1a1e29', color: '#e6e6e6', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontSize: 14 }}>☰</button>
            <div>
              <strong style={{ fontSize: 17 }}>Awsome AI</strong>
              <span style={{ color: '#8b93a7', fontSize: 13, marginLeft: 8 }}>free-llm-gateway 채팅</span>
            </div>
          </div>
          <select value={model} onChange={(e) => setModel(e.target.value)}
            style={{ background: '#1a1e29', color: '#e6e6e6', border: '1px solid #2c3140', borderRadius: 8, padding: '8px 10px', fontSize: 13, maxWidth: 180 }}>
            {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </header>

        <section style={{ flex: 1, overflowY: 'auto', padding: '18px 0' }}>
          {messages.length === 0 && (
            <p style={{ color: '#8b93a7', textAlign: 'center', marginTop: 80 }}>
              무엇이든 물어보세요. 🧠 자동 모드면 프롬프트에 맞는 무료 모델을 AI가 골라줍니다.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
              <div style={{
                maxWidth: '85%', padding: '10px 14px', borderRadius: 14, fontSize: 15, lineHeight: 1.55,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: m.role === 'user' ? '#4f7cff' : '#1a1e29',
                color: m.role === 'user' ? '#fff' : '#e6e6e6',
                border: m.role === 'user' ? 'none' : '1px solid #232838',
              }}>
                {m.content}
                {m.role === 'assistant' && m.meta?.provider && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#8b93a7', borderTop: '1px solid #232838', paddingTop: 6 }}>
                    ⚡ {m.meta.provider}{m.meta.reason ? ` — ${m.meta.reason}` : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <p style={{ color: '#8b93a7', fontSize: 13 }}>{status}</p>}
          <div ref={bottomRef} />
        </section>

        <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: '12px 0 18px' }}>
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="메시지를 입력하세요…" style={inputStyle} disabled={busy} autoFocus
          />
          <button type="submit" style={{ ...buttonStyle, opacity: busy ? 0.5 : 1 }} disabled={busy}>
            {busy ? '…' : '전송'}
          </button>
        </form>
      </main>
    </div>
  );
}
