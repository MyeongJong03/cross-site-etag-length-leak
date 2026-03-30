'use strict';

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'ctf.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const db = new Database(DB_PATH);
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const ADMIN_ID = 0x800;
const FLAG = process.env.FLAG || 'WSL{PLACEHOLDER}';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

db.prepare(
  'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)'
).run(ADMIN_ID, 'admin', adminHash, 'admin');

db.prepare(
  'INSERT INTO notes (user_id, content, is_private) VALUES (?, ?, 1)'
).run(ADMIN_ID, FLAG);

const dummies = ['alice', 'bob', 'charlie', 'dave'];
for (const name of dummies) {
  const hash = bcrypt.hashSync(name + '_pass', 10);
  db.prepare(
    'INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)'
  ).run(name, hash);
}

console.log(`[seed] done  admin_uid=${ADMIN_ID} (0x${ADMIN_ID.toString(16)})`);
db.close();
