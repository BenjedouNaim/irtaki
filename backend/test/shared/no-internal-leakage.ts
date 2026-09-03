/**
 * F-TEST-03 — error-envelope leakage guard (TS §36, APIS §9.5, SA §24).
 *
 * APIS §9.5: "Never present, on any error, at any status code: raw Postgres
 * error text, constraint name, stack trace, file path, or internal
 * identifiers beyond `correlationId`."
 *
 * This module is the single place that decides what "leaking internals"
 * means. {@link findInternalLeak} inspects a serialized response body and
 * returns the first violation it finds, or `null`. It is deliberately
 * transport-agnostic so it can be applied to a supertest `Response`, a raw
 * string, or a plain object.
 *
 * `no-internal-leakage.setup.ts` wires it into supertest globally, so it
 * runs against EVERY response the integration suite ever asserts on —
 * existing error-path tests included — not only the specs written for
 * this issue.
 */

import { inspect } from 'util';

export interface InternalLeak {
  /** Which class of internal detail leaked. */
  kind:
    'postgres-error' | 'constraint-name' | 'stack-trace' | 'filesystem-path';
  /** The human-readable name of the signature that matched. */
  signature: string;
  /** The offending excerpt, trimmed for a readable assertion message. */
  excerpt: string;
}

interface LeakSignature {
  kind: InternalLeak['kind'];
  name: string;
  pattern: RegExp;
}

/**
 * Postgres surfaces its failures as English driver text. None of it is
 * user-facing (every user-facing message is Arabic, API-X06), so any of
 * these strings in a body means a `QueryFailedError` reached the client.
 */
