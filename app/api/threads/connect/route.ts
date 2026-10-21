import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "../../../../lib/auth";
import { randomId, sign } from "../../../../lib/crypto";
import { env } from "../../../../lib/env";
import { effectivePlan, listAccounts } from "../../../../lib/store";
import { authorizeUrl } from "../../../../lib/threads";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${env.appUrl}/login`);
  const back = (msg: string) => NextResponse.redirect(`${env.appUrl}/accounts?error=${encodeURIComponent(msg)}`);
  if (!env.threadsConfigured) return back("Threads is not configured on this server (THREADS_APP_ID and THREADS_APP_SECRET).");
  const plan = effectivePlan(user);
  if (!plan) return back("Your trial has ended. Choose a plan on the Billing page.");
  if (listAccounts(user.id).length >= plan.accounts) return back(`Your ${plan.name} plan allows ${plan.accounts} connected account${plan.accounts === 1 ? "" : "s"}.`);

  const state = randomId(18);
  (await cookies()).set("tbj_oauth", `${state}.${sign(`${state}.${user.id}`)}`, { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https://"), path: "/api/threads", maxAge: 600 });
  return NextResponse.redirect(authorizeUrl(state));
}
