import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { env } from "../../../../lib/env";
import { verifyWebhookSignature } from "../../../../lib/meta";
import { safeEqual } from "../../../../lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = env.webhookVerifyToken;
  if (q.get("hub.mode") === "subscribe" && token && safeEqual(q.get("hub.verify_token") ?? "", token)) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Webhooks are only a nudge: they make the poller look sooner. All data still comes from the API. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) return new NextResponse("bad signature", { status: 401 });
  db().prepare("UPDATE accounts SET last_poll_at=NULL WHERE status='active' AND (last_poll_at IS NULL OR last_poll_at < ?)").run(new Date(Date.now() - 60_000).toISOString());
  return NextResponse.json({ ok: true });
}
