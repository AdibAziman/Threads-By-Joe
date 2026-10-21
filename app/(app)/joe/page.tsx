import { requireActiveAccount } from "../../../lib/active";
import { isKilled } from "../../../lib/audit";
import { requireUser } from "../../../lib/auth";
import { effectivePlan, getProfile, getRules } from "../../../lib/store";
import { KIND_LABEL, POST_KINDS } from "../../../lib/joe";
import { killSwitchAction, saveModeAction, saveProfileAction, saveRulesAction, togglePauseAction } from "../../actions";
import { Flash, flashFrom, type SP } from "../../components/Flash";
import { PageHead, StatusBadge } from "../../components/ui";

export const metadata = { title: "Joe settings" };
export const dynamic = "force-dynamic";

export default async function JoeSettings({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { account } = await requireActiveAccount(user);
  const { ok, error } = await flashFrom(searchParams);
  const profile = getProfile(account.id);
  const rules = getRules(account.id);
  const plan = effectivePlan(user);
  const autoAllowed = Boolean(plan?.autoMode);

  return (
    <>
      <PageHead title="Joe settings" sub={`How Joe works on @${account.username}.`}>
        <StatusBadge status={account.status} />
      </PageHead>
      <Flash ok={ok} error={error} />

      <div className="stack">
        <form action={saveModeAction} className="card card-pad stack">
          <input type="hidden" name="accountId" value={account.id} />
          <div>
            <h2>Mode</h2>
            <p className="muted small" style={{ marginTop: 4 }}>You decide how much Joe may do without asking. Start with Copilot. Move to Auto only once the drafts consistently sound like you.</p>
          </div>
          <div className="seg" role="radiogroup" aria-label="Joe mode">
            <label>
              <input type="radio" name="mode" value="manual" defaultChecked={account.mode === "manual"} />
              <span className="opt"><b>Manual</b><span>Joe writes only when you ask. Replies are fetched on request. Nothing is queued for you.</span></span>
            </label>
            <label>
              <input type="radio" name="mode" value="copilot" defaultChecked={account.mode === "copilot"} />
              <span className="opt"><b>Copilot (recommended)</b><span>Joe drafts posts and replies on his own. Every one waits in your approval queue.</span></span>
            </label>
            <label>
              <input type="radio" name="mode" value="auto" defaultChecked={account.mode === "auto"} disabled={!autoAllowed} />
              <span className="opt"><b>Auto</b><span>{autoAllowed ? "Joe posts and answers praise and simple questions himself, inside your caps. Risky items still wait for you." : "Not included in your current plan."}</span></span>
            </label>
          </div>
          {autoAllowed && account.mode !== "auto" && (
            <label className="row small">
              <input type="checkbox" name="confirm" value="yes" />
              <span>If I choose Auto, I understand Joe will publish to my real Threads account without asking, and that Meta can restrict accounts for spammy behavior.</span>
            </label>
          )}
          <div><button className="btn btn-primary" type="submit">Save mode</button></div>
        </form>

        <section className="card card-pad">
          <div className="spread">
            <div>
              <h2>Pause Joe</h2>
              <p className="muted small" style={{ marginTop: 4 }}>Stops everything for this account immediately: no generating, posting or replying.</p>
            </div>
            <form action={togglePauseAction}>
              <input type="hidden" name="accountId" value={account.id} />
              <input type="hidden" name="back" value="/joe" />
              <button className={`btn ${account.status === "paused" ? "btn-primary" : ""}`} type="submit" disabled={account.status === "needs_reconnect"}>{account.status === "paused" ? "Resume Joe" : "Pause Joe"}</button>
            </form>
          </div>
          {user.is_admin && (
            <div className="spread" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <div>
                <h3>Global kill switch (operator)</h3>
                <p className="muted small" style={{ marginTop: 4 }}>Stops Joe for every account on this server. Currently {isKilled() ? "ON" : "off"}.</p>
              </div>
              <form action={killSwitchAction}>
                <input type="hidden" name="on" value={isKilled() ? "0" : "1"} />
                <button className="btn btn-danger" type="submit">{isKilled() ? "Turn kill switch off" : "Turn kill switch on"}</button>
              </form>
            </div>
          )}
        </section>

        <form action={saveProfileAction} className="card card-pad stack">
          <input type="hidden" name="accountId" value={account.id} />
          <div>
            <h2>Brand profile</h2>
            <p className="muted small" style={{ marginTop: 4 }}>Everything Joe writes starts here. The more specific you are, the less generic it sounds.</p>
          </div>
          <label className="field">
            <span className="name">Voice</span>
            <textarea name="voice" rows={3} defaultValue={profile.voice} placeholder="Dry, warm, plain-spoken. Short sentences. Never salesy. Says 'I' not 'we'." />
          </label>
          <div className="grid grid-2">
            <label className="field"><span className="name">Niche</span><input type="text" name="niche" defaultValue={profile.niche} placeholder="Productivity for freelance designers" /></label>
            <label className="field"><span className="name">Audience</span><input type="text" name="audience" defaultValue={profile.audience} placeholder="Solo designers earning under $100k" /></label>
          </div>
          <label className="field">
            <span className="name">Offer</span>
            <textarea name="offer" rows={3} defaultValue={profile.offer} placeholder="The only facts Joe may use when promoting. e.g. 'Brand audit, $299, delivered in 5 days, book at example.com/audit'. Leave empty to disable promo posts." />
            <span className="hint">Joe is told never to invent prices, discounts, deadlines or results. Keep this accurate.</span>
          </label>
          <div className="grid grid-2">
            <label className="field"><span className="name">Language</span><input type="text" name="language" defaultValue={profile.language} /></label>
            <label className="field">
              <span className="name">Emoji</span>
              <select name="emojiPolicy" defaultValue={profile.emojiPolicy}>
                <option value="none">None</option>
                <option value="sparingly">Sparingly</option>
                <option value="freely">Freely</option>
              </select>
            </label>
          </div>
          <div className="grid grid-2">
            <label className="field">
              <span className="name">Banned words and topics</span>
              <textarea name="bannedTerms" rows={3} defaultValue={profile.bannedTerms.join("\n")} placeholder="One per line. Any draft containing these is blocked." />
            </label>
            <label className="field">
              <span className="name">Allowed link domains</span>
              <textarea name="allowedDomains" rows={3} defaultValue={profile.allowedDomains.join("\n")} placeholder="example.com" />
              <span className="hint">Links to any other domain are blocked. Empty means no links at all.</span>
            </label>
          </div>
          <label className="field">
            <span className="name">Example posts in your voice</span>
            <textarea name="samplePosts" rows={6} defaultValue={profile.samplePosts.join("\n\n")} placeholder="Paste 3 to 8 of your best posts. Separate posts with a blank line." />
          </label>
          <div className="grid grid-2">
            <label className="row"><input type="checkbox" name="disclosureEnabled" defaultChecked={profile.disclosureEnabled} /><span className="small">Add an AI disclosure to posts</span></label>
            <label className="field"><span className="name">Disclosure text</span><input type="text" name="disclosureText" defaultValue={profile.disclosureText} maxLength={60} /></label>
          </div>
          <div><button className="btn btn-primary" type="submit">Save brand profile</button></div>
        </form>

        <form action={saveRulesAction} className="card card-pad stack">
          <input type="hidden" name="accountId" value={account.id} />
          <div>
            <h2>Schedule and guardrails</h2>
            <p className="muted small" style={{ marginTop: 4 }}>Caps and quiet hours apply to everything Joe does by himself. Things you approve yourself are not throttled.</p>
          </div>
          <label className="row"><input type="checkbox" name="autopilot" defaultChecked={rules.autopilot} /><span><b>Autopilot</b>: Joe fills your posting slots for the next 2 days (queued for approval in Copilot, scheduled directly in Auto).</span></label>
          <div className="grid grid-2">
            <label className="field"><span className="name">Posting times</span><textarea name="postTimes" rows={2} defaultValue={rules.postTimes.join("\n")} /><span className="hint">24-hour, one per line, e.g. 09:00</span></label>
            <label className="field"><span className="name">Time zone</span><input type="text" name="timezone" defaultValue={rules.timezone} placeholder="Europe/London" /><span className="hint">IANA name, e.g. America/New_York, Asia/Kuala_Lumpur</span></label>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="name" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Post types Joe may rotate through</legend>
            <div className="row-wrap">
              {POST_KINDS.map((k) => (
                <label key={k} className="row small"><input type="checkbox" name="postKinds" value={k} defaultChecked={rules.postKinds.includes(k)} />{KIND_LABEL[k]}</label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-4">
            <label className="field"><span className="name">Posts per day (max)</span><input type="number" name="dailyPostCap" min={0} max={20} defaultValue={rules.dailyPostCap} /></label>
            <label className="field"><span className="name">Replies per day (max)</span><input type="number" name="dailyReplyCap" min={0} max={200} defaultValue={rules.dailyReplyCap} /></label>
            <label className="field"><span className="name">Gap between posts (min)</span><input type="number" name="minGapMinutes" min={0} max={1440} defaultValue={rules.minGapMinutes} /></label>
            <span />
            <label className="field"><span className="name">Quiet from</span><input type="time" name="quietStart" defaultValue={rules.quietStart} /></label>
            <label className="field"><span className="name">Quiet until</span><input type="time" name="quietEnd" defaultValue={rules.quietEnd} /></label>
            <label className="field"><span className="name">Reply delay min (min)</span><input type="number" name="replyDelayMin" min={0} max={120} defaultValue={rules.replyDelayMin} /></label>
            <label className="field"><span className="name">Reply delay max (min)</span><input type="number" name="replyDelayMax" min={0} max={240} defaultValue={rules.replyDelayMax} /></label>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="name" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Comments Joe may answer by himself in Auto mode</legend>
            <div className="row-wrap">
              {[["praise", "Praise"], ["question", "Simple questions"], ["other", "Other low-risk"]].map(([v, l]) => (
                <label key={v} className="row small"><input type="checkbox" name="autoReplyClasses" value={v} defaultChecked={rules.autoReplyClasses.includes(v)} />{l}</label>
              ))}
            </div>
            <p className="hint small muted" style={{ marginTop: 6 }}>Complaints, sales leads, sensitive topics, hostile comments and spam are never answered automatically, whatever you choose.</p>
          </fieldset>
          <div><button className="btn btn-primary" type="submit">Save rules</button></div>
        </form>
      </div>
    </>
  );
}
