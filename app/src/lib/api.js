import { supabase } from "./supabase.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

async function request(path, options = {}) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return res;
}

export const api = {
  profile: {
    get: () => request("/api/profile"),
    update: (data) => request("/api/profile", { method: "PUT", body: JSON.stringify(data) }),
  },

  transactions: {
    getAll: () => request("/api/transactions"),
    save: (txns) => request("/api/transactions", { method: "POST", body: JSON.stringify(txns) }),
    update: (id, data) => request(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/api/transactions/${id}`, { method: "DELETE" }),
  },

  invoices: {
    getAll: () => request("/api/invoices"),
    save: (inv) => request("/api/invoices", { method: "POST", body: JSON.stringify(inv) }),
    update: (id, data) => request(`/api/invoices/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/api/invoices/${id}`, { method: "DELETE" }),
    getFileUrl: (id) => request(`/api/invoices/${id}/file`),
  },

  expenses: {
    getAll: () => request("/api/expenses"),
    save: (exp) => request("/api/expenses", { method: "POST", body: JSON.stringify(exp) }),
    update: (id, data) => request(`/api/expenses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/api/expenses/${id}`, { method: "DELETE" }),
  },

  import: {
    parse: (csv, source) => request("/api/import/parse", { method: "POST", body: JSON.stringify({ csv, source }) }),
    confirm: (transactions) => request("/api/import/confirm", { method: "POST", body: JSON.stringify({ transactions }) }),
  },

  export: {
    accountantPackUrl: () => `${API_URL}/api/export/accountant-pack`,
    transactionsCsvUrl: () => `${API_URL}/api/export/transactions.csv`,
  },
};
