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
