import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { audit } from "../../../../lib/audit";
import { currentUser } from "../../../../lib/auth";
import { safeEqual, sign } from "../../../../lib/crypto";
import { env } from "../../../../lib/env";
import { effectivePlan, listAccounts, upsertAccount } from "../../../../lib/store";
import { exchangeCode, getProfile, toLongLived } from "../../../../lib/threads";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const to = (path: string, key: "ok" | "error", msg: string) => NextResponse.redirect(`${env.appUrl}${path}?${key}=${encodeURIComponent(msg)}`);
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${env.appUrl}/login`);

  const jar = await cookies();
  const cookie = jar.get("tbj_oauth")?.value ?? "";
  jar.delete("tbj_oauth");
  const [cookieState, cookieSig] = cookie.split(".");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!cookieState || !cookieSig || !safeEqual(cookieState, state) || !safeEqual(sign(`${cookieState}.${user.id}`), cookieSig)) {
    return to("/accounts", "error", "The connection attempt expired or did not match. Please try again.");
  }
  if (req.nextUrl.searchParams.get("error")) return to("/accounts", "error", "Threads did not grant access. No changes were made.");
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return to("/accounts", "error", "Threads did not return an authorization code.");

  try {
    const plan = effectivePlan(user);
    if (!plan) return to("/accounts", "error", "Your trial has ended.");
    const short = await exchangeCode(code.replace(/#_$/, ""));
    const long = await toLongLived(short.accessToken);
    const profile = await getProfile(long.accessToken);
    const existing = listAccounts(user.id).some((a) => a.threads_user_id === profile.id);
    if (!existing && listAccounts(user.id).length >= plan.accounts) return to("/accounts", "error", `Your ${plan.name} plan allows ${plan.accounts} connected account${plan.accounts === 1 ? "" : "s"}.`);
    const acc = upsertAccount(user.id, profile.id, profile.username, long.accessToken, long.expiresAt);
    audit({ userId: user.id, accountId: acc.id, actor: "user", action: existing ? "account.reconnected" : "account.connected", detail: { username: profile.username } });
    (await cookies()).set("tbj_account", acc.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
    return to("/joe", "ok", `Connected @${profile.username}. Joe starts in Copilot mode: nothing posts without your approval.`);
  } catch (e) {
    return to("/accounts", "error", e instanceof Error ? `Could not connect: ${e.message}` : "Could not connect to Threads.");
  }
}
