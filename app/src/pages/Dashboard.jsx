import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, PERSONAL_EXPENSE_CATEGORIES, PIE_COLORS } from "../lib/constants.js";
import { fmt, r2 } from "../lib/format.js";
import { Card, StatCard, Spinner } from "../components/ui.jsx";
import { useWorkspace } from "../App.jsx";

export default function Dashboard() {
  const { mode } = useWorkspace();
  const [transactions, setTransactions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.transactions.getAll(), api.profile.get()])
      .then(([txns, prof]) => {
        setTransactions(txns);
        setProfile(prof);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const isBusiness = mode === "business";
  const expenseCats = isBusiness ? EXPENSE_CATEGORIES : PERSONAL_EXPENSE_CATEGORIES;

  const stats = useMemo(() => {
    const active = transactions.filter((t) => !t.excluded);
    const income = active.filter((t) => t.type === "income" && t.category !== "transfer");
    const expenses = active.filter((t) => t.type === "expense" && t.category !== "transfer");

    const totalIncome = r2(income.reduce((s, t) => s + Number(t.amount), 0));
    const totalExpenses = r2(expenses.reduce((s, t) => s + Number(t.amount), 0));
    const net = r2(totalIncome - totalExpenses);
    const taxRate = profile?.tax_rate || 19;
    const tax = isBusiness && net > 0 ? r2(net * (taxRate / 100)) : 0;
    const margin = totalIncome > 0 ? r2((net / totalIncome) * 100) : 0;
    const savingsRate = totalIncome > 0 ? r2(((totalIncome - totalExpenses) / totalIncome) * 100) : 0;

    return { income: totalIncome, expenses: totalExpenses, net, tax, taxRate, margin, savingsRate, incomeCount: income.length, expenseCount: expenses.length };
  }, [transactions, profile, isBusiness]);

  const monthlyData = useMemo(() => {
    const active = transactions.filter((t) => !t.excluded && t.category !== "transfer");
    const months = {};
    active.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months[key]) months[key] = { month: key, income: 0, expenses: 0 };
      if (t.type === "income") months[key].income += Number(t.amount);
      else months[key].expenses += Number(t.amount);
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({
      ...m, income: r2(m.income), expenses: r2(m.expenses),
      label: new Date(m.month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    }));
  }, [transactions]);

  const categoryData = useMemo(() => {
    const active = transactions.filter((t) => !t.excluded && t.type === "expense" && t.category !== "transfer");
    const cats = {};
    active.forEach((t) => {
      const cat = expenseCats.find((c) => c.id === t.category);
      const label = cat ? cat.label : t.category || "Uncategorised";
      cats[label] = (cats[label] || 0) + Number(t.amount);
    });
    return Object.entries(cats)
      .map(([name, value]) => ({ name, value: r2(value) }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  if (loading) return <Spinner />;

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label={isBusiness ? "Trading Income" : "Money In"} value={fmt(stats.income)} sub={`${stats.incomeCount} transactions`} color={PALETTE.income} />
        <StatCard label={isBusiness ? "Total Expenses" : "Money Out"} value={fmt(stats.expenses)} sub={`${stats.expenseCount} transactions`} color={PALETTE.expense} />
        <StatCard label={isBusiness ? "Net Profit" : "Net Position"} value={fmt(stats.net)} sub={isBusiness ? `${stats.margin}% margin` : `${stats.savingsRate}% savings rate`} color={stats.net >= 0 ? PALETTE.income : PALETTE.expense} />
        {isBusiness ? (
          <StatCard label="Corp Tax Estimate" value={fmt(stats.tax)} sub={`@ ${stats.taxRate}%`} color={PALETTE.warning} />
        ) : (
          <StatCard label="Monthly Avg Spend" value={fmt(stats.expenses / Math.max(monthlyData.length, 1))} sub={`across ${monthlyData.length} months`} color={PALETTE.blue} />
        )}
      </div>

      {/* VAT summary */}
      {profile?.vat_registered && <VatSummary transactions={transactions} />}

      {/* Charts */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {/* Monthly Income vs Expenses */}
        <Card style={{ flex: 2, minWidth: 400 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Monthly Income vs Expenses</h3>
          {monthlyData.length === 0 ? (
            <div style={{ color: PALETTE.textMuted, fontSize: 13, padding: 40, textAlign: "center" }}>No data yet — import a bank statement to get started</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
                <XAxis dataKey="label" tick={{ fill: PALETTE.textMuted, fontSize: 11 }} />
                <YAxis tick={{ fill: PALETTE.textMuted, fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip
                  contentStyle={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: PALETTE.text }}
                  formatter={(v) => fmt(v)}
                />
                <Bar dataKey="income" fill={PALETTE.income} radius={[4, 4, 0, 0]} name="Income" />
                <Bar dataKey="expenses" fill={PALETTE.expense} radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Expense Categories */}
        <Card style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Expense Breakdown</h3>
          {categoryData.length === 0 ? (
            <div style={{ color: PALETTE.textMuted, fontSize: 13, padding: 40, textAlign: "center" }}>No expenses yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => fmt(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {categoryData.slice(0, 6).map((c, i) => (
                  <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span style={{ color: PALETTE.textDim }}>{c.name}</span>
                    </div>
                    <span style={{ color: PALETTE.text, fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Recent Transactions</h3>
        {transactions.length === 0 ? (
          <div style={{ color: PALETTE.textMuted, fontSize: 13, textAlign: "center", padding: 40 }}>
            No transactions yet. Go to Import to upload a bank statement.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Date", "Description", "Type", "Amount", "Category"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, borderBottom: `1px solid ${PALETTE.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 15).map((t) => {
                  const cat = expenseCats.find((c) => c.id === t.category);
                  return (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.textDim, whiteSpace: "nowrap" }}>
                        {new Date(t.date).toLocaleDateString("en-GB")}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.text, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.description}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, textTransform: "uppercase", padding: "2px 8px",
                          borderRadius: 4, background: t.type === "income" ? PALETTE.income + "18" : PALETTE.expense + "18",
                          color: t.type === "income" ? PALETTE.income : PALETTE.expense,
                        }}>
                          {t.type}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: t.type === "income" ? PALETTE.income : PALETTE.expense }}>
                        {fmt(t.amount)}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: PALETTE.textDim }}>
                        {cat ? cat.label : t.category || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function VatSummary({ transactions }) {
  const active = transactions.filter((t) => !t.excluded && t.category !== "transfer");
  const vatCollected = r2(active.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.vat_amount || 0), 0));
  const vatReclaimable = r2(active.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.vat_amount || 0), 0));
  const netVat = r2(vatCollected - vatReclaimable);

  return (
    <Card style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>VAT Summary</h3>
      <div style={{ display: "flex", gap: 32 }}>
        <div>
          <div style={{ fontSize: 12, color: PALETTE.textMuted }}>VAT Collected</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: PALETTE.income, fontFamily: "JetBrains Mono, monospace" }}>{fmt(vatCollected)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: PALETTE.textMuted }}>VAT Reclaimable</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: PALETTE.expense, fontFamily: "JetBrains Mono, monospace" }}>{fmt(vatReclaimable)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: PALETTE.textMuted }}>Net VAT {netVat >= 0 ? "Owed" : "Refund"}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: netVat >= 0 ? PALETTE.warning : PALETTE.income, fontFamily: "JetBrains Mono, monospace" }}>{fmt(Math.abs(netVat))}</div>
        </div>
      </div>
    </Card>
  );
}
