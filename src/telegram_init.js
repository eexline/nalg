export function getTelegramWebApp() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

/** Maximize Mini App height + fullscreen where the client supports it (Bot API 7.10+). */
function maximizeTelegramViewport(tg) {
  if (!tg) return;
  try {
    tg.ready();
  } catch {
    /* ignore */
  }
  try {
    tg.expand?.();
  } catch {
    /* ignore */
  }
  try {
    if (typeof tg.requestFullscreen === "function") {
      tg.requestFullscreen();
    }
  } catch {
    /* older clients / policy */
  }
  try {
    tg.disableVerticalSwipes?.();
  } catch {
    /* ignore */
  }
  try {
    if (!tg.__autotradeViewportHooked) {
      tg.__autotradeViewportHooked = true;
      tg.onEvent?.("viewportChanged", () => {
        try {
          tg.expand?.();
        } catch {
          /* ignore */
        }
      });
    }
  } catch {
    /* ignore */
  }
}

export function getInitData() {
  const tg = getTelegramWebApp();
  if (!tg) return "";
  maximizeTelegramViewport(tg);
  return tg.initData || "";
}

export function getTelegramUser() {
  const tg = getTelegramWebApp();
  if (!tg) return null;
  const direct = tg.initDataUnsafe?.user;
  if (direct && typeof direct === "object") return direct;

  const raw = tg.initData || "";
  if (!raw) return null;
  try {
    const params = new URLSearchParams(raw);
    const userRaw = params.get("user");
    if (!userRaw) return null;
    const parsed = JSON.parse(userRaw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function prepareTelegramWebAppViewport() {
  maximizeTelegramViewport(getTelegramWebApp());
}

export function applyTheme() {
  const tg = getTelegramWebApp();
  if (!tg) return;
  maximizeTelegramViewport(tg);
  if (!tg?.themeParams?.bg_color) return;
  document.documentElement.style.setProperty("--tg-bg", tg.themeParams.bg_color);
}
