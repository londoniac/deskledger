import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, PERSONAL_EXPENSE_CATEGORIES, PIE_COLORS } from "../lib/constants.js";
import { fmt, r2, fmtDate } from "../lib/format.js";
import { Card, StatCard, Spinner, ErrorMsg } from "../components/ui.jsx";
import { useWorkspace } from "../App.jsx";

export default function Dashboard() {
  const { mode } = useWorkspace();
  const [transactions, setTransactions] = useState([]);
  const [paypalTxns, setPaypalTxns] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        // Fetch independently so one failure doesn't block others
        const [txnResult, profResult, ppResult] = await Promise.allSettled([
          api.transactions.getAll(),
          api.profile.get(),
          mode === "business" ? api.paypal.getTransactions() : Promise.resolve([]),
        ]);

        if (txnResult.status === "fulfilled") setTransactions(txnResult.value || []);
        else setError(`Failed to load transactions: ${txnResult.reason?.message || "Unknown error"}`);

        if (profResult.status === "fulfilled") setProfile(profResult.value);
        else console.warn("Profile fetch failed:", profResult.reason);

        if (ppResult.status === "fulfilled") setPaypalTxns(ppResult.value || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [mode]);

  const isBusiness = mode === "business";
  const expenseCats = isBusiness ? EXPENSE_CATEGORIES : PERSONAL_EXPENSE_CATEGORIES;
  const EXCLUDE_FROM_INCOME = ["transfer", "capital"];

  const stats = useMemo(() => {
    const active = transactions.filter((t) => !t.excluded);
    const income = active.filter((t) => t.type === "income" && !EXCLUDE_FROM_INCOME.includes(t.category));
    const capitalTxns = active.filter((t) => t.type === "income" && t.category === "capital");
    const expenses = active.filter((t) => t.type === "expense" && t.category !== "transfer");

    const totalIncome = r2(income.reduce((s, t) => s + Number(t.amount), 0));
    const totalCapital = r2(capitalTxns.reduce((s, t) => s + Number(t.amount), 0));
    let companyExpenses = r2(expenses.reduce((s, t) => s + Number(t.amount), 0));

    // Bank transfers out (to PayPal etc.) — excluded from P&L but needed for reconciliation
    const transferExpenses = active.filter((t) => t.type === "expense" && t.category === "transfer");
    const bankTransfersOut = r2(transferExpenses.reduce((s, t) => s + Number(t.amount), 0));

    // PayPal expenses: author payouts + fees (matches desktop app logic)
    // PayPal transactions use types: transfer_in, author_payout, fee, refund, other
    let paypalExpenses = 0;
    let ppAuthorPayouts = 0;
    let ppFees = 0;
    let ppTransfersIn = 0;
    if (isBusiness && paypalTxns.length > 0) {
      ppAuthorPayouts = r2(paypalTxns
        .filter((t) => t.type === "author_payout")
        .reduce((s, t) => s + Number(t.gbp_amount || t.amount), 0));
      ppFees = r2(paypalTxns
        .filter((t) => t.type === "fee")
        .reduce((s, t) => s + Number(t.gbp_amount || t.amount), 0));
      ppTransfersIn = r2(paypalTxns
        .filter((t) => t.type === "transfer_in")
        .reduce((s, t) => s + Number(t.gbp_amount || t.amount), 0));
      paypalExpenses = r2(ppAuthorPayouts + ppFees);
    }

    // PayPal transfer_in is NOT trading income — it's money moving from bank to PayPal
    // (the bank side is already excluded as inter-account transfer)
    // But we track it for reconciliation (PayPal balance = transfers_in - payouts - fees)
    let paypalIncome = 0;

    const combinedIncome = r2(totalIncome + paypalIncome);
    const combinedExpenses = r2(companyExpenses + paypalExpenses);
    const net = r2(combinedIncome - combinedExpenses);
    const taxRate = profile?.tax_rate || 19;
    const tax = isBusiness && net > 0 ? r2(net * (taxRate / 100)) : 0;
    const margin = combinedIncome > 0 ? r2((net / combinedIncome) * 100) : 0;
    const savingsRate = combinedIncome > 0 ? r2(((combinedIncome - combinedExpenses) / combinedIncome) * 100) : 0;

    return {
      income: combinedIncome, expenses: combinedExpenses, net, tax, taxRate, margin, savingsRate,
      incomeCount: income.length,
      expenseCount: expenses.length + (isBusiness ? paypalTxns.filter((t) => t.type === "author_payout" || t.type === "fee").length : 0),
      companyExpenses, paypalExpenses, paypalIncome, ppTransfersIn, bankTransfersOut, totalCapital,
      bankIncome: totalIncome,
    };
  }, [transactions, paypalTxns, profile, isBusiness]);

  const monthlyData = useMemo(() => {
    const active = transactions.filter((t) => !t.excluded && !EXCLUDE_FROM_INCOME.includes(t.category) && t.category !== "transfer");
    const months = {};
    active.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months[key]) months[key] = { month: key, income: 0, expenses: 0 };
      if (t.type === "income") months[key].income += Number(t.amount);
      else months[key].expenses += Number(t.amount);
    });
    // Include PayPal author payouts + fees in monthly chart as expenses
    // Exclude transfer_in (inter-account), other, refund from chart
    if (isBusiness) {
      paypalTxns
        .filter((t) => t.type === "author_payout" || t.type === "fee")
        .forEach((t) => {
          const d = new Date(t.date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!months[key]) months[key] = { month: key, income: 0, expenses: 0 };
          months[key].expenses += Number(t.gbp_amount || t.amount);
        });
    }
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({
      ...m, income: r2(m.income), expenses: r2(m.expenses),
      label: new Date(m.month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    }));
  }, [transactions, paypalTxns, isBusiness]);

  const categoryData = useMemo(() => {
    const active = transactions.filter((t) => !t.excluded && t.type === "expense" && t.category !== "transfer");
    const cats = {};
    active.forEach((t) => {
      const cat = expenseCats.find((c) => c.id === t.category);
      const label = cat ? cat.label : t.category || "Uncategorised";
      cats[label] = (cats[label] || 0) + Number(t.amount);
    });
    // PayPal author payouts + fees in category breakdown
    if (isBusiness) {
      let ppTotal = 0;
      paypalTxns.filter((t) => t.type === "author_payout" || t.type === "fee").forEach((t) => {
        ppTotal += Number(t.gbp_amount || t.amount);
      });
      if (ppTotal > 0) cats["PayPal Payouts"] = (cats["PayPal Payouts"] || 0) + ppTotal;
    }
    return Object.entries(cats)
      .map(([name, value]) => ({ name, value: r2(value) }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, paypalTxns, isBusiness]);

  if (loading) return <Spinner />;

  return (
    <div>
      {error && <ErrorMsg message={error} />}
      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label={isBusiness ? "Trading Income" : "Money In"} value={fmt(stats.income)} sub={`${stats.incomeCount} transactions`} color={PALETTE.income} />
        <StatCard
          label={isBusiness ? "Total Expenses" : "Money Out"}
          value={fmt(stats.expenses)}
          sub={isBusiness && stats.paypalExpenses > 0
            ? `${fmt(stats.companyExpenses)} company + ${fmt(stats.paypalExpenses)} PayPal`
            : `${stats.expenseCount} transactions`}
          color={PALETTE.expense}
        />
        <StatCard label={isBusiness ? "Net Profit" : "Net Position"} value={fmt(stats.net)} sub={isBusiness ? `${stats.margin}% margin` : `${stats.savingsRate}% savings rate`} color={stats.net >= 0 ? PALETTE.income : PALETTE.expense} />
        {isBusiness ? (
          <StatCard label="Corp Tax Estimate" value={fmt(stats.tax)} sub={`@ ${stats.taxRate}%`} color={PALETTE.warning} />
        ) : (
          <StatCard label="Monthly Avg Spend" value={fmt(stats.expenses / Math.max(monthlyData.length, 1))} sub={`across ${monthlyData.length} months`} color={PALETTE.blue} />
        )}
      </div>

      {/* Account Reconciliation (Business) */}
      {isBusiness && <AccountReconciliation stats={stats} profile={profile} />}

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

function AccountReconciliation({ stats, profile }) {
  const seedMoney = Number(profile?.seed_money || 0);
  const actualBankBalance = profile?.bank_balance != null ? Number(profile.bank_balance) : null;
  const bankBalanceDate = profile?.bank_balance_date || null;
  // Calculated bank balance: seed + trading income - company expenses - transfers out
  const calcBankBalance = r2(seedMoney + stats.bankIncome - stats.companyExpenses - stats.bankTransfersOut);
  // Use actual balance from CSV if available, otherwise calculated
  const bankBalance = actualBankBalance != null ? actualBankBalance : calcBankBalance;
  // PayPal balance: money transferred in from bank - author payouts - fees
  const paypalBalance = r2(stats.ppTransfersIn - stats.paypalExpenses);
  const cashPosition = r2(bankBalance + paypalBalance);
  // P&L check: transfers cancel out (bank -X + PayPal +X = 0), so just trading activity
  const plCheck = r2(seedMoney + stats.income - stats.expenses);
  const variance = r2(cashPosition - plCheck);

  const Row = ({ label, value, color, bold, indent }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0", marginLeft: indent ? 16 : 0,
      borderBottom: bold ? "none" : `1px solid ${PALETTE.border}22`,
    }}>
      <span style={{ fontSize: 13, color: bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{
        fontSize: 14, fontFamily: "JetBrains Mono, monospace",
        fontWeight: bold ? 700 : 500, color: color || PALETTE.text,
      }}>{fmt(value)}</span>
    </div>
  );

  return (
    <Card style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Account Reconciliation</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Balances</div>
          {seedMoney > 0 && <Row label="Seed Capital" value={seedMoney} color={PALETTE.blue} />}
          <Row
            label={actualBankBalance != null
              ? `Bank (from statement${bankBalanceDate ? ` ${fmtDate(bankBalanceDate)}` : ""})`
              : "Bank (calculated)"}
            value={bankBalance}
          />
          {stats.ppTransfersIn > 0 || stats.paypalExpenses > 0 ? (
            <Row label="PayPal" value={paypalBalance} />
          ) : null}
          <Row label="Cash Position" value={cashPosition} color={cashPosition >= 0 ? PALETTE.income : PALETTE.expense} bold />
        </div>
        <div>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>P&L Check</div>
          <Row label="Trading Income" value={stats.income} color={PALETTE.income} />
          <Row label="Total Expenses" value={stats.expenses} color={PALETTE.expense} />
          <Row label="Net Profit" value={stats.net} color={stats.net >= 0 ? PALETTE.income : PALETTE.expense} />
          <Row label="+ Seed Capital" value={seedMoney} color={PALETTE.blue} />
          <Row label="Expected Cash" value={plCheck} bold />
          <div style={{
            marginTop: 8, padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: Math.abs(variance) < 0.01 ? PALETTE.accentDim : PALETTE.dangerDim,
            color: Math.abs(variance) < 0.01 ? PALETTE.accent : PALETTE.danger,
          }}>
            Variance: {fmt(variance)} {Math.abs(variance) < 0.01 ? "(balanced)" : ""}
          </div>
        </div>
      </div>
    </Card>
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
