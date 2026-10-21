/**
 * Safety gate. Pure functions only (no DB, no network) so every rule is unit-testable.
 * Hard failures block the text outright. Soft flags force human approval even in Auto mode.
 */

export const MAX_POST_CHARS = 500;
export const MAX_LINKS = 5; // Threads rejects posts with more than 5 unique links.

export type CommentClass = "praise" | "question" | "lead" | "complaint" | "hostile" | "sensitive" | "spam" | "other";
export const COMMENT_CLASSES: CommentClass[] = ["praise", "question", "lead", "complaint", "hostile", "sensitive", "spam", "other"];
/** Classes that may never be answered automatically, whatever the account's settings say. */
export const NEVER_AUTO: CommentClass[] = ["complaint", "hostile", "sensitive", "spam", "lead"];

export interface GateProfile {
  bannedTerms: string[];
  allowedDomains: string[];
}

export interface GateResult {
  hardFails: string[];
  flags: string[];
}

const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
const BARE_DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|dev|ai|me|ly|xyz|shop|store|link|info|biz)(?:\/[^\s]*)?\b/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/;
const LEAK_RE = /(as an ai (?:language )?model|system prompt|i (?:cannot|can't) (?:comply|assist)|here (?:is|are) (?:your|the|a few) (?:post|variants?|options?)|\[mock\])/i;
const RISKY_CLAIM_RE = /\b(guarantee[ds]?|100\s?%|risk[- ]free|no risk|get rich|cure[sd]?|miracle|double your|passive income|financial freedom|act now|limited time)\b/i;
const INJECTION_RE = /(ignore (?:all |any )?(?:the )?(?:previous|prior|above) (?:instructions|prompts?)|disregard (?:all |your )?(?:previous|prior)|you are now|system prompt|reveal your (?:prompt|instructions)|act as (?:an? )?(?:different|new)|jailbreak|developer mode|post (?:this|my) link)/i;

export function charCount(text: string): number {
  return [...text].length;
}

export function extractLinks(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.match(LINK_RE) ?? []) found.add(normalizeHost(m));
  for (const m of text.match(BARE_DOMAIN_RE) ?? []) found.add(normalizeHost(m));
  return [...found];
}

function normalizeHost(raw: string): string {
  const stripped = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return stripped.split(/[/?#]/)[0].toLowerCase().replace(/[.,;:!]+$/, "");
}

function domainAllowed(host: string, allowed: string[]): boolean {
  return allowed.some((a) => {
    const d = a.toLowerCase().replace(/^www\./, "").trim();
    return d && (host === d || host.endsWith(`.${d}`));
  });
}

export function looksLikeInjection(text: string): boolean {
  return INJECTION_RE.test(text);
}

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  if (words.length < 4) {
    words.forEach((w) => out.add(w));
    return out;
  }
  for (let i = 0; i <= words.length - 3; i++) out.add(words.slice(i, i + 3).join(" "));
  return out;
}

export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  return inter / (A.size + B.size - inter);
}

export function runGate(text: string, kind: "post" | "reply", profile: GateProfile, recent: string[]): GateResult {
  const hardFails: string[] = [];
  const flags: string[] = [];
  const trimmed = text.trim();

  if (!trimmed) hardFails.push("empty");
  if (charCount(trimmed) > MAX_POST_CHARS) hardFails.push(`over ${MAX_POST_CHARS} characters`);

  const lower = trimmed.toLowerCase();
  for (const term of profile.bannedTerms) {
    const t = term.trim().toLowerCase();
    if (t && lower.includes(t)) hardFails.push(`banned term: ${term.trim()}`);
  }

  const links = extractLinks(trimmed);
  if (links.length > MAX_LINKS) hardFails.push(`more than ${MAX_LINKS} links`);
  for (const host of links) {
    if (!domainAllowed(host, profile.allowedDomains)) hardFails.push(`link not on allowlist: ${host}`);
  }

  if (LEAK_RE.test(trimmed)) hardFails.push("looks like AI boilerplate or a prompt leak");

  for (const prev of recent) {
    if (similarity(trimmed, prev) >= (kind === "post" ? 0.6 : 0.7)) {
      hardFails.push("near-duplicate of a recent message");
      break;
    }
  }

  if (kind === "reply" && (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed))) hardFails.push("contains an email address or phone number");

  if (RISKY_CLAIM_RE.test(trimmed)) flags.push("risky claim wording");
  if ((trimmed.match(/!/g) ?? []).length > 3) flags.push("too many exclamation marks");
  if (trimmed.length > 20 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) flags.push("all caps");
  if (/\b\d{2,3}\s?%/.test(trimmed) && kind === "post") flags.push("contains a statistic to fact-check");

  return { hardFails, flags };
}

export type Disposition = "block" | "approval" | "auto";

export function decidePost(mode: "manual" | "copilot" | "auto", gate: GateResult): Disposition {
  if (gate.hardFails.length) return "block";
  if (mode !== "auto") return "approval";
  return gate.flags.length ? "approval" : "auto";
}

export function decideReply(
  mode: "manual" | "copilot" | "auto",
  gate: GateResult,
  cls: CommentClass,
  risk: number,
  autoClasses: string[],
  injected: boolean,
): Disposition {
  if (gate.hardFails.length) return "block";
  if (mode !== "auto") return "approval";
  if (injected || gate.flags.length) return "approval";
  if (NEVER_AUTO.includes(cls)) return "approval";
  if (!autoClasses.includes(cls)) return "approval";
  if (risk >= 0.4) return "approval";
  return "auto";
}

export function parseList(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
