const assert = require('node:assert/strict');

function assertAdminCardQaTarget(input) {
  const url = new URL(input.DATABASE_URL);
  assert.equal(input.ADMIN_CARD_QA_CONFIRM, 'isolated-no-outbound-network');
  assert.equal(url.protocol, 'postgresql:');
  assert.match(url.hostname, /^tourism-admin-qa-[0-9a-f]{8}-db$/);
  assert.equal(url.pathname, '/qa_admin');
  assert.equal(url.username, 'qa_admin');
  assert.ok(url.password);
  return url;
}

module.exports = { assertAdminCardQaTarget };
