"use client";

import { useActionState } from "react";
import { generateAction, saveContentAction, type GenerateState } from "../actions";
import { CountedTextArea } from "./TextArea";

const KINDS: [string, string, string][] = [
  ["hook", "Hook", "A scroll-stopping opening line"],
  ["story", "Story", "A short story with one takeaway"],
  ["tip", "Tip", "One practical thing to do today"],
  ["promo", "Promo", "A soft promotion of your offer"],
  ["marketing", "Marketing", "Problem, point of view, invitation"],
  ["question", "Question", "Invite replies from your audience"],
  ["random", "Random", "A wildcard that fits your voice"],
];

function SaveForm({ accountId, kind, text, blocked, flags, idx }: { accountId: string; kind: string; text: string; blocked?: string[]; flags?: string[]; idx: number }) {
  return (
    <form action={saveContentAction} className="item" style={{ borderTop: idx ? undefined : "0" }}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="kind" value={kind} />
      <CountedTextArea id={`v-${idx}`} name="text" defaultValue={text} rows={4} />
      {blocked && blocked.length > 0 && <div className="banner bad small">Blocked by safety checks: {blocked.join("; ")}. Edit it before posting.</div>}
      {flags && flags.length > 0 && <div className="chips">{flags.map((f) => <span key={f} className="badge warn">{f}</span>)}</div>}
      <div className="row-wrap">
        <button className="btn btn-primary btn-sm" name="intent" value="queue">Add to approval queue</button>
        <button className="btn btn-sm" name="intent" value="now">Post now</button>
        <button className="btn btn-sm" name="intent" value="draft">Save draft</button>
        <label className="row small" style={{ marginLeft: "auto" }}>
          <span className="muted">Schedule</span>
          <input type="datetime-local" name="scheduleAt" style={{ width: "auto" }} />
        </label>
        <button className="btn btn-sm" name="intent" value="schedule">Schedule</button>
      </div>
    </form>
  );
}

export function ComposeClient({ accountId }: { accountId: string }) {
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(generateAction, {});
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><h2>Ask Joe</h2><span className="small muted">Three variants per request</span></div>
        <form action={formAction} className="card-pad stack">
          <input type="hidden" name="accountId" value={accountId} />
          <div className="grid grid-2">
            <label className="field">
              <span className="name">Post type</span>
              <select name="kind" defaultValue="hook">
                {KINDS.map(([v, l, d]) => (
                  <option key={v} value={v}>{l}: {d}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="name">Topic or angle (optional)</span>
              <input type="text" name="topic" maxLength={300} placeholder="e.g. why consistency beats virality" />
            </label>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Joe is writing…" : "Generate"}</button>
            <span className="small muted">Uses your brand profile from Joe settings.</span>
          </div>
        </form>
      </section>

      {state.error && <div className="banner bad" role="alert">{state.error}</div>}

      {state.variants && (
        <section className="card" aria-live="polite">
          <div className="card-head"><h2>Variants</h2><span className="small muted">Edit freely. Nothing is posted until you choose.</span></div>
          <div className="list">
            {state.variants.map((v, i) => (
              <div key={`${i}-${v.text.slice(0, 20)}`}>
                {v.angle && <div className="label" style={{ padding: "12px 18px 0" }}>{v.angle}</div>}
                <SaveForm accountId={accountId} kind={state.kind ?? "random"} text={v.text} blocked={v.blocked} flags={v.flags} idx={i} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>Write your own</h2></div>
        <SaveForm accountId={accountId} kind="random" text="" idx={99} />
      </section>
    </div>
  );
}
