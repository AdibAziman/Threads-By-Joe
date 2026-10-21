import { NextRequest, NextResponse } from "next/server";
import { handleStripeEvent, verifyStripeSignature } from "../../../../lib/billing";
import { env } from "../../../../lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), env.stripeWebhookSecret)) {
    return new NextResponse("bad signature", { status: 400 });
  }
  try {
    const result = handleStripeEvent(JSON.parse(raw));
    return NextResponse.json({ received: true, result });
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }
}
