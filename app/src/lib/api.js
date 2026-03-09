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

const api = {
  profile: {
    get: () => request("/api/profile"),
    update: (data) => request("/api/profile", { method: "PUT", body: JSON.stringify(data) }),
  },

  transactions: {
    getAll: () => request("/api/transactions"),
    save: (txns) => request("/api/transactions", { method: "POST", body: JSON.stringify(txns) }),
    update: (id, data) => request(`/api/transactions/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE" }),
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

  paypal: {
    test: (client_id, client_secret, sandbox) => request("/api/paypal/test", { method: "POST", body: JSON.stringify({ client_id, client_secret, sandbox }) }),
    saveCredentials: (client_id, client_secret, sandbox) => request("/api/paypal/save-credentials", { method: "POST", body: JSON.stringify({ client_id, client_secret, sandbox }) }),
    hasCredentials: () => request("/api/paypal/has-credentials"),
    sync: (start_date, end_date) => request("/api/paypal/sync", { method: "POST", body: JSON.stringify({ start_date, end_date }) }),
    getTransactions: () => request("/api/paypal/transactions"),
    deleteTransaction: (id) => request(`/api/paypal/transactions/${id}`, { method: "DELETE" }),
  },

  debts: {
    getAll: () => request("/api/debts"),
    save: (debt) => request("/api/debts", { method: "POST", body: JSON.stringify(debt) }),
    update: (id, data) => request(`/api/debts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id) => request(`/api/debts/${id}`, { method: "DELETE" }),
    getPayments: (id) => request(`/api/debts/${id}/payments`),
    addPayment: (id, data) => request(`/api/debts/${id}/payments`, { method: "POST", body: JSON.stringify(data) }),
  },

  budgets: {
    getAll: (month) => request(`/api/budgets${month ? `?month=${month}` : ""}`),
    save: (budget) => request("/api/budgets", { method: "POST", body: JSON.stringify(budget) }),
    delete: (id) => request(`/api/budgets/${id}`, { method: "DELETE" }),
    getIncomeSources: () => request("/api/budgets/income-sources"),
    saveIncomeSource: (src) => request("/api/budgets/income-sources", { method: "POST", body: JSON.stringify(src) }),
    deleteIncomeSource: (id) => request(`/api/budgets/income-sources/${id}`, { method: "DELETE" }),
    getRules: () => request("/api/budgets/rules"),
    saveRule: (rule) => request("/api/budgets/rules", { method: "POST", body: JSON.stringify(rule) }),
    deleteRule: (id) => request(`/api/budgets/rules/${id}`, { method: "DELETE" }),
    getCustomCategories: () => request("/api/budgets/categories"),
    saveCustomCategory: (cat) => request("/api/budgets/categories", { method: "POST", body: JSON.stringify(cat) }),
    deleteCustomCategory: (id) => request(`/api/budgets/categories/${id}`, { method: "DELETE" }),
  },
};

export default api;
