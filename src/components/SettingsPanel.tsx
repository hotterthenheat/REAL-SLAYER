import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Settings,
  HelpCircle,
  Type,
  Eye,
  Palette,
  RefreshCw,
  Coins,
  Share2,
  Receipt,
  Calculator,
  ShieldAlert,
  FolderSync,
  User,
  CreditCard,
  Lock,
  RotateCcw,
  Monitor,
  Check,
  Clock,
  Bell,
  Globe,
  Mail,
  KeyRound,
  Trash2,
  Download,
  Keyboard,
} from 'lucide-react';
import { UserProfile } from './UserProfile';
import { TwoFactorFlow } from './TwoFactorFlow';
import { Progress } from './ui/Progress';
import { useContractStore, ContractStore } from '../lib/store';
import { zodError } from './ui/Field';
import { CopyButton } from './ui/CopyButton';
import { emailSchema, passwordSchema, referralCodeSchema } from '../lib/formSchemas';
import { THEMES, applyTheme, applyTextSize, applyCompact, applyUltrawide } from '../lib/displayPrefs';
import { formatTime, formatDateTime } from '../lib/timeUtils';

// Ordered, de-duplicated theme groups (preserves the curated order from the generator).
const THEME_GROUPS = [...new Set(THEMES.map((t) => t.group))];

interface SettingsPanelProps {
  session: any;
  onUpdateSession: () => void;
}

/* ────────────────────────────────────────────────────────────────────────────
   Shared presentational primitives — VISUAL ONLY. These enforce a single panel
   style, one control style, one toggle, and a consistent button hierarchy across
   every settings section. They reference the app's themeable semantic tokens
   (--surface / --accent-color / --text-* / --success / --danger) so the panel
   keeps following the active theme and light mode, exactly as before.
   ──────────────────────────────────────────────────────────────────────────── */

const CONTROL =
  'w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] ' +
  'placeholder:text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-strong)] ' +
  'focus:border-[var(--border-strong)] transition-colors';

const FIELD_LABEL = 'block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg text-xs font-bold transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
const BTN_PRIMARY = `${BTN_BASE} px-4 py-2 min-h-[40px] bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90`;
const BTN_SECONDARY = `${BTN_BASE} px-4 py-2 min-h-[40px] bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--surface-3)] hover:border-[var(--border-strong)]`;
const BTN_GHOST = `${BTN_BASE} px-3 py-2 min-h-[36px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]`;
const BTN_DANGER = `${BTN_BASE} px-4 py-2 min-h-[40px] text-[var(--danger)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 hover:border-[var(--danger)]/50`;
const BTN_DANGER_SOLID = `${BTN_BASE} px-4 py-2 min-h-[40px] bg-[var(--danger)] text-[var(--bg-base)] hover:brightness-110`;

const segBtn = (active: boolean) =>
  `flex-1 min-h-[40px] px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
    active
      ? 'bg-[var(--accent-color)]/15 border-[var(--accent-color)] text-[var(--text-primary)]'
      : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
  }`;

/** The single settings panel frame: hairline border, titled uppercase header,
 *  optional actions slot and description. One border per section — no card-in-card. */
