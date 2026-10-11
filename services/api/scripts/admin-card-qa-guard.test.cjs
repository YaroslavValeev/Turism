const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { assertAdminCardQaTarget } = require('./admin-card-qa-guard.cjs');
const password = crypto.randomBytes(12).toString('hex');
const valid = {
  DATABASE_URL: `postgresql://qa_admin:${password}@tourism-admin-qa-1234abcd-db:5432/qa_admin`,
  ADMIN_CARD_QA_CONFIRM: 'isolated-no-outbound-network',
};

test('accepts the explicitly confirmed disposable target', () => {
  assert.equal(assertAdminCardQaTarget(valid).hostname, 'tourism-admin-qa-1234abcd-db');
});
for (const [name, replacement] of [
  ['missing confirmation', { ADMIN_CARD_QA_CONFIRM: undefined }],
  ['production host', { DATABASE_URL: valid.DATABASE_URL.replace('tourism-admin-qa-1234abcd-db', 'postgres') }],
  ['loopback alias', { DATABASE_URL: valid.DATABASE_URL.replace('tourism-admin-qa-1234abcd-db', '127.0.0.1') }],
  ['production database', { DATABASE_URL: valid.DATABASE_URL.replace('/qa_admin', '/mywave') }],
  ['privileged existing user', { DATABASE_URL: valid.DATABASE_URL.replace('qa_admin:', 'postgres:') }],
  ['missing password', { DATABASE_URL: valid.DATABASE_URL.replace(`:${password}@`, '@') }],
]) {
  test(`rejects ${name} before connecting`, () => {
    assert.throws(() => assertAdminCardQaTarget({ ...valid, ...replacement }));
  });
}
