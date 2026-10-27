"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS, CURRENCIES, getPlanPrice, type CurrencyCode, type PlanId } from "../../lib/plans";

interface PricingSectionProps {
  mode?: "marketing" | "billing";
  cta?: { href: string; label: string };
  currentPlanId?: PlanId;
  paid?: boolean;
  billingEnabled?: boolean;
  checkoutAction?: (formData: FormData) => Promise<void>;
}

export function PricingSection({
  mode = "marketing",
  cta = { href: "/signup", label: "Start 7-day free trial" },
  currentPlanId,
  paid = false,
  billingEnabled = true,
  checkoutAction,
}: PricingSectionProps) {
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [isAnnual, setIsAnnual] = useState(false);

  const planIds: PlanId[] = ["creator", "pro", "agency"];

  return (
    <div className="pricing-wrapper">
      <div className="pricing-toolbar">
        <div className="billing-cadence-toggle" role="group" aria-label="Billing cycle">
          <button
            type="button"
            className={`cadence-btn ${!isAnnual ? "active" : ""}`}
            onClick={() => setIsAnnual(false)}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`cadence-btn ${isAnnual ? "active" : ""}`}
            onClick={() => setIsAnnual(true)}
          >
            Annual <span className="discount-chip">Save 20%</span>
          </button>
        </div>

        <div className="currency-selector-wrap">
          <label htmlFor="currency-select" className="currency-label">Currency:</label>
          <div className="select-container">
            <select
              id="currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="currency-select"
            >
              {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => {
                const c = CURRENCIES[code];
                return (
                  <option key={code} value={code}>
                    {c.code} ({c.symbol}) &mdash; {c.name}
                  </option>
                );
              })}
            </select>
            <span className="select-arrow" aria-hidden="true">▾</span>
          </div>
        </div>
      </div>

      <div className="grid grid-3 pricing-grid">
        {planIds.map((id) => {
          const p = PLANS[id];
          const pricing = getPlanPrice(p.priceUsd, currency, isAnnual);
          const isFeatured = id === "pro";
          const isCurrent = paid && currentPlanId === id;

          return (
            <div
              key={id}
              className={`card plan-card ${isFeatured ? "featured" : ""} ${isCurrent ? "current" : ""}`}
            >
              {isFeatured && <div className="featured-banner">Most Popular</div>}
              
              <div className="plan-header">
                <div className="spread">
                  <h3 className="plan-name">{p.name}</h3>
                  {isCurrent && <span className="badge ok">Current Plan</span>}
                </div>
                <p className="plan-blurb">{p.blurb}</p>
              </div>

              <div className="plan-price-box">
                <div className="price-display">
                  <span className="price-val">{pricing.formattedMonthly}</span>
                  <span className="price-period">/ month</span>
                </div>
                <div className="price-subtext">
                  {isAnnual ? (
                    <span className="annual-billed">Billed annually ({pricing.formattedAnnualTotal}/yr)</span>
                  ) : (
                    <span className="monthly-billed">Billed monthly</span>
                  )}
                </div>
              </div>

              <div className="plan-features-divider" />

              <ul className="plan-features">
                {p.features.map((feature) => (
                  <li key={feature} className="feature-item">
                    <svg
                      className="feature-icon"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="plan-cta-box">
                {mode === "marketing" ? (
                  <Link
                    href={cta.href}
                    className={`btn plan-btn ${isFeatured ? "btn-primary" : ""}`}
                  >
                    {cta.label}
                  </Link>
                ) : (
                  <form action={checkoutAction} className="billing-form">
                    <input type="hidden" name="plan" value={id} />
                    <button
                      type="submit"
                      disabled={!billingEnabled || isCurrent}
                      className={`btn plan-btn ${isFeatured ? "btn-primary" : ""}`}
                    >
                      {isCurrent ? "Active Plan" : paid ? `Switch to ${p.name}` : `Choose ${p.name}`}
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pricing-disclaimer">
        <span>* Approximate conversions based on standard exchange rates. Subscriptions are billed securely through Stripe.</span>
      </div>
    </div>
  );
}
