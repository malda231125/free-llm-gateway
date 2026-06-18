'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { isNearBottom } from '../lib/scroll.mjs';

const MODELS = [
  { value: 'auto', label: '🧠 자동 (AI 라우팅)' },
  { value: 'GOOGLE', label: 'Google Gemini' },
  { value: 'GROQ', label: 'Groq' },
  { value: 'CEREBRAS', label: 'Cerebras' },
  { value: 'MISTRAL', label: 'Mistral' },
  { value: 'NVIDIA', label: 'NVIDIA' },
  { value: 'OPENROUTER', label: 'OpenRouter' },
  { value: 'GITHUB', label: 'GitHub Models' },
];

const inputStyle = {
  flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #2c3140',
  background: '#1a1e29', color: '#e6e6e6', fontSize: 15, outline: 'none',
};
const buttonStyle = {
  padding: '12px 18px', borderRadius: 10, border: 'none', background: '#4f7cff',
  color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  whiteSpace: 'nowrap', flexShrink: 0,
};
const selectStyle = {
  background: '#1a1e29', color: '#e6e6e6', border: '1px solid #2c3140',
  borderRadius: 8, padding: '8px 10px', fontSize: 13,
};

const MODEL_TAGS = [
  { id: 'reasoning', label: '강한 추론', emoji: '🧠' },
  { id: 'fast', label: '빠른 응답', emoji: '⚡' },
  { id: 'coding', label: '코딩', emoji: '💻' },
  { id: 'vision', label: '이미지/비전', emoji: '👁️' },
  { id: 'long', label: '긴 컨텍스트', emoji: '📚' },
  { id: 'efficient', label: '가성비/경량', emoji: '🌱' },
  { id: 'multilingual', label: '한국어/다국어', emoji: '🌏' },
  { id: 'open', label: '오픈모델', emoji: '🔓' },
];

const AUTO_ROUTE_CATEGORIES = [
  { value: 'any', label: '전체 자동', desc: '프롬프트에 맞춰 전체 후보에서 라우팅' },
  { value: 'reasoning', label: '🧠 강한 추론', desc: '수학, 분석, 복잡한 문제 해결 후보 안에서 라우팅' },
  { value: 'fast', label: '⚡ 빠른 응답', desc: '짧은 질의, 초안, 반복 작업용 고속 후보 안에서 라우팅' },
  { value: 'vision', label: '👁️ 이미지/비전', desc: '이미지 이해와 멀티모달 후보 안에서 라우팅' },
  { value: 'long', label: '📚 긴 컨텍스트', desc: '긴 문서, 요약, 대량 컨텍스트 후보 안에서 라우팅' },
];

const TAG_BY_ID = Object.fromEntries(MODEL_TAGS.map((tag) => [tag.id, tag]));

function modelSearchText({ provider = '', id = '', description = '' }) {
  return `${provider} ${id} ${description}`.toLowerCase();
}

function inferModelTags({ provider = '', id = '', description = '' }) {
  const text = modelSearchText({ provider, id, description });
  const tags = new Set();

  if (/(reason|thinking|r1|qwq|qwen3|o[134]|gpt-4|gemini-2\.5-pro|claude-3\.7|claude-4|deepseek-r1|magistral)/i.test(text)) tags.add('reasoning');
  if (/(groq|cerebras|flash|instant|haiku|mini|lite|small|8b|7b|3b|1b|fast|turbo|speed)/i.test(text)) tags.add('fast');
  if (/(code|coder|coding|codestral|devstral|qwen.*coder|deepseek-coder|starcoder|gpt-4\.1|claude|kimi-k2)/i.test(text)) tags.add('coding');
  if (/(vision|visual|vl\b|v[- ]?l|multimodal|image|pixtral|llava|qwen.*vl|gemini|llama-4|maverick|scout)/i.test(text)) tags.add('vision');
  if (/(long|context|128k|200k|256k|1m|million|gemini|llama-4|mistral-large|command-r)/i.test(text)) tags.add('long');
  if (/(free|cheap|efficient|nano|mini|lite|small|8b|7b|3b|1b|gemma|phi|haiku|flash)/i.test(text)) tags.add('efficient');
  if (/(korean|한국|ko\b|multilingual|qwen|gemini|mistral|llama|solar|exaone|aya)/i.test(text)) tags.add('multilingual');
  if (/(llama|qwen|mistral|mixtral|deepseek|gemma|phi|yi|open|oss|command-r|nemotron|granite)/i.test(text)) tags.add('open');

  if (provider === 'GROQ' || provider === 'CEREBRAS') tags.add('fast');
  if (provider === 'GOOGLE') { tags.add('vision'); tags.add('long'); tags.add('multilingual'); }
  if (provider === 'MISTRAL') { tags.add('open'); tags.add('multilingual'); }
  if (provider === 'GITHUB') tags.add('coding');
  if (provider === 'NVIDIA') tags.add('open');

  return [...tags];
}

