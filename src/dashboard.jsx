import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { getTelegramUser } from "./telegram_init.js";

const emptyForm = {
  broker_name: "",
  login: "",
  password: "",
  server: "",
  risk_percent: 1,
};

const STRATEGY_OPTIONS = [
  { value: "aggressive", label: "PHASE AGGRESSIVE" },
  { value: "medium", label: "PHASE MEDIUM" },
  { value: "conservative", label: "PHASE CONSERVATIVE" },
];
const DASH_PREF_STRATEGY_KEY = "dash_pref_strategy_id";
const DEFAULT_STRATEGY_ID = "medium";

/** Keep “Connecting” UI visible at least this long (API may return faster). */
const MIN_CONNECT_UI_MS = 3000;

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const BERLIN_TZ = "Europe/Berlin";

function _dtfParts(timeZone, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const out = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

function _tzOffsetMs(date, timeZone) {
  // Offset = (formatted-in-tz as-if-UTC) - (actual UTC time)
  const p = _dtfParts(timeZone, date);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUtc - date.getTime();
}

function _zonedTimeToUtcMs({ year, month, day, hour, minute }, timeZone) {
  // Two-pass conversion to account for DST.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = guessUtc - _tzOffsetMs(new Date(guessUtc), timeZone);
  utcMs = guessUtc - _tzOffsetMs(new Date(utcMs), timeZone);
  return utcMs;
}

function getWeekendMarketStatusBerlin(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    weekday: "short",
  }).format(now);
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (!isWeekend) return { closed: false, nextOpenUtcMs: 0 };

  const p = _dtfParts(BERLIN_TZ, now);
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);

  // Find next Monday in Berlin calendar.
  const addDays = weekday === "Sat" ? 2 : 1;
  const baseUtcNoon = _zonedTimeToUtcMs({ year: y, month: m, day: d, hour: 12, minute: 0 }, BERLIN_TZ);
  const mondayUtcNoon = baseUtcNoon + addDays * 24 * 60 * 60 * 1000;
  const mondayParts = _dtfParts(BERLIN_TZ, new Date(mondayUtcNoon));
  const nextOpenUtcMs = _zonedTimeToUtcMs(
    {
      year: Number(mondayParts.year),
      month: Number(mondayParts.month),
      day: Number(mondayParts.day),
      hour: 9,
      minute: 0,
    },
    BERLIN_TZ
  );
  return { closed: true, nextOpenUtcMs };
}

function ProfileFallbackIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.2" fill="currentColor" />
      <path
        d="M12 13.2c-3.15 0-5.56 1.86-6.02 4.63-.08.5.31.97.82.97h10.4c.51 0 .9-.47.82-.97-.46-2.77-2.87-4.63-6.02-4.63Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ProfilePencilIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ConnectServerIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="4" rx="1.5" />
      <rect x="3" y="10" width="18" height="4" rx="1.5" />
      <rect x="3" y="16" width="18" height="4" rx="1.5" />
    </svg>
  );
}

function ConnectUserIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ConnectLockIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ConnectLinkedCheckIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M 7.1 12.45 L 10.9 16.25 L 17.75 7.35" />
    </svg>
  );
}

function ConnectEyeIcon({ open, className = "" }) {
  if (open) {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function HomeTabIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 3L4 10v10h5v-6h6v6h5V10l-8-7z" />
    </svg>
  );
}

function ProfileTabIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="5" />
    </svg>
  );
}

