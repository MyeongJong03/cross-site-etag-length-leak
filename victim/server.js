'use strict';

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;
const db = new Database(path.join(__dirname, 'db', 'ctf.db'));

app.set('etag', 'weak');

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  next();
});

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '로그인 시도 횟수를 초과했습니다. 1분 후 다시 시도하세요.' },
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Login required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Login required' });
  }
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// 메모 CRUD API
app.get('/api/notes', requireLogin, (req, res) => {
  const notes = db.prepare(
    'SELECT id, content, is_private FROM notes WHERE user_id = ? ORDER BY id DESC'
  ).all(req.session.userId);
  res.json(notes);
});

app.post('/api/notes', requireLogin, (req, res) => {
  const { content, is_private } = req.body ?? {};
  if (!content) {
    return res.status(400).json({ error: 'content required' });
  }
  try {
    const r = db.prepare(
      'INSERT INTO notes (user_id, content, is_private) VALUES (?, ?, ?)'
    ).run(req.session.userId, content, is_private ? 1 : 0);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: '메모 저장에 실패했습니다.' });
  }
});

app.delete('/api/notes/:id', requireLogin, (req, res) => {
  const noteId = parseInt(req.params.id, 10);
  if (Number.isNaN(noteId)) {
    return res.status(400).json({ error: 'Invalid note ID' });
  }

  // 본인 메모인지 확인
  const note = db.prepare('SELECT user_id FROM notes WHERE id = ?').get(noteId);
  if (!note) {
    return res.status(404).json({ error: 'Note not found' });
  }
  if (note.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
  res.json({ ok: true });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare(
      'INSERT INTO users (username, password) VALUES (?, ?)'
    ).run(username, hash);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });
  }
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body ?? {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ ok: true });
});

app.get('/api/me', requireLogin, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, role FROM users WHERE id = ?'
  ).get(req.session.userId);
  res.json(user);
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

const GTE_PAD = 'X'.repeat(4111);
const LT_PAD = 'X'.repeat(4071);

app.get('/api/compare', requireLogin, (req, res) => {
  const target = parseInt(req.query.target, 10);
  if (Number.isNaN(target)) {
    return res.status(400).json({ error: 'target must be a number' });
  }

  if (req.session.userId >= target) {
    res.json({ result: 'gte', pad: GTE_PAD });
  } else {
    res.json({ result: 'lt', pad: LT_PAD });
  }
});

app.get('/admin/flag/search', requireAdmin, (req, res) => {
  const uid = parseInt(req.query.uid, 10);
  const q = req.query.q ?? '';

  if (uid !== req.session.userId) {
    return res.end();
  }

  const note = db.prepare(
    `SELECT content FROM notes
     WHERE user_id = ? AND is_private = 1 AND content LIKE ?`
  ).get(req.session.userId, q + '%');

  if (!note) {
    return res.end();
  }

  res.json({ match: true, length: note.content.length });
});

app.get('/admin/flag', requireAdmin, (req, res) => {
  const note = db.prepare(
    'SELECT content FROM notes WHERE user_id = ? AND is_private = 1 LIMIT 1'
  ).get(req.session.userId);
  res.json({ flag: note?.content ?? 'FLAG NOT FOUND' });
});

// /admin 리다이렉트 (HTML 페이지 라우트보다 먼저 처리)
app.get('/admin', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html?next=/admin');
  }
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.redirect('/notes.html');
  }
  res.redirect('/admin.html');
});

// 정적 파일 서빙 (API 라우트보다 뒤에 위치)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`[victim] listening on :${PORT}`);
});
