import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'trial',
    trial_ends_at TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    threads_user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    token_enc TEXT NOT NULL,
    token_expires_at TEXT,
    mode TEXT NOT NULL DEFAULT 'copilot' CHECK (mode IN ('manual','copilot','auto')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','needs_reconnect')),
    last_poll_at TEXT,
    last_refresh_at TEXT,
    last_plan_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, threads_user_id)
  );

  CREATE TABLE brand_profiles (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    voice TEXT NOT NULL DEFAULT '',
    niche TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT '',
    offer TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'English',
    emoji_policy TEXT NOT NULL DEFAULT 'sparingly',
    banned_terms TEXT NOT NULL DEFAULT '[]',
    allowed_domains TEXT NOT NULL DEFAULT '[]',
    sample_posts TEXT NOT NULL DEFAULT '[]',
    disclosure_enabled INTEGER NOT NULL DEFAULT 0,
    disclosure_text TEXT NOT NULL DEFAULT '(AI-assisted)'
  );

  CREATE TABLE rules (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    autopilot INTEGER NOT NULL DEFAULT 0,
    post_times TEXT NOT NULL DEFAULT '["09:00","18:00"]',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    post_kinds TEXT NOT NULL DEFAULT '["hook","tip","promo","random"]',
    daily_post_cap INTEGER NOT NULL DEFAULT 3,
    daily_reply_cap INTEGER NOT NULL DEFAULT 40,
    quiet_start TEXT NOT NULL DEFAULT '23:00',
    quiet_end TEXT NOT NULL DEFAULT '07:00',
    min_gap_minutes INTEGER NOT NULL DEFAULT 90,
    reply_delay_min INTEGER NOT NULL DEFAULT 2,
    reply_delay_max INTEGER NOT NULL DEFAULT 12,
    auto_reply_classes TEXT NOT NULL DEFAULT '["praise","question"]'
  );

  CREATE TABLE content_items (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','pending_approval','scheduled','publishing','published','failed','rejected')),
    scheduled_at TEXT,
    created_by TEXT NOT NULL DEFAULT 'user',
    approved_by TEXT,
    approved_at TEXT,
    risk_flags TEXT NOT NULL DEFAULT '[]',
    container_id TEXT,
    threads_media_id TEXT,
    permalink TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_content_account_status ON content_items(account_id, status, scheduled_at);

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    reply_id TEXT NOT NULL,
    root_post_id TEXT NOT NULL,
    post_text TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    reply_ts TEXT,
    class TEXT,
    risk REAL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','pending_approval','approved','sent','ignored','skipped','failed')),
    draft_text TEXT,
    draft_flags TEXT NOT NULL DEFAULT '[]',
    send_after TEXT,
    approved_by TEXT,
    container_id TEXT,
    sent_reply_id TEXT,
    sent_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (account_id, reply_id)
  );
  CREATE INDEX idx_conv_account_status ON conversations(account_id, status);

  CREATE TABLE llm_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    account_id TEXT,
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    ok INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_llm_user_time ON llm_calls(user_id, created_at);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    account_id TEXT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_audit_account_time ON audit_log(account_id, created_at);

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE stripe_events (id TEXT PRIMARY KEY, received_at TEXT NOT NULL);
  CREATE TABLE login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL);
  `,
];

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;
  const file = path.resolve(env.databasePath);
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(env.databasePath === ":memory:" ? ":memory:" : file);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 5000");
  migrate(d);
  instance = d;
  return d;
}

function migrate(d: Database.Database) {
  const current = d.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    d.transaction(() => {
      d.exec(MIGRATIONS[i]);
      d.pragma(`user_version = ${i + 1}`);
    })();
  }
}

/** Test helper: drop the cached connection. */
export function resetDbForTests() {
  instance?.close();
  instance = null;
}

export const nowIso = () => new Date().toISOString();
export const json = <T>(v: string | null | undefined, fallback: T): T => {
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};
