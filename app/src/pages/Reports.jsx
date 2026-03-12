import { useState, useEffect, useMemo } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../lib/constants.js";
import { fmt, r2, fmtDate } from "../lib/format.js";
import { Card, Button, StatCard, Select, ErrorMsg, Spinner } from "../components/ui.jsx";

const CORP_TAX_RATES = [
  { min: 0, max: 50000, rate: 19, label: "Small profits rate (19%)" },
  { min: 50001, max: 250000, rate: 26.5, label: "Marginal relief rate (26.5%)" },
  { min: 250001, max: Infinity, rate: 25, label: "Main rate (25%)" },
];

function calcCorpTax(profit) {
  if (profit <= 0) return { tax: 0, effectiveRate: 0, band: CORP_TAX_RATES[0] };
  const band = CORP_TAX_RATES.find((b) => profit >= b.min && profit <= b.max) || CORP_TAX_RATES[2];
  const tax = r2(profit * (band.rate / 100));
  return { tax, effectiveRate: band.rate, band };
}

export default function Reports() {
  const [transactions, setTransactions] = useState([]);
  const [paypalTxns, setPaypalTxns] = useState([]);
  const [personalExpenses, setPersonalExpenses] = useState([]);
  const [profile, setProfile] = useState(null);
  const [dividends, setDividends] = useState([]);
  const [dlaData, setDlaData] = useState(null);
  const [fixedAssets, setFixedAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportView, setReportView] = useState("pl");

  useEffect(() => {
    Promise.all([
      api.transactions.getAll(),
      api.profile.get(),
      api.dividends.getAll(),
      api.dla.getAll(),
      api.fixedAssets.getAll(),
      api.paypal.getTransactions(),
      api.expenses.getAll(),
    ])
      .then(([txns, prof, divs, dla, assets, pp, pe]) => {
        setTransactions(txns);
        setProfile(prof);
        setDividends(divs);
        setDlaData(dla);
        setFixedAssets(assets);
        setPaypalTxns(pp || []);
        setPersonalExpenses(pe || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text }}>Reports</h2>
        <Select
          value={reportView}
          onChange={setReportView}
          options={[
            { value: "pl", label: "Profit & Loss" },
            { value: "tax", label: "Tax Computation" },
            { value: "summary", label: "Year Summary" },
          ]}
        />
      </div>

      <ErrorMsg message={error} />

      {reportView === "pl" && <ProfitAndLoss transactions={transactions} paypalTxns={paypalTxns} personalExpenses={personalExpenses} profile={profile} fixedAssets={fixedAssets} />}
      {reportView === "tax" && <TaxComputation transactions={transactions} paypalTxns={paypalTxns} personalExpenses={personalExpenses} profile={profile} dividends={dividends} dlaData={dlaData} fixedAssets={fixedAssets} />}
      {reportView === "summary" && <YearSummary transactions={transactions} paypalTxns={paypalTxns} personalExpenses={personalExpenses} profile={profile} dividends={dividends} dlaData={dlaData} fixedAssets={fixedAssets} />}

      {/* Export & Downloads */}
      <Card style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 8 }}>Export & Downloads</h3>
        <p style={{ fontSize: 13, color: PALETTE.textDim, marginBottom: 16 }}>
          Download your data for your accountant or personal records.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="outline" onClick={() => api.export.download("/api/export/accountant-pack", "accountant-pack.zip").catch((e) => alert("Download failed: " + e.message))}>Download Accountant Pack (.zip)</Button>
          <Button variant="outline" onClick={() => api.export.download("/api/export/transactions.csv", "transactions.csv").catch((e) => alert("Download failed: " + e.message))}>Export Transactions (.csv)</Button>
        </div>
      </Card>
    </div>
  );
}