function SettingsCard({
  icon: Icon,
  title,
  description,
  actions,
  tone = 'default',
  children,
}: {
  icon?: React.ElementType;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: 'default' | 'danger';
  children?: React.ReactNode;
}) {
  const danger = tone === 'danger';
  return (
    <section
      className={`bg-[var(--surface)] rounded-xl overflow-hidden border ${
        danger ? 'border-[var(--danger)]/25' : 'border-[var(--border)]'
      }`}
    >
      <header
        className={`flex items-center justify-between gap-3 px-5 py-3.5 border-b ${
          danger ? 'border-[var(--danger)]/20' : 'border-[var(--border)]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon ? (
            <Icon className={`w-4 h-4 shrink-0 ${danger ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'}`} />
          ) : null}
          <h3
            className={`text-[11px] font-bold uppercase tracking-[0.18em] truncate ${
              danger ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            {title}
          </h3>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="p-5 space-y-5">
        {description ? <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}

/** The one and only switch used across settings. */
function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-4 select-none ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        {description ? (
          <span className="block text-xs text-[var(--text-tertiary)] mt-0.5 leading-snug">{description}</span>
        ) : null}
      </span>
      <span className="relative inline-flex items-center shrink-0">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
        <span className="w-9 h-5 rounded-full bg-[var(--surface-3)] transition-colors peer-checked:bg-[var(--accent-color)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-[var(--text-tertiary)] after:transition-all peer-checked:after:translate-x-full peer-checked:after:bg-[var(--bg-base)]" />
      </span>
    </label>
  );
}

/** Inline validation/status message with a consistent tone. */
function InlineAlert({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const ok = tone === 'success';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={`text-xs font-semibold rounded-lg px-3 py-2 border ${
        ok
          ? 'text-[var(--success)] border-[var(--success)]/30 bg-[var(--success)]/10'
          : 'text-[var(--danger)] border-[var(--danger)]/30 bg-[var(--danger)]/10'
      }`}
    >
      {children}
    </div>
  );
}

/** Quiet contextual footnote used at the bottom of a section group. */
function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">
      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[var(--text-tertiary)]" />
      <span>{children}</span>
    </div>
  );
}

// Referral code display + apply box (spec §B). Shows the user's strict
// [PREFIX]10OFF code and applies a referral/promo code at /api/billing/apply-coupon.
function ReferralCodeBox() {
  const [code, setCode] = useState('');
  const [applyInput, setApplyInput] = useState('');
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetch('/api/billing/my-referral-code', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => { if (d.referral_code) setCode(d.referral_code); })
      .catch(() => {});
  }, []);

  const apply = async () => {
    // Validate the code shape client-side so obviously-malformed input fails fast with a
    // clear message instead of a silent no-op or an opaque server round-trip.
    const codeErr = zodError(referralCodeSchema, applyInput);
    if (codeErr) { setApplyMsg({ ok: false, text: codeErr }); return; }
    setApplying(true);
    setApplyMsg(null);
    try {
      const r = await fetch('/api/billing/apply-coupon', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: applyInput.trim() }),
      });
      const d = await r.json();
      if (r.ok) setApplyMsg({ ok: true, text: `${d.discount_percentage}% discount applied — referrer ${d.referrer_name || ''} credited +1 token.` });
      else setApplyMsg({ ok: false, text: d.error || 'Invalid code.' });
    } catch {
      setApplyMsg({ ok: false, text: 'Network error.' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <span className={FIELD_LABEL}>Your referral code</span>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm font-mono font-bold text-[var(--success)] tracking-widest">{code || '…'}</code>
          <CopyButton content={code} size="md" label="Copy" className="py-2.5 shrink-0" />
        </div>
        <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5 leading-snug">Share this code — referees get 10% off and you earn +1 token per use.</p>
      </div>
      <div className="pt-5 border-t border-[var(--border)]">
        <span className={FIELD_LABEL}>Apply a referral code</span>
        <div className="flex items-center gap-2">
          <input
            aria-label="Apply a referral code"
            value={applyInput}
            onChange={(e) => setApplyInput(e.target.value.toUpperCase())}
            placeholder="FRND10OFF"
            className={`${CONTROL} font-mono uppercase`}
          />
          <button onClick={apply} disabled={applying} className={`${BTN_PRIMARY} shrink-0`}>{applying ? '…' : 'Apply'}</button>
        </div>
        {applyMsg && <p role="alert" className={`text-[11px] mt-2 font-semibold ${applyMsg.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{applyMsg.text}</p>}
      </div>
    </div>
  );
}

function KeybindRow({ bindId, label }: { bindId: keyof ContractStore['keybinds'], label: string }) {
  const keybinds = useContractStore(state => state.keybinds);
  const setKeybinds = useContractStore(state => state.setKeybinds);
  const disabledKeybinds = useContractStore(state => state.disabledKeybinds);
  const setDisabledKeybinds = useContractStore(state => state.setDisabledKeybinds);
  const [isRecording, setIsRecording] = useState(false);

  const isDisabled = disabledKeybinds[bindId];

  useEffect(() => {
    if (!isRecording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let key = e.key.toLowerCase();
      // Ignore bare modifiers
      if (['control', 'meta', 'shift', 'alt'].includes(key)) return;

      const parts = [];
      if (e.metaKey || e.ctrlKey) parts.push('cmd');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(key);

      setKeybinds({ [bindId]: parts.join('+') });
      setIsRecording(false);
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isRecording, bindId, setKeybinds]);

  // Translate 'cmd' to standard display based on OS
  const displayKey = (keybinds[bindId] || '').replace('cmd', typeof window !== 'undefined' && navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl');

  return (
    <div className={`flex items-center justify-between gap-3 py-2.5 transition-all ${isDisabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {/* 36px minimum tap target wrapping the 16px checkbox visual */}
        <button
          onClick={() => setDisabledKeybinds({ [bindId]: !isDisabled })}
          className="flex items-center justify-center w-9 h-9 -ml-1.5 rounded-lg cursor-pointer shrink-0"
          aria-label={isDisabled ? 'Enable keybind' : 'Disable keybind'}
        >
          <span className={`w-4 h-4 rounded flex items-center justify-center border ${isDisabled ? 'bg-transparent border-[var(--border-strong)]' : 'bg-[var(--accent-color)] border-[var(--accent-color)] text-[var(--bg-base)]'}`}>
            {!isDisabled && <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 stroke-current stroke-[3]"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </span>
        </button>
        <span className={`text-sm font-semibold truncate ${isDisabled ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-primary)]'}`}>{label}</span>
      </div>
      <button
        onClick={() => {
          if (!isDisabled) setIsRecording(true);
        }}
        disabled={isDisabled}
        className={`px-3 min-h-[36px] min-w-[92px] text-xs font-mono font-semibold rounded-lg flex items-center justify-center transition-all border
          ${isDisabled ? 'bg-[var(--surface-2)] text-[var(--text-tertiary)] border-[var(--border)] cursor-not-allowed' : isRecording ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)] border-[var(--accent-color)]/50' : 'bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'}`}
      >
        {isRecording ? 'Listening…' : displayKey.toUpperCase()}
      </button>
    </div>
  );
}

export function SettingsPanel({ session, onUpdateSession }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'privacy' | 'preferences' | 'keybinds' | 'referrals' | 'billing'>('profile');

  const [selectedFont, setSelectedFont] = useState<'STANDARD' | 'ENHANCED' | 'ENHANCED_XL'>(session?.selected_font_scale || 'STANDARD');
  const [compactMode, setCompactMode] = useState<boolean>(!!session?.compact_view_enabled);
  const [ultrawideMode, setUltrawideMode] = useState<boolean>(!!session?.ultrawide_enabled);
  // '' = native Slayer default (no data-theme). Any other value is a theme id from the generated library.
  const [activeTheme, setActiveTheme] = useState<string>(session?.selected_theme || '');

  const globalKeybindsEnabled = useContractStore(state => state.globalKeybindsEnabled);
  const setGlobalKeybindsEnabled = useContractStore(state => state.setGlobalKeybindsEnabled);

  const timeZone = useContractStore(state => state.timeZone);
  const setTimeZone = useContractStore(state => state.setTimeZone);
  const timeFormat = useContractStore(state => state.timeFormat);
  const setTimeFormat = useContractStore(state => state.setTimeFormat);

  const [isUpdating, setIsUpdating] = useState(false);
  const [isSimulatingInvoice, setIsSimulatingInvoice] = useState(false);
  const [invoiceLog, setInvoiceLog] = useState<any | null>(null);

  // Security Vault & Compliance states
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [simulatedOtp, setSimulatedOtp] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Privacy Boundaries & Notification states
  const [notifPreferences, setNotifPreferences] = useState({
    email_enabled: true,
    sms_enabled: true,
    discord_enabled: true,
    options_flow_alerts: true
  });
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'private' | 'logged_in'>('public');
  const [blockSearchIndexing, setBlockSearchIndexing] = useState(false);
  const [isPatchingPrivacy, setIsPatchingPrivacy] = useState(false);

  // GDPR Data Portability states
  const gdprTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => { gdprTimers.current.forEach(clearTimeout); gdprTimers.current.forEach(clearInterval); }, []);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportDownloadUrl, setExportDownloadUrl] = useState('');
  const [exportExpiresAt, setExportExpiresAt] = useState<number | null>(null);
  const [exportEmailLog, setExportEmailLog] = useState('');

  const [toastText, setToastText] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastText(text);
    setToastType(type);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastText(null);
    }, 4000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Subscription Cancellation Flow attributes (Module 4)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const cancelDialogRef = useRef<HTMLDivElement>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement>(null);

  // Cancel-subscription modal a11y: focus the dialog on open, support Escape to
  // close, and restore focus to the trigger button on close.
  useEffect(() => {
    if (!showCancelConfirm) return;
    cancelDialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isCanceling) setShowCancelConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelTriggerRef.current?.focus();
    };
  }, [showCancelConfirm, isCanceling]);

  const handleCancelSubscription = async () => {
    setIsCanceling(true);
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || 'Subscription scheduled for cancellation.', 'success');
        onUpdateSession();
      } else {
        showToast(data.error || 'Failed to cancel subscription.', 'error');
      }
    } catch (e) {
      showToast('Network error during cancellation request.', 'error');
    } finally {
      setIsCanceling(false);
      setShowCancelConfirm(false);
    }
  };

  // Link for copy. Never expose a localhost/dev origin in a customer-facing referral link —
  // fall back to the production domain (overridable via VITE_PUBLIC_URL) whenever the current
  // origin is a local/dev host.
  const PUBLIC_BASE = ((import.meta as any).env?.VITE_PUBLIC_URL as string) || 'https://app.slayerterminal.com';
  const referralBase = typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(window.location.host) && !/\.local(:|$)/.test(window.location.host)
    ? window.location.origin
    : PUBLIC_BASE;
  const referralLink = `${referralBase}/join/${session?.custom_referral_code || 'SLAYERX'}`;

  const handleSaveSettings = async (font: 'STANDARD' | 'ENHANCED' | 'ENHANCED_XL', compact: boolean, theme: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/users/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_font_scale: font,
          compact_view_enabled: compact,
          selected_theme: theme
        })
      });

      if (res.ok) {
        onUpdateSession();
        showToast('Display preferences saved and synchronized.');
      } else {
        showToast('Failed to save display preferences.', 'error');
      }
    } catch (e) {
      console.error('Failed to update Settings parameters', e);
      showToast('Backend connection error.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const saveUltrawide = async (on: boolean) => {
    try {
      const res = await fetch('/api/users/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ultrawide_enabled: on }),
      });
      if (res.ok) {
        onUpdateSession();
        showToast('Display preferences saved and synchronized.');
      }
    } catch (e) {
      console.error('Failed to update ultrawide preference', e);
    }
  };

  useEffect(() => {
    if (session) {
      // Sync appearance prefs (these only seed via useState on first mount,
      // so re-sync here when the session loads/changes to avoid stale values).
      if (session.selected_font_scale) setSelectedFont(session.selected_font_scale);
      setCompactMode(!!session.compact_view_enabled);
      setUltrawideMode(!!session.ultrawide_enabled);
      if (session.selected_theme) setActiveTheme(session.selected_theme);

      if (session.notification_preferences) {
        setNotifPreferences({
          email_enabled: session.notification_preferences.email_enabled ?? true,
          sms_enabled: session.notification_preferences.sms_enabled ?? true,
          discord_enabled: session.notification_preferences.discord_enabled ?? true,
          options_flow_alerts: session.notification_preferences.options_flow_alerts ?? true,
        });
      }
      if (session.profile_visibility) {
        setProfileVisibility(session.profile_visibility);
      }
      if (session.block_search_indexing !== undefined) {
        setBlockSearchIndexing(session.block_search_indexing);
      }
    }
  }, [session]);

  // Dynamically inject/remove meta robots tags to block search engines
  useEffect(() => {
    let metaTag = document.querySelector('meta[name="robots"]');
    if (blockSearchIndexing) {
      if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute('name', 'robots');
        metaTag.setAttribute('content', 'noindex, nofollow');
        document.head.appendChild(metaTag);
      }
    } else {
      if (metaTag) {
        metaTag.remove();
      }
    }
  }, [blockSearchIndexing]);

  const handleUpdatePrivacySettings = async (
    updates: {
      notification_preferences?: typeof notifPreferences;
      profile_visibility?: typeof profileVisibility;
      block_search_indexing?: boolean;
    },
    // Revert the optimistic local state when the server rejects the change so the
    // UI never shows a setting the backend refused.
    revert?: () => void
  ) => {
    setIsPatchingPrivacy(true);
    try {
      const res = await fetch('/api/users/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        onUpdateSession();
        showToast('Privacy updates saved successfully.');
      } else {
        const d = await res.json();
        revert?.();
        showToast(d.error || 'Server rejected privacy updates.', 'error');
      }
    } catch (e) {
      revert?.();
      showToast('Error syncing privacy settings.', 'error');
    } finally {
      setIsPatchingPrivacy(false);
    }
  };

  const triggerGdprExport = async () => {
    setIsExporting(true);
    setExportProgress(10);
    setExportDownloadUrl('');
    setExportExpiresAt(null);
    setExportEmailLog('');

    const interval = setInterval(() => {
      setExportProgress((p) => {
        if (p >= 90) {
          clearInterval(interval);
          return 90;
        }
        return p + 20;
      });
    }, 200);
    gdprTimers.current.push(interval);

    try {
      const res = await fetch('/api/users/export-data', { method: 'POST' });
      clearInterval(interval);
      setExportProgress(100);

      const data = await res.json();
      if (res.ok) {
        setExportDownloadUrl(data.downloadUrl);
        setExportExpiresAt(data.expiresAt);
        setExportEmailLog(data.simulatedEmailLogs);
        showToast('GDPR record archive built successfully.', 'success');
      } else {
        showToast(data.error || 'Failed to trigger GDPR export.', 'error');
      }
    } catch (err) {
      clearInterval(interval);
      showToast('Export compilation interrupted.', 'error');
    } finally {
      gdprTimers.current.push(setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 800));
    }
  };

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch('/api/auth/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      console.error('Error fetching sessions list:', e);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'security') {
      fetchSessions();
    }
  }, [activeTab]);

  const handleRevokeAllSessions = async () => {
    try {
      const res = await fetch('/api/auth/revoke-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        showToast('All secondary sessions successfully terminated.');
        await fetchSessions();
        // Force hard reload as mandated for direct SSO JWT/cookie clearing sync
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        showToast('Couldn’t sign out your other sessions.', 'error');
      }
    } catch (e) {
      showToast('Network timeout during session revocation.', 'error');
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (!currentPassword || !newPassword) {
      setPwError('Please fill in both credential fields.');
      return;
    }

    // Front-end pre-validating password parameters against the shared schema.
    const pwValidationErr = zodError(passwordSchema, newPassword);
    if (pwValidationErr) {
      setPwError(pwValidationErr);
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || 'Password update refused by server check.');
      } else {
        setPwSuccess('Password updated.');
        setCurrentPassword('');
        setNewPassword('');
        showToast('Password updated.');
      }
    } catch (err) {
      setPwError('Server connection timeout. Please verify backend status.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleEmailUpdateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    const emailErr = zodError(emailSchema, newEmail);
    if (emailErr) {
      setEmailError(emailErr);
      return;
    }

    try {
      const res = await fetch('/api/auth/request-email-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail })
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || 'Failed to dispatch email verification.');
      } else {
        setOtpSent(true);
        if (data.otpCode) {
          setSimulatedOtp(data.otpCode);
        }
        setEmailSuccess('Two-step Verification OTP dispatched successfully.');
        showToast('OTP code issued.');
      }
    } catch (err) {
      setEmailError('Communication error trying to request email transition.');
    }
  };

  const handleEmailUpdateVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    if (!emailOtp) {
      setEmailError('6-digit OTP code required.');
      return;
    }

    try {
      const res = await fetch('/api/auth/verify-email-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: emailOtp })
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailError(data.error || 'OTP verification digit mismatch.');
      } else {
        setEmailSuccess('Primary account email updated successfully!');
        setOtpSent(false);
        setNewEmail('');
        setEmailOtp('');
        setSimulatedOtp('');
        onUpdateSession();
        showToast('Email verified and updated.');
      }
    } catch (err) {
      setEmailError('Network error during primary security confirmation.');
    }
  };

  const handleSoftDeleteAccount = async () => {
    setDeleteError('');
    try {
      const res = await fetch('/api/users/delete-account', {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to trigger deactivation flow.');
      } else {
        showToast('Account deactivated. Signing out…', 'success');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    } catch (err) {
      setDeleteError('Connection error attempting to request GDPR soft delete.');
    }
  };

  const handleRunSimulatedBilling = async () => {
    setIsSimulatingInvoice(true);
    setInvoiceLog(null);
    try {
      const res = await fetch('/api/billing/sim-cron-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        setInvoiceLog(data);
        // Refresh token stats on header
        onUpdateSession();
      }
    } catch (e) {
      console.error('Invoice simulation failed', e);
    } finally {
      setIsSimulatingInvoice(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Public Profile', icon: User },
    { id: 'billing', label: 'Billing', icon: Receipt },
    { id: 'security', label: 'Account & Security', icon: Lock },
    { id: 'privacy', label: 'Privacy & Alerts', icon: ShieldAlert },
    { id: 'preferences', label: 'Preferences', icon: Settings },
    { id: 'keybinds', label: 'Keyboard Shortcuts', icon: Type },
    { id: 'referrals', label: 'Referrals', icon: Coins },
  ] as const;

  // The Default swatch is "active" whenever no valid custom theme id is selected.
  const isDefaultThemeActive = !THEMES.some((t) => t.id === activeTheme);

  const isPaidTier = session?.access_tier && !['guest', 'discord'].includes(session?.access_tier);

  return (
    <div id="slayer-settings-panel" className="w-full flex flex-col gap-4 text-left font-mono max-w-[860px] mx-auto">

      {/* Tab Navigation — horizontal scroll on mobile, wraps with comfortable tap targets on md+ */}
      <div className="w-full">
        <div className="flex flex-nowrap overflow-x-auto gap-1.5 pb-1 md:flex-wrap md:overflow-x-visible scrollbar-none" role="tablist" aria-label="Settings sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 flex items-center gap-2 px-4 rounded-lg text-[11px] font-semibold tracking-wide transition-all cursor-pointer min-h-[40px] whitespace-nowrap border ${
                  isActive
                    ? 'bg-[var(--surface-2)] text-[var(--text-primary)] border-[var(--border-strong)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[var(--accent-color)]' : 'text-[var(--text-tertiary)]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 h-px bg-[var(--border)]" />
      </div>

      {/* Content Area */}
      <div className="flex-1 max-w-[800px]">
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-fadeIn">
            <UserProfile session={session} onUpdateSession={onUpdateSession} />
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-5 animate-fadeIn pb-12">

            {/* Two-Factor Authentication */}
            <SettingsCard
              icon={KeyRound}
              title="Two-Factor Authentication"
              description="Add a second step at sign-in with an authenticator app for stronger account protection."
            >
              <TwoFactorFlow />
            </SettingsCard>

            {/* Email Address */}
            <SettingsCard
              icon={Mail}
              title="Email Address"
              description="Changing your email requires a verification code. A security notice is also sent to your old address."
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Current email</span>
                <span className="text-sm font-mono font-semibold text-[var(--text-primary)] break-all">{session?.email || 'N/A'}</span>
              </div>

              {emailError && <InlineAlert tone="error">{emailError}</InlineAlert>}
              {emailSuccess && <InlineAlert tone="success">{emailSuccess}</InlineAlert>}

              {otpSent ? (
                <form onSubmit={handleEmailUpdateVerify} className="space-y-4 animate-fadeIn pt-1 border-t border-[var(--border)]">
                  <div className="pt-4">
                    <span className={FIELD_LABEL}>Verification code</span>
                    <div className="font-mono text-sm font-bold text-[var(--success)] bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 rounded-lg w-fit select-all">
                      {simulatedOtp}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="settings-email-otp" className={FIELD_LABEL}>Enter verification code</label>
                    <input
                      id="settings-email-otp"
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      value={emailOtp}
                      onChange={e => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                      className={`${CONTROL} text-center font-mono tracking-widest`}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setOtpSent(false); setEmailOtp(''); }}
                      className={BTN_GHOST}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={BTN_PRIMARY}>
                      Verify &amp; Save
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleEmailUpdateRequest} className="space-y-4 pt-4 border-t border-[var(--border)]">
                  <div>
                    <label htmlFor="settings-new-email" className={FIELD_LABEL}>New email address</label>
                    <input
                      id="settings-new-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      className={CONTROL}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" className={BTN_PRIMARY}>
                      Send Verification Code
                    </button>
                  </div>
                </form>
              )}
            </SettingsCard>

            {/* Password */}
            <SettingsCard icon={Lock} title="Password">
              <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                {pwError && <InlineAlert tone="error">{pwError}</InlineAlert>}
                {pwSuccess && <InlineAlert tone="success">{pwSuccess}</InlineAlert>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="settings-current-password" className={FIELD_LABEL}>Current password</label>
                    <input
                      id="settings-current-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className={CONTROL}
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-new-password" className={FIELD_LABEL}>New password</label>
                    <input
                      id="settings-new-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••••••"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className={CONTROL}
                    />
                  </div>
                </div>

                <ul className="text-[11px] text-[var(--text-tertiary)] space-y-1 leading-relaxed list-disc pl-4">
                  <li>At least 8 characters.</li>
                  <li>At least one letter.</li>
                  <li>At least one number (0-9).</li>
                </ul>

                <div className="flex justify-end">
                  <button type="submit" disabled={isChangingPassword} className={BTN_PRIMARY}>
                    {isChangingPassword && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isChangingPassword ? 'Updating…' : 'Update Password'}</span>
                  </button>
                </div>
              </form>
            </SettingsCard>

            {/* Active Sessions */}
            <SettingsCard
              icon={Monitor}
              title="Active Sessions"
              description='Devices and browsers currently signed in to your account. "Log Out All Devices" signs them out immediately.'
              actions={
                <button onClick={handleRevokeAllSessions} type="button" className={BTN_DANGER}>
                  Log Out All Devices
                </button>
              }
            >
              <div className="divide-y divide-[var(--border)] -mt-1">
                {sessionsLoading ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-[var(--text-tertiary)]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading sessions…</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="py-6 text-xs text-center text-[var(--text-tertiary)]">No active sessions located.</div>
                ) : (
                  sessions.map((sess, idx) => (
                    <div key={idx} className="py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)] font-mono">{sess.ip_address}</span>
                          {sess.is_current ? (
                            <span className="px-2 py-0.5 bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--success)] font-bold text-[10px] rounded-full uppercase tracking-wider">
                              Current
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-tertiary)] font-bold text-[10px] rounded-full uppercase tracking-wider">
                              Other Device
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-tertiary)] truncate max-w-[300px] sm:max-w-md font-mono" title={sess.user_agent}>
                          {sess.user_agent}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] font-mono">
                          Created: {formatDateTime(sess.created_at)} · Activity: {formatTime(sess.last_active)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SettingsCard>

            {/* Delete Account */}
            <SettingsCard
              icon={Trash2}
              title="Delete Account"
              tone="danger"
              description="Under GDPR you can request account deletion. Your account is deactivated immediately and permanently removed after 30 days."
            >
              {deleteError && <InlineAlert tone="error">{deleteError}</InlineAlert>}

              {showDeleteConfirm ? (
                <div className="pt-4 border-t border-[var(--danger)]/20 space-y-3 animate-fadeIn">
                  <div className="text-sm text-[var(--text-primary)] font-bold">Are you absolutely sure?</div>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                    This immediately disables your username, API keys, and options flow access. After 30 days it cannot be undone.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowDeleteConfirm(false)} className={BTN_GHOST}>
                      Cancel
                    </button>
                    <button onClick={handleSoftDeleteAccount} className={BTN_DANGER_SOLID}>
                      Confirm Delete Account
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-start">
                  <button onClick={() => setShowDeleteConfirm(true)} className={BTN_DANGER}>
                    Request Account Deletion
                  </button>
                </div>
              )}
            </SettingsCard>

          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="space-y-5 animate-fadeIn pb-12">

            {/* Notification preferences */}
            <SettingsCard
              icon={Bell}
              title="Notifications"
              description="Alerts are only sent through the channels you turn on."
            >
              <div className="divide-y divide-[var(--border)] -my-1">
                <div className="py-3.5">
                  <Toggle
                    label="Email Alerts"
                    description="Send alerts to your email"
                    checked={notifPreferences.email_enabled}
                    disabled={isPatchingPrivacy}
                    onChange={(e) => {
                      const prev = notifPreferences;
                      const next = { ...notifPreferences, email_enabled: e.target.checked };
                      setNotifPreferences(next);
                      handleUpdatePrivacySettings({ notification_preferences: next }, () => setNotifPreferences(prev));
                    }}
                  />
                </div>
                <div className="py-3.5">
                  <Toggle
                    label="SMS Alerts"
                    description="Send alerts to your phone via SMS"
                    checked={notifPreferences.sms_enabled}
                    disabled={isPatchingPrivacy}
                    onChange={(e) => {
                      const prev = notifPreferences;
                      const next = { ...notifPreferences, sms_enabled: e.target.checked };
                      setNotifPreferences(next);
                      handleUpdatePrivacySettings({ notification_preferences: next }, () => setNotifPreferences(prev));
                    }}
                  />
                </div>
                <div className="py-3.5">
                  <Toggle
                    label="Discord Webhook Feeds"
                    description="Post sweeps directly to server webhooks"
                    checked={notifPreferences.discord_enabled}
                    disabled={isPatchingPrivacy}
                    onChange={(e) => {
                      const prev = notifPreferences;
                      const next = { ...notifPreferences, discord_enabled: e.target.checked };
                      setNotifPreferences(next);
                      handleUpdatePrivacySettings({ notification_preferences: next }, () => setNotifPreferences(prev));
                    }}
                  />
                </div>
                <div className="py-3.5">
                  <Toggle
                    label="Options Flow Alerts"
                    description="Alert on large GEX deviation events"
                    checked={notifPreferences.options_flow_alerts}
                    disabled={isPatchingPrivacy}
                    onChange={(e) => {
                      const prev = notifPreferences;
                      const next = { ...notifPreferences, options_flow_alerts: e.target.checked };
                      setNotifPreferences(next);
                      handleUpdatePrivacySettings({ notification_preferences: next }, () => setNotifPreferences(prev));
                    }}
                  />
                </div>
              </div>
            </SettingsCard>

            {/* Profile Visibility & Search */}
            <SettingsCard icon={Globe} title="Profile Visibility & Search">
              <div>
                <span className="text-sm font-semibold text-[var(--text-primary)] block">Profile Visibility</span>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed mt-0.5">Controls who can find and view your profile.</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3">
                  {[
                    { value: 'public', label: 'Public (Everyone)', desc: 'Anyone can view your profile' },
                    { value: 'logged_in', label: 'Subscribers Only', desc: 'Only logged-in users' },
                    { value: 'private', label: 'Private (Just You)', desc: 'Only you can see your profile' }
                  ].map((opt) => {
                    const active = profileVisibility === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const prev = profileVisibility;
                          setProfileVisibility(opt.value as any);
                          handleUpdatePrivacySettings({ profile_visibility: opt.value as any }, () => setProfileVisibility(prev));
                        }}
                        className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                          active
                            ? 'bg-[var(--accent-color)]/10 border-[var(--accent-color)] text-[var(--text-primary)]'
                            : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="text-xs font-bold">{opt.label}</div>
                        <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5 leading-snug">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-5 border-t border-[var(--border)]">
                <Toggle
                  label="Restrict Search Engine Indexing"
                  description="Adds a noindex tag so Google and Bing don't index your public profile."
                  checked={blockSearchIndexing}
                  disabled={isPatchingPrivacy}
                  onChange={(e) => {
                    const prev = blockSearchIndexing;
                    setBlockSearchIndexing(e.target.checked);
                    handleUpdatePrivacySettings({ block_search_indexing: e.target.checked }, () => setBlockSearchIndexing(prev));
                  }}
                />
              </div>
            </SettingsCard>

            {/* GDPR Data Export */}
            <SettingsCard
              icon={Download}
              title="Download Your Data"
              description="Export all your account data — logs, preferences, and payment records — as a single download. The file is available for 24 hours, then deleted."
            >
              {isExporting ? (
                <div className="space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Building your data export…</span>
                    <span className="text-[var(--accent-color)] font-bold slayer-num">{exportProgress}%</span>
                  </div>
                  <Progress value={exportProgress} tone="accent" ariaLabel="Data export progress" />
                </div>
              ) : (
                <div className="flex justify-start">
                  <button type="button" onClick={triggerGdprExport} className={BTN_PRIMARY}>
                    Export My Data
                  </button>
                </div>
              )}

              {exportDownloadUrl && (
                <div className="pt-5 border-t border-[var(--border)] space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--success)]">
                    <Check className="w-4 h-4" />
                    <span>Data export ready</span>
                  </div>

                  <div className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                    Expires: {exportExpiresAt ? formatDateTime(exportExpiresAt) : 'in 24 hours'}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <a href={exportDownloadUrl} download className={BTN_PRIMARY}>
                      <span>Download Export Package</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const link = window.location.origin + exportDownloadUrl;
                        navigator.clipboard.writeText(link);
                        showToast("Download URL copied.");
                      }}
                      className={BTN_SECONDARY}
                    >
                      Copy Direct File URL
                    </button>
                  </div>

                  {exportEmailLog && (
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] p-3 rounded-lg text-[11px] space-y-1 font-mono">
                      <div className="font-bold text-[var(--text-secondary)] uppercase tracking-wider">Email notification</div>
                      <p className="text-[var(--text-tertiary)] leading-relaxed">{exportEmailLog}</p>
                    </div>
                  )}
                </div>
              )}
            </SettingsCard>

          </div>
        )}

        {activeTab === 'preferences' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Display */}
            <SettingsCard icon={Settings} title="Display">
              {/* Text Size */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Type className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                  <span>Text Size</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed mt-0.5 mb-2">
                  Adjust how large the text appears throughout the app.
                </p>
                <select
                  aria-label="Text size"
                  value={selectedFont}
                  onChange={(e) => {
                    const newVal = e.target.value as 'STANDARD' | 'ENHANCED' | 'ENHANCED_XL';
                    setSelectedFont(newVal);
                    applyTextSize(newVal);
                    handleSaveSettings(newVal, compactMode, activeTheme);
                  }}
                  className={`${CONTROL} cursor-pointer appearance-none`}
                >
                  <option value="STANDARD">Standard</option>
                  <option value="ENHANCED">Large</option>
                  <option value="ENHANCED_XL">Extra Large</option>
                </select>
              </div>

              {/* Clock Format */}
              <div className="pt-5 border-t border-[var(--border)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Clock className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                  <span>Clock Format</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed mt-0.5 mb-2">
                  Show times as 12-hour (AM/PM) or 24-hour.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setTimeFormat('12H')} className={segBtn(timeFormat === '12H')}>
                    12-Hour Clock
                  </button>
                  <button type="button" onClick={() => setTimeFormat('24H')} className={segBtn(timeFormat === '24H')}>
                    24-Hour Clock
                  </button>
                </div>
              </div>

              {/* Display Time Zone */}
              <div className="pt-5 border-t border-[var(--border)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Monitor className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                  <span>Display Time Zone</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed mt-0.5 mb-2">
                  All times display in this timezone. US market hours are in Eastern Time.
                </p>
                <select
                  aria-label="Display time zone"
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value as 'EST' | 'UTC' | 'LOCAL')}
                  className={`${CONTROL} cursor-pointer appearance-none`}
                >
                  <option value="EST">New York Time (EST / EDT)</option>
                  <option value="UTC">Coordinated Universal Time (UTC)</option>
                  <option value="LOCAL">Local System Time (User Device Zone)</option>
                </select>
              </div>

              {/* Compact View */}
              <div className="pt-5 border-t border-[var(--border)]">
                <Toggle
                  label="Compact View"
                  description="Reduces spacing between rows and panels so more data fits on screen at once."
                  checked={compactMode}
                  onChange={(e) => {
                    const newVal = e.target.checked;
                    setCompactMode(newVal);
                    applyCompact(newVal);
                    handleSaveSettings(selectedFont, newVal, activeTheme);
                  }}
                />
              </div>

              {/* Ultrawide Layout */}
              <div className="pt-5 border-t border-[var(--border)]">
                <Toggle
                  label="Ultrawide Layout"
                  description="Expands the terminal to more columns on very wide monitors."
                  checked={ultrawideMode}
                  onChange={(e) => {
                    const newVal = e.target.checked;
                    setUltrawideMode(newVal);
                    applyUltrawide(newVal);
                    saveUltrawide(newVal);
                  }}
                />
              </div>
            </SettingsCard>

            {/* Interface Theme */}
            <SettingsCard
              icon={Palette}
              title="Interface Theme"
              description="Changes the background and panel colors across the app."
              actions={
                <span className="text-[11px] text-[var(--text-tertiary)] font-mono hidden sm:inline">
                  {THEMES.length} themes
                </span>
              }
            >
              <div className="max-h-80 overflow-y-auto pr-1 -mr-1 space-y-4 slayer-scrollbar">
                {/* Default / brand reset — restores the native Slayer black-and-white design */}
                <div>
                  <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest font-semibold mb-1.5">Default</div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2.5">
                    <button
                      title="Default (Slayer)"
                      type="button"
                      onClick={() => {
                        setActiveTheme('');
                        applyTheme('');
                        handleSaveSettings(selectedFont, compactMode, '');
                      }}
                      className={`group relative aspect-square rounded-lg border-2 transition-all ${
                        isDefaultThemeActive
                          ? 'border-[var(--accent-color)] scale-110 z-10'
                          : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:scale-105'
                      }`}
                      style={{ background: 'linear-gradient(135deg, #0A0A0A 0%, #0A0A0A 50%, #FFFFFF 50%, #FFFFFF 100%)' }}
                    >
                      {isDefaultThemeActive && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Curated theme groups */}
                {THEME_GROUPS.map(group => (
                  <div key={group}>
                    <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest font-semibold mb-1.5">{group}</div>
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-2.5">
                      {THEMES.filter(t => t.group === group).map(t => (
                        <button
                          key={t.id}
                          title={t.name}
                          type="button"
                          onClick={() => {
                            setActiveTheme(t.id);
                            applyTheme(t.id);
                            handleSaveSettings(selectedFont, compactMode, t.id);
                          }}
                          className={`group relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${
                            activeTheme === t.id
                              ? 'border-[var(--accent-color)] scale-110 z-10'
                              : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:scale-105'
                          }`}
                          style={{ background: `color-mix(in srgb, ${t.surface} 74%, #000)` }}
                        >
                          {/* Mini terminal-card preview: panel + accent header bar + text
                              lines, so the swatch shows what the theme actually looks like. */}
                          <span className="absolute inset-[3px] rounded-[3px]" style={{ background: t.surface }}>
                            <span className="absolute left-1 right-1 top-1 h-[3px] rounded-full" style={{ background: t.accent }} />
                            <span className="absolute left-1 top-[8px] w-1/2 h-[2px] rounded-full" style={{ background: `color-mix(in srgb, ${t.accent} 45%, transparent)` }} />
                            <span className="absolute left-1 bottom-[3px] w-2/3 h-[2px] rounded-full bg-white/15" />
                          </span>
                          {activeTheme === t.id && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Check className="w-4 h-4 text-[var(--text-primary)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest font-mono pt-3 border-t border-[var(--border)]">
                Active: <span className="text-[var(--text-primary)] font-bold">{THEMES.find(t => t.id === activeTheme)?.name || 'Default'}</span>
              </div>
            </SettingsCard>

            <InfoNote>
              Themes change background and panel colors only. Signal indicators, heat maps, and status colors stay the same so data is always readable.
            </InfoNote>
          </div>
        )}

        {activeTab === 'keybinds' && (
          <div className="space-y-5 animate-fadeIn">
            <SettingsCard
              icon={Keyboard}
              title="Keyboard Shortcuts"
              description="Quick-access keybinds for menu toggles and workspace switching. Bindings work across macOS (Command) and Windows (Ctrl)."
              actions={
                <button
                  onClick={() => {
                    const defaults = {
                      home: 'shift+h',
                      skyvision: 'shift+s',
                      pinpoint: 'shift+p',
                      auditor: 'shift+a',
                      dealerflow: 'shift+d',
                      community: 'shift+r',
                      settings: 'shift+o',
                      prismMenu: 'cmd+k',
                    };
                    useContractStore.getState().setKeybinds(defaults);
                    useContractStore.getState().setDisabledKeybinds({});
                    setGlobalKeybindsEnabled(true);
                  }}
                  className={BTN_GHOST}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              }
            >
              <div className="pb-1 border-b border-[var(--border)]">
                <Toggle
                  label="Enable All Shortcuts"
                  description="Master switch for every keyboard shortcut below."
                  checked={globalKeybindsEnabled}
                  onChange={() => setGlobalKeybindsEnabled(!globalKeybindsEnabled)}
                />
              </div>

              <div className={`transition-opacity duration-300 ${!globalKeybindsEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="divide-y divide-[var(--border)] -my-1">
                  {[
                    { id: 'prismMenu', label: 'Toggle Command Palette', default: 'cmd+k' },
                    { id: 'home', label: 'Workspace: Home', default: 'shift+h' },
                    { id: 'skyvision', label: 'Workspace: SkyVision', default: 'shift+s' },
                    { id: 'pinpoint', label: 'Workspace: Pinpoint GEX', default: 'shift+p' },
                    { id: 'auditor', label: 'Workspace: Trade History', default: 'shift+a' },
                    { id: 'dealerflow', label: 'Workspace: Dealer Flow', default: 'shift+d' },
                    { id: 'community', label: 'Workspace: Research & Community', default: 'shift+r' },
                    { id: 'settings', label: 'Settings & Preferences', default: 'shift+o' },
                  ].map(bind => (
                    <KeybindRow key={bind.id} bindId={bind.id as any} label={bind.label} />
                  ))}
                </div>
              </div>
            </SettingsCard>

            <InfoNote>
              To rebind, click a shortcut button and press your new key combination. Use a modifier (Shift, Ctrl, Alt, Meta) plus a character.
            </InfoNote>
          </div>
        )}

        {activeTab === 'referrals' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Referral rewards — code, apply, share link */}
            <SettingsCard icon={Coins} title="Referral Rewards">
              <ReferralCodeBox />

              <div className="pt-5 border-t border-[var(--border)] space-y-4">
                <div>
                  <span className={FIELD_LABEL}>Your referral code</span>
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm font-bold font-mono tracking-widest text-center">
                    {session?.custom_referral_code || 'SLAYERX'}
                  </div>
                </div>

                <div>
                  <span className={FIELD_LABEL}>Your custom referral link</span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-secondary)] rounded-lg px-3 py-2.5 text-xs font-mono flex items-center">
                      <span className="break-all">{referralLink}</span>
                    </div>
                    <CopyButton
                      content={referralLink}
                      variant="primary"
                      label="Copy Link"
                      title="Copy full referral link to clipboard"
                      className="px-6 py-2.5 text-xs sm:shrink-0"
                    />
                  </div>
                </div>
              </div>
            </SettingsCard>

            {/* Your rewards — progress + token stats */}
            <SettingsCard icon={Share2} title="Your Rewards">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Tokens to Next Free Month</span>
                  <span className="text-xs font-mono text-[var(--success)] slayer-num">{session?.referral_tokens_pool || 0} / 10</span>
                </div>
                <Progress
                  value={((session?.referral_tokens_pool || 0) / 10) * 100}
                  tone="success"
                  height={10}
                  ariaLabel="Referral tokens to next free month"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-5 border-t border-[var(--border)] text-center">
                <div className="space-y-1">
                  <span className="text-[11px] text-[var(--text-tertiary)] font-semibold uppercase tracking-wider block">Your Tokens</span>
                  <span className="text-2xl font-black text-[var(--success)] font-mono slayer-num block">
                    {session?.referral_tokens_pool || 0}
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)] block font-mono">1 Token = 10% Off</span>
                </div>
                <div className="space-y-1 border-l border-[var(--border)]">
                  <span className="text-[11px] text-[var(--text-tertiary)] font-semibold uppercase tracking-wider block">Current Discount</span>
                  <span className="text-2xl font-black text-[var(--text-primary)] font-mono slayer-num block">
                    {Math.min(100, (session?.referral_tokens_pool || 0) * 10)}%
                  </span>
                  <span className="text-[11px] text-[var(--text-tertiary)] block font-mono">Applied at renewal</span>
                </div>
              </div>
            </SettingsCard>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Subscription & Tier */}
            <SettingsCard
              icon={Receipt}
              title="Subscription & Tier"
              actions={
                session?.customer_id ? (
                  <span className="text-[10px] tracking-widest uppercase bg-[var(--accent-color)]/10 px-2 py-0.5 border border-[var(--accent-color)]/30 rounded text-[var(--accent-color)] font-mono">
                    Secured
                  </span>
                ) : undefined
              }
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">Current Plan</div>
                  <div className="text-2xl font-black uppercase text-[var(--text-primary)] tracking-widest flex items-center gap-2 flex-wrap">
                    <span>{session?.access_tier || 'GUEST'} TIER</span>
                    {session?.cancels_at_period_end ? (
                      <span className="text-[10px] tracking-normal font-semibold bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] px-2.5 py-0.5 rounded-full">
                        Cancels at Period End
                      </span>
                    ) : (
                      isPaidTier && (
                        <span className="text-[10px] tracking-normal font-semibold bg-[var(--success)]/10 border border-[var(--success)]/20 text-[var(--success)] px-2.5 py-0.5 rounded-full">
                          Active &amp; Auto-renewing
                        </span>
                      )
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      useContractStore.getState().setActiveTab('subscription');
                      window.scrollTo({ top: 0, behavior: 'auto' });
                    }}
                    className={BTN_PRIMARY}
                  >
                    View Upgrades
                  </button>

                  {isPaidTier && (
                    <button
                      ref={cancelTriggerRef}
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={!!session?.cancels_at_period_end}
                      className={
                        session?.cancels_at_period_end
                          ? `${BTN_SECONDARY} !text-[var(--text-tertiary)]`
                          : BTN_DANGER
                      }
                    >
                      {session?.cancels_at_period_end ? 'Cancellation Logged' : 'Cancel Subscription'}
                    </button>
                  )}
                </div>
              </div>

              {/* Secure Customer_id and Payment_method_id details */}
              {session?.customer_id && (
                <div className="pt-5 border-t border-[var(--border)] space-y-3 font-mono">
                  <div className="text-[11px] text-[var(--text-tertiary)] font-semibold uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Payment Info</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-[var(--text-tertiary)] font-semibold block uppercase tracking-wider">Stripe Customer ID</span>
                      <code className="text-[var(--accent-color)] font-mono text-xs break-all">{session.customer_id}</code>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-[var(--text-tertiary)] font-semibold block uppercase tracking-wider">Tokenized Payment Method ID</span>
                      <code className="text-[var(--success)] font-mono text-xs break-all">{session.payment_method_id || 'Not Saved (Iframe Protected)'}</code>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                    No card numbers or CVVs are stored here. Payment details are kept securely by Stripe.
                  </p>
                </div>
              )}

              {/* Confirmation Dialog / Modal */}
              {showCancelConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => { if (!isCanceling) setShowCancelConfirm(false); }}>
                  <div
                    ref={cancelDialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="cancel-subscription-title"
                    tabIndex={-1}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 text-left space-y-4 shadow-2xl relative focus:outline-none"
                  >
                    <div className="flex items-center gap-3 text-[var(--danger)] pb-3 border-b border-[var(--border)]">
                      <ShieldAlert className="w-5 h-5 shrink-0" />
                      <h3 id="cancel-subscription-title" className="text-base font-black uppercase tracking-wider">Are you sure?</h3>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed text-left">
                      Cancellation takes effect at the end of your current paid billing period. You <strong className="text-[var(--text-primary)]">retain full access</strong> to your tier and real-time options flow triggers until then.
                    </p>

                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setShowCancelConfirm(false)} className={BTN_SECONDARY}>
                        Keep Subscription
                      </button>
                      <button type="button" onClick={handleCancelSubscription} disabled={isCanceling} className={BTN_DANGER_SOLID}>
                        {isCanceling ? 'Processing…' : 'Confirm Cancel'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </SettingsCard>

            {/* Billing & Invoices */}
            <SettingsCard
              icon={Calculator}
              title="Billing & Invoices"
              description="No active cards on file. This environment uses a developer sandbox for simulated billing runs."
              actions={
                <span className="text-[10px] uppercase tracking-wider bg-[var(--surface-2)] px-2 py-0.5 border border-[var(--border)] rounded text-[var(--text-tertiary)]">Sandbox</span>
              }
            >
              <button onClick={handleRunSimulatedBilling} disabled={isSimulatingInvoice} className={`${BTN_SECONDARY} w-full`}>
                {isSimulatingInvoice ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Running Invoice Simulation…</span>
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4" />
                    <span>Run Simulated Billing Invoice</span>
                  </>
                )}
              </button>

              {invoiceLog && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4 text-left font-mono text-[11px] text-[var(--text-secondary)] leading-relaxed space-y-1.5"
                >
                  <div className="text-[11px] text-[var(--text-tertiary)] font-semibold tracking-wider uppercase border-b border-[var(--border)] pb-1.5 mb-1.5 flex justify-between">
                    <span>Invoice Receipt</span>
                    <span className="font-normal">Tier: {invoiceLog.access_tier}</span>
                  </div>
                  <div className="flex justify-between">Monthly Plan Price <span className="text-[var(--text-primary)] font-bold slayer-num">${invoiceLog.base_rate}.00</span></div>
                  <div className="flex justify-between">Tokens Used <span className="text-[var(--danger)] slayer-num">-{invoiceLog.tokens_deducted} ({invoiceLog.discount_rate_pct}% Off)</span></div>
                  <div className="flex justify-between">Discount Applied <span className="text-[var(--success)] slayer-num">-${(invoiceLog.discount_amount_usd ?? 0).toFixed(2)}</span></div>
                  <div className="border-t border-[var(--border)] pt-2 mt-2 font-bold flex justify-between text-xs">
                    <span className="text-[var(--text-primary)]">Net Charged</span>
                    <span className="text-[var(--success)] slayer-num">${(invoiceLog.total_charged_usd ?? 0).toFixed(2)} USD</span>
                  </div>
                  <div className="border-t border-[var(--border)] pt-2 mt-2 text-[11px] text-[var(--text-tertiary)] uppercase flex gap-1.5 items-center">
                    <FolderSync className="w-3.5 h-3.5 text-[var(--accent-color)]/80 shrink-0" />
                    <span>{invoiceLog.tokens_remaining_rolled_over} unused tokens rolled over to next month.</span>
                  </div>
                </motion.div>
              )}
            </SettingsCard>
          </div>
        )}
      </div>

      {toastText && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`fixed bottom-5 right-5 z-[100] p-4 bg-[var(--surface-2)] border ${toastType === 'success' ? 'border-[var(--success)]/30' : 'border-[var(--danger)]/30'} shadow-2xl flex items-center gap-2.5 font-mono text-[11px] text-[var(--text-primary)] rounded-lg`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${toastType === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'} animate-pulse`} />
          <span className={`uppercase font-semibold tracking-wider ${toastType === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{toastType === 'success' ? 'Success' : 'Error'}:</span>
          <span>{toastText}</span>
        </motion.div>
      )}
    </div>
  );
}
