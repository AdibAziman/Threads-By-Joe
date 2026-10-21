function bool(v: string | undefined, fallback = false): boolean {
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get sessionSecret() {
    const s = process.env.SESSION_SECRET || "";
    if (s.length < 24) {
      if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be at least 24 characters");
      return "dev-only-insecure-session-secret-change-me";
    }
    return s;
  },
  get tokenEncKey(): Buffer {
    const raw = process.env.TOKEN_ENC_KEY || "";
    if (!raw) {
      if (process.env.NODE_ENV === "production") throw new Error("TOKEN_ENC_KEY is required");
      return Buffer.alloc(32, 7); // dev only
    }
    const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("TOKEN_ENC_KEY must decode to 32 bytes");
    return buf;
  },
  get threadsAppId() {
    return process.env.THREADS_APP_ID || "";
  },
  get threadsAppSecret() {
    return process.env.THREADS_APP_SECRET || "";
  },
  get threadsConfigured() {
    return Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);
  },
  get webhookVerifyToken() {
    return process.env.THREADS_WEBHOOK_VERIFY_TOKEN || "";
  },
  get deepseekKey() {
    return process.env.DEEPSEEK_API_KEY || "";
  },
  get deepseekBase() {
    return (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  },
  get deepseekModel() {
    return process.env.DEEPSEEK_MODEL || "deepseek-flash";
  },
  get llmMock() {
    return bool(process.env.LLM_MOCK);
  },
  get dryRun() {
    return bool(process.env.DRY_RUN, true);
  },
  get allowSignup() {
    return bool(process.env.ALLOW_SIGNUP, true);
  },
  get contactEmail() {
    return process.env.CONTACT_EMAIL || "support@example.com";
  },
  get databasePath() {
    return process.env.DATABASE_PATH || "./data/threadsbyjoe.db";
  },
  get stripeKey() {
    return process.env.STRIPE_SECRET_KEY || "";
  },
  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || "";
  },
  get billingEnabled() {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  },
};