function ProfitAndLoss({ transactions, paypalTxns, personalExpenses, profile, fixedAssets }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];

  // Income by category
  const incomeByCategory = {};
  INCOME_CATEGORIES.filter((c) => !EXCLUDE_INCOME.includes(c.id)).forEach((c) => {
    const total = active
      .filter((t) => t.type === "income" && t.category === c.id)
      .reduce((s, t) => s + Number(t.amount), 0);
    if (total > 0) incomeByCategory[c.id] = { label: c.label, total: r2(total) };
  });

  const totalTurnover = r2(Object.values(incomeByCategory).reduce((s, c) => s + c.total, 0));

  // Cost of sales
  const costOfSales = r2(active
    .filter((t) => t.type === "expense" && t.category === "materials")
    .reduce((s, t) => s + Number(t.amount), 0));

  const grossProfit = r2(totalTurnover - costOfSales);

  // Expenses by HMRC category (excluding materials which is cost of sales)
  const expenseByCategory = {};
  EXPENSE_CATEGORIES.filter((c) => c.id !== "materials" && c.id !== "transfer" && c.hmrc).forEach((c) => {
    const total = active
      .filter((t) => t.type === "expense" && t.category === c.id)
      .reduce((s, t) => s + Number(t.amount), 0);
    if (total > 0) expenseByCategory[c.id] = { label: c.label, hmrc: c.hmrc, total: r2(total) };
  });

  // PayPal expenses
  const ppAuthorPayouts = r2(paypalTxns.filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const ppFees = r2(paypalTxns.filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  if (ppAuthorPayouts > 0) expenseByCategory["paypal_payouts"] = { label: "PayPal Author Payouts", hmrc: "Cost of goods sold", total: ppAuthorPayouts };
  if (ppFees > 0) expenseByCategory["paypal_fees"] = { label: "PayPal Fees", hmrc: "Interest and bank charges", total: ppFees };

  // Personal expenses
  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  if (peTotal > 0) expenseByCategory["personal_expenses"] = { label: "Personal Expense Claims", hmrc: "Various (see breakdown)", total: peTotal };

  // Add depreciation from fixed assets
  const totalDepreciation = r2(fixedAssets.reduce((s, a) => s + Number(a.total_depreciation || 0), 0));
  if (totalDepreciation > 0) {
    expenseByCategory["depreciation"] = { label: "Depreciation", hmrc: "Capital allowances", total: totalDepreciation };
  }

  const totalExpenses = r2(Object.values(expenseByCategory).reduce((s, c) => s + c.total, 0));
  const netProfitBeforeTax = r2(grossProfit - totalExpenses);
  const { tax, effectiveRate } = calcCorpTax(netProfitBeforeTax);
  const netProfitAfterTax = r2(netProfitBeforeTax - tax);

  const yearStart = profile?.year_start || "—";
  const yearEnd = profile?.year_end || "—";

  return (
    <Card>
      {/* Report Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: PALETTE.text, marginBottom: 4 }}>
          {profile?.company_name || "Company"}
        </div>
        {profile?.company_reg && <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 4 }}>Company No. {profile.company_reg}</div>}
        <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 4 }}>
          PROFIT AND LOSS ACCOUNT
        </div>
        <div style={{ fontSize: 12, color: PALETTE.textDim }}>
          For the year ended {fmtDate(yearEnd)}
        </div>
      </div>

      {/* Turnover */}
      <PLSection title="TURNOVER">
        {Object.values(incomeByCategory).map((c) => (
          <PLRow key={c.label} label={c.label} value={c.total} indent />
        ))}
        <PLRow label="Total Turnover" value={totalTurnover} bold />
      </PLSection>

      {/* Cost of Sales */}
      <PLSection title="COST OF SALES">
        {costOfSales > 0 ? (
          <PLRow label="Materials & Stock" value={costOfSales} indent />
        ) : (
          <PLRow label="(none)" value={0} indent dim />
        )}
        <PLRow label="GROSS PROFIT" value={grossProfit} bold color={PALETTE.income} />
      </PLSection>

      {/* Administrative Expenses */}
      <PLSection title="ADMINISTRATIVE EXPENSES">
        {Object.values(expenseByCategory).map((c) => (
          <PLRow key={c.label} label={`${c.label} (${c.hmrc})`} value={c.total} indent />
        ))}
        <PLRow label="Total Expenses" value={totalExpenses} bold />
      </PLSection>

      {/* Net Profit */}
      <div style={{ borderTop: `2px solid ${PALETTE.border}`, paddingTop: 16, marginTop: 16 }}>
        <PLRow label="NET PROFIT BEFORE TAX" value={netProfitBeforeTax} bold
          color={netProfitBeforeTax >= 0 ? PALETTE.income : PALETTE.danger} />
        <PLRow label={`Corporation Tax @ ${effectiveRate}%`} value={tax} indent color={PALETTE.warning} />
        <div style={{ borderTop: `2px double ${PALETTE.border}`, paddingTop: 8, marginTop: 8 }}>
          <PLRow label="NET PROFIT AFTER TAX" value={netProfitAfterTax} bold
            color={netProfitAfterTax >= 0 ? PALETTE.income : PALETTE.danger} />
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: PALETTE.textMuted, textAlign: "center" }}>
        Generated {new Date().toLocaleDateString("en-GB")} — verify with your accountant before filing
      </div>
    </Card>
  );
}

