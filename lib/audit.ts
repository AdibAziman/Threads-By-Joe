import { db, nowIso } from "./db";

export function audit(opts: {
  userId?: string | null;
  accountId?: string | null;
  actor: "user" | "joe" | "system";
  action: string;
  detail?: Record<string, unknown>;
}) {
  db()
    .prepare("INSERT INTO audit_log (user_id, account_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)")
    .run(opts.userId ?? null, opts.accountId ?? null, opts.actor, opts.action, JSON.stringify(opts.detail ?? {}), nowIso());
}

export function isKilled(): boolean {
  const row = db().prepare("SELECT value FROM settings WHERE key='kill_switch'").get() as { value: string } | undefined;
  return row?.value === "1";
}

export function setKilled(on: boolean) {
  db().prepare("INSERT INTO settings (key,value) VALUES ('kill_switch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(on ? "1" : "0");
}
