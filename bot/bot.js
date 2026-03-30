'use strict';

const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const BOT_PORT = 3001;
const VICTIM_URL = process.env.VICTIM_URL || 'http://victim:3000';
const ATTACKER_URL = process.env.ATTACKER_URL || 'http://attacker:4000';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'changeme';

let lastVisit = 0;
const COOLDOWN_MS = 15 * 1000;
const BOT_TIMEOUT = 1500 * 1000;

let currentBrowser = null;

app.use(express.json());

app.post('/visit', async (req, res) => {
  const { url } = req.body ?? {};

  if (!url || !url.startsWith(ATTACKER_URL)) {
    return res.status(400).json({ error: `URL must start with ${ATTACKER_URL}` });
  }

  const now = Date.now();
  if (now - lastVisit < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - lastVisit)) / 1000);
    return res.status(429).json({ error: `Wait ${wait}s before next visit` });
  }
  lastVisit = now;

  if (currentBrowser) {
    console.log('[bot] terminating previous session');
    try { await currentBrowser.close(); } catch (_) {}
    currentBrowser = null;
  }

  res.json({ ok: true, message: 'Bot dispatched' });
  runBot(url).catch(e => console.error('[bot] error:', e.message));
});

async function runBot(exploitUrl) {
  console.log(`[bot] start  url=${exploitUrl}`);
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-popup-blocking',
    ],
  });
  currentBrowser = browser;

  try {
    const page = await browser.newPage();

    await page.goto(`${VICTIM_URL}/`, { waitUntil: 'networkidle2', timeout: 10000 });

    const loginOk = await page.evaluate(async (pass) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: 'admin', password: pass }),
      });
      const json = await res.json();
      return json.ok === true;
    }, ADMIN_PASS);

    if (!loginOk) {
      console.error('[bot] admin login failed');
      return;
    }
    console.log('[bot] admin login ok');

    await page.goto(exploitUrl, { waitUntil: 'load', timeout: 15000 });
    console.log('[bot] exploit page loaded, waiting...');

    await new Promise(r => setTimeout(r, BOT_TIMEOUT));
    console.log('[bot] done');
  } finally {
    await browser.close();
    if (currentBrowser === browser) currentBrowser = null;
  }
}

app.listen(BOT_PORT, () => console.log(`[bot] service on :${BOT_PORT}`));