function TaxComputation({ transactions, paypalTxns, personalExpenses, profile, dividends, dlaData, fixedAssets }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];

  const tradingIncome = r2(active
    .filter((t) => t.type === "income" && !EXCLUDE_INCOME.includes(t.category))
    .reduce((s, t) => s + Number(t.amount), 0));

  const bankExpenses = r2(active
    .filter((t) => t.type === "expense" && t.category !== "transfer")
    .reduce((s, t) => s + Number(t.amount), 0));

  const ppAuthorPayouts = r2(paypalTxns.filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const ppFees = r2(paypalTxns.filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));

  const totalExpenses = r2(bankExpenses + ppAuthorPayouts + ppFees + peTotal);

  const depreciation = r2(fixedAssets.reduce((s, a) => s + Number(a.total_depreciation || 0), 0));

  const tradingProfit = r2(tradingIncome - totalExpenses);
  const taxableProfit = r2(Math.max(tradingProfit, 0));
  const { tax, effectiveRate, band } = calcCorpTax(taxableProfit);

  const totalDividends = dividends.reduce((s, d) => s + Number(d.amount), 0);
  const dlaBalance = dlaData?.summary?.closing_balance || 0;
  const s455 = dlaData?.summary?.s455_amount || 0;

  const yearEnd = profile?.year_end;
  const paymentDeadline = yearEnd ? addMonths(yearEnd, 9, 1) : "—";
  const filingDeadline = yearEnd ? addMonths(yearEnd, 12) : "—";

  return (
    <Card>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: PALETTE.text, marginBottom: 4 }}>
          {profile?.company_name || "Company"}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 4 }}>
          CORPORATION TAX COMPUTATION
        </div>
        <div style={{ fontSize: 12, color: PALETTE.textDim }}>
          Year ended {fmtDate(yearEnd)}
        </div>
      </div>

      <PLSection title="TRADING PROFIT">
        <PLRow label="Turnover (Box 145)" value={tradingIncome} />
        <PLRow label="Less: Bank expenses" value={bankExpenses} indent />
        {ppAuthorPayouts > 0 && <PLRow label="Less: PayPal author payouts" value={ppAuthorPayouts} indent />}
        {ppFees > 0 && <PLRow label="Less: PayPal fees" value={ppFees} indent />}
        {peTotal > 0 && <PLRow label="Less: Personal expense claims" value={peTotal} indent />}
        {depreciation > 0 && <PLRow label="Less: Capital allowances" value={depreciation} indent />}
        <PLRow label="Total Allowable Expenses" value={totalExpenses} indent bold />
        <PLRow label="Trading Profit (Box 155)" value={tradingProfit} bold color={tradingProfit >= 0 ? PALETTE.income : PALETTE.danger} />
      </PLSection>

      <PLSection title="TAXABLE PROFIT">
        <PLRow label="Profits chargeable to CT (Box 235)" value={taxableProfit} bold />
        <PLRow label={`Corporation Tax @ ${effectiveRate}% (Box 440)`} value={tax} bold color={PALETTE.warning} />
        <div style={{ padding: "8px 12px", marginTop: 8, borderRadius: 8, background: PALETTE.bg, fontSize: 12, color: PALETTE.textDim }}>
          Rate band: {band.label}
        </div>
      </PLSection>

      <PLSection title="ADDITIONAL ITEMS">
        <PLRow label="Total Dividends Paid" value={totalDividends} sub="(not deductible — tracked for personal tax)" />
        <PLRow label="Directors' Loan Balance" value={Math.abs(dlaBalance)}
          sub={dlaBalance > 0 ? "Director owes company" : dlaBalance < 0 ? "Company owes director" : "Balanced"} />
        {s455 > 0 && <PLRow label="S455 Tax Liability (33.75%)" value={s455} color={PALETTE.danger} sub="Repayable when loan is repaid within 9 months of year end" />}
      </PLSection>

      <PLSection title="KEY DATES">
        <PLRow label="Payment deadline (9 months + 1 day)" value={null} sub={paymentDeadline} />
        <PLRow label="Filing deadline (12 months)" value={null} sub={filingDeadline} />
      </PLSection>

      <div style={{ marginTop: 24, fontSize: 11, color: PALETTE.textMuted, textAlign: "center" }}>
        Generated {new Date().toLocaleDateString("en-GB")} — verify with your accountant before filing. This is not tax advice.
      </div>
    </Card>
  );
}

