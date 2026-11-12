import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { SQL } from 'bun';

const DEFAULT_URL = 'mysql://root@127.0.0.1:3306/openpolis';
const DATABASE_URL = process.env.OPENPOLIS_MYSQL_URL || DEFAULT_URL;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 8 * 1024 * 1024;
const USERNAME = /^[a-zA-Z0-9_]{3,24}$/;
const loginFailures = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const empty = (status = 204, headers = {}) => new Response(null, { status, headers });
const first = (rows) => rows[0] ?? null;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function derive(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await derive(password, Buffer.from(saltHex, 'hex'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(request) {
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY) fail(413, 'O arquivo da cidade é grande demais.');
  try { return JSON.parse(text); } catch { fail(400, 'Dados inválidos.'); }
}

function credentials(body, signup) {
  const username = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = body?.password;
  if (!USERNAME.test(username)) fail(400, 'O login deve ter de 3 a 24 letras, números ou _.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) fail(400, 'A senha deve ter de 8 a 200 caracteres.');
  if (signup && body.confirmPassword !== password) fail(400, 'As duas senhas precisam ser iguais.');
  return { username, password };
}

function saveBody(body) {
  const m = body?.meta;
  const d = body?.data;
  if (!m || typeof m !== 'object' || !d || typeof d !== 'object' || !Number.isInteger(d.v)) fail(400, 'Dados da cidade inválidos.');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 64 ||
      !Number.isInteger(m.population) || m.population < 0 ||
      !Number.isFinite(m.funds) || !Number.isInteger(m.day) || m.day < 0 ||
      !Number.isInteger(m.size) || m.size < 16 || m.size > 1024 ||
      typeof m.preset !== 'string' || !m.preset || m.preset.length > 32 || !Number.isInteger(m.seed)) {
    fail(400, 'Informações da cidade inválidas.');
  }
  return { meta: m, data: JSON.stringify(d) };
}

function cookieToken(request) {
  const cookie = request.headers.get('cookie') ?? '';
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('openpolis_session='))?.slice('openpolis_session='.length) ?? null;
}

function sessionCookie(token, maxAge) {
  return `openpolis_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function userFrom(row) {
  return { id: Number(row.id), email: row.username };
}

function metaFrom(row) {
  return {
    id: Number(row.id), name: row.name, population: Number(row.population),
    funds: Number(row.funds), day: Number(row.day), size: Number(row.size),
    preset: row.preset, seed: Number(row.seed), updatedAt: Number(row.updated_at),
  };
}

async function openDatabase() {
  // XAMPP's default local MariaDB has root without a password. A different server can be
  // configured with OPENPOLIS_MYSQL_URL, with its database created beforehand.
  if (DATABASE_URL === DEFAULT_URL) {
    const admin = new SQL('mysql://root@127.0.0.1:3306/mysql');
    try {
      try {
        await admin`SELECT 1`;
      } catch (error) {
        if (process.platform !== 'win32' || !(await Bun.file('C:\\xampp\\mysql\\bin\\mysqld.exe').exists())) throw error;
        spawn('C:\\xampp\\mysql\\bin\\mysqld.exe', ['--defaults-file=C:\\xampp\\mysql\\bin\\my.ini', '--standalone'], {
          cwd: 'C:\\xampp\\mysql\\bin', detached: true, stdio: 'ignore', windowsHide: true,
        }).unref();
        let ready = false;
        for (let n = 0; n < 30; n++) {
          await Bun.sleep(500);
          try { await admin`SELECT 1`; ready = true; break; } catch { /* MySQL is starting. */ }
        }
        if (!ready) throw error;
      }
      await admin`CREATE DATABASE IF NOT EXISTS openpolis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;
    } finally {
      await admin.close();
    }
  }
  const db = new SQL(DATABASE_URL);
  await db`CREATE TABLE IF NOT EXISTS players (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(24) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    created_at BIGINT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  await db`CREATE TABLE IF NOT EXISTS player_sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    player_id BIGINT UNSIGNED NOT NULL,
    expires_at BIGINT NOT NULL,
    INDEX idx_player_sessions_owner (player_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  await db`CREATE TABLE IF NOT EXISTS player_cities (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    player_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(64) NOT NULL,
    population INT NOT NULL,
    funds DOUBLE NOT NULL,
    day INT NOT NULL,
    size SMALLINT UNSIGNED NOT NULL,
    preset VARCHAR(32) NOT NULL,
    seed INT NOT NULL,
    updated_at BIGINT NOT NULL,
    data LONGTEXT NOT NULL,
    INDEX idx_player_cities_owner (player_id, updated_at),
    UNIQUE KEY uq_player_city_owner (player_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  await db`CREATE TABLE IF NOT EXISTS player_tours (
    player_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    step VARCHAR(64) NOT NULL,
    done BOOLEAN NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  const ownerIndex = await db`SHOW INDEX FROM player_cities WHERE Key_name = 'uq_player_city_owner'`;
  if (ownerIndex.length === 0) {
    const duplicateOwners = await db`SELECT player_id FROM player_cities GROUP BY player_id HAVING COUNT(*) > 1 LIMIT 1`;
    if (duplicateOwners.length === 0) {
      await db`ALTER TABLE player_cities ADD UNIQUE KEY uq_player_city_owner (player_id)`;
    }
  }
  return db;
}

export async function createLocalApi() {
  const db = await openDatabase();

  async function currentUser(request) {
    const token = cookieToken(request);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = first(await db`SELECT p.id, p.username FROM player_sessions s
      JOIN players p ON p.id = s.player_id WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > ${Date.now()}`);
    return row ? userFrom(row) : null;
  }

  async function requireUser(request) {
    const user = await currentUser(request);
    if (!user) fail(401, 'Entre na sua conta para acessar suas cidades.');
    return user;
  }

  async function issueSession(user) {
    const token = randomBytes(32).toString('hex');
    await db`INSERT INTO player_sessions (token_hash, player_id, expires_at)
      VALUES (${hashToken(token)}, ${user.id}, ${Date.now() + SESSION_MS})`;
    return json({ user }, 200, { 'Set-Cookie': sessionCookie(token, Math.floor(SESSION_MS / 1000)) });
  }

  async function city(userId, id) {
    const row = first(await db`SELECT * FROM player_cities WHERE id = ${id} AND player_id = ${userId}`);
    if (!row) fail(404, 'Cidade não encontrada.');
    return row;
  }

  async function handle(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      if (!['GET', 'HEAD'].includes(method)) {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) fail(403, 'Origem não permitida.');
      }
      if (path === '/api/auth/me' && method === 'GET') {
        return json({ user: await currentUser(request), providers: { github: false, emailCodes: false, turnstileSiteKey: null } });
      }
      if (path === '/api/auth/signup' && method === 'POST') {
        const { username, password } = credentials(await readBody(request), true);
        if (first(await db`SELECT id FROM players WHERE username = ${username}`)) fail(409, 'Esse login já está em uso.');
        const passwordHash = await hashPassword(password);
        try {
          const user = await db.begin(async (tx) => {
            await tx`INSERT INTO players (username, password_hash, created_at) VALUES (${username}, ${passwordHash}, ${Date.now()})`;
            const row = first(await tx`SELECT LAST_INSERT_ID() AS id`);
            return { id: Number(row.id), email: username };
          });
          const response = await issueSession(user);
          return json({ kind: 'user', user }, 200, { 'Set-Cookie': response.headers.get('set-cookie') });
        } catch (error) {
          if (error?.code === 'ER_DUP_ENTRY') fail(409, 'Esse login já está em uso.');
          throw error;
        }
      }
      if (path === '/api/auth/login' && method === 'POST') {
        const { username, password } = credentials(await readBody(request), false);
        const key = username.toLowerCase();
        const attempts = loginFailures.get(key);
        if (attempts && attempts.until > Date.now() && attempts.count >= 5) fail(429, 'Muitas tentativas. Tente novamente em alguns minutos.');
        const row = first(await db`SELECT id, username, password_hash FROM players WHERE username = ${username}`);
        const dummy = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;
        if (!(await verifyPassword(password, row?.password_hash ?? dummy)) || !row) {
          loginFailures.set(key, { count: (attempts?.until > Date.now() ? attempts.count : 0) + 1, until: Date.now() + 10 * 60_000 });
          fail(401, 'Login ou senha incorretos.');
        }
        loginFailures.delete(key);
        return issueSession(userFrom(row));
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        const token = cookieToken(request);
        if (token) await db`DELETE FROM player_sessions WHERE token_hash = ${hashToken(token)}`;
        return empty(204, { 'Set-Cookie': sessionCookie('', 0) });
      }
      if (path === '/api/saves' && method === 'GET') {
        const user = await requireUser(request);
        const rows = await db`SELECT id, name, population, funds, day, size, preset, seed, updated_at
          FROM player_cities WHERE player_id = ${user.id} ORDER BY updated_at DESC`;
        return json({ saves: rows.map(metaFrom) });
      }
      if (path === '/api/saves' && method === 'POST') {
        const user = await requireUser(request);
        const { meta, data } = saveBody(await readBody(request));
        const id = await db.begin(async (tx) => {
          await tx`SELECT id FROM players WHERE id = ${user.id} FOR UPDATE`;
          const count = first(await tx`SELECT COUNT(*) AS n FROM player_cities WHERE player_id = ${user.id}`);
          if (Number(count.n) >= 1) fail(403, 'Sua conta já tem uma cidade. Exclua-a antes de criar outra.');
          await tx`INSERT INTO player_cities (player_id, name, population, funds, day, size, preset, seed, updated_at, data)
            VALUES (${user.id}, ${meta.name.trim()}, ${meta.population}, ${meta.funds}, ${meta.day}, ${meta.size}, ${meta.preset}, ${meta.seed}, ${Date.now()}, ${data})`;
          return Number(first(await tx`SELECT LAST_INSERT_ID() AS id`).id);
        });
        return json({ meta: metaFrom(await city(user.id, id)) }, 201);
      }
      const saveMatch = path.match(/^\/api\/saves\/(\d+)$/);
      if (saveMatch) {
        const user = await requireUser(request);
        const id = Number(saveMatch[1]);
        if (!Number.isSafeInteger(id) || id <= 0) fail(400, 'Cidade inválida.');
        if (method === 'GET') {
          const row = await city(user.id, id);
          return json({ meta: metaFrom(row), data: JSON.parse(row.data) });
        }
        if (method === 'PUT') {
          await city(user.id, id);
          const { meta, data } = saveBody(await readBody(request));
          await db`UPDATE player_cities SET name = ${meta.name.trim()}, population = ${meta.population},
            funds = ${meta.funds}, day = ${meta.day}, size = ${meta.size}, preset = ${meta.preset},
            seed = ${meta.seed}, updated_at = ${Date.now()}, data = ${data}
            WHERE id = ${id} AND player_id = ${user.id}`;
          return json({ meta: metaFrom(await city(user.id, id)) });
        }
        if (method === 'DELETE') {
          await city(user.id, id);
          await db`DELETE FROM player_cities WHERE id = ${id} AND player_id = ${user.id}`;
          return empty();
        }
      }
      if (path === '/api/tour' && method === 'GET') {
        const user = await requireUser(request);
        const row = first(await db`SELECT step, done FROM player_tours WHERE player_id = ${user.id}`);
        return json({ progress: row ? { step: row.step, done: !!row.done } : null });
      }
      if (path === '/api/tour' && method === 'PUT') {
        const user = await requireUser(request);
        const body = await readBody(request);
        if (typeof body?.step !== 'string' || body.step.length > 64 || typeof body.done !== 'boolean') fail(400, 'Progresso inválido.');
        await db`INSERT INTO player_tours (player_id, step, done) VALUES (${user.id}, ${body.step}, ${body.done})
          ON DUPLICATE KEY UPDATE step = VALUES(step), done = VALUES(done)`;
        return empty();
      }
      if (path === '/api/guest/heartbeat' && method === 'POST') return json({ kind: 'member' });
      if (path === '/api/events' && method === 'POST') return empty();
      if (path === '/api/health' && method === 'GET') return json({ ok: true, database: 'mariadb' });
      return json({ error: 'Rota não encontrada.' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error('Erro na API local:', error);
      return json({ error: 'Não foi possível acessar o banco de dados.' }, 500);
    }
  }

  return { handle, close: () => db.close() };
}
