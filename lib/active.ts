import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAccount, listAccounts, type Account, type User } from "./store";

export const ACCOUNT_COOKIE = "tbj_account";

/** The account the dashboard is currently looking at. Always re-checked against ownership. */
export async function activeAccount(user: User): Promise<{ account: Account | null; all: Account[] }> {
  const all = listAccounts(user.id);
  const jar = await cookies();
  const wanted = jar.get(ACCOUNT_COOKIE)?.value;
  const account = (wanted && getAccount(user.id, wanted)) || all[0] || null;
  return { account, all };
}

export async function requireActiveAccount(user: User): Promise<{ account: Account; all: Account[] }> {
  const r = await activeAccount(user);
  if (!r.account) redirect("/accounts");
  return { account: r.account, all: r.all };
}
