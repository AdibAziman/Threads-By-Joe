import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, nowIso } from "./db";
import { safeEqual, sign } from "./crypto";
import { env } from "./env";
import { getUser, type User } from "./store";

const COOKIE = "tbj_session";
const MAX_AGE_S = 14 * 86400;

export async function startSession(user: User) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const body = `${user.id}.${user.session_version}.${exp}`;
  const jar = await cookies();
  jar.set(COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [uid, ver, exp, sig] = parts;
  if (!safeEqual(sign(`${uid}.${ver}.${exp}`), sig)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const user = getUser(uid);
  if (!user || String(user.session_version) !== ver) return null;
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Fixed-window limiter in SQLite so it survives restarts and works across processes. */
export function hitLimit(key: string, max: number, windowMs: number): boolean {
  const row = db().prepare("SELECT count, window_start FROM login_attempts WHERE key=?").get(key) as { count: number; window_start: string } | undefined;
  const now = Date.now();
  if (!row || now - new Date(row.window_start).getTime() > windowMs) {
    db().prepare("INSERT INTO login_attempts (key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=1, window_start=excluded.window_start").run(key, nowIso());
    return false;
  }
  db().prepare("UPDATE login_attempts SET count=count+1 WHERE key=?").run(key);
  return row.count + 1 > max;
}

export function clearLimit(key: string) {
  db().prepare("DELETE FROM login_attempts WHERE key=?").run(key);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}
