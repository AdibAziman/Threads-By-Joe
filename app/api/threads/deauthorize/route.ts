import { NextRequest, NextResponse } from "next/server";
import { audit } from "../../../../lib/audit";
import { encrypt } from "../../../../lib/crypto";
import { db } from "../../../../lib/db";
import { parseSignedRequest } from "../../../../lib/meta";

export const dynamic = "force-dynamic";

/** Meta calls this when a person removes the app from their Threads settings: drop the token immediately. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest(form?.get("signed_request") as string | null);
  if (!data?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const rows = db().prepare("SELECT id, user_id FROM accounts WHERE threads_user_id=?").all(String(data.user_id)) as { id: string; user_id: string }[];
  for (const r of rows) {
    db().prepare("UPDATE accounts SET token_enc=?, status='needs_reconnect' WHERE id=?").run(encrypt("revoked"), r.id);
    audit({ userId: r.user_id, accountId: r.id, actor: "system", action: "account.deauthorized" });
  }
  return NextResponse.json({ ok: true });
}
