import React, { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getInitData,
  prepareTelegramWebAppViewport,
} from "./telegram_init.js";
import { api } from "./api.js";
import LicenseAccess, { LICENSE_MIN_VERIFY_MS } from "./license_access.jsx";
import Dashboard from "./dashboard.jsx";

const DEMO_TOKEN_KEY = "access_token";

export default function App() {
  const [user, setUser] = useState(null);
  const [tick, setTick] = useState(0);
  const [licenseBuyUrl, setLicenseBuyUrl] = useState(null);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    prepareTelegramWebAppViewport();
    applyTheme();
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .licensePurchaseUrl()
      .then((res) => {
        const u = typeof res?.url === "string" ? res.url.trim() : "";
        if (!cancelled) setLicenseBuyUrl(u || null);
      })
      .catch(() => {
        if (!cancelled) setLicenseBuyUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(DEMO_TOKEN_KEY);
    if (!token) {
      setUser(null);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(DEMO_TOKEN_KEY);
        setUser(null);
      });
  }, [tick]);

  async function loginWithTelegramInitData(options = {}) {
    const { deferRefresh = false } = options;
    const initData = getInitData();
    if (!initData) {
      throw new Error("Telegram initData not found. Open this WebApp from Telegram.");
    }
    const res = await api.loginTelegram(initData);
    localStorage.setItem(DEMO_TOKEN_KEY, res.access_token);
    if (!deferRefresh) refresh();
  }

  function waitMinVerify(flowStarted) {
    const elapsed = performance.now() - flowStarted;
    if (elapsed >= LICENSE_MIN_VERIFY_MS) return Promise.resolve();
    return new Promise((r) =>
      setTimeout(r, LICENSE_MIN_VERIFY_MS - elapsed),
    );
  }

  async function devDemoLogin(options = {}) {
    const { deferRefresh = false } = options;
    try {
      const r = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          init_data: "dev_demo_local",
        }),
      });
      const text = await r.text();
      if (r.ok) {
        const res = JSON.parse(text);
        localStorage.setItem(DEMO_TOKEN_KEY, res.access_token);
        if (!deferRefresh) refresh();
        return;
      }
      let detail = text;
      try {
        const j = JSON.parse(text);
        detail = j.detail != null ? JSON.stringify(j.detail) : text;
      } catch {
        /* keep text */
      }
      alert(
        `Dev login failed (${r.status}): ${detail}\n\n` +
          "Check: API running, ALLOW_DEV_AUTH=1 in autotrade_saas/.env, then restart uvicorn."
      );
    } catch (e) {
      alert(`Network error: ${e}. Is the API up at http://127.0.0.1:8001 ?`);
    }
  }

  if (!user || !user.has_access) {
    return (
      <LicenseAccess
        buyUrl={licenseBuyUrl}
        onActivate={async (licenseCode) => {
          const flowStarted = performance.now();
          try {
            await loginWithTelegramInitData({ deferRefresh: true });
            await api.redeemCode(licenseCode);
            await waitMinVerify(flowStarted);
            refresh();
            return { ok: true };
          } catch (e) {
            if (String(e.message || e).includes("initData")) {
              try {
                await devDemoLogin({ deferRefresh: true });
                await api.redeemCode(licenseCode);
                await waitMinVerify(flowStarted);
                refresh();
                return { ok: true };
              } catch (devErr) {
                return { ok: false, error: String(devErr.message || devErr) };
              }
            }
            return { ok: false, error: String(e.message || e) };
          }
        }}
      />
    );
  }

  return (
    <div className="app">
      <Dashboard user={user} refreshKey={tick} onRefresh={refresh} />
    </div>
  );
}
