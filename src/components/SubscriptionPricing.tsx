
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check, X, AlertTriangle, CheckCircle2, Mail
} from 'lucide-react';
import { useContractStore } from '../lib/store';
import { useLegal } from './LegalCenter';

interface SubscriptionPricingProps {
  onUpgradeComplete?: (tier: number) => void;
  onEnterApp?: (tab?: string) => void;
  session: any;
  onRequestAuth?: () => void;
}

export function SubscriptionPricing({ onUpgradeComplete, onEnterApp, session, onRequestAuth }: SubscriptionPricingProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // The checkout modal is now only used for the lifetime contact request.
  // Paid plans redirect straight to Stripe Checkout (see handleStripeCheckout); access
  // is granted server-side by the Stripe webhook — never on the client.
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Lock background scrolling and handle Escape key closes when checkout modal is active
  useEffect(() => {
    if (selectedPlanForCheckout) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('prism-locked');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('prism-locked');
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedPlanForCheckout) {
        setSelectedPlanForCheckout(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('prism-locked');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPlanForCheckout]);

  const [lifetimeContactType, setLifetimeContactType] = useState<'individual' | 'corporate'>('individual');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [lifetimeFormError, setLifetimeFormError] = useState('');

  const [lifetimeIndName, setLifetimeIndName] = useState('');
  const [lifetimeIndEmail, setLifetimeIndEmail] = useState('');
  const [lifetimeIndPhone, setLifetimeIndPhone] = useState('');
  const [lifetimeIndReferralSource, setLifetimeIndReferralSource] = useState('');

  const [lifetimeBusName, setLifetimeBusName] = useState('');
  const [lifetimeBusEmail, setLifetimeBusEmail] = useState('');
  const [lifetimeBusPhone, setLifetimeBusPhone] = useState('');
  const [lifetimeBusCompanyName, setLifetimeBusCompanyName] = useState('');
  const [lifetimeBusReferralSource, setLifetimeBusReferralSource] = useState('');
  const [lifetimeBusMessage, setLifetimeBusMessage] = useState('');

  const checkoutPlan = useContractStore(s => s.checkoutPlan);
  const setCheckoutPlan = useContractStore(s => s.setCheckoutPlan);

  const [checkoutError, setCheckoutError] = useState<string>('');

  // Tracks which plan (by planKey) is currently redirecting to Stripe so we can
  // disable its CTA and show a pending label during the async round-trip.
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);

  // Opens the lifetime contact modal. Paid plans never reach this — they
  // go straight to Stripe Checkout via handleStripeCheckout.
  const handleCheckoutPlan = (plan: string) => {
    // Prompt login if not authenticated
    if (!session?.authenticated && onRequestAuth) {
      // Retain checkout intent inside state-store so we resume immediately on successful authentication login
      setCheckoutPlan(plan);
      onRequestAuth();
      return;
    }

    setSelectedPlanForCheckout(plan);
    setContactSubmitted(false);
    setCheckoutError('');
  };

  useEffect(() => {
    if (checkoutPlan && session?.authenticated) {
      // Resume the retained intent: paid plans go to Stripe, lifetime opens the contact modal.
      if (checkoutPlan === 'lifetime') {
        handleCheckoutPlan(checkoutPlan);
      } else {
        handleStripeCheckout(checkoutPlan);
      }
      setCheckoutPlan(null);
    }
  }, [checkoutPlan, session?.authenticated, setCheckoutPlan]);

  // Real Stripe Checkout redirect for the pricing cards' primary CTA.
  // Logged-out users are prompted to authenticate (intent is retained so we can
  // resume once they sign in); logged-in users are sent straight to Stripe.
  async function handleStripeCheckout(planKey: string) {
    if (!session?.authenticated) {
      setCheckoutPlan(planKey);
      if (onRequestAuth) onRequestAuth();
      return;
    }
    setCheckoutPending(planKey);
    setCheckoutError('');
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey, billingCycle })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        // Leave the pending state on: the page is navigating away to Stripe.
        window.location.href = data.url;
        return;
      }
      // Non-ok or missing url: surface a lightweight error and re-enable the CTA.
      setCheckoutError(data?.error || 'Unable to start checkout. Please try again.');
      setSelectedPlanForCheckout(planKey);
      setCheckoutPending(null);
    } catch (e) {
      setCheckoutError('Unable to reach the payment service. Please try again.');
      setSelectedPlanForCheckout(planKey);
      setCheckoutPending(null);
    }
  }

  // Lifetime is a sales contact request, not a self-serve purchase.
  // We open the user's mail client with the details pre-filled and show a
  // confirmation. This never grants a tier — pricing is handled offline.
  const submitLifetimeContact = () => {
    const isIndividual = lifetimeContactType === 'individual';
    const name = isIndividual ? lifetimeIndName : lifetimeBusName;
    const email = isIndividual ? lifetimeIndEmail : lifetimeBusEmail;
    const phone = isIndividual ? lifetimeIndPhone : lifetimeBusPhone;
    const referral = isIndividual ? lifetimeIndReferralSource : lifetimeBusReferralSource;

    const bodyLines = [
      'Lifetime Pass enquiry',
      '',
      `Account type: ${isIndividual ? 'Individual' : 'Business'}`,
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
    ];
    if (!isIndividual) {
      bodyLines.push(`Company: ${lifetimeBusCompanyName}`);
      if (lifetimeBusMessage) bodyLines.push('', 'Requirements:', lifetimeBusMessage);
    }
    if (referral) bodyLines.push('', `Heard about us via: ${referral}`);

    const mailto = `mailto:info@slayerterminal.com?subject=${encodeURIComponent('Lifetime Pass enquiry')}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
    try {
      window.location.href = mailto;
      // Only show the success confirmation once the mailto handoff actually fired.
      setContactSubmitted(true);
    } catch {
      // No mail client available: don't fake success — tell the user how to reach us.
      setLifetimeFormError('We couldn’t open your mail app. Please email us directly at info@slayerterminal.com and we’ll follow up with a custom quote.');
    }
  };

  // Shared institutional field / control styling for the checkout modal.
  const modalLabelCls = "text-[10px] text-[var(--text-faint)] uppercase tracking-[0.18em] font-semibold block mb-1.5";
  const modalInputCls = "w-full bg-[var(--bg-shell)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] rounded-[7px] px-3 py-2.5 text-[13px] focus:outline-none focus:border-[var(--border-mid)] transition-colors font-sans";
  const ghostCtaCls = "w-full py-3 rounded-[7px] bg-transparent border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(248,248,255,0.05)] font-semibold text-[11.5px] uppercase tracking-[0.1em] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const primaryCtaCls = "w-full py-3 rounded-[7px] bg-[var(--text-primary)] text-[#0A0806] hover:opacity-90 font-semibold text-[11.5px] uppercase tracking-[0.1em] transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <>
      <motion.section
        id="pricing-matrices"
        initial={{ opacity: 0, y: 50, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 py-12 sm:py-20 px-4 sm:px-6 max-w-[1320px] mx-auto w-full"
      >
        <div className="text-center mb-10 sm:mb-12">
          <span className="text-[var(--text-faint)] text-[10px] font-semibold uppercase tracking-[0.28em] block mb-3">
            Plans &amp; Pricing
          </span>
          <h2 className="text-[28px] sm:text-[34px] font-semibold text-[var(--text-primary)] tracking-tight font-sans leading-tight">
            Choose your plan
          </h2>
          <p className="text-[var(--text-muted)] text-[13.5px] mt-3 max-w-md mx-auto leading-relaxed">
            Every tier builds on the one before it. Upgrade or cancel anytime.
          </p>
        </div>

        <div className="flex justify-center mb-10 sm:mb-12 w-full">
          <div role="radiogroup" aria-label="Billing cycle" className="inline-flex items-center gap-1 bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-1 rounded-[8px]">
            <button
              role="radio"
              aria-checked={billingCycle === 'monthly'}
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 sm:px-6 py-2 min-h-[38px] rounded-[6px] text-[12px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] border ${
                billingCycle === 'monthly' ? 'bg-[var(--bg-panel-raised)] text-[var(--text-primary)] border-[var(--border-mid)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border-transparent'
              }`}
            >
              Monthly
            </button>
            <button
              role="radio"
              aria-checked={billingCycle === 'annual'}
              onClick={() => setBillingCycle('annual')}
              className={`px-5 sm:px-6 py-2 min-h-[38px] rounded-[6px] text-[12px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] flex items-center gap-2 border ${
                billingCycle === 'annual' ? 'bg-[var(--bg-panel-raised)] text-[var(--text-primary)] border-[var(--border-mid)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border-transparent'
              }`}
            >
              Annual <span className="text-[9px] bg-[var(--positive-soft)] text-[var(--positive-ink)] px-2 py-0.5 rounded-[4px] font-semibold uppercase tracking-wide">Save up to 18%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch max-w-[340px] sm:max-w-none lg:max-w-6xl mx-auto">

          {/* SQUIRE CARD */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="group rounded-[10px] p-6 flex flex-col bg-[var(--bg-panel)] border border-[var(--border-subtle)] transition-colors duration-200 hover:border-[var(--border-mid)]"
          >
            <div className="flex flex-col flex-grow">
              <div className="pb-5 mb-5 border-b border-[var(--border-subtle)]">
                <div className="mb-4">
                  <span className="text-[var(--text-primary)] text-[13px] font-semibold">
                    Discord
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[34px] font-semibold text-[var(--text-primary)] tracking-tight tabular-nums slayer-num leading-none">{billingCycle === 'monthly' ? '$39' : '$32'}</span>
                  <span className="text-[12px] text-[var(--text-muted)]">/ mo</span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6 flex-grow">
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Real-time Discord chat &amp; alerts</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Daily option discovery reports</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Verified historic trade archive</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handleStripeCheckout('discord')}
              disabled={checkoutPending === 'discord'}
              className={ghostCtaCls}
            >
              {checkoutPending === 'discord' ? 'Redirecting…' : 'Select plan'}
            </button>
          </motion.div>

          {/* PINPOINT GEX CARD */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="group rounded-[10px] p-6 flex flex-col bg-[var(--bg-panel)] border border-[var(--border-subtle)] transition-colors duration-200 hover:border-[var(--border-mid)]"
          >
            <div className="flex flex-col flex-grow">
              <div className="pb-5 mb-5 border-b border-[var(--border-subtle)]">
                <div className="mb-4">
                  <span className="text-[var(--text-primary)] text-[13px] font-semibold">
                    Pinpoint GEX
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[34px] font-semibold text-[var(--text-primary)] tracking-tight tabular-nums slayer-num leading-none">{billingCycle === 'monthly' ? '$99' : '$82'}</span>
                  <span className="text-[12px] text-[var(--text-muted)]">/ mo</span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6 flex-grow">
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span className="text-[var(--text-primary)] font-medium">Everything in Discord</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Live dealer positioning (GEX, DEX, VEX)</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Gamma exposure by strike</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Zero-DTE levels &amp; dealer dynamics</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handleStripeCheckout('pinpoint')}
              disabled={checkoutPending === 'pinpoint'}
              className={ghostCtaCls}
            >
              {checkoutPending === 'pinpoint' ? 'Redirecting…' : 'Select plan'}
            </button>
          </motion.div>

          {/* SKYVISION CARD - flagship, featured */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="group rounded-[10px] p-6 pt-7 flex flex-col relative bg-[var(--bg-panel-raised)] border border-[var(--border-strong)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] transition-colors duration-200"
          >
            <div className="absolute -top-2.5 left-6 bg-[var(--gex-2)] text-[var(--text-primary)] text-[9px] font-semibold uppercase tracking-[0.16em] px-2.5 py-1 rounded-[5px] whitespace-nowrap z-10">
              Most Popular
            </div>

            <div className="flex flex-col flex-grow">
              <div className="pb-5 mb-5 border-b border-[var(--border-subtle)]">
                <div className="mb-4">
                  <span className="text-[var(--text-primary)] text-[13px] font-semibold">
                    SkyVision
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[34px] font-semibold text-[var(--text-primary)] tracking-tight tabular-nums slayer-num leading-none">{billingCycle === 'monthly' ? '$499' : '$415'}</span>
                  <span className="text-[12px] text-[var(--text-muted)]">/ mo</span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6 flex-grow">
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span className="text-[var(--text-primary)] font-medium">Everything in Pinpoint GEX</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span className="text-[var(--text-primary)] font-medium">Tells you which options to trade</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Live volatility surface &amp; expected P&amp;L</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Trade health score tracker</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Quant Lab — backtester, order flow &amp; momentum</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handleStripeCheckout('skyvision')}
              disabled={checkoutPending === 'skyvision'}
              className={primaryCtaCls}
            >
              {checkoutPending === 'skyvision' ? 'Redirecting…' : 'Select plan'}
            </button>
          </motion.div>

          {/* LIFETIME CARD */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="group rounded-[10px] p-6 flex flex-col bg-[var(--bg-panel)] border border-[var(--border-subtle)] transition-colors duration-200 hover:border-[var(--border-mid)]"
          >
            <div className="flex flex-col flex-grow">
              <div className="pb-5 mb-5 border-b border-[var(--border-subtle)]">
                <div className="mb-4">
                  <span className="text-[var(--text-primary)] text-[13px] font-semibold">
                    Lifetime
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[26px] font-semibold text-[var(--text-primary)] tracking-tight leading-none">Custom</span>
                </div>
                <span className="text-[12px] text-[var(--text-muted)] mt-2 block">Tailored pricing &mdash; talk to us</span>
              </div>

              <ul className="space-y-2.5 mb-6 flex-grow">
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span className="text-[var(--text-primary)] font-medium">All features unlocked</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Permanent platform access</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Private 1-on-1 onboarding</span>
                </li>
                <li className="flex gap-2.5 items-start text-[12.5px] text-[var(--text-secondary)] leading-snug">
                  <Check className="w-3.5 h-3.5 text-[var(--positive-ink)] shrink-0 mt-0.5" />
                  <span>Early beta access to tools</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => handleCheckoutPlan('lifetime')}
              className={ghostCtaCls}
            >
              Contact us
            </button>
          </motion.div>

        </div>

        {/* Compact risk caption directly beneath the plans, not just in the page footer. */}
        <p className="mt-8 mx-auto max-w-xl text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
          Analytics and informational tools only — not investment advice. Options involve substantial risk.{' '}
          <button type="button" onClick={() => useLegal.getState().open('risk')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 transition-colors cursor-pointer">Read the full Risk Disclosure</button>. All sales are final and non-refundable —{' '}
          <button type="button" onClick={() => useLegal.getState().open('refunds')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 transition-colors cursor-pointer">see policy</button>.
        </p>
      </motion.section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="border-t border-[var(--border-subtle)] py-10 px-4 sm:px-6 text-center mt-auto relative z-10 w-full"
      >
        <p className="text-[12px] text-[var(--text-muted)]">&copy; 2026 Slayer Terminal. All rights reserved.</p>
        <nav className="mt-3 flex items-center justify-center flex-wrap gap-x-3 gap-y-1.5 text-[11px]" aria-label="Legal">
          {([['terms', 'Terms of Service'], ['privacy', 'Privacy Policy'], ['risk', 'Risk Disclosure'], ['refunds', 'Refund Policy'], ['cookies', 'Cookie Policy']] as const).map(([id, label], i) => (
            <React.Fragment key={id}>
              {i > 0 && <span className="text-[var(--text-faint)]" aria-hidden="true">·</span>}
              <button
                type="button"
                onClick={() => useLegal.getState().open(id)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] rounded"
              >
                {label}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <p className="mt-3 mx-auto max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
          Slayer Terminal provides analytics and informational tools only — not investment advice, a recommendation, or a
          solicitation to buy or sell any security. Options carry substantial risk and are not suitable for every investor.
          Modeled results and past performance do not guarantee future outcomes. All trading decisions are your own.
        </p>
      </motion.footer>

      {/* Dynamic Payment & Plan Checkout Gateway Modal */}
      {isMounted && createPortal(
        <AnimatePresence>
          {selectedPlanForCheckout && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] overflow-y-auto flex items-start md:items-center justify-center p-4"
            >
            <motion.div
              initial={{ scale: 0.96, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-[10px] w-full max-w-2xl my-auto overflow-hidden shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] flex flex-col"
            >
              {/* Modal Top Ribbon Header */}
              <div className="border-b border-[var(--border-subtle)] px-4 sm:px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedPlanForCheckout === 'lifetime' && <Mail className="w-4 h-4 text-[var(--positive-ink)]" />}
                  <span className="text-[11px] uppercase font-semibold tracking-[0.18em] text-[var(--text-secondary)]">
                    {selectedPlanForCheckout === 'lifetime' ? 'Contact sales' : 'Checkout'}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedPlanForCheckout(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer -mr-1 hover:bg-[var(--bg-panel-soft)] rounded-[7px] flex items-center justify-center min-w-[40px] min-h-[40px]"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Checkout Main Scrollable Panel */}
              <div className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-5">

                {/* 1. PLAN SUMMARY CARD */}
                <div className="bg-[var(--bg-panel-soft)] border border-[var(--border-subtle)] p-5 rounded-[8px]">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-[0.18em] block font-semibold">Your plan</span>
                      <h3 className="text-[19px] font-semibold text-[var(--text-primary)] mt-1.5 tracking-tight font-sans">
                        {selectedPlanForCheckout === 'discord' && "Discord"}
                        {selectedPlanForCheckout === 'skyvision' && "SkyVision"}
                        {selectedPlanForCheckout === 'pinpoint' && "Pinpoint GEX"}
                        {selectedPlanForCheckout === 'lifetime' && "Lifetime"}
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                        {selectedPlanForCheckout === 'discord' && "Live alerts & Discord community"}
                        {selectedPlanForCheckout === 'skyvision' && "Trade picks, GEX & Quant Lab — everything"}
                        {selectedPlanForCheckout === 'pinpoint' && "Live dealer positioning (GEX)"}
                        {selectedPlanForCheckout === 'lifetime' && "All features, permanent access"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-[var(--text-faint)] block tracking-[0.18em] font-semibold uppercase">Price</span>
                      <span className={`${selectedPlanForCheckout === 'lifetime' ? 'text-[12px] font-semibold tracking-wide text-[var(--positive-ink)] inline-block mt-1.5' : 'text-[26px] font-semibold text-[var(--text-primary)] tabular-nums slayer-num inline-block mt-1'}`}>
                        {selectedPlanForCheckout === 'lifetime'
                          ? 'Custom quote'
                          : billingCycle === 'monthly'
                            ? (selectedPlanForCheckout === 'discord' ? '$39' : selectedPlanForCheckout === 'pinpoint' ? '$99' : '$499')
                            : (selectedPlanForCheckout === 'discord' ? '$32' : selectedPlanForCheckout === 'pinpoint' ? '$82' : '$415')
                        }
                      </span>
                      {selectedPlanForCheckout !== 'lifetime' && (
                        <span className="text-[11px] text-[var(--text-muted)] block">/ mo</span>
                      )}
                    </div>
                  </div>

                  {selectedPlanForCheckout !== 'lifetime' && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                      <span className="uppercase font-semibold tracking-[0.14em] text-[var(--text-faint)]">Billing</span>
                      <span className="font-semibold">
                        {billingCycle === 'monthly' ? "Billed monthly" : "Billed annually (save up to 18%)"}
                      </span>
                    </div>
                  )}
                </div>

                {checkoutError && (
                  <div className="rounded-[7px] border border-[var(--negative)]/40 bg-[var(--negative-soft)] text-[var(--negative-ink)] px-4 py-3 text-[12px] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{checkoutError}</span>
                    <button onClick={() => setCheckoutError('')} className="ml-auto shrink-0 hover:opacity-70 transition-opacity"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {selectedPlanForCheckout === 'lifetime' && !contactSubmitted && (
                  <div className="border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] rounded-[8px] p-4">
                        <div className="space-y-4 flex flex-col justify-between h-full">
                          <div className="space-y-3.5">
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                              The Lifetime Pass is priced individually. Send us your details and our team
                              will reach out with a custom quote &mdash; no payment is taken here.
                            </p>

                            {/* Account Classification Toggle */}
                            <div className="space-y-2">
                              <label className={modalLabelCls}>
                                Account type
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setLifetimeContactType('individual')}
                                  className={`py-2 px-3 text-[12px] font-semibold rounded-[7px] border transition-colors cursor-pointer ${
                                    lifetimeContactType === 'individual'
                                      ? 'bg-[var(--bg-panel-raised)] border-[var(--border-mid)] text-[var(--text-primary)]'
                                      : 'bg-[var(--bg-shell)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-mid)]'
                                  }`}
                                >
                                  Individual
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLifetimeContactType('corporate')}
                                  className={`py-2 px-3 text-[12px] font-semibold rounded-[7px] border transition-colors cursor-pointer ${
                                    lifetimeContactType === 'corporate'
                                      ? 'bg-[var(--bg-panel-raised)] border-[var(--border-mid)] text-[var(--text-primary)]'
                                      : 'bg-[var(--bg-shell)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-mid)]'
                                  }`}
                                >
                                  Business
                                </button>
                              </div>
                            </div>

                            {lifetimeContactType === 'individual' ? (
                              <div className="space-y-3">
                                <div>
                                  <label className={modalLabelCls}>
                                    Full name
                                  </label>
                                  <input
                                    type="text"
                                    id="lifetime-ind-name-input"
                                    value={lifetimeIndName}
                                    onChange={(e) => setLifetimeIndName(e.target.value)}
                                    placeholder="Your name"
                                    className={modalInputCls}
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className={modalLabelCls}>
                                      Email address
                                    </label>
                                    <input
                                      type="email"
                                      value={lifetimeIndEmail}
                                      onChange={(e) => setLifetimeIndEmail(e.target.value)}
                                      placeholder="you@example.com"
                                      className={modalInputCls}
                                    />
                                  </div>
                                  <div>
                                    <label className={modalLabelCls}>
                                      Phone number
                                    </label>
                                    <input
                                      type="tel"
                                      value={lifetimeIndPhone}
                                      onChange={(e) => setLifetimeIndPhone(e.target.value)}
                                      placeholder="+1 (555) 0123"
                                      className={modalInputCls}
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className={modalLabelCls}>
                                    How did you find us?
                                  </label>
                                  <select
                                    value={lifetimeIndReferralSource}
                                    onChange={(e) => setLifetimeIndReferralSource(e.target.value)}
                                    className={modalInputCls + " cursor-pointer"}
                                  >
                                    <option value="" disabled className="bg-[var(--bg-panel)] text-[var(--text-muted)]">Select an option</option>
                                    <option value="Twitter / X" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Twitter / X</option>
                                    <option value="Telegram" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Telegram</option>
                                    <option value="Friend / Referral" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Friend / Referral</option>
                                    <option value="Search Engine" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Search Engine</option>
                                    <option value="YouTube" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">YouTube</option>
                                    <option value="Other" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Other</option>
                                  </select>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div>
                                  <label className={modalLabelCls}>
                                    Full name
                                  </label>
                                  <input
                                    type="text"
                                    id="lifetime-bus-name-input"
                                    value={lifetimeBusName}
                                    onChange={(e) => setLifetimeBusName(e.target.value)}
                                    placeholder="Your name"
                                    className={modalInputCls}
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className={modalLabelCls}>
                                      Email address
                                    </label>
                                    <input
                                      type="email"
                                      value={lifetimeBusEmail}
                                      onChange={(e) => setLifetimeBusEmail(e.target.value)}
                                      placeholder="you@example.com"
                                      className={modalInputCls}
                                    />
                                  </div>
                                  <div>
                                    <label className={modalLabelCls}>
                                      Phone number
                                    </label>
                                    <input
                                      type="tel"
                                      value={lifetimeBusPhone}
                                      onChange={(e) => setLifetimeBusPhone(e.target.value)}
                                      placeholder="+1 (555) 0123"
                                      className={modalInputCls}
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className={modalLabelCls}>
                                      Company / entity
                                    </label>
                                    <input
                                      type="text"
                                      value={lifetimeBusCompanyName}
                                      onChange={(e) => setLifetimeBusCompanyName(e.target.value)}
                                      placeholder="Company name"
                                      className={modalInputCls}
                                    />
                                  </div>
                                  <div>
                                    <label className={modalLabelCls}>
                                      How did you find us?
                                    </label>
                                    <select
                                      value={lifetimeBusReferralSource}
                                      onChange={(e) => setLifetimeBusReferralSource(e.target.value)}
                                      className={modalInputCls + " cursor-pointer"}
                                    >
                                      <option value="" disabled className="bg-[var(--bg-panel)] text-[var(--text-muted)]">Select an option</option>
                                      <option value="Twitter / X" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Twitter / X</option>
                                      <option value="Telegram" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Telegram</option>
                                      <option value="Friend / Referral" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Friend / Referral</option>
                                      <option value="Search Engine" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Search Engine</option>
                                      <option value="YouTube" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">YouTube</option>
                                      <option value="Other" className="bg-[var(--bg-panel)] text-[var(--text-primary)]">Other</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex justify-between items-center">
                                    <label className={modalLabelCls + " mb-0"}>
                                      Message / requirements
                                    </label>
                                    <span className="text-[10px] text-[var(--text-faint)] font-mono tabular-nums">
                                      {lifetimeBusMessage.length}/500
                                    </span>
                                  </div>
                                  <textarea
                                    rows={2}
                                    maxLength={500}
                                    value={lifetimeBusMessage}
                                    onChange={(e) => setLifetimeBusMessage(e.target.value)}
                                    placeholder="Tell us about your needs, custom setup, or the features you require..."
                                    className={modalInputCls + " resize-none"}
                                  />
                                  {lifetimeBusMessage.length >= 500 && (
                                    <div className="text-[11px] text-[var(--negative-ink)] font-medium mt-1">
                                      For longer requirements, email <a href="mailto:info@slayerterminal.com" className="underline hover:opacity-80">info@slayerterminal.com</a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {lifetimeFormError && (
                            <div className="mt-3 text-[12px] text-[var(--negative-ink)] font-medium" role="alert">
                              {lifetimeFormError}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const isValid = lifetimeContactType === 'individual'
                                ? (lifetimeIndName && lifetimeIndEmail && lifetimeIndPhone)
                                : (lifetimeBusName && lifetimeBusEmail && lifetimeBusPhone && lifetimeBusCompanyName);
                              if (isValid) {
                                setLifetimeFormError('');
                                submitLifetimeContact();
                              } else {
                                setLifetimeFormError(
                                  lifetimeContactType === 'individual'
                                    ? 'Please enter your name, email, and phone number.'
                                    : 'Please enter your name, email, phone number, and company name.'
                                );
                              }
                            }}
                            className="w-full mt-4 py-3 rounded-[7px] bg-[var(--text-primary)] text-[#0A0806] hover:opacity-90 font-semibold text-[11.5px] uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 transition-opacity cursor-pointer"
                          >
                            <span>Send message</span>
                          </button>
                        </div>
                  </div>
                )}

                {selectedPlanForCheckout === 'lifetime' && contactSubmitted && (
                  <div className="border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] rounded-[8px] p-6 text-center space-y-3">
                    <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center bg-[var(--positive-soft)] border border-[var(--positive-ink)]/40">
                      <CheckCircle2 className="w-7 h-7 text-[var(--positive-ink)]" />
                    </div>
                    <h4 className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight font-sans">
                      Thanks &mdash; your request is on its way
                    </h4>
                    <p className="text-[12px] text-[var(--text-muted)] leading-relaxed max-w-sm mx-auto">
                      Your mail app should have opened with the details pre-filled. If it didn&apos;t, email
                      us directly at <a href="mailto:info@slayerterminal.com" className="underline text-[var(--text-secondary)] hover:opacity-80">info@slayerterminal.com</a> and
                      our team will follow up with a custom Lifetime quote.
                    </p>
                  </div>
                )}


              </div>

              {/* Modal Bottom Controls */}
              <div className="border-t border-[var(--border-subtle)] px-4 sm:px-6 py-4 flex gap-3 justify-center items-center">
                {checkoutError && selectedPlanForCheckout !== 'lifetime' && (
                  <button
                    onClick={() => handleStripeCheckout(selectedPlanForCheckout)}
                    disabled={checkoutPending === selectedPlanForCheckout}
                    className="w-full py-3 rounded-[7px] bg-[var(--text-primary)] text-[#0A0806] hover:opacity-90 font-semibold text-[11.5px] uppercase tracking-[0.1em] transition-opacity cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>{checkoutPending === selectedPlanForCheckout ? 'Redirecting…' : 'Try again'}</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedPlanForCheckout(null)}
                  className="w-full py-3 rounded-[7px] bg-transparent border border-[var(--border-strong)] hover:bg-[rgba(248,248,255,0.05)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold text-[11.5px] uppercase tracking-[0.1em] transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>{contactSubmitted ? 'Close' : 'Cancel & choose another plan'}</span>
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  );
}