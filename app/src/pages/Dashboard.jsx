import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, ComposedChart, Line, Area } from "recharts";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, PERSONAL_EXPENSE_CATEGORIES, PIE_COLORS } from "../lib/constants.js";
import { fmt, r2, fmtDate } from "../lib/format.js";
import { Card, StatCard, Spinner, ErrorMsg } from "../components/ui.jsx";
import { useWorkspace } from "../App.jsx";

export default function Dashboard() {
  const { mode } = useWorkspace();
  const [transactions, setTransactions] = useState([]);
  const [paypalTxns, setPaypalTxns] = useState([]);
  const [personalExpenses, setPersonalExpenses] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        // Fetch independently so one failure doesn't block others
        const [txnResult, profResult, ppResult, peResult] = await Promise.allSettled([
          api.transactions.getAll(),
          api.profile.get(),
          mode === "business" ? api.paypal.getTransactions() : Promise.resolve([]),
          mode === "business" ? api.expenses.getAll() : Promise.resolve([]),
        ]);

        if (txnResult.status === "fulfilled") setTransactions(txnResult.value || []);
        else setError(`Failed to load transactions: ${txnResult.reason?.message || "Unknown error"}`);

        if (profResult.status === "fulfilled") setProfile(profResult.value);
        else console.warn("Profile fetch failed:", profResult.reason);

        if (ppResult.status === "fulfilled") setPaypalTxns(ppResult.value || []);
        if (peResult.status === "fulfilled") setPersonalExpenses(peResult.value || []);
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
    const reimbursementTxns = transactions.filter((t) => t.type === "reimbursement");
    const totalReimbursements = r2(reimbursementTxns.reduce((s, t) => s + Number(t.amount), 0));

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

    // Personal expenses (reimbursable by company)
    const totalPersonalExpenses = r2(personalExpenses.reduce((s, e) => s + Number(e.amount), 0));
    const reimbursementsOwed = r2(personalExpenses
      .filter((e) => e.status === "pending")
      .reduce((s, e) => s + Number(e.amount), 0));

    const combinedIncome = r2(totalIncome + paypalIncome);
    const combinedExpenses = r2(companyExpenses + paypalExpenses + totalPersonalExpenses);
    const net = r2(combinedIncome - combinedExpenses);
    const taxRate = profile?.tax_rate || 19;
    const tax = isBusiness && net > 0 ? r2(net * (taxRate / 100)) : 0;
    const margin = combinedIncome > 0 ? r2((net / combinedIncome) * 100) : 0;
    const savingsRate = combinedIncome > 0 ? r2(((combinedIncome - combinedExpenses) / combinedIncome) * 100) : 0;

    return {
      income: combinedIncome, expenses: combinedExpenses, net, tax, taxRate, margin, savingsRate,
      incomeCount: income.length,
      expenseCount: expenses.length + (isBusiness ? paypalTxns.filter((t) => t.type === "author_payout" || t.type === "fee").length : 0),
      companyExpenses, paypalExpenses, paypalIncome, ppTransfersIn, ppAuthorPayouts, ppFees,
      bankTransfersOut, totalCapital, totalPersonalExpenses, reimbursementsOwed,
      totalReimbursements, bankIncome: totalIncome,
    };
  }, [transactions, paypalTxns, personalExpenses, profile, isBusiness]);

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

  const cashFlowData = useMemo(() => {
    if (!isBusiness) return [];
    const EXCLUDE = ["transfer", "capital"];
    const active = transactions.filter((t) => !t.excluded);
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 89);
    start.setHours(0, 0, 0, 0);

    // Build a map of daily income and expenses
    const dayMap = {};
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { income: 0, expenses: 0 };
    }

    // Sum all transactions before the 90-day window to get the opening balance
    const seedMoney = Number(profile?.seed_money || 0);
    let preBalance = seedMoney;
    active.forEach((t) => {
      const tDate = new Date(t.date);
      const key = tDate.toISOString().slice(0, 10);
      const amt = Number(t.amount);
      if (tDate < start) {
        // Accumulate into pre-balance
        if (t.type === "income" && !EXCLUDE.includes(t.category)) preBalance += amt;
        else if (t.type === "expense") preBalance -= amt;
        else if (t.type === "reimbursement") preBalance -= amt;
      } else if (dayMap[key]) {
        if (t.type === "income" && !EXCLUDE.includes(t.category)) dayMap[key].income += amt;
        else if (t.type === "expense") dayMap[key].expenses += amt;
        else if (t.type === "reimbursement") dayMap[key].expenses += amt;
      }
    });

    // Build cumulative running balance
    let balance = preBalance;
    const result = [];
    const sortedKeys = Object.keys(dayMap).sort();
    sortedKeys.forEach((key) => {
      balance += dayMap[key].income - dayMap[key].expenses;
      result.push({
        date: key,
        label: new Date(key + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        balance: r2(balance),
        expenses: r2(dayMap[key].expenses),
      });
    });
    return result;
  }, [transactions, profile, isBusiness]);

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
          sub={isBusiness
            ? [
                `${fmt(stats.companyExpenses)} company`,
                stats.paypalExpenses > 0 ? `${fmt(stats.paypalExpenses)} PayPal` : "",
                stats.totalPersonalExpenses > 0 ? `${fmt(stats.totalPersonalExpenses)} personal` : "",
              ].filter(Boolean).join(" + ")
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

      {/* Cash Flow chart — business mode only */}
      {isBusiness && cashFlowData.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Cash Flow</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
              <XAxis
                dataKey="label"
                tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
                interval={6}
              />
              <YAxis
                yAxisId="balance"
                tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
                tickFormatter={(v) => `£${v}`}
              />
              <YAxis
                yAxisId="expenses"
                orientation="right"
                tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
                tickFormatter={(v) => `£${v}`}
              />
              <Tooltip
                contentStyle={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: PALETTE.text }}
                formatter={(v, name) => [fmt(v), name === "balance" ? "Balance" : "Expenses"]}
              />
              <Area
                yAxisId="balance"
                type="monotone"
                dataKey="balance"
                stroke={PALETTE.income}
                fill={PALETTE.income}
                fillOpacity={0.1}
                strokeWidth={2}
                name="balance"
                dot={false}
              />
              <Bar
                yAxisId="expenses"
                dataKey="expenses"
                fill={PALETTE.expense}
                opacity={0.7}
                radius={[2, 2, 0, 0]}
                name="expenses"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

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
  const [showDiag, setShowDiag] = useState(false);
  const seedMoney = Number(profile?.seed_money || 0);
  const actualBankBalance = profile?.bank_balance != null ? Number(profile.bank_balance) : null;
  const bankBalanceDate = profile?.bank_balance_date || null;

  // PayPal balance: money transferred in from bank - author payouts - fees
  const paypalBalance = r2(stats.ppTransfersIn - stats.paypalExpenses);

  // Cash position
  const bankBalance = actualBankBalance != null ? actualBankBalance : r2(seedMoney + stats.bankIncome - stats.companyExpenses - stats.bankTransfersOut - stats.totalReimbursements);
  const totalCash = r2(bankBalance + paypalBalance);
  const tradingGain = r2(totalCash - seedMoney);
  const afterReimbursements = r2(tradingGain + stats.reimbursementsOwed);

  // P&L check
  const plNet = stats.net;
  const plExpected = r2(seedMoney + plNet);
  const variance = r2(tradingGain - plNet);

  // Diagnostic: rebuild cash side from components to find mismatch
  const cashIncome = actualBankBalance != null
    ? r2(bankBalance - seedMoney + stats.bankTransfersOut + stats.companyExpenses) // reverse-derive what income must be
    : stats.bankIncome;
  const cashExpenses = stats.companyExpenses;
  const cashTransfersOut = stats.bankTransfersOut;
  const cashPPIn = stats.ppTransfersIn;
  const cashPPOut = stats.paypalExpenses;
  // P&L side components
  const plIncome = stats.income;
  const plBankExp = stats.companyExpenses;
  const plPPPayouts = stats.ppAuthorPayouts;
  const plPPFees = stats.ppFees;
  const plPersonal = stats.totalPersonalExpenses;

  const Row = ({ label, value, color, bold, dim, sep }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0",
      borderTop: sep ? `1px solid ${PALETTE.border}` : "none",
      borderBottom: bold ? "none" : `1px solid ${PALETTE.border}22`,
    }}>
      <span style={{ fontSize: 13, color: dim ? PALETTE.textMuted : bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{
        fontSize: 14, fontFamily: "JetBrains Mono, monospace",
        fontWeight: bold ? 700 : 500, color: color || PALETTE.text,
      }}>{fmt(value)}</span>
    </div>
  );

  const SectionLabel = ({ children }) => (
    <div style={{ fontSize: 12, color: PALETTE.textMuted, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
      {children}
    </div>
  );

  return (
    <Card style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Account Reconciliation</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: Cash Position */}
        <div>
          <SectionLabel>Cash Position</SectionLabel>
          <Row
            label={actualBankBalance != null
              ? `Monzo Bank (from statement${bankBalanceDate ? ` ${fmtDate(bankBalanceDate)}` : ""})`
              : "Monzo Bank (calculated)"}
            value={bankBalance}
          />
          {(stats.ppTransfersIn > 0 || stats.paypalExpenses > 0) && (
            <Row label="PayPal Balance (from sync)" value={paypalBalance} />
          )}
          <Row label="Total Cash" value={totalCash} bold />
          {seedMoney > 0 && <Row label="Less: Seed Capital" value={-seedMoney} color={PALETTE.blue} />}
          {stats.totalReimbursements > 0 && <Row label="Less: Director Reimbursements" value={-stats.totalReimbursements} color={PALETTE.cyan} />}
          <Row label="Trading Gain / (Loss)" value={tradingGain} color={tradingGain >= 0 ? PALETTE.income : PALETTE.expense} bold sep />
          {stats.reimbursementsOwed > 0 && (
            <>
              <Row label="Reimbursements owed" value={-stats.reimbursementsOwed} color={PALETTE.warning} />
              <Row label="After reimbursements" value={afterReimbursements} bold />
            </>
          )}
        </div>

        {/* Right: P&L Check */}
        <div>
          <SectionLabel>Profit & Loss Check</SectionLabel>
          <Row label="Trading Income" value={stats.income} color={PALETTE.income} />
          <Row label="Bank Expenses (excl. transfers)" value={-stats.companyExpenses} color={PALETTE.expense} />
          {stats.ppAuthorPayouts > 0 && (
            <Row label="PayPal Author Payouts" value={-stats.ppAuthorPayouts} color={PALETTE.expense} />
          )}
          {stats.ppFees > 0 && (
            <Row label="PayPal Fees" value={-stats.ppFees} color={PALETTE.expense} />
          )}
          {stats.totalPersonalExpenses > 0 && (
            <Row label="Personal Expenses" value={-stats.totalPersonalExpenses} color={PALETTE.expense} />
          )}
          <Row label="Net Profit / (Loss)" value={plNet} color={plNet >= 0 ? PALETTE.income : PALETTE.expense} bold sep />
          <div
            onClick={() => Math.abs(variance) >= 0.01 && setShowDiag(!showDiag)}
            style={{
              marginTop: 8, padding: "8px 12px", borderRadius: 6, fontSize: 12,
              background: Math.abs(variance) < 1 ? PALETTE.accentDim : PALETTE.dangerDim,
              color: Math.abs(variance) < 1 ? PALETTE.accent : PALETTE.danger,
              cursor: Math.abs(variance) >= 0.01 ? "pointer" : "default",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>Variance (P&L vs Cash): {fmt(variance)}</div>
              {Math.abs(variance) >= 0.01 && (
                <span style={{ fontSize: 11, opacity: 0.7 }}>{showDiag ? "Hide details" : "Click to diagnose"}</span>
              )}
            </div>
          </div>
          {showDiag && Math.abs(variance) >= 0.01 && (
            <div style={{ marginTop: 8, padding: "12px 16px", borderRadius: 6, background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: PALETTE.text, marginBottom: 10 }}>Variance Breakdown</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "4px 16px", fontFamily: "JetBrains Mono, monospace" }}>
                <div style={{ fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, fontFamily: "inherit" }}>Component</div>
                <div style={{ fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, textAlign: "right" }}>Cash Side</div>
                <div style={{ fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, textAlign: "right" }}>P&L Side</div>
                <div style={{ fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, textAlign: "right" }}>Diff</div>

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>Bank Balance (statement)</div>
                <div style={{ textAlign: "right", color: PALETTE.text }}>{fmt(bankBalance)}</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>Seed Capital</div>
                <div style={{ textAlign: "right", color: PALETTE.text }}>{fmt(seedMoney)}</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>Trading Income</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>
                <div style={{ textAlign: "right", color: PALETTE.income }}>{fmt(plIncome)}</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>Bank Expenses</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>
                <div style={{ textAlign: "right", color: PALETTE.expense }}>{fmt(plBankExp)}</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>Bank Transfers Out</div>
                <div style={{ textAlign: "right", color: PALETTE.purple }}>{fmt(cashTransfersOut)}</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>excluded</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>PayPal Transfers In</div>
                <div style={{ textAlign: "right", color: PALETTE.text }}>{fmt(cashPPIn)}</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>excluded</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>PayPal Payouts</div>
                <div style={{ textAlign: "right", color: PALETTE.expense }}>{fmt(stats.ppAuthorPayouts)}</div>
                <div style={{ textAlign: "right", color: PALETTE.expense }}>{fmt(plPPPayouts)}</div>
                {(() => { const d = r2(stats.ppAuthorPayouts - plPPPayouts); return <div style={{ textAlign: "right", color: Math.abs(d) > 0.01 ? PALETTE.danger : PALETTE.textMuted }}>{Math.abs(d) > 0.01 ? fmt(d) : "—"}</div>; })()}

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>PayPal Fees</div>
                <div style={{ textAlign: "right", color: PALETTE.expense }}>{fmt(stats.ppFees)}</div>
                <div style={{ textAlign: "right", color: PALETTE.expense }}>{fmt(plPPFees)}</div>
                {(() => { const d = r2(stats.ppFees - plPPFees); return <div style={{ textAlign: "right", color: Math.abs(d) > 0.01 ? PALETTE.danger : PALETTE.textMuted }}>{Math.abs(d) > 0.01 ? fmt(d) : "—"}</div>; })()}

                {stats.totalReimbursements > 0 && (<>
                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>Director Reimbursements</div>
                <div style={{ textAlign: "right", color: PALETTE.cyan }}>{fmt(stats.totalReimbursements)}</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>excluded</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>
                </>)}

                <div style={{ color: PALETTE.textDim, fontFamily: "system-ui" }}>Personal Expenses</div>
                <div style={{ textAlign: "right", color: PALETTE.textMuted }}>not in cash</div>
                <div style={{ textAlign: "right", color: PALETTE.expense }}>{fmt(plPersonal)}</div>
                {plPersonal > 0 ? <div style={{ textAlign: "right", color: PALETTE.warning }}>{fmt(plPersonal)}</div> : <div style={{ textAlign: "right", color: PALETTE.textMuted }}>—</div>}

                <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 6, color: PALETTE.text, fontWeight: 600, fontFamily: "system-ui" }}>Result</div>
                <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 6, textAlign: "right", fontWeight: 600, color: tradingGain >= 0 ? PALETTE.income : PALETTE.expense }}>{fmt(tradingGain)}</div>
                <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 6, textAlign: "right", fontWeight: 600, color: plNet >= 0 ? PALETTE.income : PALETTE.expense }}>{fmt(plNet)}</div>
                <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 6, textAlign: "right", fontWeight: 700, color: PALETTE.danger }}>{fmt(variance)}</div>
              </div>

              <div style={{ marginTop: 12, fontSize: 11, color: PALETTE.textMuted, lineHeight: 1.6 }}>
                {stats.totalPersonalExpenses > 0 && Math.abs(r2(variance - stats.totalPersonalExpenses)) < 1 && (
                  <div>The variance roughly matches Personal Expenses ({fmt(stats.totalPersonalExpenses)}). Personal expenses reduce P&L profit but don't come from the bank account — this is expected.</div>
                )}
                {Math.abs(variance) > 0 && Math.abs(variance) < 5 && (
                  <div>Small variances under £5 are usually PayPal GBP conversion rounding.</div>
                )}
                {actualBankBalance == null && (
                  <div>Bank balance is calculated, not from a statement. Re-import your latest CSV to get an accurate figure.</div>
                )}
              </div>
            </div>
          )}
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
