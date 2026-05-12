import React, { useEffect, useState } from "react";
import { api } from "./api.js";

const emptyForm = {
  broker_name: "DemoBroker",
  login: "",
  password: "",
  server: "Broker-Demo",
  risk_percent: 1,
};

export default function BrokerSelect({ refreshKey }) {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setErr("");
    try {
      setAccounts(await api.listBrokers());
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      await api.addBroker({
        ...form,
        risk_percent: Number(form.risk_percent),
      });
      setForm(emptyForm);
      setMsg("Account added");
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  return (
    <div className="card">
      <h1>Broker account</h1>
      {err && <div className="err">{err}</div>}
      {msg && <div>{msg}</div>}
      <form onSubmit={submit}>
        <label>Broker</label>
        <input
          value={form.broker_name}
          onChange={(e) => setForm({ ...form, broker_name: e.target.value })}
        />
        <label>Login</label>
        <input
          value={form.login}
          onChange={(e) => setForm({ ...form, login: e.target.value })}
        />
        <label>Password</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <label>Server</label>
        <input
          value={form.server}
          onChange={(e) => setForm({ ...form, server: e.target.value })}
        />
        <label>Risk %</label>
        <input
          type="number"
          step="0.1"
          min="0.1"
          max="100"
          value={form.risk_percent}
          onChange={(e) =>
            setForm({ ...form, risk_percent: e.target.value })
          }
        />
        <button type="submit">Save</button>
      </form>
      <h2 style={{ marginTop: "1rem", fontSize: "1rem" }}>Your accounts</h2>
      <ul>
        {accounts.map((a) => (
          <li key={a.id}>
            #{a.id} {a.broker_name} — {a.login} @ {a.server} (risk{" "}
            {a.risk_percent}%)
          </li>
        ))}
      </ul>
    </div>
  );
}
