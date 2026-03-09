import { useState, useEffect, useMemo } from "react";
import api from "../lib/api.js";
import { PALETTE, PERSONAL_EXPENSE_CATEGORIES, EXPENSE_CATEGORIES } from "../lib/constants.js";
import { fmt, r2 } from "../lib/format.js";
import { Card, Button, Input, Label, Spinner, ErrorMsg, SuccessMsg } from "../components/ui.jsx";

export default function Budget() {
  const [profile, setProfile] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [incomeSources, setIncomeSources] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Current month
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // New income source form
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [newIncome, setNewIncome] = useState({ earner: "", source: "", amount: "" });

  // New custom category form
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ label: "", type: "expense" });

  useEffect(() => {
    Promise.all([
      api.profile.get(),
      api.transactions.getAll(),
      api.budgets.getIncomeSources(),
      api.budgets.getAll(month),
      api.budgets.getCustomCategories(),
    ])
      .then(([prof, txns, sources, budg, cats]) => {
        setProfile(prof);
        setTransactions(txns);
        setIncomeSources(sources);
        setBudgets(budg);
        setCustomCategories(cats);
      })
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  // Reload budgets when month changes
  useEffect(() => {
    if (!loading) {
      api.budgets.getAll(month).then(setBudgets).catch(console.error);
    }
  }, [month]);

  const isBusiness = (profile?.account_type || "business") === "business";
  const defaultCats = isBusiness ? EXPENSE_CATEGORIES : PERSONAL_EXPENSE_CATEGORIES;
  const allExpenseCats = [...defaultCats.filter((c) => c.id !== "transfer"), ...customCategories.filter((c) => c.type === "expense")];

  // Calculate actuals for the selected month
  const monthActuals = useMemo(() => {
    const actuals = {};
    transactions
      .filter((t) => {
        if (t.excluded || t.category === "transfer") return false;
        const d = new Date(t.date);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return m === month;
      })
      .forEach((t) => {
        const cat = t.category || "uncategorised";
        if (!actuals[cat]) actuals[cat] = { income: 0, expense: 0 };
        if (t.type === "income") actuals[cat].income += Number(t.amount);
        else actuals[cat].expense += Number(t.amount);
      });
    return actuals;
  }, [transactions, month]);

  const totalIncome = useMemo(() => {
    return r2(Object.values(monthActuals).reduce((s, a) => s + a.income, 0));
  }, [monthActuals]);

  const totalExpenses = useMemo(() => {
    return r2(Object.values(monthActuals).reduce((s, a) => s + a.expense, 0));
  }, [monthActuals]);

  const budgetMap = useMemo(() => {
    const m = {};
    budgets.forEach((b) => { m[b.category] = b; });
    return m;
  }, [budgets]);

  const totalBudgeted = useMemo(() => {
    return r2(budgets.reduce((s, b) => s + Number(b.amount), 0));
  }, [budgets]);

  const expectedIncome = useMemo(() => {
    return r2(incomeSources.filter((s) => s.is_active).reduce((s, src) => s + Number(src.amount), 0));
  }, [incomeSources]);

  const saveBudget = async (category, amount) => {
    try {
      const result = await api.budgets.save({ category, month, amount: Number(amount) || 0 });
      setBudgets((prev) => {
        const exists = prev.find((b) => b.category === category && b.month === month);
        if (exists) return prev.map((b) => (b.category === category && b.month === month ? result : b));
        return [...prev, result];
      });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const addIncomeSource = async () => {
    if (!newIncome.earner || !newIncome.amount) return;
    try {
      const result = await api.budgets.saveIncomeSource({
        id: `inc-${Date.now()}`,
        earner: newIncome.earner,
        source: newIncome.source,
        amount: Number(newIncome.amount),
      });
      setIncomeSources((prev) => [...prev, result]);
      setNewIncome({ earner: "", source: "", amount: "" });
      setShowAddIncome(false);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const deleteIncomeSource = async (id) => {
    try {
      await api.budgets.deleteIncomeSource(id);
      setIncomeSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const addCustomCategory = async () => {
    if (!newCategory.label) return;
    try {
      const id = newCategory.label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const result = await api.budgets.saveCustomCategory({
        id,
        label: newCategory.label,
        type: newCategory.type,
      });
      setCustomCategories((prev) => [...prev, result]);
      setNewCategory({ label: "", type: "expense" });
      setShowAddCategory(false);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const deleteCustomCategory = async (id) => {
    try {
      await api.budgets.deleteCustomCategory(id);
      setCustomCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const monthLabel = new Date(month + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const prevMonth = () => {
    const d = new Date(month + "-01");
    d.setMonth(d.getMonth() - 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(month + "-01");
    d.setMonth(d.getMonth() + 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {message.type === "error" && <ErrorMsg message={message.text} />}
      {message.type === "success" && <SuccessMsg message={message.text} />}

      {/* Month selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <button onClick={prevMonth} style={{ background: "none", border: "none", color: PALETTE.textDim, cursor: "pointer", fontSize: 18 }}>◀</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: PALETTE.text }}>{monthLabel}</h2>
        <button onClick={nextMonth} style={{ background: "none", border: "none", color: PALETTE.textDim, cursor: "pointer", fontSize: 18 }}>▶</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <SummaryCard label="Expected Income" value={fmt(expectedIncome)} color={PALETTE.income} />
        <SummaryCard label="Actual Income" value={fmt(totalIncome)} color={PALETTE.income} sub={expectedIncome > 0 ? `${r2((totalIncome / expectedIncome) * 100)}%` : ""} />
        <SummaryCard label="Budgeted Spend" value={fmt(totalBudgeted)} color={PALETTE.warning} />
        <SummaryCard label="Actual Spend" value={fmt(totalExpenses)} color={PALETTE.expense} sub={totalBudgeted > 0 ? `${r2((totalExpenses / totalBudgeted) * 100)}%` : ""} />
        <SummaryCard label="Remaining" value={fmt(totalIncome - totalExpenses)} color={totalIncome - totalExpenses >= 0 ? PALETTE.income : PALETTE.expense} />
      </div>

      {/* Income Sources */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>Income</h3>
          <Button variant="outline" onClick={() => setShowAddIncome(!showAddIncome)} style={{ fontSize: 12 }}>+ Add Source</Button>
        </div>

        {showAddIncome && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end" }}>
            <div><Label>Who</Label><Input value={newIncome.earner} onChange={(e) => setNewIncome({ ...newIncome, earner: e.target.value })} placeholder="e.g. Den" style={{ width: 120 }} /></div>
            <div><Label>Source</Label><Input value={newIncome.source} onChange={(e) => setNewIncome({ ...newIncome, source: e.target.value })} placeholder="e.g. Employer" style={{ width: 150 }} /></div>
            <div><Label>Amount (£)</Label><Input type="number" value={newIncome.amount} onChange={(e) => setNewIncome({ ...newIncome, amount: e.target.value })} placeholder="0" style={{ width: 120 }} /></div>
            <Button onClick={addIncomeSource}>Add</Button>
            <Button variant="ghost" onClick={() => setShowAddIncome(false)}>Cancel</Button>
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Earner", "Source", "Expected", "Actual", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, borderBottom: `1px solid ${PALETTE.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {incomeSources.map((src) => (
              <tr key={src.id} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                <td style={{ padding: "8px 10px", fontSize: 13, color: PALETTE.text }}>{src.earner}</td>
                <td style={{ padding: "8px 10px", fontSize: 13, color: PALETTE.textDim }}>{src.source}</td>
                <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.income }}>{fmt(src.amount)}</td>
                <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.text }}>—</td>
                <td style={{ padding: "8px 10px" }}>
                  <button onClick={() => deleteIncomeSource(src.id)} style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 13 }}>✕</button>
                </td>
              </tr>
            ))}
            <tr style={{ background: PALETTE.bg }}>
              <td colSpan={2} style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, color: PALETTE.text }}>Total</td>
              <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: PALETTE.income }}>{fmt(expectedIncome)}</td>
              <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: PALETTE.income }}>{fmt(totalIncome)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Expense Budget */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>
            {isBusiness ? "Expenses" : "Bills & Spending"}
          </h3>
          <Button variant="outline" onClick={() => setShowAddCategory(!showAddCategory)} style={{ fontSize: 12 }}>+ Custom Category</Button>
        </div>

        {showAddCategory && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end" }}>
            <div><Label>Category Name</Label><Input value={newCategory.label} onChange={(e) => setNewCategory({ ...newCategory, label: e.target.value })} placeholder="e.g. Childcare" style={{ width: 200 }} /></div>
            <Button onClick={addCustomCategory}>Add</Button>
            <Button variant="ghost" onClick={() => setShowAddCategory(false)}>Cancel</Button>
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Category", "Budget", "Actual", "Remaining", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, borderBottom: `1px solid ${PALETTE.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allExpenseCats.map((cat) => {
              const actual = r2(monthActuals[cat.id]?.expense || 0);
              const budgeted = Number(budgetMap[cat.id]?.amount || 0);
              const remaining = r2(budgeted - actual);
              const isOver = budgeted > 0 && actual > budgeted;
              const isCustom = customCategories.some((c) => c.id === cat.id);
              const pct = budgeted > 0 ? Math.min((actual / budgeted) * 100, 100) : 0;

              if (budgeted === 0 && actual === 0) return null; // hide empty rows unless budgeted

              return (
                <tr key={cat.id} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                  <td style={{ padding: "8px 10px", fontSize: 13, color: PALETTE.text }}>
                    {cat.label}
                    {isCustom && <span style={{ fontSize: 10, color: PALETTE.textMuted, marginLeft: 6 }}>custom</span>}
                  </td>
                  <td style={{ padding: "8px 10px", width: 130 }}>
                    <BudgetInput value={budgeted} onChange={(v) => saveBudget(cat.id, v)} />
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: isOver ? PALETTE.expense : PALETTE.text }}>{fmt(actual)}</span>
                      {budgeted > 0 && (
                        <div style={{ width: 60, height: 4, background: PALETTE.border, borderRadius: 2 }}>
                          <div style={{ width: `${pct}%`, height: 4, background: isOver ? PALETTE.expense : PALETTE.accent, borderRadius: 2 }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: remaining < 0 ? PALETTE.expense : PALETTE.income }}>
                    {budgeted > 0 ? fmt(remaining) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {isCustom && <button onClick={() => deleteCustomCategory(cat.id)} style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 13 }}>✕</button>}
                  </td>
                </tr>
              );
            })}

            {/* Show categories with spend but not in defaults (uncategorised spend) */}
            {Object.entries(monthActuals)
              .filter(([cat, a]) => a.expense > 0 && !allExpenseCats.some((c) => c.id === cat))
              .map(([cat, a]) => (
                <tr key={cat} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                  <td style={{ padding: "8px 10px", fontSize: 13, color: PALETTE.orange }}>{cat || "Uncategorised"}</td>
                  <td style={{ padding: "8px 10px" }}><BudgetInput value={0} onChange={(v) => saveBudget(cat, v)} /></td>
                  <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.text }}>{fmt(a.expense)}</td>
                  <td style={{ padding: "8px 10px", fontSize: 13, color: PALETTE.textMuted }}>—</td>
                  <td />
                </tr>
              ))}

            {/* Totals row */}
            <tr style={{ background: PALETTE.bg }}>
              <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, color: PALETTE.text }}>Total</td>
              <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: PALETTE.warning }}>{fmt(totalBudgeted)}</td>
              <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: PALETTE.expense }}>{fmt(totalExpenses)}</td>
              <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: totalBudgeted - totalExpenses >= 0 ? PALETTE.income : PALETTE.expense }}>
                {fmt(totalBudgeted - totalExpenses)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>

        {/* Add budget for empty categories */}
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: PALETTE.textMuted, cursor: "pointer" }}>Show all categories to set budgets</summary>
          <div style={{ marginTop: 8 }}>
            {allExpenseCats.filter((cat) => !budgetMap[cat.id] && !(monthActuals[cat.id]?.expense > 0)).map((cat) => (
              <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: PALETTE.textDim, width: 180 }}>{cat.label}</span>
                <BudgetInput value={0} onChange={(v) => saveBudget(cat.id, v)} />
              </div>
            ))}
          </div>
        </details>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, color, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 150, background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: PALETTE.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function BudgetInput({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value || ""));

  if (!editing) {
    return (
      <span
        onClick={() => { setVal(String(value || "")); setEditing(true); }}
        style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: value ? PALETTE.warning : PALETTE.textMuted, cursor: "pointer" }}
      >
        {value ? fmt(value) : "Set budget"}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { onChange(val); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") { onChange(val); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
      style={{ width: 100, padding: "4px 8px", background: PALETTE.bg, border: `1px solid ${PALETTE.accent}`, borderRadius: 4, color: PALETTE.text, fontSize: 13, fontFamily: "JetBrains Mono, monospace", outline: "none" }}
    />
  );
}
