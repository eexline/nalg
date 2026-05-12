import React, { useState } from "react";

/** Minimum time to show the “checking” state (keep in sync with App activation delay before refresh). */
export const LICENSE_MIN_VERIFY_MS = 4000;

const MIN_VERIFY_MS = LICENSE_MIN_VERIFY_MS;

function sleep(minMs) {
  return new Promise((r) => setTimeout(r, minMs));
}

export default function LicenseAccess({ onActivate, buyUrl }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [errBump, setErrBump] = useState(0);

  async function activate() {
    const code = key.trim();
    setErr("");
    if (!code) {
      setErr("Enter your license key to continue.");
      setErrBump((b) => b + 1);
      return;
    }
    setLoading(true);
    const started = performance.now();
    try {
      const res = await onActivate?.(code);
      const elapsed = performance.now() - started;
      if (elapsed < MIN_VERIFY_MS) {
        await sleep(MIN_VERIFY_MS - elapsed);
      }
      if (res && res.ok === false) {
        setErr(res.error || "Activation failed");
        setErrBump((b) => b + 1);
      }
    } catch (e) {
      const elapsed = performance.now() - started;
      if (elapsed < MIN_VERIFY_MS) {
        await sleep(MIN_VERIFY_MS - elapsed);
      }
      setErr(String(e.message || e));
      setErrBump((b) => b + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="licenseRoot">
      <div className="licensePanel">
        <div className="licenseLogoStub" aria-hidden="true">
          <img src="/logo.png" alt="Phase Trade Robot" className="licenseLogoImg" />
        </div>
        <div className="licenseBrand">PHASE TRADE ROBOT</div>
        <div className="licenseSubtitle">LICENSE ACCESS</div>

        <div
          className={`licenseRow licenseRowInput${loading ? " licenseRowInputVerifying" : ""}`}
        >
          <span className="licenseInputIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M16 1.2a6.795 6.795 0 0 0-6.284 9.392L1.168 19.14 1 19.515V23h3.533l.429-.076L7 20.886V20h.885L10 17.886V17h.886l2.664-2.664A6.797 6.797 0 1 0 16 1.2zm0 12.6a5.76 5.76 0 0 1-2.672-.657L10.472 16H9v1.472L7.472 19H6v1.472l-1.522 1.522-.033.006H2v-2.271l.005-.011 8.918-8.919A5.798 5.798 0 1 1 16 13.8zm-4.371-.75L3.682 21H3v-.68l7.95-7.952zM17.5 4A2.5 2.5 0 1 0 20 6.5 2.5 2.5 0 0 0 17.5 4zm0 4A1.5 1.5 0 1 1 19 6.5 1.502 1.502 0 0 1 17.5 8z"
                fill="currentColor"
              />
            </svg>
          </span>
          <input
            className="licenseInput"
            value={key}
            placeholder="Enter license key..."
            disabled={loading}
            onChange={(e) => {
              setErr("");
              setKey(e.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {loading ? (
          <p className="licenseVerifyHint" aria-live="polite">
            <span className="licenseVerifyHintLead">Verifying license</span>
            <span className="licenseVerifyEllipsis" aria-hidden="true">
              <span className="licenseVerifyEllipsisDot" />
              <span className="licenseVerifyEllipsisDot" />
              <span className="licenseVerifyEllipsisDot" />
            </span>
          </p>
        ) : null}

        <div className="licenseRow licenseRowPrimary">
          <button
            className={`licenseBtn licenseBtnPrimary${loading ? " licenseBtnIsLoading" : ""}`}
            type="button"
            onClick={activate}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="licenseBtnSpinner" aria-hidden="true" />
                <span className="licenseBtnLabel">Checking</span>
              </>
            ) : (
              <>
                <span className="licenseBtnLabel">ACTIVATE</span>
                <span className="licenseBtnArrow">→</span>
              </>
            )}
          </button>
        </div>

        {buyUrl ? (
          <div className="licenseRow licenseRowSecondary">
            <a
              className={`licenseBtn licenseBtnSecondary${loading ? " licenseBtnBlocked" : ""}`}
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={loading ? -1 : 0}
              aria-disabled={loading}
              onClick={(e) => {
                if (loading) e.preventDefault();
              }}
            >
              <span className="licenseBtnIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M7 9V7a5 5 0 0 1 10 0v2h1.2a1.8 1.8 0 0 1 1.8 1.8l-0.7 8.2A2 2 0 0 1 17.3 21H6.7a2 2 0 0 1-2-2L4 10.8A1.8 1.8 0 0 1 5.8 9H7zm2 0h6V7a3 3 0 0 0-6 0v2z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span className="licenseBtnLabel">BUY LICENSE KEY</span>
              <span className="licenseBtnArrow">→</span>
            </a>
          </div>
        ) : null}

        {err ? (
          <div
            className="licenseErrCard"
            role="alert"
            key={errBump}
          >
            <span className="licenseErrCardGlyph" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                />
              </svg>
            </span>
            <div className="licenseErrCardBody">
              <span className="licenseErrCardLabel">Couldn&apos;t activate</span>
              <p className="licenseErrCardText">{err}</p>
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}

