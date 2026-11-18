#!/usr/bin/env node
/**
 * Creates a Neon branch for one E2E shard and prints its connection strings
 * as GitHub step outputs (branch_id, db_url, db_url_pooled).
 *
 * The Neon project allows only a few branches at a time. When two PRs run E2E
 * together, a shard can find it full (HTTP 422). Instead of failing, it waits
 * for another run to delete its branches and tries again, for up to 15 min.
 *
 * Env: NEON_API_KEY, NEON_PROJECT_ID, PARENT_BRANCH_ID, BRANCH_NAME, EXPIRES_AT,
 *      GITHUB_OUTPUT.
 */
import { appendFileSync } from 'node:fs';

const { NEON_API_KEY, NEON_PROJECT_ID, PARENT_BRANCH_ID, BRANCH_NAME, EXPIRES_AT, GITHUB_OUTPUT } = process.env;
const API = `https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}`;
const DB = 'neondb';
const ROLE = 'neondb_owner';
const RETRY_FOR_MS = 15 * 60_000;
const WAIT_MS = 20_000;

async function neon(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${NEON_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const started = Date.now();
let branch;
for (let attempt = 1; ; attempt++) {
  const { status, body } = await neon('/branches', {
    method: 'POST',
    body: JSON.stringify({
      branch: { parent_id: PARENT_BRANCH_ID, name: BRANCH_NAME, expires_at: EXPIRES_AT },
      endpoints: [{ type: 'read_write' }],
    }),
  });
  if (status === 201) {
    branch = body.branch;
    break;
  }
  // 422: branch limit reached (or the parent is busy); 423: project locked
  // by another operation; 429: rate limited. All clear up on their own.
  const retryable = status === 422 || status === 423 || status === 429 || status >= 500;
  if (!retryable || Date.now() - started > RETRY_FOR_MS) {
    console.error(`::error::Could not create Neon branch (HTTP ${status}): ${body.message ?? JSON.stringify(body)}`);
    process.exit(1);
  }
  console.log(`Attempt ${attempt}: HTTP ${status} (${body.message ?? 'no message'}). Retrying in ${WAIT_MS / 1000} s…`);
  await sleep(WAIT_MS);
}
console.log(`Created branch ${branch.id} (${BRANCH_NAME})`);
appendFileSync(GITHUB_OUTPUT, `branch_id=${branch.id}\n`);

async function uri(pooled) {
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ branch_id: branch.id, database_name: DB, role_name: ROLE, pooled: String(pooled) });
    const { status, body } = await neon(`/connection_uri?${q}`);
    if (status === 200 && body.uri) return body.uri;
    await sleep(3_000);
  }
  console.error('::error::Created the branch but could not get its connection string.');
  process.exit(1);
}

for (const [key, pooled] of [['db_url', false], ['db_url_pooled', true]]) {
  const value = await uri(pooled);
  console.log(`::add-mask::${value}`);
  appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`);
}