const POSTGRES_SIGNATURES: LeakSignature[] = [
  {
    kind: 'postgres-error',
    name: 'unique violation text',
    pattern: /duplicate key value violates unique constraint/i,
  },
  {
    kind: 'postgres-error',
    name: 'foreign key violation text',
    pattern: /violates foreign key constraint/i,
  },
  {
    kind: 'postgres-error',
    name: 'check violation text',
    pattern: /violates (?:check|not-null|exclusion) constraint/i,
  },
  {
    kind: 'postgres-error',
    name: 'not-null violation text',
    pattern: /null value in column .* violates/i,
  },
  {
    kind: 'postgres-error',
    name: 'missing relation/column text',
    pattern: /(?:relation|column|function|type) "[^"]+" does not exist/i,
  },
  {
    kind: 'postgres-error',
    name: 'invalid input syntax text',
    pattern: /invalid input (?:syntax|value) for/i,
  },
  {
    kind: 'postgres-error',
    name: 'SQL syntax error text',
    pattern: /syntax error at or near/i,
  },
  {
    kind: 'postgres-error',
    name: 'serialization/deadlock text',
    pattern: /could not serialize access|deadlock detected/i,
  },
  {
    kind: 'postgres-error',
    name: 'TypeORM driver error class',
    pattern: /QueryFailedError|EntityNotFoundError|driverError|\bpg_[a-z_]+/,
  },
  {
    kind: 'postgres-error',
    name: 'raw SQL statement echo',
    pattern:
      /\b(?:SELECT\s+[\w".*]+\s+FROM|INSERT\s+INTO\s+\w+|UPDATE\s+\w+\s+SET|DELETE\s+FROM\s+\w+)\b/i,
  },
  {
    kind: 'postgres-error',
    name: 'pg error object field',
    pattern:
      /(?:"|')(?:severity|routine|sqlState|internalQuery|dataType|constraint)(?:"|')\s*:/,
  },
];

/**
 * Every table in this schema (DBD's 18 + `auth_tokens` DBT-19 + TypeORM's
 * own `migrations`). Used to recognise Postgres' default constraint names
 * (`<table>_<column>_key`, `<table>_pkey`, …) precisely, so a legitimate
 * response field that merely ends in `_key` can never be mistaken for one.
 */
const TABLE_NAMES = [
  'audit_entries',
  'auth_tokens',
  'coverage_intervals',
  'daily_reports',
  'device_tokens',
  'groups',
  'hizb_boundaries',
  'join_request_ahzab',
  'join_requests',
  'memberships',
  'memorization_coverage',
  'migrations',
  'notification_categories',
  'notification_log',
  'notification_preferences',
  'payment_records',
  'reference_data_version',
  'surahs',
  'users',
  'weekly_reports',
].join('|');

/**
 * Constraint and index identifiers as this schema actually names them
 * (`fk_*`, `idx_*`, `<table>_*_key`, `*_pkey`, `*_check`, and DBD's
 * `DB-UQ-nn` / `DB-CHK-nn` / `DB-IDX-nn` literals, which are the real
 * `conname`s here). None of them may appear in a response: the only rule
 * identifiers the envelope carries are `VR-*`, `BR-*` and `DBT-*`
 * (APIS §9.5 `details[]`).
 */
const CONSTRAINT_SIGNATURES: LeakSignature[] = [
  {
    kind: 'constraint-name',
    name: 'DBD constraint/index id',
    pattern: /\bDB-(?:UQ|CHK|IDX)-\d+/,
  },
  {
    kind: 'constraint-name',
    name: 'fk_/idx_ constraint name',
    pattern: /\b(?:fk|idx)_[a-z0-9]+_[a-z0-9_]+/,
  },
  {
    kind: 'constraint-name',
    name: 'Postgres default constraint suffix',
    pattern: /\b[a-z][a-z0-9_]*_(?:pkey|fkey|check|excl)\b/,
  },
  {
    kind: 'constraint-name',
    name: 'Postgres default unique-index name',
    pattern: new RegExp(`\\b(?:${TABLE_NAMES})_[a-z0-9_]*key\\b`),
  },
  {
    kind: 'constraint-name',
    name: 'TypeORM generated constraint name',
    pattern: /\b(?:PK|FK|UQ|IDX|REL|CHK)_[0-9a-f]{16,}/,
  },
];

const STACK_SIGNATURES: LeakSignature[] = [
  {
    kind: 'stack-trace',
    name: 'V8 stack frame',
    pattern: /\bat\s+(?:new\s+)?[A-Za-z_$][\w$.<>]*\s*\(/,
  },
  {
    kind: 'stack-trace',
    name: 'indented stack frame',
    pattern: /\\n\s{2,}at\s|\n\s{2,}at\s/,
  },
  {
    kind: 'stack-trace',
    name: 'source location',
    pattern: /[\w./\\-]+\.(?:ts|js|mjs|cjs):\d+:\d+/,
  },
  {
    kind: 'stack-trace',
    name: 'node internals frame',
    pattern: /\bnode:internal\/|\(internal\/process\//,
  },
];

/**
 * A leading delimiter is required so a base64 cursor (whose alphabet
 * includes `/`) can never be mistaken for an absolute path.
 */
const PATH_SIGNATURES: LeakSignature[] = [
  {
    kind: 'filesystem-path',
    name: 'absolute POSIX path',
    pattern:
      /(?:^|[\s"'(,:[])\/(?:Users|home|var|usr|opt|etc|tmp|root|srv|app|private)\/[A-Za-z0-9._-]/,
  },
  {
    kind: 'filesystem-path',
    name: 'Windows path',
    pattern: /\b[A-Za-z]:\\\\?[A-Za-z0-9._-]+\\\\?/,
  },
  {
    kind: 'filesystem-path',
    name: 'project-internal path',
    pattern:
      /node_modules[/\\]|(?:^|[\s"'(,:[])(?:src|dist)[/\\](?:modules|shared|database)[/\\]/,
  },
];

const SIGNATURES: LeakSignature[] = [
  ...POSTGRES_SIGNATURES,
  ...CONSTRAINT_SIGNATURES,
  ...STACK_SIGNATURES,
  ...PATH_SIGNATURES,
];

/** Normalizes any body shape into the text the signatures are matched on. */
export function serializeBody(body: unknown): string {
  if (body === undefined || body === null) {
    return '';
  }
  if (typeof body === 'string') {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }
  try {
    return JSON.stringify(body);
  } catch {
    // Circular or otherwise unserializable: `inspect` still renders every
    // nested value, which is what the signatures need to see.
    return inspect(body, { depth: 8 });
  }
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${
    end < text.length ? '…' : ''
  }`;
}

/**
 * Returns the first internal detail the body leaks, or `null` when the body
 * is clean. Never throws — callers decide how to report.
 */
export function findInternalLeak(body: unknown): InternalLeak | null {
  const text = serializeBody(body);
  if (text.length === 0) {
    return null;
  }

  for (const signature of SIGNATURES) {
    const match = signature.pattern.exec(text);
    if (match) {
      return {
        kind: signature.kind,
        signature: signature.name,
        excerpt: excerptAround(text, match.index, match[0].length),
      };
    }
  }

  return null;
}

export function describeLeak(
  leak: InternalLeak,
  context?: { method?: string; path?: string; status?: number },
): string {
  const where = context
    ? `${context.method ?? '?'} ${context.path ?? '?'} → ${
        context.status ?? '?'
      }`
    : 'response';
  return [
    `Response body leaks an internal detail (APIS §9.5 / SA §24 / TS §36).`,
    `  where     : ${where}`,
    `  kind      : ${leak.kind}`,
    `  signature : ${leak.signature}`,
    `  excerpt   : ${leak.excerpt}`,
  ].join('\n');
}

/** Minimal structural view of a supertest/superagent response. */
export interface InspectableResponse {
  status?: number;
  body?: unknown;
  text?: string;
  request?: { method?: string; url?: string };
}

/**
 * Asserts a single response carries no Postgres error text, constraint name,
 * stack trace or filesystem path — at any status code. Prefer letting the
 * global supertest hook (`no-internal-leakage.setup.ts`) do this for you;
 * call it directly only when the body did not come from supertest.
 */
export function expectNoInternalLeakage(response: InspectableResponse): void {
  const leak =
    findInternalLeak(response.body) ?? findInternalLeak(response.text);
  if (leak) {
    throw new Error(
      describeLeak(leak, {
        method: response.request?.method,
        path: response.request?.url,
        status: response.status,
      }),
    );
  }
}
