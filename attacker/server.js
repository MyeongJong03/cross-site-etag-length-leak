'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const EXPLOIT_FILE = path.join(PUBLIC_DIR, 'exploit.html');

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const INITIAL_EXPLOIT = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>Exploit</title></head>
<body>
<script>
const VICTIM = 'http://victim:3000';

// 여기에 exploit 코드를 작성하세요.
<\/script>
</body>
</html>`;

if (!fs.existsSync(EXPLOIT_FILE)) {
  fs.writeFileSync(EXPLOIT_FILE, INITIAL_EXPLOIT);
}

app.use(express.text({ type: '*/*', limit: '512kb' }));
app.use('/exploit.html', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  const current = fs.existsSync(EXPLOIT_FILE)
    ? fs.readFileSync(EXPLOIT_FILE, 'utf8')
    : INITIAL_EXPLOIT;

  const escaped = current
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>Exploit Editor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1e1e1e; color: #d4d4d4; font-family: Consolas, monospace; padding: 20px; }
    h1 { color: #4ec9b0; margin-bottom: 8px; font-size: 18px; }
    p { color: #9cdcfe; margin-bottom: 12px; font-size: 13px; }
    a { color: #ce9178; }
    textarea { width: 100%; height: calc(100vh - 160px); background: #252526; color: #d4d4d4; border: 1px solid #3c3c3c; padding: 12px; font-family: Consolas, monospace; font-size: 13px; resize: none; outline: none; }
    .toolbar { display: flex; gap: 10px; margin-top: 10px; align-items: center; }
    button { padding: 8px 20px; background: #0e639c; color: #fff; border: none; cursor: pointer; font-size: 13px; }
    button:hover { background: #1177bb; }
    #status { font-size: 13px; color: #4ec9b0; }
  </style>
</head>
<body>
  <h1>Exploit Editor</h1>
  <p>익스플로잇을 작성하고 저장하세요. 봇 트리거: <code>POST http://bot:3001/visit {"url":"http://attacker:4000/exploit.html"}</code></p>
  <textarea id="code" spellcheck="false">${escaped}</textarea>
  <div class="toolbar">
    <button onclick="save()">저장</button>
    <button onclick="window.open('/exploit.html','_blank')">미리보기</button>
    <span id="status"></span>
  </div>
  <script>
    document.getElementById('code').addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.target, s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + 2;
      }
    });
    async function save() {
      const code = document.getElementById('code').value;
      const status = document.getElementById('status');
      status.textContent = '저장 중...';
      try {
        const res = await fetch('/upload', { method: 'POST', headers: { 'Content-Type': 'text/html' }, body: code });
        const json = await res.json();
        status.textContent = json.ok ? '저장 완료' : '오류: ' + json.error;
      } catch(e) { status.textContent = '오류: ' + e.message; }
    }
  <\/script>
</body>
</html>`);
});

app.post('/upload', (req, res) => {
  try {
    fs.writeFileSync(EXPLOIT_FILE, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ----- 결과 수신 엔드포인트 -----
app.post('/debug', (req, res) => {
  process.stdout.write(`[debug] ${req.body}\n`);
  res.sendStatus(200);
});

app.post('/leak', (req, res) => {
  process.stdout.write(`[leak ] ${req.body}\n`);
  res.sendStatus(200);
});

app.post('/flag', (req, res) => {
  process.stdout.write(`\n[FLAG ] *** ${req.body} ***\n`);
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`[attacker] on :${PORT}`));