function tagLabels(tagIds = []) {
  return tagIds.map((id) => TAG_BY_ID[id]).filter(Boolean).map((tag) => `${tag.emoji} ${tag.label}`);
}

function CodeBlock({ className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const isBlock = String(className || '').includes('language-') || String(children).includes('\n');
  if (!isBlock) {
    return <code style={{ background: '#2a2f3e', padding: '2px 5px', borderRadius: 4, fontSize: 13 }} {...props}>{children}</code>;
  }
  const text = String(children).replace(/\n$/, '');
  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        style={{ position: 'absolute', top: 6, right: 6, fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #3a4154', background: '#1a1e29', color: copied ? '#7bd88f' : '#8b93a7', cursor: 'pointer', zIndex: 1 }}>
        {copied ? '복사됨!' : '복사'}
      </button>
      <pre style={{ background: '#0d1117', borderRadius: 10, padding: '14px 12px', overflowX: 'auto', fontSize: 13, lineHeight: 1.5 }}>
        <code className={className} {...props}>{children}</code>
      </pre>
    </div>
  );
}

function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock,
          pre: ({ children }) => <>{children}</>,
          table: (props) => <div style={{ overflowX: 'auto' }}><table {...props} /></div>,
          a: (props) => <a {...props} target="_blank" rel="noreferrer" style={{ color: '#7aa2ff' }} />,
        }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** 부분검색 가능한 모델 선택 콤보박스. options: [{value, label, desc}] */
function ModelPicker({ options, value, onChange, width = 220, placeholder = '모델 검색…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const tagCounts = MODEL_TAGS.map((tag) => ({
    ...tag,
    count: options.filter((o) => (o.tags || []).includes(tag.id)).length,
  })).filter((tag) => tag.count > 0);
  const q = query.toLowerCase().trim();
  const filtered = options.filter((o) => {
    const tags = o.tags || [];
    if (activeTag && !tags.includes(activeTag)) return false;
    if (!q) return true;
    const keywords = tagLabels(tags).join(' ');
    return `${o.value} ${o.label} ${o.desc || ''} ${keywords}`.toLowerCase().includes(q);
  });
  const current = options.find((o) => o.value === value);

  return (
    <div ref={boxRef} style={{ position: 'relative', width }}>
      <button type="button" onClick={() => { setOpen(!open); setQuery(''); setActiveTag(''); }}
        style={{ width: '100%', textAlign: 'left', background: '#1a1e29', color: '#e6e6e6', border: '1px solid #2c3140', borderRadius: 8, padding: '8px 10px', fontSize: 13, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current ? current.label : value} ▾
      </button>
      {open && (
        <div style={{ position: 'fixed', left: 12, right: 12, top: 110, zIndex: 50, maxWidth: 520, margin: '0 auto', background: '#12141c', border: '1px solid #2c3140', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid #232838', color: '#e6e6e6', fontSize: 13, outline: 'none' }} />
          {tagCounts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '9px 10px', borderBottom: '1px solid #232838' }}>
              <button type="button" onClick={() => setActiveTag('')}
                style={{ border: '1px solid #2c3140', background: activeTag ? '#1a1e29' : '#4f7cff', color: activeTag ? '#8b93a7' : '#fff', borderRadius: 999, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer' }}>
                전체 {options.length}
              </button>
              {tagCounts.map((tag) => (
                <button key={tag.id} type="button" onClick={() => setActiveTag(activeTag === tag.id ? '' : tag.id)}
                  style={{ border: '1px solid #2c3140', background: activeTag === tag.id ? '#4f7cff' : '#1a1e29', color: activeTag === tag.id ? '#fff' : '#c8cfdd', borderRadius: 999, padding: '5px 9px', fontSize: 11.5, cursor: 'pointer' }}>
                  {tag.emoji} {tag.label} {tag.count}
                </button>
              ))}
            </div>
          )}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.length === 0 && <p style={{ color: '#5b6275', fontSize: 13, textAlign: 'center', padding: 14 }}>검색 결과 없음</p>}
            {filtered.slice(0, 100).map((o) => (
              <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ padding: '8px 12px', cursor: 'pointer', background: o.value === value ? '#222738' : 'transparent', borderBottom: '1px solid #1a1e29' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#1d2230'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = o.value === value ? '#222738' : 'transparent'; }}>
                <div style={{ fontSize: 13, color: '#e6e6e6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</div>
                {(o.tags || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                    {tagLabels(o.tags).slice(0, 4).map((label) => (
                      <span key={label} style={{ fontSize: 10.5, color: '#aab2c5', background: '#202637', border: '1px solid #30384b', borderRadius: 999, padding: '2px 6px' }}>{label}</span>
                    ))}
                  </div>
                )}
                {o.desc && <div style={{ fontSize: 11.5, color: '#7d8598', marginTop: 2, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.desc}</div>}
              </div>
            ))}
            {filtered.length > 100 && <p style={{ color: '#5b6275', fontSize: 12, textAlign: 'center', padding: 8 }}>+{filtered.length - 100}개 더 — 검색어를 좁혀보세요</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** SSE 스트림을 읽으며 onUpdate(text, meta)를 호출 */
async function streamChat(payload, onUpdate) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let meta = null;
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
          const payloadLine = line.slice(6).trim();
          if (payloadLine === '[DONE]') continue;
          try { text += JSON.parse(payloadLine).choices?.[0]?.delta?.content || ''; } catch {}
        }
      }
      onUpdate(text, meta);
    }
  }
  return { text, meta };
}

function metaLabel(meta) {
  if (!meta?.provider) return null;
  const name = meta.model ? `${meta.provider} (${meta.model})` : meta.provider;
  const reason = meta.mode === 'auto' ? meta.reason : null;
  return { provider: name, reason };
}

/** 이미지를 최대 1280px JPEG로 리사이즈해 dataURL 반환 */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function Page() {
  const [authed, setAuthed] = useState(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('auto');
  const [autoCategory, setAutoCategory] = useState('any');
  const [catalog, setCatalog] = useState({});
  const [subModel, setSubModel] = useState('default');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [image, setImage] = useState(null); // dataURL
  const [compareOn, setCompareOn] = useState(false);
  const [compareA, setCompareA] = useState('auto');
  const [compareB, setCompareB] = useState('GROQ');
  const [compareRuns, setCompareRuns] = useState([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messagesViewportRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((d) => setAuthed(d.authed)).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) {
      refreshSessions();
      fetch('/api/models').then((r) => r.json()).then((list) => {
        if (Array.isArray(list)) {
          const map = {};
          for (const c of list) {
            map[c.provider] = (c.models || []).map((m) => typeof m === 'string' ? { id: m, description: '' } : m);
          }
          setCatalog(map);
        }
      }).catch(() => {});
    }
  }, [authed]);

  function scrollToLatest(behavior = 'smooth') {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }

  function handleMessagesScroll() {
    const nearBottom = isNearBottom(messagesViewportRef.current);
    stickToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToLatest('smooth');
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, compareRuns, busy]);

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
      stickToBottomRef.current = true;
      setShowJumpToLatest(false);
      setSidebarOpen(false);
      setCompareOn(false);
      refreshSessions();
    }
  }

  async function openChat(id) {
    setSessionId(id);
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setSidebarOpen(false);
    setCompareOn(false);
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

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setImage(await resizeImage(file)); } catch { alert('이미지를 읽지 못했습니다.'); }
    e.target.value = '';
  }

  function buildUserContent(text) {
    if (!image) return text;
    return [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: image } },
    ];
  }

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    if (compareOn) return sendCompare(text);

    let sid = sessionId;
    if (!sid) {
      const d = await fetch('/api/sessions', { method: 'POST' }).then((r) => r.json()).catch(() => ({}));
      sid = d.session?.id || null;
      setSessionId(sid);
    }

    const userContent = buildUserContent(text);
    const history = [...messages, { role: 'user', content: userContent }];
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setMessages(history);
    setInput('');
    const sentImage = image;
    setImage(null);
    setBusy(true);
    setStatus('연결 중… (잠들어 있던 서버를 깨우는 중이면 30초쯤 걸릴 수 있어요)');

    // 이미지가 있으면 비전 지원 모델로 (auto일 땐 Gemini)
    const effectiveModel = sentImage && model === 'auto'
      ? 'auto:vision'
      : model === 'auto' ? (autoCategory === 'any' ? 'auto' : `auto:${autoCategory}`) : subModel === 'default' ? model : `${model}/${subModel}`;

    const apiMessages = history.map(({ role, content }) => ({ role, content }));
    try {
      setMessages([...history, { role: 'assistant', content: '', meta: null }]);
      const { text: answer, meta } = await streamChat(
        { messages: apiMessages, model: effectiveModel, sessionId: sid },
        (partial, m) => {
          setStatus('응답 생성 중…');
          setMessages([...history, { role: 'assistant', content: partial, meta: metaLabel(m) }]);
        },
      );
      setMessages([...history, { role: 'assistant', content: answer || '(빈 응답)', meta: metaLabel(meta) }]);
      refreshSessions();
    } catch (err) {
      setMessages([...history, { role: 'assistant', content: `⚠️ 오류: ${err.message}`, meta: null }]);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  async function sendCompare(text) {
    let sid = sessionId;
    if (!sid) {
      const d = await fetch('/api/sessions', { method: 'POST' }).then((r) => r.json()).catch(() => ({}));
      sid = d.session?.id || null;
      setSessionId(sid);
    }
    if (sid) {
      await fetch(`/api/sessions/${sid}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: text }),
      }).catch(() => {});
    }
    setInput('');
    setBusy(true);
    setStatus('두 모델에 동시에 요청 중…');
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    const run = { prompt: text, results: [{ label: compareA, text: '', meta: null }, { label: compareB, text: '', meta: null }] };
    const runs = [...compareRuns, run];
    setCompareRuns(runs);
    const idx = runs.length - 1;
    const update = (side, partial, m) => {
      setCompareRuns((prev) => {
        const next = prev.map((r, i) => i === idx ? { ...r, results: r.results.map((res, j) => j === side ? { ...res, text: partial, meta: metaLabel(m) } : res) } : r);
        return next;
      });
    };
    const messagesPayload = [{ role: 'user', content: text }];
    await Promise.allSettled([
      streamChat({ messages: messagesPayload, model: compareA, sessionId: sid, saveUser: false }, (t, m) => update(0, t, m))
        .catch((err) => update(0, `⚠️ ${err.message}`, null)),
      streamChat({ messages: messagesPayload, model: compareB, sessionId: sid, saveUser: false }, (t, m) => update(1, t, m))
        .catch((err) => update(1, `⚠️ ${err.message}`, null)),
    ]);
    refreshSessions();
    setBusy(false);
    setStatus('');
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

  const compareOptions = [
    { value: 'auto', label: '🧠 자동 (AI 라우팅)', desc: '프롬프트에 맞는 모델을 AI가 선택', tags: ['reasoning'] },
    ...AUTO_ROUTE_CATEGORIES.filter((c) => c.value !== 'any').map((c) => ({
      value: `auto:${c.value}`,
      label: `자동 · ${c.label}`,
      desc: `${c.desc} — Gemini 라우터가 최종 모델 선택`,
      tags: [c.value],
    })),
    ...Object.entries(catalog).flatMap(([provider, models]) => [
      { value: provider, label: `${provider} 기본`, desc: '', tags: inferModelTags({ provider, id: provider }) },
      ...models.map((m) => ({
        value: `${provider}/${m.id}`,
        label: `${provider} · ${m.id}`,
        desc: m.description,
        tags: inferModelTags({ provider, id: m.id, description: m.description }),
      })),
    ]),
  ];

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
              background: s.id === sessionId && !compareOn ? '#222738' : 'transparent', fontSize: 14,
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

  const badge = (meta) => meta?.provider && (
    <div style={{ marginTop: 8, fontSize: 12, color: '#8b93a7', borderTop: '1px solid #232838', paddingTop: 6 }}>
      ⚡ {meta.provider}{meta.reason ? ` — ${meta.reason}` : ''}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100dvh' }}>
      <style>{`
        .desktop-sidebar { display: none; }
        @media (min-width: 900px) {
          .desktop-sidebar { display: block; }
          .mobile-menu { display: none; }
        }
        .md p { margin: 6px 0; }
        .md ul, .md ol { margin: 6px 0; padding-left: 22px; }
        .md h1, .md h2, .md h3 { margin: 12px 0 6px; }
        .md table { border-collapse: collapse; margin: 8px 0; }
        .md th, .md td { border: 1px solid #2c3140; padding: 5px 10px; font-size: 13px; }
        .md blockquote { border-left: 3px solid #3a4154; margin: 6px 0; padding-left: 10px; color: #aab2c5; }
        .compare-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
        @media (min-width: 760px) { .compare-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 899px) {
          .header-controls { flex: 1 1 100%; }
          .send-btn { padding: 12px 14px !important; font-size: 14px !important; }
        }
      `}</style>

      <div className="desktop-sidebar">{sidebar}</div>
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, top: 0, zIndex: 21 }}>{sidebar}</div>
        </div>
      )}

      <main style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', height: '100dvh', maxWidth: compareOn ? 1100 : 860, margin: '0 auto', padding: '0 16px', width: '100%', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #232838', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setSidebarOpen(true)} className="mobile-menu"
              style={{ border: '1px solid #2c3140', background: '#1a1e29', color: '#e6e6e6', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontSize: 14 }}>☰</button>
            <strong style={{ fontSize: 17 }}>Awsome AI</strong>
            <button onClick={() => setCompareOn(!compareOn)}
              style={{ border: '1px solid #2c3140', background: compareOn ? '#4f7cff' : '#1a1e29', color: compareOn ? '#fff' : '#8b93a7', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', fontSize: 13 }}>
              ⚖️ 비교
            </button>
          </div>
          {compareOn ? (
            <div className="header-controls" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}><ModelPicker options={compareOptions} value={compareA} onChange={setCompareA} width="100%" /></div>
              <span style={{ color: '#5b6275', fontSize: 13, flexShrink: 0 }}>vs</span>
              <div style={{ flex: 1, minWidth: 0 }}><ModelPicker options={compareOptions} value={compareB} onChange={setCompareB} width="100%" /></div>
            </div>
          ) : (
            <div className="header-controls" style={{ display: 'flex', gap: 6 }}>
              <select value={model} onChange={(e) => { setModel(e.target.value); setSubModel('default'); }}
                style={{ ...selectStyle, flex: 1, minWidth: 0, maxWidth: 190 }}>
                {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {model === 'auto' && (
                <select value={autoCategory} onChange={(e) => setAutoCategory(e.target.value)}
                  title="자동 라우팅 카테고리"
                  style={{ ...selectStyle, flex: 1.1, minWidth: 0, maxWidth: 190 }}>
                  {AUTO_ROUTE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              )}
              {model !== 'auto' && (catalog[model] || []).length > 0 && (
                <div style={{ flex: 1.2, minWidth: 0 }}>
                  <ModelPicker
                    width="100%"
                    value={subModel}
                    onChange={setSubModel}
                    options={[
                      { value: 'default', label: '기본 모델', desc: '프로바이더 추천 기본값', tags: inferModelTags({ provider: model, id: model }) },
                      ...(catalog[model] || []).map((m) => ({
                        value: m.id,
                        label: m.id,
                        desc: m.description,
                        tags: inferModelTags({ provider: model, id: m.id, description: m.description }),
                      })),
                    ]}
                  />
                </div>
              )}
            </div>
          )}
        </header>

        <section
          ref={messagesViewportRef}
          onScroll={handleMessagesScroll}
          style={{ flex: 1, overflowY: 'auto', padding: '18px 0' }}
        >
          {compareOn ? (
            <>
              {compareRuns.length === 0 && (
                <p style={{ color: '#8b93a7', textAlign: 'center', marginTop: 80 }}>
                  ⚖️ 비교 모드: 같은 질문을 두 모델에 동시에 보내 나란히 비교합니다.<br />
                  <span style={{ fontSize: 13 }}>(비교 결과는 같은 채팅 이력에 모델별 답변으로 저장됩니다)</span>
                </p>
              )}
              {compareRuns.map((run, i) => (
                <div key={i} style={{ marginBottom: 22 }}>
                  <div style={{ background: '#4f7cff', color: '#fff', padding: '10px 14px', borderRadius: 14, marginBottom: 10, fontSize: 15 }}>{run.prompt}</div>
                  <div className="compare-grid">
                    {run.results.map((r, j) => (
                      <div key={j} style={{ background: '#1a1e29', border: '1px solid #232838', borderRadius: 14, padding: '10px 14px', fontSize: 14, lineHeight: 1.55, minHeight: 60 }}>
                        <div style={{ fontSize: 12, color: '#7aa2ff', marginBottom: 6, fontWeight: 600 }}>{r.label}</div>
                        <Markdown>{r.text || '…'}</Markdown>
                        {badge(r.meta)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {messages.length === 0 && (
                <p style={{ color: '#8b93a7', textAlign: 'center', marginTop: 80 }}>
                  무엇이든 물어보세요. 🧠 자동 모드면 200개+ 무료 모델 중 AI가 골라줍니다.
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  <div style={{
                    maxWidth: '88%', padding: '10px 14px', borderRadius: 14, fontSize: 15, lineHeight: 1.55,
                    wordBreak: 'break-word',
                    background: m.role === 'user' ? '#4f7cff' : '#1a1e29',
                    color: m.role === 'user' ? '#fff' : '#e6e6e6',
                    border: m.role === 'user' ? 'none' : '1px solid #232838',
                  }}>
                    {m.role === 'user' ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {typeof m.content === 'string' ? m.content : (
                          <>
                            {(m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ')}
                            {(m.content || []).filter((c) => c.type === 'image_url').map((c, k) => (
                              <img key={k} src={c.image_url.url} alt="첨부" style={{ display: 'block', maxWidth: 220, borderRadius: 10, marginTop: 8 }} />
                            ))}
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <Markdown>{typeof m.content === 'string' ? m.content : ''}</Markdown>
                        {badge(m.meta)}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
          {busy && <p style={{ color: '#8b93a7', fontSize: 13 }}>{status}</p>}
          <div ref={bottomRef} />
        </section>

        {showJumpToLatest && (
          <button
            type="button"
            onClick={() => scrollToLatest('smooth')}
            style={{
              position: 'absolute',
              right: 22,
              bottom: 82,
              zIndex: 10,
              border: '1px solid #33405a',
              background: '#1f2534',
              color: '#dbe4ff',
              borderRadius: 999,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 700,
              boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
              cursor: 'pointer',
            }}
          >
            ↓ 최신 응답
          </button>
        )}

        <form onSubmit={send} style={{ padding: '10px 0 18px' }}>
          {image && !compareOn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <img src={image} alt="첨부 미리보기" style={{ height: 52, borderRadius: 8 }} />
              <button type="button" onClick={() => setImage(null)}
                style={{ border: '1px solid #2c3140', background: '#1a1e29', color: '#8b93a7', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>제거</button>
              <span style={{ color: '#5b6275', fontSize: 12 }}>이미지는 비전 지원 모델(Gemini 등)로 전송됩니다</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {!compareOn && (
              <>
                <input ref={fileRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                  style={{ border: '1px solid #2c3140', background: '#1a1e29', color: '#8b93a7', borderRadius: 10, padding: '0 14px', cursor: 'pointer', fontSize: 17 }}
                  title="이미지 첨부">📷</button>
              </>
            )}
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={compareOn ? '두 모델에 동시에 보낼 질문…' : '메시지를 입력하세요…'} style={inputStyle} disabled={busy} autoFocus
            />
            <button type="submit" className="send-btn" style={{ ...buttonStyle, opacity: busy ? 0.5 : 1 }} disabled={busy}>
              {busy ? '…' : '전송'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
