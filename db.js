// Database layer: one small async API over MySQL/MariaDB (XAMPP) or SQLite.
//   await db.get(sql, ...params)  -> first row or undefined
//   await db.all(sql, ...params)  -> array of rows
//   await db.run(sql, ...params)  -> { insertId, changes }
// All SQL in server.js is plain standard SQL with "?" placeholders, so it runs on both.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SHORT_DT = /^\d{4}-\d\d-\d\d \d\d:\d\d$/;

async function openMysql(cfg) {
  let mysql;
  try { mysql = require('mysql2/promise'); }
  catch { throw new Error('The "mysql2" package is missing. Open a terminal in the project folder and run:  npm install'); }
  const base = { host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, dateStrings: true, charset: 'utf8mb4' };
  // 1) create the database + tables if they are not there yet (same as importing schema.sql in phpMyAdmin)
  try {
    const admin = await mysql.createConnection({ ...base, multipleStatements: true });
    await admin.query('CREATE DATABASE IF NOT EXISTS `' + cfg.name.replace(/[^\w]/g, '') + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await admin.query('USE `' + cfg.name.replace(/[^\w]/g, '') + '`');
    const ddl = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').replace(/^\s*(CREATE DATABASE|USE)\b.*$/gim, '');
    await admin.query(ddl);
    await admin.end();
  } catch (e) {
    if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(e.code)) throw new Error(`Cannot reach MySQL at ${cfg.host}:${cfg.port}. Open the XAMPP Control Panel and click Start next to MySQL.`);
    if (e.code === 'ER_ACCESS_DENIED_ERROR') throw new Error(`MySQL refused user "${cfg.user}". Set the right password (DB_PASS or config.js). XAMPP's default is user root with an empty password.`);
    throw e;
  }
  // 2) connection pool; every connection works in UTC so timestamps are consistent
  const pool = mysql.createPool({ ...base, database: cfg.name.replace(/[^\w]/g, ''), waitForConnections: true, connectionLimit: 10 });
  pool.pool.on('connection', c => c.query("SET time_zone = '+00:00'"));
  const prep = params => params.map(p => p === undefined ? null : (typeof p === 'string' && SHORT_DT.test(p) ? p + ':00' : p));
  // occurred_at is a local "wall clock" time with no seconds; the browser expects 16 characters
  const fix = r => { if (r && typeof r.occurred_at === 'string') r.occurred_at = r.occurred_at.slice(0, 16); return r; };
  return {
    kind: 'mysql',
    async get(sql, ...p) { const [rows] = await pool.query(sql, prep(p)); return fix(rows[0]); },
    async all(sql, ...p) { const [rows] = await pool.query(sql, prep(p)); return rows.map(fix); },
    async run(sql, ...p) { const [r] = await pool.query(sql, prep(p)); return { insertId: Number(r.insertId || 0), changes: r.affectedRows || 0 }; },
  };
}

async function openSqlite(cfg) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  const db = new DatabaseSync(path.join(__dirname, 'data', 'safereport.db'));
  db.exec(fs.readFileSync(path.join(__dirname, 'schema_sqlite.sql'), 'utf8'));
  const prep = p => p.map(v => v === undefined ? null : v);
  return {
    kind: 'sqlite',
    async get(sql, ...p) { return db.prepare(sql).get(...prep(p)); },
    async all(sql, ...p) { return db.prepare(sql).all(...prep(p)); },
    async run(sql, ...p) { const r = db.prepare(sql).run(...prep(p)); return { insertId: Number(r.lastInsertRowid || 0), changes: Number(r.changes || 0) }; },
  };
}

module.exports = cfg => (cfg.driver === 'sqlite' ? openSqlite(cfg) : openMysql(cfg));
