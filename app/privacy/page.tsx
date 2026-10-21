import Link from "next/link";
import { env } from "../../lib/env";

export const metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <main className="wrap" style={{ maxWidth: 760, padding: "40px 28px 80px" }}>
      <Link href="/" className="small muted">← ThreadsByJoe</Link>
      <h1 style={{ margin: "16px 0 8px" }}>Privacy Policy</h1>
      <p className="muted small">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <div className="stack" style={{ marginTop: 24 }}>
        <section><h2>What we collect</h2><p className="muted">Your email and a hashed password; the Threads account you connect (user id, username and an access token); the brand notes, drafts, posts and settings you create; the comments on your posts that Joe reads; and a log of actions taken on your account.</p></section>
        <section><h2>What we use it for</h2><p className="muted">To write drafts, publish posts and send replies you or Joe approve, to enforce your limits, to bill you, and to keep the service secure. We do not sell your data and do not use it for advertising.</p></section>
        <section><h2>Threads permissions</h2><p className="muted">We request permission to read your profile, publish posts, read replies to your posts, and manage replies. We act only on the account you connect and only as you configure. We do not read private messages or other people's accounts.</p></section>
        <section><h2>AI processing (DeepSeek)</h2><p className="muted">To generate text we send your brand notes, recent post excerpts and the comments Joe is replying to to the DeepSeek API. DeepSeek is a third-party provider, and its servers may be located outside your country. Please read DeepSeek's own privacy policy. Do not put information in your brand notes that you do not want processed by this provider.</p></section>
        <section><h2>Storage and security</h2><p className="muted">Access tokens are encrypted at rest. Passwords are hashed. Access to the database is restricted to the service. No system is perfectly secure, and we will notify affected users if we learn of a breach affecting their data.</p></section>
        <section><h2>Retention and deletion</h2><p className="muted">Disconnecting an account in the Accounts page deletes its token, drafts, replies and settings immediately. Removing the app in Threads, or submitting a data deletion request through Meta, triggers the same deletion. To delete your whole account, email us.</p></section>
        <section><h2>Your rights</h2><p className="muted">You can ask to access, correct or delete your data. Contact <a href={`mailto:${env.contactEmail}`}>{env.contactEmail}</a>.</p></section>
      </div>
    </main>
  );
}
