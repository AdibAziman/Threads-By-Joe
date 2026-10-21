import Link from "next/link";
import { env } from "../../lib/env";

export const metadata = { title: "Data deletion" };

export default async function DataDeletion({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const code = (await searchParams).code;
  return (
    <main className="wrap" style={{ maxWidth: 640, padding: "40px 28px 80px" }}>
      <Link href="/" className="small muted">← ThreadsByJoe</Link>
      <h1 style={{ margin: "16px 0 8px" }}>Data deletion</h1>
      {typeof code === "string" ? (
        <p className="muted">Your deletion request was received and processed. Confirmation code: <span className="mono">{code.replace(/[^\w-]/g, "").slice(0, 32)}</span>. The Threads access token, drafts, replies and settings for the account were deleted.</p>
      ) : (
        <p className="muted">To delete your data, open Accounts in the dashboard and choose “Disconnect and delete data”, or remove ThreadsByJoe in your Threads settings. You can also email <a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a>.</p>
      )}
    </main>
  );
}
