import React, { useCallback, useEffect, useState } from "react";
import { adminTokensApi } from "./admin_api.js";
import { getInitData, prepareTelegramWebAppViewport } from "./telegram_init.js";

const ADMIN_TOKEN_KEY = "admin_access_token";
const PAGE_SIZE = 15;
const AUTO_REFRESH_MS = 8000;

function formatTimeLeft(sec) {
  if (sec <= 0) return "истёк";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function rowStatusKind(item) {
  if (!item.is_active) return "off";
  if (item.used_by_telegram_id != null) return "used";
  return "free";
}

function RowStatusPill({ item }) {
  const kind = rowStatusKind(item);
  const labels = { off: "Выключен", used: "Использован", free: "Свободен" };
  return (
    <span className={`adminTokensPill adminTokensPill--${kind}`}>{labels[kind]}</span>
  );
}

export default function AdminTokensApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authErr, setAuthErr] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listErr, setListErr] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [days, setDays] = useState("30");
  const [creating, setCreating] = useState(false);
  const [deletingCode, setDeletingCode] = useState("");
  const [pendingDeleteCode, setPendingDeleteCode] = useState("");
  const [createErr, setCreateErr] = useState("");
  const [lastCreated, setLastCreated] = useState(null);

  useEffect(() => {
    prepareTelegramWebAppViewport();
    const existing = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (existing) {
      setAuthLoading(false);
      return;
    }

    const initData = getInitData();
    if (!initData) {
      setAuthErr("Откройте эту страницу из Telegram, чтобы подтвердить admin user id.");
      setAuthLoading(false);
      return;
    }

    adminTokensApi
      .loginAdminTelegram(initData)
      .then((res) => {
        localStorage.setItem(ADMIN_TOKEN_KEY, res.access_token);
      })
      .catch((e) => {
        setAuthErr(String(e.message || e));
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setListQuery(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [listQuery]);

  const loadList = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    if (!silent) setLoadingList(true);
    if (!silent) setListErr("");
    try {
      const res = await adminTokensApi.listCodes(PAGE_SIZE, page * PAGE_SIZE, listQuery);
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      if (!silent) {
        setItems([]);
        setListErr(String(e.message || e));
      }
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, [page, listQuery]);

  useEffect(() => {
    if (!authLoading && !authErr) loadList();
  }, [authLoading, authErr, page, loadList]);

  useEffect(() => {
    if (authLoading || authErr) return undefined;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadList({ silent: true });
    };
    const timer = window.setInterval(tick, AUTO_REFRESH_MS);
    const onVisible = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authLoading, authErr, loadList]);

  useEffect(() => {
    if (!pendingDeleteCode) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !deletingCode) {
        setPendingDeleteCode("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [pendingDeleteCode, deletingCode]);

  async function createCode(e) {
    e.preventDefault();
    const n = parseInt(String(days).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      setCreateErr("Укажите целое число дней от 1 до 3650.");
      return;
    }
    setCreating(true);
    setCreateErr("");
    try {
      const res = await adminTokensApi.createCode(n);
      setLastCreated({
        code: res.code,
        expires_at: res.expires_at,
        days: res.days != null ? res.days : n,
      });
      setPage(0);
      await loadList();
    } catch (err) {
      setCreateErr(String(err.message || err));
    } finally {
      setCreating(false);
    }
  }

  async function deleteCode(code) {
    const codeText = String(code || "").trim();
    if (!codeText) return;
    setDeletingCode(codeText);
    setListErr("");
    try {
      await adminTokensApi.deleteCode(codeText);
      setItems((prev) => prev.filter((x) => String(x.code || "") !== codeText));
      if (lastCreated?.code === codeText) {
        setLastCreated(null);
      }
      await loadList();
    } catch (e) {
      setListErr(String(e.message || e));
    } finally {
      setDeletingCode("");
    }
  }

  function requestDelete(code) {
    const codeText = String(code || "").trim();
    if (!codeText || deletingCode) return;
    setPendingDeleteCode(codeText);
  }

  function cancelDelete() {
    if (deletingCode) return;
    setPendingDeleteCode("");
  }

  async function confirmDelete() {
    const codeText = String(pendingDeleteCode || "").trim();
    if (!codeText) return;
    await deleteCode(codeText);
    setPendingDeleteCode("");
  }

  const hasNext = items.length === PAGE_SIZE;

  if (authLoading) {
    return (
      <div className="adminTokensShell">
        <header className="adminTokensAppHeader" aria-hidden="true" />
        <section className="adminTokensCard">
          <p className="adminTokensMuted">Проверка прав администратора…</p>
        </section>
      </div>
    );
  }

  if (authErr) {
    return (
      <div className="adminTokensShell">
        <header className="adminTokensAppHeader" aria-hidden="true" />
        <section className="adminTokensCard">
          <p className="adminTokensErr">{authErr}</p>
          <p className="adminTokensHint">
            Доступ даётся только user id из <code className="adminTokensCode">TELEGRAM_ADMIN_IDS</code>.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="adminTokensShell">
      <header className="adminTokensAppHeader" aria-hidden="true" />

      <section className="adminTokensCard">
        <h2 className="adminTokensSectionTitle">Создать код</h2>
        <form className="adminTokensForm" onSubmit={createCode}>
          <div className="adminTokensField">
            <label className="adminTokensLabel" htmlFor="days">
              Срок действия
            </label>
            <p className="adminTokensFieldHint">Целое число дней от 1 до 3650</p>
            <input
              id="days"
              className="adminTokensInput adminTokensInputBlock"
              inputMode="numeric"
              autoComplete="off"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <button
            className="adminTokensBtn adminTokensBtnPrimary adminTokensBtnBlock"
            type="submit"
            disabled={creating}
          >
            {creating ? "Создание…" : "Создать код"}
          </button>
        </form>
        {createErr ? <p className="adminTokensErr">{createErr}</p> : null}
        {lastCreated ? (
          <div className="adminTokensCreated">
            <p className="adminTokensCreatedLabel">Код создан — отправьте пользователю</p>
            <p className="adminTokensCreatedCode">{lastCreated.code}</p>
            <div className="adminTokensCreatedDetails">
              <p className="adminTokensCreatedLine">
                <span className="adminTokensCreatedKey">Срок</span>
                <span className="adminTokensCreatedVal">{lastCreated.days} дн.</span>
              </p>
              <p className="adminTokensCreatedLine">
                <span className="adminTokensCreatedKey">Истекает</span>
                <span className="adminTokensCreatedVal">{lastCreated.expires_at || "—"}</span>
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="adminTokensCard">
        <div className="adminTokensListHeader">
          <h2 className="adminTokensListTitle">Список</h2>
          <div className="adminTokensSearchWrap">
            <input
              type="search"
              className="adminTokensSearchInput"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Код, @username или ID…"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Поиск по коду, username или Telegram ID"
            />
            {searchInput ? (
              <button
                type="button"
                className="adminTokensSearchClear"
                aria-label="Очистить поиск"
                onClick={() => setSearchInput("")}
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
        <div className="adminTokensPager">
          <div className="adminTokensPagerBtns">
            <button
              type="button"
              className="adminTokensBtn adminTokensBtnGhost adminTokensBtnTouch"
              disabled={page === 0 || loadingList}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Назад
            </button>
            <span className="adminTokensPageNum">стр. {page + 1}</span>
            <button
              type="button"
              className="adminTokensBtn adminTokensBtnGhost adminTokensBtnTouch"
              disabled={!hasNext || loadingList}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперёд
            </button>
          </div>
        </div>
        {listErr ? <p className="adminTokensErr adminTokensErrSpaced">{listErr}</p> : null}
        {loadingList ? (
          <p className="adminTokensMuted adminTokensMutedSpaced">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="adminTokensMuted adminTokensMutedSpaced">
            {listQuery ? "Ничего не найдено" : "Кодов пока нет"}
          </p>
        ) : (
          <ul className="adminTokensList">
            {items.map((row) => {
              const uname = String(row.used_by_telegram_username || "")
                .trim()
                .replace(/^@+/, "");
              return (
                <li key={row.code} className="adminTokensRow">
                  <div className="adminTokensRowHead">
                    <span className="adminTokensRowCode">{row.code}</span>
                    <RowStatusPill item={row} />
                  </div>
                  <p className="adminTokensRowSummary">
                    <span>{formatTimeLeft(row.seconds_left ?? 0)}</span>
                    <span className="adminTokensRowDot" aria-hidden="true">
                      ·
                    </span>
                    <span>{row.lifetime_days} дн. в коде</span>
                  </p>
                  {row.used_by_telegram_id != null ? (
                    <p className="adminTokensRowUser">
                      {uname ? (
                        <>
                          <span className="adminTokensRowAt">@{uname}</span>
                          <span className="adminTokensRowDot" aria-hidden="true">
                            ·
                          </span>
                        </>
                      ) : null}
                      <span className="mono">id {row.used_by_telegram_id}</span>
                    </p>
                  ) : null}
                  {row.used_at ? (
                    <p className="adminTokensRowActivated">Активирован: {row.used_at}</p>
                  ) : null}
                  <button
                    type="button"
                    className="adminTokensBtn adminTokensBtnDanger adminTokensBtnBlock adminTokensBtnTouch adminTokensBtnDelete"
                    disabled={Boolean(deletingCode)}
                    onClick={() => requestDelete(row.code)}
                  >
                    {deletingCode === row.code ? "Удаление…" : "Удалить"}
                  </button>
                  {uname ? (
                    <a
                      className="adminTokensBtn adminTokensBtnGhost adminTokensBtnBlock adminTokensBtnTouch adminTokensBtnMessage"
                      href={`https://t.me/${uname}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Написать пользователю
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {pendingDeleteCode ? (
        <div
          className="adminTokensModalOverlay"
          role="dialog"
          aria-modal="true"
          onClick={cancelDelete}
        >
          <div className="adminTokensModalCard" onClick={(e) => e.stopPropagation()}>
            <p className="adminTokensModalTitle">Удалить код?</p>
            <p className="adminTokensModalText">{pendingDeleteCode}</p>
            <div className="adminTokensModalActions">
              <button
                type="button"
                className="adminTokensBtn adminTokensBtnGhost adminTokensModalBtn"
                onClick={cancelDelete}
                disabled={Boolean(deletingCode)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="adminTokensBtn adminTokensBtnDanger adminTokensModalBtn"
                onClick={confirmDelete}
                disabled={Boolean(deletingCode)}
              >
                {deletingCode ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
