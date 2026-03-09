import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api from "../lib/api.js";
import { PALETTE } from "../lib/constants.js";
import { fmt, r2 } from "../lib/format.js";
import { Card, Button, Input, Label, Select, Spinner, ErrorMsg, SuccessMsg } from "../components/ui.jsx";

const DEBT_TYPES = [
  { value: "credit_card", label: "Credit Card" },
  { value: "loan", label: "Loan" },
  { value: "mortgage", label: "Mortgage" },
  { value: "store_card", label: "Store Card" },
  { value: "overdraft", label: "Overdraft" },
  { value: "other", label: "Other" },
];

export default function Debts() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  function emptyForm() {
    return { name: "", type: "credit_card", provider: "", balance: "", credit_limit: "", interest_rate: "", min_payment: "", monthly_payment: "", payment_day: "", notes: "" };
  }

  useEffect(() => {
    api.debts.getAll()
      .then(setDebts)
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    const active = debts.filter((d) => d.is_active);
    const totalBalance = r2(active.reduce((s, d) => s + Number(d.balance), 0));
    const totalMinPayment = r2(active.reduce((s, d) => s + Number(d.min_payment || 0), 0));
    const totalMonthlyPayment = r2(active.reduce((s, d) => s + Number(d.monthly_payment || 0), 0));
    const totalCreditLimit = r2(active.filter((d) => d.credit_limit).reduce((s, d) => s + Number(d.credit_limit), 0));
    return { totalBalance, totalMinPayment, totalMonthlyPayment, totalCreditLimit };
  }, [debts]);

  // Payoff projection chart data
  const projectionData = useMemo(() => {
    const active = debts.filter((d) => d.is_active && Number(d.balance) > 0);
    if (active.length === 0) return [];
    const months = [];
    let balances = active.map((d) => ({
      name: d.name,
      balance: Number(d.balance),
      rate: Number(d.interest_rate || 0) / 100 / 12,
      payment: Number(d.monthly_payment || d.min_payment || 0),
    }));
    for (let i = 0; i <= 60; i++) {
      const total = r2(balances.reduce((s, b) => s + Math.max(b.balance, 0), 0));
      if (total <= 0 && i > 0) break;
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      months.push({
        month: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        balance: total,
      });
      balances = balances.map((b) => ({
        ...b,
        balance: Math.max(b.balance + b.balance * b.rate - b.payment, 0),
      }));
    }
    return months;
  }, [debts]);

  const saveDebt = async () => {
    try {
      const data = {
        id: editId || `debt-${Date.now()}`,
        name: form.name,
        type: form.type,
        provider: form.provider,
        balance: Number(form.balance) || 0,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        interest_rate: Number(form.interest_rate) || 0,
        min_payment: Number(form.min_payment) || 0,
        monthly_payment: Number(form.monthly_payment) || 0,
        payment_day: form.payment_day ? Number(form.payment_day) : null,
        notes: form.notes,
        is_active: true,
      };
      const result = editId
        ? await api.debts.update(editId, data)
        : await api.debts.save(data);
      setDebts((prev) => {
        if (editId) return prev.map((d) => (d.id === editId ? result : d));
        return [...prev, result];
      });
      setForm(emptyForm());
      setShowAdd(false);
      setEditId(null);
      setMessage({ type: "success", text: editId ? "Debt updated" : "Debt added" });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const startEdit = (d) => {
    setEditId(d.id);
    setForm({
      name: d.name, type: d.type, provider: d.provider || "",
      balance: String(d.balance), credit_limit: d.credit_limit ? String(d.credit_limit) : "",
      interest_rate: String(d.interest_rate || ""), min_payment: String(d.min_payment || ""),
      monthly_payment: String(d.monthly_payment || ""), payment_day: d.payment_day ? String(d.payment_day) : "",
      notes: d.notes || "",
    });
    setShowAdd(true);
  };

  const deleteDebt = async (id) => {
    if (!confirm("Delete this debt account?")) return;
    try {
      await api.debts.delete(id);
      setDebts((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const u = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) return <Spinner />;

  return (
    <div>
      {message.type === "error" && <ErrorMsg message={message.text} />}
      {message.type === "success" && <SuccessMsg message={message.text} />}

      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <SummaryCard label="Total Debt" value={fmt(totals.totalBalance)} color={PALETTE.expense} />
        <SummaryCard label="Monthly Payments" value={fmt(totals.totalMonthlyPayment)} color={PALETTE.warning} />
        <SummaryCard label="Minimum Required" value={fmt(totals.totalMinPayment)} color={PALETTE.textDim} />
        {totals.totalCreditLimit > 0 && (
          <SummaryCard
            label="Credit Utilisation"
            value={`${r2((totals.totalBalance / totals.totalCreditLimit) * 100)}%`}
            color={totals.totalBalance / totals.totalCreditLimit > 0.5 ? PALETTE.expense : PALETTE.income}
            sub={`${fmt(totals.totalBalance)} of ${fmt(totals.totalCreditLimit)}`}
          />
        )}
      </div>

      {/* Payoff projection */}
      {projectionData.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Debt Payoff Projection</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={projectionData}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
              <XAxis dataKey="month" tick={{ fill: PALETTE.textMuted, fontSize: 10 }} interval={Math.max(Math.floor(projectionData.length / 12), 0)} />
              <YAxis tick={{ fill: PALETTE.textMuted, fontSize: 10 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 8, fontSize: 12 }}
                formatter={(v) => fmt(v)}
              />
              <Bar dataKey="balance" fill={PALETTE.expense} radius={[2, 2, 0, 0]} name="Balance" />
            </BarChart>
          </ResponsiveContainer>
          {projectionData.length > 1 && (
            <div style={{ fontSize: 12, color: PALETTE.textDim, marginTop: 8 }}>
              At current payments, debt-free by <strong style={{ color: PALETTE.accent }}>{projectionData[projectionData.length - 1].month}</strong>
              {" "}({projectionData.length - 1} months)
            </div>
          )}
        </Card>
      )}

      {/* Debt accounts */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>Debt Accounts</h3>
          <Button variant="outline" onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm(emptyForm()); }} style={{ fontSize: 12 }}>
            {showAdd ? "Cancel" : "+ Add Debt"}
          </Button>
        </div>

        {/* Add/Edit form */}
        {showAdd && (
          <div style={{ padding: 16, background: PALETTE.bg, borderRadius: 10, marginBottom: 16, border: `1px solid ${PALETTE.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => u("name", e.target.value)} placeholder="e.g. Barclaycard" /></div>
              <div><Label>Type</Label><Select value={form.type} onChange={(v) => u("type", v)} options={DEBT_TYPES} style={{ width: "100%" }} /></div>
              <div><Label>Provider</Label><Input value={form.provider} onChange={(e) => u("provider", e.target.value)} placeholder="e.g. Barclays" /></div>
              <div><Label>Current Balance (£)</Label><Input type="number" value={form.balance} onChange={(e) => u("balance", e.target.value)} /></div>
              <div><Label>Credit Limit (£)</Label><Input type="number" value={form.credit_limit} onChange={(e) => u("credit_limit", e.target.value)} placeholder="For cards" /></div>
              <div><Label>Interest Rate (APR %)</Label><Input type="number" value={form.interest_rate} onChange={(e) => u("interest_rate", e.target.value)} /></div>
              <div><Label>Min Payment (£)</Label><Input type="number" value={form.min_payment} onChange={(e) => u("min_payment", e.target.value)} /></div>
              <div><Label>Monthly Payment (£)</Label><Input type="number" value={form.monthly_payment} onChange={(e) => u("monthly_payment", e.target.value)} /></div>
              <div><Label>Payment Day</Label><Input type="number" value={form.payment_day} onChange={(e) => u("payment_day", e.target.value)} placeholder="1-31" /></div>
            </div>
            <div style={{ marginBottom: 12 }}><Label>Notes</Label><Input value={form.notes} onChange={(e) => u("notes", e.target.value)} placeholder="Optional notes" /></div>
            <Button onClick={saveDebt} disabled={!form.name}>{editId ? "Update" : "Add Debt"}</Button>
          </div>
        )}

        {/* Debt list */}
        {debts.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: PALETTE.textMuted, fontSize: 13 }}>
            No debts tracked yet. Add your credit cards, loans, and mortgage to see your full picture.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Name", "Type", "Balance", "Limit", "APR", "Min", "Payment", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, borderBottom: `1px solid ${PALETTE.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debts.filter((d) => d.is_active).map((d) => {
                const utilisation = d.credit_limit ? r2((Number(d.balance) / Number(d.credit_limit)) * 100) : null;
                return (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 13, color: PALETTE.text, fontWeight: 500 }}>{d.name}</div>
                      {d.provider && <div style={{ fontSize: 11, color: PALETTE.textMuted }}>{d.provider}</div>}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, textTransform: "uppercase", padding: "2px 8px", borderRadius: 4,
                        background: d.type === "mortgage" ? PALETTE.purple + "18" : d.type === "credit_card" ? PALETTE.expense + "18" : PALETTE.blue + "18",
                        color: d.type === "mortgage" ? PALETTE.purple : d.type === "credit_card" ? PALETTE.expense : PALETTE.blue,
                      }}>
                        {DEBT_TYPES.find((t) => t.value === d.type)?.label || d.type}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: PALETTE.expense }}>{fmt(d.balance)}</div>
                      {utilisation !== null && (
                        <div style={{ width: 60, height: 3, background: PALETTE.border, borderRadius: 2, marginTop: 4 }}>
                          <div style={{ width: `${Math.min(utilisation, 100)}%`, height: 3, background: utilisation > 75 ? PALETTE.expense : utilisation > 50 ? PALETTE.warning : PALETTE.accent, borderRadius: 2 }} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.textDim }}>
                      {d.credit_limit ? fmt(d.credit_limit) : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.textDim }}>
                      {d.interest_rate ? `${d.interest_rate}%` : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.textDim }}>
                      {d.min_payment ? fmt(d.min_payment) : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.warning }}>
                      {d.monthly_payment ? fmt(d.monthly_payment) : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <button onClick={() => startEdit(d)} style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 14, marginRight: 4 }}>✏️</button>
                      <button onClick={() => deleteDebt(d.id)} style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 14 }}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {/* Totals */}
              <tr style={{ background: PALETTE.bg }}>
                <td colSpan={2} style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, color: PALETTE.text }}>Total</td>
                <td style={{ padding: "8px 10px", fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: PALETTE.expense }}>{fmt(totals.totalBalance)}</td>
                <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.textDim }}>{totals.totalCreditLimit ? fmt(totals.totalCreditLimit) : ""}</td>
                <td />
                <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.textDim }}>{fmt(totals.totalMinPayment)}</td>
                <td style={{ padding: "8px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: PALETTE.warning }}>{fmt(totals.totalMonthlyPayment)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
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
