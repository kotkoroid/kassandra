// nuke-realms — dev-only Durable Objects purge script.
//
// Finds the RealmRoom namespace in Cloudflare, pages through every DO
// instance that has ever been created (one per realm that has been
// visited since the last purge), and deletes each one — persisted
// storage and all. Run this during development to reclaim storage and
// stop any trickle billing from idle realms.
//
// Prerequisites:
//   CLOUDFLARE_API_TOKEN  — needs "Durable Objects: Edit" permission
//   CLOUDFLARE_ACCOUNT_ID — your account's 32-char hex UUID
//
// Both vars are already required for `bun run deploy` (alchemy reads
// them), so they should be present in your dev shell.
//
// Usage:
//   bun scripts/nuke-realms.ts            # dry-run: list objects only
//   bun scripts/nuke-realms.ts --force    # delete every instance
//   bun scripts/nuke-realms.ts --force --yes  # skip confirmation prompt

const BASE = 'https://api.cloudflare.com/client/v4';

const TOKEN = Bun.env['CLOUDFLARE_API_TOKEN'];
const ACCOUNT = Bun.env['CLOUDFLARE_ACCOUNT_ID'];
const force = process.argv.includes('--force');
const yes = process.argv.includes('--yes');

if (!TOKEN || !ACCOUNT) {
  console.error(
    'Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set.\n' +
      'These are the same vars alchemy uses for `bun run deploy`.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Typed Cloudflare REST helpers
// ---------------------------------------------------------------------------

interface CfResponse<T> {
  readonly success: boolean;
  readonly result: T;
  readonly result_info?: { readonly cursor?: string };
  readonly errors: ReadonlyArray<{ readonly message: string }>;
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<CfResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  });

  // CF returns 200 for success and a structured error body for failures;
  // DELETE returns 200 with result:null on success.
  const body = (await res.json()) as CfResponse<T>;
  if (!body.success) {
    throw new Error(
      `CF API ${res.status} on ${path}: ` +
        body.errors.map((e) => e.message).join(', '),
    );
  }
  return body;
}

// ---------------------------------------------------------------------------
// Step 1 — discover the RealmRoom namespace UUID
// ---------------------------------------------------------------------------

interface DoNamespace {
  readonly id: string;
  readonly name: string;
  readonly script: string;
}

console.log('Fetching Durable Objects namespaces…');
const nsResponse = await cfFetch<ReadonlyArray<DoNamespace>>(
  `/accounts/${ACCOUNT}/workers/durable_objects/namespaces`,
);

// alchemy tags the DO with the class name; the CF namespace name is
// whatever alchemy registered it as. We match loosely so a worker-name
// prefix (e.g. "realm-RealmRoom") still resolves.
const ns = (nsResponse.result ?? []).find((n) => n.name.endsWith('RealmRoom'));
if (!ns) {
  console.log('No RealmRoom namespace found — nothing has been deployed yet.');
  process.exit(0);
}
console.log(`Namespace: ${ns.name}  (id: ${ns.id})`);

// ---------------------------------------------------------------------------
// Step 2 — page through every object in the namespace
// ---------------------------------------------------------------------------

interface DoObject {
  readonly id: string;
  readonly hasStoredData: boolean;
}

const objects: DoObject[] = [];
let cursor: string | undefined;

do {
  const params = new URLSearchParams({ limit: '1000' });
  if (cursor) params.set('cursor', cursor);

  const page = await cfFetch<ReadonlyArray<DoObject>>(
    `/accounts/${ACCOUNT}/workers/durable_objects/namespaces/${ns.id}/objects?${params}`,
  );
  objects.push(...(page.result ?? []));
  cursor = page.result_info?.cursor;
} while (cursor);

if (objects.length === 0) {
  console.log('No Durable Object instances found — namespace is empty.');
  process.exit(0);
}

const withData = objects.filter((o) => o.hasStoredData);
console.log(
  `\nFound ${objects.length} instance(s), ${withData.length} with persisted storage:`,
);
for (const o of objects) {
  const tag = o.hasStoredData ? ' [has data]' : ' [empty]';
  console.log(`  ${o.id}${tag}`);
}

// ---------------------------------------------------------------------------
// Step 3 — bail out if dry-run
// ---------------------------------------------------------------------------

if (!force) {
  console.log(
    '\nDry-run complete.  Re-run with --force to delete all instances.',
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Step 4 — optional confirmation prompt
// ---------------------------------------------------------------------------

if (!yes) {
  process.stdout.write(
    `\nThis will permanently delete ${objects.length} Durable Object instance(s) ` +
      `and all their storage.  Type "yes" to confirm: `,
  );
  const answer = (await new Response(Bun.stdin.stream()).text()).trim();
  if (answer.toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Step 5 — delete each instance
// ---------------------------------------------------------------------------

console.log('');
let deleted = 0;
let failed = 0;

for (const o of objects) {
  try {
    await cfFetch<null>(
      `/accounts/${ACCOUNT}/workers/durable_objects/namespaces/${ns.id}/objects/${o.id}`,
      { method: 'DELETE' },
    );
    const tag = o.hasStoredData ? ' (had data)' : '';
    console.log(`  ✓ ${o.id}${tag}`);
    deleted++;
  } catch (err) {
    console.error(`  ✗ ${o.id}: ${String(err)}`);
    failed++;
  }
}

console.log(
  `\nDone: ${deleted} deleted${failed > 0 ? `, ${failed} failed` : ''}.`,
);
if (failed > 0) process.exit(1);
