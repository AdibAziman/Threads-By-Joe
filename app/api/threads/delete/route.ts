import { NextRequest, NextResponse } from "next/server";
import { audit } from "../../../../lib/audit";
import { randomId } from "../../../../lib/crypto";
import { db } from "../../../../lib/db";
import { env } from "../../../../lib/env";
import { parseSignedRequest } from "../../../../lib/meta";

export const dynamic = "force-dynamic";

/** Data-deletion callback required by Meta: remove the account and everything attached to it (cascade). */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest(form?.get("signed_request") as string | null);
  if (!data?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const rows = db().prepare("SELECT id, user_id FROM accounts WHERE threads_user_id=?").all(String(data.user_id)) as { id: string; user_id: string }[];
  for (const r of rows) {
    db().prepare("DELETE FROM accounts WHERE id=?").run(r.id);
    audit({ userId: r.user_id, actor: "system", action: "account.deleted_by_meta_request" });
  }
  const code = randomId(10);
  return NextResponse.json({ url: `${env.appUrl}/data-deletion?code=${code}`, confirmation_code: code });
}
