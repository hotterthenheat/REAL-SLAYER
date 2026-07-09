import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Lock, Mail, User, Info, Check, X } from 'lucide-react';
import { useLegal } from './LegalCenter';
import { Spinner } from './ui/Spinner';

interface ClerkGateProps {
  onSuccess: (userData: any) => void;
  referralCodeFromUrl?: string;
  onClose?: () => void;
}

export function ClerkGate({ onSuccess, referralCodeFromUrl, onClose }: ClerkGateProps) {
  const [activeMode, setActiveMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [referralCode, setReferralCode] = useState(referralCodeFromUrl || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRefApplied, setShowRefApplied] = useState(!!referralCodeFromUrl);
  const [twoFactorStage, setTwoFactorStage] = useState(false);
  const [preAuthToken, setPreAuthToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const endpoint = activeMode === 'signup' ? '/api/auth/clerk-signup' : '/api/auth/clerk-login';
      const body = activeMode === 'signup' 
        ? { email, name, password, referralCode: referralCode.trim(), avatar: avatarUrl } 
        : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.requires_2fa && data.pre_auth_token) {
          // Password verified, but the account has 2FA — switch to the code-entry stage.
          setPreAuthToken(data.pre_auth_token);
          setTwoFactorStage(true);
          setIsLoading(false);
          return;
        }
        // Trigger parent callback
        onSuccess(data.user);
        window.location.reload(); // Reload immediately to secure signed httpOnly session cookies!
      } else {
        const errorData = await res.json();
        setErrorMessage(errorData.error || 'Authentication error. Please try again.');
      }
    } catch (err) {
      setErrorMessage('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-login-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_auth_token: preAuthToken, token: totpCode.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        onSuccess(data.user);
        window.location.reload();
      } else {
        const errorData = await res.json();
        setErrorMessage(errorData.error || 'Invalid authentication code.');
      }
    } catch (err) {
      setErrorMessage('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Shared field styling — institutional, hairline borders, tabular where relevant.
  const labelCls = "text-[10px] text-[var(--text-faint)] uppercase tracking-[0.18em] font-semibold block mb-1.5";
  const inputCls = "w-full bg-[var(--bg-shell)] border border-[var(--border-subtle)] focus:border-[var(--border-mid)] text-[var(--text-primary)] placeholder:text-[var(--text-faint)] font-sans rounded-[7px] px-3.5 py-3 text-[13px] focus:outline-none transition-colors";
  const inputWithIconCls = inputCls + " pl-11";

  return (
    <div id="clerk-authentication-gate" className="min-h-screen bg-[var(--bg-app)] text-[var(--text-secondary)] flex flex-col justify-center items-center font-mono selection:bg-[var(--positive-ink)] selection:text-[var(--bg-app)] p-4 relative overflow-hidden">

      {/* Restrained structural wash — not a glow */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(900px 460px at 50% -10%, rgba(68,49,153,0.10), transparent 70%)' }} />

      <div className="absolute top-6 left-6 sm:top-8 sm:left-8 select-none z-10">
        <span className="text-[13px] font-semibold tracking-[0.02em] text-[var(--text-primary)] font-mono">
          &gt;slayer<span className="text-[var(--text-muted)]">_terminal</span>
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-[420px] bg-[var(--bg-panel)] border border-[var(--border-subtle)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] rounded-[10px] overflow-hidden p-6 sm:p-8 relative z-10"
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer h-8 w-8 rounded-[7px] bg-[var(--bg-panel-soft)] border border-[var(--border-subtle)] hover:border-[var(--border-mid)] flex items-center justify-center z-20"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="text-left mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-[7px] bg-[var(--bg-panel-soft)] border border-[var(--border-subtle)] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-[var(--text-secondary)]" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--text-faint)]">
              Secure Access
            </span>
          </div>
          <h1 className="text-[22px] font-sans font-semibold tracking-tight text-[var(--text-primary)] select-none leading-tight">
            Welcome to Slayer Terminal
          </h1>
          <p className="text-[var(--text-muted)] text-[12.5px] font-sans mt-2 leading-relaxed">
            Sign in with your secure credentials to access institutional-grade decision intelligence.
          </p>
        </div>

        {/* Tab switcher */}
        {!twoFactorStage && (
        <div className="grid grid-cols-2 gap-1 bg-[var(--bg-panel-soft)] rounded-[8px] p-1 border border-[var(--border-subtle)] text-[12px] font-semibold mb-5">
          <button
            onClick={() => { setActiveMode('signin'); setErrorMessage(null); }}
            className={`py-2.5 rounded-[6px] transition-colors cursor-pointer ${activeMode === 'signin' ? 'bg-[var(--bg-panel-raised)] text-[var(--text-primary)] border border-[var(--border-mid)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setActiveMode('signup'); setErrorMessage(null); }}
            className={`py-2.5 rounded-[6px] transition-colors cursor-pointer ${activeMode === 'signup' ? 'bg-[var(--bg-panel-raised)] text-[var(--text-primary)] border border-[var(--border-mid)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'}`}
          >
            Create Account
          </button>
        </div>
        )}

        {errorMessage && (
          <div className="mb-4 px-3.5 py-3 bg-[var(--negative-soft)] border border-[var(--negative)]/40 rounded-[7px] text-[11px] text-[var(--negative-ink)] leading-relaxed font-sans flex items-start gap-2" role="alert">
            <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span><span className="font-semibold">Error — </span>{errorMessage}</span>
          </div>
        )}

        {referralCode && activeMode === 'signup' && (
          <div className="mb-4 px-3.5 py-2.5 bg-[var(--positive-soft)] border border-[var(--positive-ink)]/35 rounded-[7px] text-[11px] text-[var(--positive-ink)] leading-tight font-sans flex items-center gap-2">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>Referral applied — 5% discount taken at checkout.</span>
          </div>
        )}

        {twoFactorStage && (
          <form onSubmit={handleVerify2fa} className="space-y-4 text-left">
            <div>
              <label className={labelCls}>
                Two-Factor Authentication Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="123456"
                  className={inputWithIconCls + " tracking-[0.3em] tabular-nums"}
                />
                <ShieldCheck className="w-4 h-4 text-[var(--text-faint)] absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-2 font-sans">Enter the 6-digit code from your authenticator app.</p>
            </div>
            <button
              type="submit"
              disabled={isLoading || totpCode.length < 6}
              className="w-full py-3.5 mt-1 bg-[var(--text-primary)] hover:opacity-90 text-[#0A0806] border-none font-semibold text-[12.5px] uppercase tracking-[0.1em] rounded-[7px] flex items-center justify-center gap-2 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" tone="onAccent" label="Verifying" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify and Sign In</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setTwoFactorStage(false); setTotpCode(''); setPreAuthToken(''); setErrorMessage(null); }}
              className="w-full text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-sans transition-colors cursor-pointer"
            >
              ← Back to sign in
            </button>
          </form>
        )}

        {!twoFactorStage && (
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {activeMode === 'signup' && (
            <div>
              <label className={labelCls}>
                Your Full Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                  className={inputWithIconCls}
                />
                <User className="w-4 h-4 text-[var(--text-faint)] absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          {activeMode === 'signup' && (
            <div>
              <label className={labelCls}>
                Profile Photo URL (Optional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className={inputWithIconCls}
                />
                <User className="w-4 h-4 text-[var(--text-faint)] absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@firm.com"
                className={inputWithIconCls}
              />
              <Mail className="w-4 h-4 text-[var(--text-faint)] absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Security Key Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className={inputWithIconCls}
              />
              <Lock className="w-4 h-4 text-[var(--text-faint)] absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {activeMode === 'signup' && (
            <div>
              <label className={labelCls}>
                Referral Code (Optional)
              </label>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="SLAYERY123"
                className={inputCls + " uppercase tracking-[0.1em]"}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 mt-2 bg-[var(--text-primary)] hover:opacity-90 text-[#0A0806] border-none font-semibold text-[12.5px] uppercase tracking-[0.1em] rounded-[7px] flex items-center justify-center gap-2 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)]"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 rounded-full border-t-2 border-r-2 border-[#0A0806] animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>{activeMode === 'signin' ? 'Sign in' : 'Create Account'}</span>
              </>
            )}
          </button>
        </form>
        )}

        <div className="border-t border-[var(--border-subtle)] pt-5 mt-6 text-center">
          <p className="text-[11px] text-[var(--text-muted)] font-sans leading-relaxed">
            By continuing, you agree to Slayer Terminal's{' '}
            <button type="button" onClick={() => useLegal.getState().open('terms')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 transition-colors cursor-pointer">Terms of Service</button>
            {' '}and{' '}
            <button type="button" onClick={() => useLegal.getState().open('privacy')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 transition-colors cursor-pointer">Privacy Policy</button>. Secure SSL connection.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
