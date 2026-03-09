import { useState, useEffect, useMemo } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PERSONAL_EXPENSE_CATEGORIES, PERSONAL_INCOME_CATEGORIES } from "../lib/constants.js";
import { fmt, r2, fmtDate } from "../lib/format.js";
import { Card, Badge, Button, Select, Input, ErrorMsg, SuccessMsg, Spinner } from "../components/ui.jsx";

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showExcluded, setShowExcluded] = useState(false);

  // Editing
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    Promise.all([api.transactions.getAll(), api.profile.get()])
      .then(([txns, prof]) => { setTransactions(txns); setProfile(prof); })
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const isBusiness = (profile?.account_type || "business") === "business";
  const expenseCats = isBusiness ? EXPENSE_CATEGORIES : PERSONAL_EXPENSE_CATEGORIES;
  const incomeCats = isBusiness ? INCOME_CATEGORIES : PERSONAL_INCOME_CATEGORIES;
  const ALL_CATEGORIES = [...expenseCats, ...incomeCats];

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (!showExcluded && t.excluded) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, search, typeFilter, categoryFilter, sourceFilter, showExcluded]);

  // Group by month
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = { key, transactions: [] };
      groups[key].transactions.push(t);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered]);

  const sources = useMemo(() => {
    const s = new Set(transactions.map((t) => t.source));
    return [...s].sort();
  }, [transactions]);

  const startEdit = (t) => {
    setEditId(t.id);
    setEditData({
      description: t.description,
      type: t.type,
      amount: t.amount,
      category: t.category,
      vat_rate: t.vat_rate || 0,
      notes: t.notes || "",
      excluded: t.excluded || false,
    });
  };

  const saveEdit = async () => {
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const vatAmount = r2(Number(editData.amount) * (Number(editData.vat_rate) / (100 + Number(editData.vat_rate))));
      const updated = await api.transactions.update(editId, {
        ...editData,
        vat_amount: vatAmount,
        updated_at: new Date().toISOString(),
      });
      setTransactions((prev) => prev.map((t) => (t.id === editId ? { ...t, ...updated } : t)));

      // Learn: save category rule if category was changed
      const original = transactions.find((t) => t.id === editId);
      if (original && editData.category && editData.category !== original.category && original.description) {
        const words = original.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(" ");
        if (words) {
          api.budgets.saveRule({ pattern: words, category: editData.category, type: editData.type }).catch(() => {});
        }
      }

      setEditId(null);
      setMessage({ type: "success", text: "Transaction updated" });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  const deleteTransaction = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await api.transactions.delete(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      setMessage({ type: "success", text: "Transaction deleted" });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const toggleExclude = async (t) => {
    try {
      const updated = await api.transactions.update(t.id, {
        excluded: !t.excluded,
        exclude_reason: !t.excluded ? "Manually excluded" : null,
        updated_at: new Date().toISOString(),
      });
      setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...updated } : x)));
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Filters */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..." style={{ width: 220, flex: "none" }}
          />
          <Select
            value={typeFilter} onChange={setTypeFilter}
            options={[{ value: "all", label: "All Types" }, { value: "income", label: "Income" }, { value: "expense", label: "Expenses" }]}
          />
          <Select
            value={categoryFilter} onChange={setCategoryFilter}
            options={[{ value: "all", label: "All Categories" }, ...ALL_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]}
          />
          {sources.length > 1 && (
            <Select
              value={sourceFilter} onChange={setSourceFilter}
              options={[{ value: "all", label: "All Sources" }, ...sources.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))]}
            />
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: PALETTE.textDim, cursor: "pointer" }}>
            <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} />
            Show excluded
          </label>
          <div style={{ marginLeft: "auto", fontSize: 12, color: PALETTE.textMuted }}>
            {filtered.length} of {transactions.length} transactions
          </div>
        </div>
      </Card>

      {message.type === "error" && <ErrorMsg message={message.text} />}
      {message.type === "success" && <SuccessMsg message={message.text} />}

      {/* Transaction groups */}
      {grouped.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: PALETTE.textMuted, fontSize: 13 }}>
            {transactions.length === 0 ? "No transactions yet. Go to Import to upload a bank statement." : "No transactions match your filters."}
          </div>
        </Card>
      ) : (
        grouped.map((group) => {
          const monthIncome = r2(group.transactions.filter((t) => t.type === "income" && !t.excluded && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0));
          const monthExpenses = r2(group.transactions.filter((t) => t.type === "expense" && !t.excluded && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0));
          const monthLabel = new Date(group.key + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

          return (
            <Card key={group.key} style={{ marginBottom: 16 }}>
              {/* Month header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>{monthLabel}</h3>
                <div style={{ display: "flex", gap: 16, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
                  <span style={{ color: PALETTE.income }}>+{fmt(monthIncome)}</span>
                  <span style={{ color: PALETTE.expense }}>-{fmt(monthExpenses)}</span>
                </div>
              </div>

              {/* Transaction rows */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Date", "Description", "Source", "Type", "Amount", "Category", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, borderBottom: `1px solid ${PALETTE.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.transactions.map((t) => {
                    const cat = ALL_CATEGORIES.find((c) => c.id === t.category);
                    const isEditing = editId === t.id;

                    if (isEditing) {
                      const cats = editData.type === "income" ? incomeCats : expenseCats;
                      return (
                        <tr key={t.id} style={{ background: PALETTE.bg }}>
                          <td style={{ padding: "8px 10px", fontSize: 13, color: PALETTE.textDim }}>{fmtDate(t.date)}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <Input value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} style={{ width: "100%" }} />
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <Select value={editData.type} onChange={(v) => setEditData({ ...editData, type: v, category: "" })}
                              options={[{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }]} />
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <Input type="number" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} style={{ width: 100 }} />
                          </td>
                          <td style={{ padding: "8px 10px" }} colSpan={2}>
                            <Select value={editData.category} onChange={(v) => setEditData({ ...editData, category: v })}
                              options={[{ value: "", label: "Select..." }, ...cats.map((c) => ({ value: c.id, label: c.label }))]} />
                          </td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                            <Button onClick={saveEdit} disabled={saving} style={{ marginRight: 4 }}>{saving ? "..." : "Save"}</Button>
                            <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={t.id} style={{
                        borderBottom: `1px solid ${PALETTE.border}`,
                        opacity: t.excluded ? 0.4 : 1,
                        borderLeft: `3px solid ${t.excluded ? "transparent" : t.category === "transfer" ? PALETTE.purple : !t.category ? PALETTE.orange : "transparent"}`,
                      }}>
                        <td style={{ padding: "8px 10px", fontSize: 13, color: PALETTE.textDim, whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                        <td style={{ padding: "8px 10px", fontSize: 13, color: PALETTE.text, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: t.excluded ? "line-through" : "none" }}>
                          {t.description}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <Badge color={t.source === "bank" ? PALETTE.blue : t.source === "paypal" ? PALETTE.cyan : PALETTE.textDim}>{t.source}</Badge>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <Badge color={t.type === "income" ? PALETTE.income : PALETTE.expense}>{t.type}</Badge>
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: t.type === "income" ? PALETTE.income : PALETTE.expense }}>
                          {fmt(t.amount)}
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: 12, color: t.category ? PALETTE.textDim : PALETTE.orange }}>
                          {cat ? cat.label : t.category || "Uncategorised"}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          <button onClick={() => startEdit(t)} title="Edit" style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 14, marginRight: 4 }}>✏️</button>
                          <button onClick={() => toggleExclude(t)} title={t.excluded ? "Include" : "Exclude"} style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 14, marginRight: 4 }}>
                            {t.excluded ? "↩️" : "🚫"}
                          </button>
                          <button onClick={() => deleteTransaction(t.id)} title="Delete" style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 14 }}>🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          );
        })
      )}
    </div>
  );
}