function YearSummary({ transactions, paypalTxns, personalExpenses, profile, dividends, dlaData, fixedAssets }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];

  const tradingIncome = r2(active.filter((t) => t.type === "income" && !EXCLUDE_INCOME.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0));
  const bankExpenses = r2(active.filter((t) => t.type === "expense" && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0));
  const ppExpenses = r2(paypalTxns.filter((t) => t.type === "author_payout" || t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  const totalExpenses = r2(bankExpenses + ppExpenses + peTotal);
  const netProfit = r2(tradingIncome - totalExpenses);
  const { tax, effectiveRate } = calcCorpTax(netProfit);
  const totalDividends = dividends.reduce((s, d) => s + Number(d.amount), 0);
  const totalAssets = fixedAssets.reduce((s, a) => s + Number(a.current_value || 0), 0);
  const dlaBalance = dlaData?.summary?.closing_balance || 0;

  const seedMoney = Number(profile?.seed_money || 0);
  const capitalInjected = r2(active.filter((t) => t.type === "income" && t.category === "capital").reduce((s, t) => s + Number(t.amount), 0)) + seedMoney;

  const txnCount = transactions.length;
  const excludedCount = transactions.filter((t) => t.excluded).length;
  const uncategorised = active.filter((t) => !t.category).length;

  const vatTotal = r2(active.reduce((s, t) => s + Number(t.vat_amount || 0), 0));

  return (
    <div>
      {/* Key Numbers */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Trading Income" value={fmt(tradingIncome)} color={PALETTE.income} />
        <StatCard label="Total Expenses" value={fmt(totalExpenses)} color={PALETTE.expense} />
        <StatCard label="Net Profit" value={fmt(netProfit)} color={netProfit >= 0 ? PALETTE.income : PALETTE.danger} />
        <StatCard label={`Corp Tax @ ${effectiveRate}%`} value={fmt(tax)} color={PALETTE.warning} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Financial Summary */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Financial Summary</div>
          <SumRow label="Trading Income" value={fmt(tradingIncome)} color={PALETTE.income} />
          <SumRow label="Total Expenses" value={fmt(totalExpenses)} color={PALETTE.expense} />
          <SumRow label="Net Profit Before Tax" value={fmt(netProfit)} bold />
          <SumRow label="Corporation Tax" value={fmt(tax)} color={PALETTE.warning} />
          <SumRow label="Net Profit After Tax" value={fmt(r2(netProfit - tax))} bold />
          <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 8, marginTop: 8 }} />
          <SumRow label="Dividends Paid" value={fmt(totalDividends)} />
          <SumRow label="Retained Profit" value={fmt(r2(netProfit - tax - totalDividends))} bold />
        </Card>

        {/* Balance Position */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Balance Position</div>
          <SumRow label="Capital Injected" value={fmt(capitalInjected)} />
          <SumRow label="Fixed Assets (NBV)" value={fmt(totalAssets)} />
          <SumRow label="Directors' Loan" value={fmt(Math.abs(dlaBalance))}
            sub={dlaBalance > 0 ? "(director owes)" : dlaBalance < 0 ? "(company owes)" : ""} />
          <SumRow label="Total VAT Recorded" value={fmt(vatTotal)} />
          <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 8, marginTop: 8 }} />
          <SumRow label="Total Transactions" value={String(txnCount)} />
          <SumRow label="Excluded" value={String(excludedCount)} />
          {uncategorised > 0 && <SumRow label="Uncategorised" value={String(uncategorised)} color={PALETTE.orange} />}
        </Card>
      </div>

      {/* Data Quality */}
      {uncategorised > 0 && (
        <Card style={{ borderColor: PALETTE.orange }}>
          <div style={{ fontSize: 13, color: PALETTE.orange, fontWeight: 600 }}>
            {uncategorised} transaction{uncategorised !== 1 ? "s" : ""} still uncategorised — categorise these for accurate reports.
          </div>
        </Card>
      )}
    </div>
  );
}

// Helper components

function PLSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, borderBottom: `1px solid ${PALETTE.border}`, paddingBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function PLRow({ label, value, bold, indent, color, dim, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", marginLeft: indent ? 16 : 0 }}>
      <span style={{ fontSize: 13, color: dim ? PALETTE.textMuted : bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 700 : 400 }}>
        {label}
        {sub && <span style={{ fontSize: 11, color: PALETTE.textMuted, marginLeft: 8 }}>{sub}</span>}
      </span>
      {value !== null && value !== undefined && (
        <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: bold ? 700 : 500, color: color || PALETTE.text }}>
          {typeof value === "number" ? fmt(value) : value}
        </span>
      )}
    </div>
  );
}

function SumRow({ label, value, bold, color, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontSize: 13, color: bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 600 : 400 }}>
        {label} {sub && <span style={{ fontSize: 11, color: PALETTE.textMuted }}>{sub}</span>}
      </span>
      <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: bold ? 700 : 500, color: color || PALETTE.text }}>
        {value}
      </span>
    </div>
  );
}

function addMonths(dateStr, months, days = 0) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-GB");
}
