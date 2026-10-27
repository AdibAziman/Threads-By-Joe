export type PlanId = "trial" | "creator" | "pro" | "agency";

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
  accounts: number;
  generationsPerMonth: number;
  replyDraftsPerMonth: number;
  autoMode: boolean;
  blurb: string;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceUsd: 0,
    accounts: 1,
    generationsPerMonth: 10,
    replyDraftsPerMonth: 20,
    autoMode: false,
    blurb: "7 days to see if Joe fits your voice.",
    features: ["1 Threads account", "10 post generations", "20 reply drafts", "Copilot mode only"],
  },
  creator: {
    id: "creator",
    name: "Creator",
    priceUsd: 15,
    accounts: 1,
    generationsPerMonth: 150,
    replyDraftsPerMonth: 300,
    autoMode: true,
    blurb: "For one account run by one person.",
    features: ["1 Threads account", "150 generations a month", "300 reply drafts a month", "Copilot and Auto modes", "Content calendar"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 39,
    accounts: 3,
    generationsPerMonth: 600,
    replyDraftsPerMonth: 1500,
    autoMode: true,
    blurb: "For creators and small brands with a few accounts.",
    features: ["3 Threads accounts", "600 generations a month", "1,500 reply drafts a month", "Copilot and Auto modes", "Priority support"],
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceUsd: 99,
    accounts: 10,
    generationsPerMonth: 2500,
    replyDraftsPerMonth: 6000,
    autoMode: true,
    blurb: "For people managing accounts for clients.",
    features: ["10 Threads accounts", "2,500 generations a month", "6,000 reply drafts a month", "Copilot and Auto modes", "Priority support"],
  },
};

export const TRIAL_DAYS = 7;

export function isPlanId(v: string): v is PlanId {
  return v in PLANS;
}

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "SGD" | "MYR" | "INR";

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  rateFromUsd: number;
  position: "prefix" | "suffix";
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$", name: "US Dollar", rateFromUsd: 1.0, position: "prefix" },
  EUR: { code: "EUR", symbol: "€", name: "Euro", rateFromUsd: 0.92, position: "prefix" },
  GBP: { code: "GBP", symbol: "£", name: "British Pound", rateFromUsd: 0.79, position: "prefix" },
  CAD: { code: "CAD", symbol: "CA$", name: "Canadian Dollar", rateFromUsd: 1.38, position: "prefix" },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", rateFromUsd: 1.52, position: "prefix" },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese Yen", rateFromUsd: 152.0, position: "prefix" },
  SGD: { code: "SGD", symbol: "SG$", name: "Singapore Dollar", rateFromUsd: 1.34, position: "prefix" },
  MYR: { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", rateFromUsd: 4.45, position: "prefix" },
  INR: { code: "INR", symbol: "₹", name: "Indian Rupee", rateFromUsd: 84.5, position: "prefix" },
};

export function getPlanPrice(usdAmount: number, currency: CurrencyCode = "USD", isAnnual: boolean = false) {
  const cfg = CURRENCIES[currency] || CURRENCIES.USD;
  const baseMonthly = isAnnual ? Math.round(usdAmount * 0.8) : usdAmount;
  const convertedMonthly = Math.round(baseMonthly * cfg.rateFromUsd);
  const convertedAnnualTotal = convertedMonthly * 12;
  const formattedMonthly = cfg.position === "prefix" 
    ? `${cfg.symbol}${convertedMonthly.toLocaleString()}` 
    : `${convertedMonthly.toLocaleString()} ${cfg.symbol}`;
  const formattedAnnualTotal = cfg.position === "prefix" 
    ? `${cfg.symbol}${convertedAnnualTotal.toLocaleString()}` 
    : `${convertedAnnualTotal.toLocaleString()} ${cfg.symbol}`;

  return {
    rawMonthly: convertedMonthly,
    rawAnnualTotal: convertedAnnualTotal,
    formattedMonthly,
    formattedAnnualTotal,
    currency: cfg.code,
    symbol: cfg.symbol,
  };
}
