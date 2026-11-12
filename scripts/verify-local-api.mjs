import { strict as assert } from 'node:assert';
import { SQL } from 'bun';
import { createLocalApi } from './local-api.mjs';

const base = process.env.OPENPOLIS_API_BASE;
const api = base ? null : await createLocalApi();
const db = new SQL(process.env.OPENPOLIS_MYSQL_URL || 'mysql://root@127.0.0.1:3306/openpolis');
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const names = [`teste_${suffix}a`, `teste_${suffix}b`];
const password = `Teste-${suffix}!`;

async function call(path, method = 'GET', body, cookie) {
  const request = new Request(`${base ?? 'http://127.0.0.1:18787'}/api${path}`, {
    method,
    headers: { ...(body && { 'content-type': 'application/json' }), ...(cookie && { cookie }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  const response = base ? await fetch(request) : await api.handle(request);
  return { status: response.status, data: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

try {
  const invalid = await call('/auth/signup', 'POST', { email: names[0], password, confirmPassword: 'outra' });
  assert.equal(invalid.status, 400);

  const signedUp = await call('/auth/signup', 'POST', { email: names[0], password, confirmPassword: password });
  assert.equal(signedUp.status, 200);
  assert.equal(signedUp.data.user.email, names[0]);
  assert.ok(signedUp.cookie);
  const firstCookie = signedUp.cookie;
  assert.equal((await call('/auth/me', 'GET', undefined, firstCookie)).data.user.email, names[0]);

  const meta = { name: 'Cidade teste', population: 12, funds: 40000, day: 5, size: 64, preset: 'plains', seed: 42 };
  const created = await call('/saves', 'POST', { meta, data: { v: 1, probe: true } }, firstCookie);
  assert.equal(created.status, 201);
  const saveId = created.data.meta.id;
  assert.equal((await call('/saves', 'GET', undefined, firstCookie)).data.saves.length, 1);
  assert.equal((await call(`/saves/${saveId}`, 'GET', undefined, firstCookie)).data.data.probe, true);

  const second = await call('/auth/signup', 'POST', { email: names[1], password, confirmPassword: password });
  assert.equal(second.status, 200);
  assert.equal((await call('/saves', 'GET', undefined, second.cookie)).data.saves.length, 0);
  assert.equal((await call(`/saves/${saveId}`, 'GET', undefined, second.cookie)).status, 404);

  const updated = await call(`/saves/${saveId}`, 'PUT', { meta: { ...meta, funds: 39000 }, data: { v: 1, probe: 'updated' } }, firstCookie);
  assert.equal(updated.data.meta.funds, 39000);
  assert.equal((await call(`/saves/${saveId}`, 'GET', undefined, firstCookie)).data.data.probe, 'updated');
  assert.equal((await call('/auth/logout', 'POST', undefined, firstCookie)).status, 204);
  assert.equal((await call('/auth/me', 'GET', undefined, firstCookie)).data.user, null);
  const loggedIn = await call('/auth/login', 'POST', { email: names[0], password });
  assert.equal(loggedIn.status, 200);
  assert.equal((await call(`/saves/${saveId}`, 'DELETE', undefined, loggedIn.cookie)).status, 204);
  assert.equal((await call('/saves', 'GET', undefined, loggedIn.cookie)).data.saves.length, 0);
  console.log('Cadastro, sessão, login, isolamento entre contas e salvamento: OK');
} finally {
  await db`DELETE FROM players WHERE username IN (${names[0]}, ${names[1]})`;
  await db.close();
  if (api) await api.close();
}
