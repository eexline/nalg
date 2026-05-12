const base = "";

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = localStorage.getItem("admin_access_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`${base}${path}`, { ...opts, headers });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) {
    throw new Error(
      typeof data === "object" && data?.detail != null
        ? JSON.stringify(data.detail)
        : text,
    );
  }
  return data;
}

export const adminTokensApi = {
  loginAdminTelegram: (initData) =>
    request("/api/auth/admin/telegram", {
      method: "POST",
      body: JSON.stringify({ init_data: initData }),
    }),
  listCodes: (limit = 20, offset = 0, q = "") => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    const trimmed = String(q || "").trim();
    if (trimmed) params.set("q", trimmed);
    return request(`/api/tokens/codes?${params.toString()}`);
  },
  createCode: (days) =>
    request("/api/tokens/codes/create", {
      method: "POST",
      body: JSON.stringify({ days }),
    }),
  deleteCode: (code) =>
    request(`/api/tokens/codes/${encodeURIComponent(String(code || "").trim())}`, {
      method: "DELETE",
    }),
};