export default function Dashboard({ user, refreshKey, onRefresh }) {
  const [sessions, setSessions] = useState([]);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [strategyId, setStrategyId] = useState(() => {
    try {
      const saved = String(localStorage.getItem(DASH_PREF_STRATEGY_KEY) || "").trim();
      return STRATEGY_OPTIONS.some((o) => o.value === saved)
        ? saved
        : DEFAULT_STRATEGY_ID;
    } catch {
      return DEFAULT_STRATEGY_ID;
    }
  });
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyDraft, setStrategyDraft] = useState(strategyId);
  const strategyLabel =
    STRATEGY_OPTIONS.find((o) => o.value === strategyId)?.label ?? strategyId;
  const openStrategyModal = () => {
    setStrategyDraft(strategyId);
    setStrategyModalOpen(true);
  };
  const closeStrategyModal = () => {
    setStrategyModalOpen(false);
  };
  const applyStrategyModal = () => {
    setStrategyId(strategyDraft);
    setStrategyModalOpen(false);
  };
  // server selection modal removed (connect broker only)

  const openServersModal = () => {
    setServerSearch("");
    setServersModalOpen(true);
    // avoid stacking multiple modals
    setStrategyModalOpen(false);
  };

  const closeServersModal = () => {
    setServersModalOpen(false);
  };


  const avatarInputRef = useRef(null);
  const [avatarOverrideDataUrl, setAvatarOverrideDataUrl] = useState(() => {
    try {
      return localStorage.getItem("profile_avatar_override_dataurl") || "";
    } catch {
      return "";
    }
  });
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [usernameOverride, setUsernameOverride] = useState(() => {
    try {
      return localStorage.getItem("profile_username_override") || "";
    } catch {
      return "";
    }
  });
  const [usernameDraft, setUsernameDraft] = useState("");
  const [brokerExpanded, setBrokerExpanded] = useState(true);
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [startSubmitting, setStartSubmitting] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [connectErr, setConnectErr] = useState("");
  const [connectErrBump, setConnectErrBump] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({ server: false, login: false, password: false });
  const [showConnectPassword, setShowConnectPassword] = useState(false);
  const brokerListHydrated = useRef(false);
  const notifiedFailedSessionRef = useRef("");
  /** After Start, ignore Stop briefly — mobile/WebView can fire a delayed click on the same spot once the label flips to Stop. */
  const postStartStopGuardRef = useRef(false);
  const postStartStopGuardTimerRef = useRef(0);
  const [postStartStopGuard, setPostStartStopGuard] = useState(false);
  const dashShellRef = useRef(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [formControlFocused, setFormControlFocused] = useState(false);
  const tgUser = getTelegramUser();
  const hideTabBar = keyboardOpen || formControlFocused;

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const marketStatus = useMemo(() => {
    // depends on nowTick to refresh
    void nowTick;
    const s = getWeekendMarketStatusBerlin(new Date());
    const nextOpenText = s.closed && s.nextOpenUtcMs
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: BERLIN_TZ,
          weekday: "long",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(s.nextOpenUtcMs))
      : "";
    return { ...s, nextOpenText };
  }, [nowTick]);

  useEffect(() => {
    return () => {
      if (postStartStopGuardTimerRef.current) {
        window.clearTimeout(postStartStopGuardTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setMsg((m) => (m.trim().toLowerCase() === "linked" ? "" : m));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DASH_PREF_STRATEGY_KEY, strategyId);
    } catch {
      // ignore storage errors
    }
  }, [strategyId]);

  useEffect(() => {
    const vv = window.visualViewport;
    const thresholdPx = 80;

    const syncKeyboard = () => {
      if (!vv) {
        setKeyboardOpen(false);
        return;
      }
      const layoutH = window.document.documentElement.clientHeight || window.innerHeight;
      const gap = layoutH - vv.height - (vv.offsetTop || 0);
      setKeyboardOpen(gap > thresholdPx);
    };

    const syncFormControlFocus = () => {
      const shell = dashShellRef.current;
      const ae = document.activeElement;
      const inside =
        !!(
          ae &&
          shell &&
          shell.contains(ae) &&
          (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")
        );
      setFormControlFocused(inside);
    };

    const onFocusIn = (e) => {
      const t = e.target;
      if (
        !t ||
        !dashShellRef.current ||
        !dashShellRef.current.contains(t) ||
        (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA" && t.tagName !== "SELECT")
      ) {
        return;
      }
      setFormControlFocused(true);
      requestAnimationFrame(() => {
        syncKeyboard();
        syncFormControlFocus();
        window.setTimeout(syncKeyboard, 180);
        window.setTimeout(syncKeyboard, 400);
      });
    };

    const onFocusOut = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncFormControlFocus();
        });
      });
      window.setTimeout(syncKeyboard, 120);
      window.setTimeout(syncKeyboard, 400);
    };

    if (vv) {
      vv.addEventListener("resize", syncKeyboard);
      vv.addEventListener("scroll", syncKeyboard);
    }
    window.addEventListener("resize", syncKeyboard);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    syncKeyboard();

    return () => {
      if (vv) {
        vv.removeEventListener("resize", syncKeyboard);
        vv.removeEventListener("scroll", syncKeyboard);
      }
      window.removeEventListener("resize", syncKeyboard);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const tradingAccountId = useMemo(() => {
    if (!accounts.length) return "";
    const cur = accountId != null && String(accountId) !== "" ? String(accountId) : "";
    if (cur && accounts.some((a) => String(a.id) === cur)) return cur;
    return String(accounts[0].id);
  }, [accounts, accountId]);

  const brokerChangeMode = accounts.length > 0 && brokerExpanded;

  async function load() {
    setErr("");
    try {
      const [me, s, b] = await Promise.all([api.me(), api.sessions(), api.listBrokers()]);
      if (!me?.has_access) {
        localStorage.removeItem("access_token");
        onRefresh?.();
        return;
      }
      setSessions(s);
      setAccounts(b);
      if (b.length) {
        setAccountId((prev) => {
          const p = prev != null && String(prev) !== "" ? String(prev) : "";
          const ok = p && b.some((a) => String(a.id) === p);
          return ok ? p : String(b[0].id);
        });
        if (!brokerListHydrated.current) {
          brokerListHydrated.current = true;
          setBrokerExpanded(false);
        }
      } else {
        setAccountId("");
        setBrokerExpanded(true);
      }
    } catch (e) {
      const msg = String(e?.message || e || "");
      const unauthorized =
        e?.status === 401 ||
        msg.includes("401") ||
        msg.toLowerCase().includes("not authenticated") ||
        msg.toLowerCase().includes("no authorization") ||
        msg.toLowerCase().includes("unauthorized");
      if (unauthorized) {
        localStorage.removeItem("access_token");
        setErr("");
        onRefresh?.();
        return;
      }
      setErr(String(e.message || e));
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshKey]);

  async function start() {
    if (startSubmitting) return;
    setErr("");
    if (marketStatus.closed) {
      setErr(
        marketStatus.nextOpenText
          ? `Market closed (weekend). Trading will be available: ${marketStatus.nextOpenText} (Berlin).`
          : "Market closed (weekend)."
      );
      return;
    }
    setStartSubmitting(true);
    try {
      await api.startTrading(Number(tradingAccountId), strategyId);
      await load();
      if (postStartStopGuardTimerRef.current) {
        window.clearTimeout(postStartStopGuardTimerRef.current);
      }
      postStartStopGuardRef.current = true;
      setPostStartStopGuard(true);
      postStartStopGuardTimerRef.current = window.setTimeout(() => {
        postStartStopGuardRef.current = false;
        setPostStartStopGuard(false);
        postStartStopGuardTimerRef.current = 0;
      }, 1200);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setStartSubmitting(false);
    }
  }

  async function stop(id) {
    if (postStartStopGuardRef.current || stopSubmitting) return;
    setErr("");
    setStopSubmitting(true);
    try {
      await api.stopTrading(id);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setStopSubmitting(false);
    }
  }

  async function submitBroker(e) {
    e.preventDefault();
    setErr("");
    setConnectErr("");
    setMsg("");
    const server = form.server.trim();
    const login = form.login.trim();
    const password = form.password.trim();
    const nextErrors = { server: !server, login: !login, password: !password };
    if (nextErrors.server || nextErrors.login || nextErrors.password) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({ server: false, login: false, password: false });
    setConnectSubmitting(true);
    const connectFlowStarted = performance.now();
    try {
      const brokerName = (form.broker_name || server || "Broker").trim().slice(0, 128);
      const queued = await api.addBrokerAsync({
        ...form,
        broker_name: brokerName,
        server,
        login,
        password,
        risk_percent: Number(form.risk_percent),
      });
      const jobId = String(queued?.job_id || "");
      if (!jobId) throw new Error("broker auth queue error");

      let created = null;
      const pollDeadline = Date.now() + 180000;
      while (Date.now() < pollDeadline) {
        const job = await api.brokerAuthJob(jobId);
        const st = String(job?.status || "");
        if (st === "success") {
          created = job?.account || null;
          break;
        }
        if (st === "error") {
          throw new Error(String(job?.error || "broker authorization failed"));
        }
        await sleepMs(1200);
      }
      if (!created) {
        throw new Error("broker authorization timeout, try again");
      }

      let elapsed = performance.now() - connectFlowStarted;
      if (elapsed < MIN_CONNECT_UI_MS) {
        await sleepMs(MIN_CONNECT_UI_MS - elapsed);
      }
      if (created?.id != null) {
        setAccountId(String(created.id));
      }
      setForm(emptyForm);
      setBrokerExpanded(false);
      brokerListHydrated.current = true;
      await load();
      onRefresh?.();
    } catch (e) {
      let elapsed = performance.now() - connectFlowStarted;
      if (elapsed < MIN_CONNECT_UI_MS) {
        await sleepMs(MIN_CONNECT_UI_MS - elapsed);
      }
      setConnectErr(String(e.message || e));
      setConnectErrBump((b) => b + 1);
    } finally {
      setConnectSubmitting(false);
    }
  }

  const openSessions = sessions.filter(
    (s) => s.state === "running" || s.state === "queued"
  );

  const runningCount = sessions.filter(
    (s) => s.state === "running" || s.state === "queued"
  ).length;

  const accessExpiryMs = user.access_expires_at
    ? new Date(user.access_expires_at).getTime()
    : null;
  const accessMsLeft =
    accessExpiryMs != null ? Math.max(0, accessExpiryMs - Date.now()) : null;
  const hasActiveAccess =
    Boolean(user.has_access) &&
    (accessMsLeft == null ? true : accessMsLeft > 0);
  const accessLeftLabel = (() => {
    if (accessMsLeft == null) return null;
    if (accessMsLeft <= 0) return "expired";
    const totalMin = Math.floor(accessMsLeft / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${Math.max(1, mins)}m left`;
  })();

  const fullName = [tgUser?.first_name, tgUser?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const telegramUsername = tgUser?.username ? `@${tgUser.username}` : "";
  const profileName = usernameOverride
    ? usernameOverride
    : fullName || telegramUsername || "User";

  const telegramAvatar = tgUser?.photo_url || "";
  const profileAvatar = avatarOverrideDataUrl || telegramAvatar;

  function onProfileAvatarFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      setAvatarOverrideDataUrl(dataUrl);
      try {
        localStorage.setItem("profile_avatar_override_dataurl", dataUrl);
      } catch {
        // ignore storage errors
      }
    };
    reader.readAsDataURL(file);
  }

  function openProfileEdit() {
    const base = usernameOverride || telegramUsername || "";
    setUsernameDraft(base);
    setProfileEditOpen(true);
  }

  function closeProfileEdit() {
    setProfileEditOpen(false);
  }

  function applyProfileEdit() {
    const raw = String(usernameDraft || "").trim();
    const cleaned = raw.startsWith("@") ? raw.slice(1) : raw;
    if (!cleaned) {
      setUsernameOverride("");
      try {
        localStorage.removeItem("profile_username_override");
      } catch {
        // ignore
      }
      setProfileEditOpen(false);
      return;
    }
    const normalized = `@${cleaned}`;
    setUsernameOverride(normalized);
    try {
      localStorage.setItem("profile_username_override", normalized);
    } catch {
      // ignore
    }
    setProfileEditOpen(false);
  }

  function cancelBrokerEdit() {
    if (!accounts.length) return;
    setBrokerExpanded(false);
    setFieldErrors({ server: false, login: false, password: false });
    setConnectErr("");
    setForm(emptyForm);
  }

  const selectedBrokerName =
    accounts.find((a) => String(a.id) === String(tradingAccountId))?.broker_name || "Demo";
  const selectedServerName =
    accounts.find((a) => String(a.id) === String(tradingAccountId))?.server || "Demo";
  const primaryAccount =
    accounts.find((a) => String(a.id) === String(tradingAccountId)) || accounts[0];
  const connectSummary =
    primaryAccount != null
      ? `${primaryAccount.broker_name} · ${primaryAccount.login}`
      : "";
  const activeSessionForAccount = sessions.find(
    (s) =>
      String(s.account_id) === String(tradingAccountId) &&
      (s.state === "running" || s.state === "queued")
  );
  const latestSessionForAccount = sessions.find(
    (s) => String(s.account_id) === String(tradingAccountId)
  );
  // Profit in profile should be per current session (not sum of historical sessions).
  const sessionPnl = (() => {
    const src = activeSessionForAccount || latestSessionForAccount;
    if (!src) return null;
    if (src.pnl === null || src.pnl === undefined) return null;
    const n = Number(src.pnl);
    return Number.isFinite(n) ? n : null;
  })();
  useEffect(() => {
    const failedSession = sessions.find(
      (s) =>
        String(s.account_id) === String(tradingAccountId) &&
        s.state === "failed"
    );
    if (!failedSession) return;
    const key = String(failedSession.id);
    if (notifiedFailedSessionRef.current === key) return;
    notifiedFailedSessionRef.current = key;
    // Do not show generic "worker crashed" banner in WebApp.
  }, [sessions, tradingAccountId]);
  const latestSnapshotForAccount = sessions.find(
    (s) =>
      String(s.account_id) === String(tradingAccountId) &&
      (s.last_balance != null || s.last_equity != null || s.last_margin != null)
  );
  const accountSnapshot =
    activeSessionForAccount || latestSnapshotForAccount || latestSessionForAccount;
  const livePositions = useMemo(() => {
    // Positions are live-only: don't show stale snapshot from stopped sessions.
    const raw = activeSessionForAccount?.positions_json;
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [activeSessionForAccount?.positions_json]);

  const profileBalance =
    accountSnapshot?.last_balance != null
      ? Number(accountSnapshot.last_balance)
      : null;
  const profileEquity =
    accountSnapshot?.last_equity != null ? Number(accountSnapshot.last_equity) : null;
  const profileMargin =
    accountSnapshot?.last_margin != null ? Number(accountSnapshot.last_margin) : null;

  return (
    <div className="dashRoot">
      <div
        ref={dashShellRef}
        className={`dashShell${hideTabBar ? " dashKeyboardOpen" : ""}`}
      >
        <header className="dashHeaderFixed">
          <div className="dashHeader">
            <div className="dashHeaderBrand">
              <img src="/logo.png" alt="Logo" className="dashHeaderLogo" />
              <span>PHASE TRADE ROBOT</span>
            </div>
          </div>
        </header>

        <main className="dashContent">
          <div className="dashPanel">
            {err ? (
              <div className="dashPanelErr" role="alert">
                <span className="dashPanelErrGlyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                    />
                  </svg>
                </span>
                <div className="dashPanelErrBody">
                  <span className="dashPanelErrLabel">Something went wrong</span>
                  <p className="dashPanelErrText">{err}</p>
                </div>
              </div>
            ) : null}
            {msg && msg.trim().toLowerCase() !== "linked" ? (
              <div className="dashMsg">{msg}</div>
            ) : null}

            {activeTab === "profile" && (
              <div key="profile" className="dashTabPane">
                <div className="profilePage">
                  <div className="profileHeroBlock">
                    <div className="profileAvatarWrap">
                      {profileAvatar ? (
                        <img src={profileAvatar} alt="" className="profileAvatarRef" />
                      ) : (
                        <div className="profileAvatarRef profileAvatarRefFallback">
                          <ProfileFallbackIcon className="profileRefFallbackSvg" />
                        </div>
                      )}
                      <button
                        type="button"
                        className="profileAvatarEdit"
                        aria-label="Edit photo"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <ProfilePencilIcon className="profileAvatarEditSvg" />
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={onProfileAvatarFileChange}
                      />
                    </div>
                    <div className="profileDisplayName">{profileName}</div>
                    <button
                      type="button"
                      className="profileEditOutline"
                      onClick={openProfileEdit}
                    >
                      Edit Profile
                    </button>
                  </div>

                  {profileEditOpen && (
                    <div
                      className="dashModalOverlay"
                      role="dialog"
                      aria-modal="true"
                      onClick={closeProfileEdit}
                    >
                      <div
                        className="dashModalCard"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dashModalHead">
                          <div className="dashModalTitle">
                            Edit username
                          </div>
                          <button
                            type="button"
                            className="dashModalClose"
                            onClick={closeProfileEdit}
                            aria-label="Close"
                          >
                            ×
                          </button>
                        </div>

                        <div className="dashModalBody">
                          <div className="dashConnectInputShell">
                            <input
                              className="dashConnectInput"
                              placeholder="Username"
                              value={usernameDraft}
                              onChange={(e) => setUsernameDraft(e.target.value)}
                              autoComplete="off"
                            />
                          </div>
                        </div>

                        <div className="dashModalActions">
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnSecondary"
                            onClick={closeProfileEdit}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnPrimary"
                            onClick={applyProfileEdit}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="profileRefCard">
                    <div className="profileRefCardHead">
                      <span className="profileRefCardTitle">Balance</span>
                    </div>
                    <div className="profileRefRows">
                      <div className="profileRefRow">
                        <span className="profileRefLabel">Balance</span>
                        <span className="profileRefValue">
                          {profileBalance == null
                            ? "—"
                            : `${profileBalance.toFixed(2)} USDT`}
                        </span>
                      </div>
                      <div className="profileRefRow">
                        <span className="profileRefLabel">Equity</span>
                        <span className="profileRefValue">
                          {profileEquity == null
                            ? "—"
                            : `${profileEquity.toFixed(2)} USDT`}
                        </span>
                      </div>
                      <div className="profileRefRow">
                        <span className="profileRefLabel">Margin</span>
                        <span className="profileRefValue">
                          {profileMargin == null ? "—" : profileMargin.toFixed(2)}
                        </span>
                      </div>
                      <div className="profileRefRow profileRefRowLast">
                        <span className="profileRefLabel">Profit (session)</span>
                        <span
                          className={
                            (sessionPnl ?? 0) > 0
                              ? "profileRefValue profileRefValuePos"
                              : (sessionPnl ?? 0) < 0
                                ? "profileRefValue profileRefValueNeg"
                                : "profileRefValue profileRefValuePos"
                          }
                        >
                          {sessionPnl == null ? "—" : `${sessionPnl > 0 ? "+" : ""}${sessionPnl.toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="profileRefCard">
                    <div className="profileRefCardHead">
                      <span className="profileRefCardTitle">Positions</span>
                    </div>
                    <div className="profilePosTable">
                      <div className="profilePosColHead">
                        <span>SYM</span>
                        <span>TYPE</span>
                        <span>VOL</span>
                        <span>P/L</span>
                      </div>
                      {livePositions.length ? (
                        <div className="profilePosBody">
                          {livePositions.map((p) => {
                            const pnl = p?.profit != null ? Number(p.profit) : null;
                            const side = String(p?.type || "").toUpperCase();
                            const sym = String(p?.symbol || "—");
                            const vol = p?.volume != null ? Number(p.volume) : null;
                            const key = String(p?.ticket || `${sym}-${side}-${vol ?? "x"}`);
                            return (
                              <div key={key} className="profilePosRow">
                                <span>{sym}</span>
                                <span>{side || "—"}</span>
                                <span>{vol == null ? "—" : vol.toFixed(2)}</span>
                                <span
                                  className={
                                    pnl == null || pnl === 0
                                      ? "profileRefValue"
                                      : pnl > 0
                                        ? "profileRefValue profileRefValuePos"
                                        : "profileRefValue profileRefValueNeg"
                                  }
                                >
                                  {pnl == null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="profilePosEmpty">No open positions</p>
                      )}
                    </div>
                  </div>

                  <p className="profileFootNote">
                    Access {hasActiveAccess ? "active" : "inactive"}
                    {accessLeftLabel ? ` · ${accessLeftLabel}` : ""}
                  </p>
                </div>
              </div>
            )}
            {activeTab === "dashboard" && (
              <div key="dashboard" className="dashTabPane">
                <section className="dashConnectSection">
                  <div className="dashCard dashCardConnect dashCardConnectRef">
                    {accounts.length > 0 && !brokerExpanded && (
                      <div className="dashConnectLinked">
                        <span className="dashConnectLinkedMark" aria-hidden="true">
                          <ConnectLinkedCheckIcon className="dashConnectLinkedCheckSvg" />
                        </span>
                        <div className="dashConnectLinkedBody">
                          <p className="dashConnectLinkedAccount">{connectSummary}</p>
                        </div>
                        <button
                          type="button"
                          className="dashConnectLinkedAction"
                          onClick={() => {
                            setBrokerExpanded(true);
                            setMsg("");
                            setConnectErr("");
                          }}
                        >
                          Change
                        </button>
                      </div>
                    )}
                    {(accounts.length === 0 || brokerExpanded) && (
                      <>
                        <div
                          className={`dashCardTitleRow dashConnectInnerTitle${
                            accounts.length > 0 ? " dashConnectTitleRowWithAction" : ""
                          }`}
                        >
                          <h2>Connect Broker</h2>
                          {accounts.length > 0 ? (
                            <button
                              type="button"
                              className="dashConnectEditCancel"
                              onClick={cancelBrokerEdit}
                            >
                              Back
                            </button>
                          ) : null}
                        </div>
                        <form
                          className={`dashConnectFormStack${connectSubmitting ? " dashConnectFormConnecting" : ""}`}
                          onSubmit={submitBroker}
                        >
                          <div className={`dashConnectFieldGroup${fieldErrors.server ? " isInvalid" : ""}`}>
                            <div className="dashConnectInputShell dashConnectInputShellIcon">
                              <span className="dashConnectInputLeadIcon" aria-hidden>
                                <ConnectServerIcon className="dashConnectInputSvg" />
                              </span>
                              <input
                                className="dashConnectInput dashConnectInputPadded"
                                value={form.server}
                                placeholder="Enter server"
                                autoComplete="off"
                                aria-label="Server"
                                disabled={connectSubmitting}
                                onChange={(e) => {
                                  setConnectErr("");
                                  setFieldErrors((fe) => ({ ...fe, server: false }));
                                  setForm({ ...form, server: e.target.value });
                                }}
                              />
                            </div>
                          </div>
                          <div className={`dashConnectFieldGroup${fieldErrors.login ? " isInvalid" : ""}`}>
                            <div className="dashConnectInputShell dashConnectInputShellIcon">
                              <span className="dashConnectInputLeadIcon" aria-hidden>
                                <ConnectUserIcon className="dashConnectInputSvg" />
                              </span>
                              <input
                                className="dashConnectInput dashConnectInputPadded"
                                value={form.login}
                                placeholder="Enter login"
                                autoComplete="username"
                                aria-label="Login"
                                disabled={connectSubmitting}
                                onChange={(e) => {
                                  setConnectErr("");
                                  setFieldErrors((fe) => ({ ...fe, login: false }));
                                  setForm({ ...form, login: e.target.value });
                                }}
                              />
                            </div>
                          </div>
                          <div className={`dashConnectFieldGroup${fieldErrors.password ? " isInvalid" : ""}`}>
                            <div className="dashConnectInputShell dashConnectInputShellIcon dashConnectInputShellPw">
                              <span className="dashConnectInputLeadIcon" aria-hidden>
                                <ConnectLockIcon className="dashConnectInputSvg" />
                              </span>
                              <input
                                className="dashConnectInput dashConnectInputPadded"
                                type={showConnectPassword ? "text" : "password"}
                                value={form.password}
                                placeholder="Password"
                                autoComplete="current-password"
                                aria-label="Password"
                                disabled={connectSubmitting}
                                onChange={(e) => {
                                  setConnectErr("");
                                  setFieldErrors((fe) => ({ ...fe, password: false }));
                                  setForm({ ...form, password: e.target.value });
                                }}
                              />
                              <button
                                type="button"
                                className="dashConnectPwToggle"
                                aria-label={showConnectPassword ? "Hide password" : "Show password"}
                                disabled={connectSubmitting}
                                onClick={() => setShowConnectPassword((v) => !v)}
                              >
                                <ConnectEyeIcon open={showConnectPassword} className="dashConnectInputSvg" />
                              </button>
                            </div>
                          </div>
                          {(fieldErrors.server || fieldErrors.login || fieldErrors.password) && (
                            <div className="dashConnectValidationMsg">
                              Server, login, and password are required.
                            </div>
                          )}
                          {connectErr ? (
                            <div
                              className="dashConnectErrCard"
                              role="alert"
                              key={connectErrBump}
                            >
                              <span className="dashConnectErrGlyph" aria-hidden="true">
                                <svg viewBox="0 0 24 24">
                                  <path
                                    fill="currentColor"
                                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                                  />
                                </svg>
                              </span>
                              <div className="dashConnectErrBody">
                                <span className="dashConnectErrLabel">Couldn&apos;t connect</span>
                                <p className="dashConnectErrText">{connectErr}</p>
                              </div>
                            </div>
                          ) : null}
                          {connectSubmitting ? (
                            <p className="dashConnectVerifyHint" aria-live="polite">
                              <span className="dashConnectVerifyHintLead">Authorizing with broker</span>
                              <span className="dashConnectVerifyEllipsis" aria-hidden="true">
                                <span className="dashConnectVerifyEllipsisDot" />
                                <span className="dashConnectVerifyEllipsisDot" />
                                <span className="dashConnectVerifyEllipsisDot" />
                              </span>
                            </p>
                          ) : null}
                          <button
                            className={`dashConnectSubmitBtn${connectSubmitting ? " dashConnectSubmitBtnLoading" : ""}`}
                            type="submit"
                            disabled={connectSubmitting}
                          >
                            {connectSubmitting ? (
                              <>
                                <span className="dashConnectSubmitSpinner" aria-hidden="true" />
                                <span className="dashConnectSubmitLabel">Connecting</span>
                                <span className="dashConnectSubmitEllipsis" aria-hidden="true">
                                  <span className="dashConnectSubmitEllipsisDot" />
                                  <span className="dashConnectSubmitEllipsisDot" />
                                  <span className="dashConnectSubmitEllipsisDot" />
                                </span>
                              </>
                            ) : (
                              <span className="dashConnectSubmitLabel">Connect</span>
                            )}
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </section>

                <div className="dashCard dashCardBot">
                  <div className="dashCardHead dashCardHeadBot">
                    <h2>Trading Bot</h2>
                    <span className={runningCount > 0 ? "dashStatusGreen" : "dashStatusMuted"}>
                      {runningCount > 0 ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="dashField dashBotRow dashBotRowBroker">
                    <div className="dashFieldBody">
                      <label>Server</label>
                      <span
                        className="dashBotRowValue"
                      >
                        {selectedServerName}
                      </span>
                    </div>
                    <span className="dashFieldChevron">›</span>
                  </div>

                  {/* server selection modal removed */}
                  <div className="dashField dashBotRow">
                    <div className="dashFieldBody">
                      <label>Strategy</label>
                      <div
                        className="dashCurrencyDisplay"
                        role="button"
                        tabIndex={0}
                        onClick={openStrategyModal}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            openStrategyModal();
                        }}
                      >
                        {strategyLabel}
                      </div>
                    </div>
                    <span className="dashFieldChevron">›</span>
                  </div>

                  {strategyModalOpen && (
                    <div
                      className="dashModalOverlay"
                      role="dialog"
                      aria-modal="true"
                      onClick={closeStrategyModal}
                    >
                      <div
                        className="dashModalCard"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dashModalHead">
                          <div className="dashModalTitle">Select strategy</div>
                          <button
                            type="button"
                            className="dashModalClose"
                            onClick={closeStrategyModal}
                            aria-label="Close"
                          >
                            ×
                          </button>
                        </div>

                        <div className="dashModalBody">
                          <div className="dashSymbolsPills">
                            {STRATEGY_OPTIONS.map((opt) => {
                              const isOn = strategyDraft === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={`dashSymbolPill${
                                    isOn ? " isActive" : ""
                                  }`}
                                  onClick={() => setStrategyDraft(opt.value)}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="dashModalActions">
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnSecondary"
                            onClick={closeStrategyModal}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="dashModalBtn dashModalBtnPrimary"
                            onClick={applyStrategyModal}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="dashField dashBotRow">
                    <div className="dashFieldBody">
                      <label>Instrument</label>
                      <span className="dashBotRowValue">XAUUSD</span>
                    </div>
                    <span className="dashFieldChevron" aria-hidden="true">›</span>
                  </div>

                  <button
                    className={
                      activeSessionForAccount
                        ? `licenseBtn dashWideBtn dashStartBtn dashBotStopBtn${
                            stopSubmitting ? " dashConnectSubmitBtnLoading" : ""
                          }`
                        : `licenseBtn dashWideBtn dashStartBtn dashBotStartBtn${
                            startSubmitting ? " dashConnectSubmitBtnLoading" : ""
                          }`
                    }
                    type="button"
                    onClick={
                      activeSessionForAccount
                        ? () => stop(activeSessionForAccount.id)
                        : start
                    }
                    disabled={
                      brokerChangeMode
                        ? !activeSessionForAccount
                        : activeSessionForAccount
                          ? postStartStopGuard || stopSubmitting
                          : marketStatus.closed || startSubmitting || !accounts.length
                    }
                  >
                    {activeSessionForAccount ? stopSubmitting ? (
                      <>
                        <span className="dashConnectSubmitSpinner" aria-hidden="true" />
                        <span className="licenseBtnLabel">Stopping</span>
                        <span className="dashConnectSubmitEllipsis" aria-hidden="true">
                          <span className="dashConnectSubmitEllipsisDot" />
                          <span className="dashConnectSubmitEllipsisDot" />
                          <span className="dashConnectSubmitEllipsisDot" />
                        </span>
                      </>
                    ) : (
                      <span className="licenseBtnLabel">Stop</span>
                    ) : startSubmitting ? (
                      <>
                        <span className="dashConnectSubmitSpinner" aria-hidden="true" />
                        <span className="licenseBtnLabel">Connecting</span>
                        <span className="dashConnectSubmitEllipsis" aria-hidden="true">
                          <span className="dashConnectSubmitEllipsisDot" />
                          <span className="dashConnectSubmitEllipsisDot" />
                          <span className="dashConnectSubmitEllipsisDot" />
                        </span>
                      </>
                    ) : (
                      <span className="licenseBtnLabel">Start</span>
                    )}
                  </button>
                  {!activeSessionForAccount && marketStatus.closed ? (
                    <div className="dashMarketClosedCard" role="status" aria-live="polite">
                      <div className="dashMarketClosedTitle">Market closed</div>
                      <div className="dashMarketClosedText">
                        Market closed (weekend). Trading will be available{" "}
                        <span className="dashMarketClosedWhen">{marketStatus.nextOpenText || "Monday 09:00"}</span>{" "}
                        (Berlin).
                      </div>
                    </div>
                  ) : null}
                  {!accounts.length ? (
                    <p className="dashStartHint">Connect a broker first</p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="dashFooterFixed" aria-hidden={hideTabBar}>
          <div className="dashFooter">
            <button
              type="button"
              className={`dashTabBtn ${activeTab === "dashboard" ? "isActive" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <span className="dashTabIcon"><HomeTabIcon className="dashTabIconSvg" /></span>
              <span className="dashTabLabel">Home</span>
            </button>
            <button
              type="button"
              className={`dashTabBtn ${activeTab === "profile" ? "isActive" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <span className="dashTabIcon"><ProfileTabIcon className="dashTabIconSvg" /></span>
              <span className="dashTabLabel">Profile</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
