import { useState, useEffect, useMemo } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../lib/constants.js";
import { Card, Button, Badge, Spinner, Select, StatCard } from "../components/ui.jsx";
import { fmt, r2, fmtDate } from "../lib/format.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "reports", label: "Reports" },
  { id: "transactions", label: "Transactions" },
  { id: "expenses", label: "Expenses" },
  { id: "dividends", label: "Dividends" },
  { id: "dla", label: "DLA" },
  { id: "assets", label: "Assets" },
  { id: "vat", label: "VAT" },
];

// ─── CT600 Marginal Relief ───
const CT = {
  smallRate: 0.19,
  mainRate: 0.25,
  fraction: 3 / 200,
  lowerLimit: 50000,
  upperLimit: 250000,
};

function calcCorpTaxFull(profit, associatedCompanies = 0, broughtForwardLosses = 0) {
  const divisor = 1 + associatedCompanies;
  const lower = CT.lowerLimit / divisor;
  const upper = CT.upperLimit / divisor;
  const taxableProfit = Math.max(0, r2(profit - broughtForwardLosses));
  const lossesUsed = profit > 0 ? Math.min(broughtForwardLosses, profit) : 0;
  const lossesCarriedForward = r2(broughtForwardLosses - lossesUsed);

  if (taxableProfit <= 0) return { taxableProfit: 0, tax: 0, effectiveRate: 0, band: "No profit", marginalRelief: 0, lossesUsed, lossesCarriedForward, lower, upper };
  if (taxableProfit <= lower) return { taxableProfit, tax: r2(taxableProfit * CT.smallRate), effectiveRate: 19, band: "Small profits rate (19%)", marginalRelief: 0, lossesUsed, lossesCarriedForward, lower, upper };
  if (taxableProfit > upper) return { taxableProfit, tax: r2(taxableProfit * CT.mainRate), effectiveRate: 25, band: "Main rate (25%)", marginalRelief: 0, lossesUsed, lossesCarriedForward, lower, upper };

  const taxAtMainRate = r2(taxableProfit * CT.mainRate);
  const marginalRelief = r2(CT.fraction * (upper - taxableProfit));
  const tax = r2(taxAtMainRate - marginalRelief);
  const effectiveRate = r2((tax / taxableProfit) * 100 * 100) / 100;
  return { taxableProfit, tax, effectiveRate, band: `Marginal relief (${effectiveRate}%)`, marginalRelief, lossesUsed, lossesCarriedForward, lower, upper };
}

// ─── Capital Allowances ───
const AIA_LIMIT = 1000000;
function calcCapitalAllowances(fixedAssets, yearStart, yearEnd) {
  if (!fixedAssets?.length) return { totalAIA: 0, totalWDA: 0, total: 0, details: [] };
  const ysDate = yearStart ? new Date(yearStart) : null;
  const yeDate = yearEnd ? new Date(yearEnd) : null;
  let aiaUsed = 0;
  const details = fixedAssets.map((a) => {
    const cost = Number(a.cost);
    const acquired = new Date(a.date_acquired);
    const disposed = a.date_disposed ? new Date(a.date_disposed) : null;
    const inPeriod = ysDate && yeDate && acquired >= ysDate && acquired <= yeDate;
    const method = a.depreciation_method || "aia";
    if (method === "aia" && inPeriod && !disposed) {
      const aiaAvailable = AIA_LIMIT - aiaUsed;
      const aiaClaim = Math.min(cost, aiaAvailable);
      aiaUsed += aiaClaim;
      return { name: a.name, cost, method: "AIA", allowance: r2(aiaClaim), category: a.category };
    }
    if (!disposed) {
      const rate = a.category === "vehicle" ? 0.06 : 0.18;
      const yearsOwned = yeDate ? Math.max(1, Math.ceil((yeDate - acquired) / (365.25 * 86400000))) : 1;
      const nbvStart = cost * Math.pow(1 - rate, Math.max(0, yearsOwned - 1));
      return { name: a.name, cost, method: `WDA ${rate * 100}%`, allowance: r2(nbvStart * rate), category: a.category };
    }
    return { name: a.name, cost, method: "Disposed", allowance: 0, category: a.category };
  });
  const totalAIA = r2(details.filter((d) => d.method === "AIA").reduce((s, d) => s + d.allowance, 0));
  const totalWDA = r2(details.filter((d) => d.method.startsWith("WDA")).reduce((s, d) => s + d.allowance, 0));
  return { totalAIA, totalWDA, total: r2(totalAIA + totalWDA), details };
}

function addMonths(dateStr, months, days = 0) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-GB");
}

export default function AccountantClientView({ clientId, onBack }) {
  const [tab, setTab] = useState("overview");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.accountant.getClientProfile(clientId)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  const downloadPack = async () => {
    setDownloading(true);
    try {
      await api.export.download(`/api/accountant/client/${clientId}/export/accountant-pack`, `${(profile?.company_name || "client").replace(/[^a-zA-Z0-9]/g, "-")}-accounts.zip`);
    } catch (e) {
      alert("Download failed: " + e.message);
    }
    setDownloading(false);
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="ghost" onClick={onBack} style={{ fontSize: 13, padding: "6px 10px" }}>← Back to Clients</Button>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text }}>{profile?.company_name || "Client"}</h2>
          <Badge color={PALETTE.blue}>Read-only</Badge>
        </div>
        <Button onClick={downloadPack} disabled={downloading}>
          {downloading ? "Downloading..." : "Download Accountant Pack"}
        </Button>
      </div>

      {/* Company info */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, fontSize: 13 }}>
          <div>
            <div style={{ color: PALETTE.textMuted, fontSize: 11, marginBottom: 2 }}>Email</div>
            <div style={{ color: PALETTE.text }}>{profile?.email}</div>
          </div>
          <div>
            <div style={{ color: PALETTE.textMuted, fontSize: 11, marginBottom: 2 }}>Company Reg</div>
            <div style={{ color: PALETTE.text }}>{profile?.company_reg || "—"}</div>
          </div>
          <div>
            <div style={{ color: PALETTE.textMuted, fontSize: 11, marginBottom: 2 }}>Tax Ref</div>
            <div style={{ color: PALETTE.text }}>{profile?.tax_ref || "—"}</div>
          </div>
          <div>
            <div style={{ color: PALETTE.textMuted, fontSize: 11, marginBottom: 2 }}>Year</div>
            <div style={{ color: PALETTE.text }}>{profile?.year_start || "—"} to {profile?.year_end || "—"}</div>
          </div>
        </div>
      </Card>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "6px 14px", border: "none", borderRadius: 8, cursor: "pointer",
              fontSize: 12, fontWeight: 500,
              background: tab === t.id ? PALETTE.accent + "15" : "transparent",
              color: tab === t.id ? PALETTE.accent : PALETTE.textDim,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab clientId={clientId} />}
      {tab === "reports" && <ReportsTab clientId={clientId} profile={profile} />}
      {tab === "transactions" && <TransactionsTab clientId={clientId} />}
      {tab === "expenses" && <ExpensesTab clientId={clientId} />}
      {tab === "dividends" && <DividendsTab clientId={clientId} />}
      {tab === "dla" && <DLATab clientId={clientId} />}
      {tab === "assets" && <AssetsTab clientId={clientId} />}
      {tab === "vat" && <VATTab clientId={clientId} />}
    </div>
  );
}

// ─── Reports Tab (CT600 + P&L + Summary) ───

function ReportsTab({ clientId, profile }) {
  const [reportView, setReportView] = useState("ct600");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.accountant.getClientTransactions(clientId),
      api.accountant.getClientExpenses(clientId),
      api.accountant.getClientDividends(clientId),
      api.accountant.getClientDLA(clientId),
      api.accountant.getClientFixedAssets(clientId),
      api.accountant.getClientPaypalTransactions(clientId).catch(() => []),
    ]).then(([txns, expenses, dividends, dla, assets, paypalTxns]) => {
      setData({ transactions: txns, expenses, dividends, dla, fixedAssets: assets, paypalTxns: paypalTxns || [] });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;
  if (!data) return <div style={{ color: PALETTE.textMuted }}>Failed to load report data</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Select
          value={reportView}
          onChange={setReportView}
          options={[
            { value: "ct600", label: "CT600 Computation" },
            { value: "pl", label: "Profit & Loss" },
            { value: "summary", label: "Year Summary" },
          ]}
        />
      </div>
      {reportView === "ct600" && <CT600View profile={profile} {...data} />}
      {reportView === "pl" && <PLView profile={profile} {...data} />}
      {reportView === "summary" && <SummaryView profile={profile} {...data} />}
    </div>
  );
}

// ─── CT600 Computation ───

function CT600View({ profile, transactions, expenses: personalExpenses, dividends, dla, fixedAssets, paypalTxns }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];
  const nonDeductibleIds = EXPENSE_CATEGORIES.filter((c) => c.deductible === false).map((c) => c.id);

  const turnover = r2(active.filter((t) => t.type === "income" && !EXCLUDE_INCOME.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0));
  const bankExpenses = r2(active.filter((t) => t.type === "expense" && t.category !== "transfer" && !nonDeductibleIds.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0));
  const entertainmentExpenses = r2(active.filter((t) => t.type === "expense" && nonDeductibleIds.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0));
  const ppAuthorPayouts = r2((paypalTxns || []).filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const ppFees = r2((paypalTxns || []).filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  const capAllowances = calcCapitalAllowances(fixedAssets, profile?.year_start, profile?.year_end);
  const totalAllowable = r2(bankExpenses + ppAuthorPayouts + ppFees + peTotal + capAllowances.total);
  const tradingProfit = r2(turnover - totalAllowable);

  const associatedCompanies = Number(profile?.associated_companies || 0);
  const broughtForwardLosses = Number(profile?.brought_forward_losses || 0);
  const ct = calcCorpTaxFull(tradingProfit, associatedCompanies, broughtForwardLosses);

  let dlaBalance = 0;
  dla.forEach((e) => { if (e.direction === "to_director") dlaBalance += Number(e.amount); else dlaBalance -= Number(e.amount); });
  const s455 = dlaBalance > 0 ? r2(dlaBalance * 0.3375) : 0;
  const totalDividends = dividends.reduce((s, d) => s + Number(d.amount), 0);
  const totalTaxPayable = r2(ct.tax + s455);

  const expByHmrc = {};
  active.filter((t) => t.type === "expense" && t.category !== "transfer" && !nonDeductibleIds.includes(t.category)).forEach((t) => {
    const cat = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
    const effectiveCat = t.category === "marketing" ? EXPENSE_CATEGORIES.find((c) => c.id === "advertising") || cat : cat;
    const hmrc = effectiveCat?.hmrc || "Other";
    expByHmrc[hmrc] = (expByHmrc[hmrc] || 0) + Number(t.amount);
  });

  const paymentDeadline = profile?.year_end ? addMonths(profile.year_end, 9, 1) : null;
  const filingDeadline = profile?.year_end ? addMonths(profile.year_end, 12) : null;

  return (
    <Card>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: PALETTE.text, marginBottom: 4 }}>{profile?.company_name || "Company"}</div>
        {profile?.company_reg && <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 2 }}>Company No. {profile.company_reg}</div>}
        {profile?.tax_ref && <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 8 }}>UTR: {profile.tax_ref}</div>}
        <div style={{ fontSize: 16, fontWeight: 700, color: PALETTE.accent, marginBottom: 4 }}>CT600 CORPORATION TAX COMPUTATION</div>
        <div style={{ fontSize: 13, color: PALETTE.textDim }}>Accounting period: {fmtDate(profile?.year_start)} to {fmtDate(profile?.year_end)}</div>
      </div>

      <CTSection title="COMPANY INFORMATION">
        <CTBoxRow box="1" label="Company name" text={profile?.company_name || "—"} />
        <CTBoxRow box="2" label="Company registration number" text={profile?.company_reg || "—"} />
        <CTBoxRow box="3" label="Tax reference (UTR)" text={profile?.tax_ref || "—"} />
        <CTBoxRow box="30" label="Start of accounting period" text={fmtDate(profile?.year_start) || "—"} />
        <CTBoxRow box="35" label="End of accounting period" text={fmtDate(profile?.year_end) || "—"} />
        <CTBoxRow box="60" label="Associated companies in this period" text={String(associatedCompanies)} />
      </CTSection>

      <CTSection title="TURNOVER AND INCOME">
        <CTBoxRow box="145" label="Turnover" value={turnover} />
      </CTSection>

      <CTSection title="ALLOWABLE EXPENSES">
        {Object.entries(expByHmrc).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
          <CTRow key={cat} label={cat} value={r2(amt)} indent />
        ))}
        {ppAuthorPayouts > 0 && <CTRow label="PayPal author payouts" value={ppAuthorPayouts} indent />}
        {ppFees > 0 && <CTRow label="PayPal fees" value={ppFees} indent />}
        {peTotal > 0 && <CTRow label="Personal expense claims" value={peTotal} indent />}
        {capAllowances.total > 0 && <CTRow label="Capital allowances" value={capAllowances.total} indent />}
        <CTRow label="Total allowable expenses" value={totalAllowable} bold />
      </CTSection>

      <CTSection title="TRADING PROFIT">
        <CTBoxRow box="155" label="Net trading profit" value={tradingProfit} bold color={tradingProfit >= 0 ? PALETTE.accent : PALETTE.danger} />
      </CTSection>

      {entertainmentExpenses > 0 && (
        <CTSection title="DISALLOWABLE EXPENSES">
          <CTRow label="Client entertainment (non-deductible)" value={entertainmentExpenses} color={PALETTE.orange} />
        </CTSection>
      )}

      {broughtForwardLosses > 0 && (
        <CTSection title="LOSSES">
          <CTRow label="Brought forward trading losses" value={broughtForwardLosses} />
          <CTRow label="Losses utilised this period" value={ct.lossesUsed} color={PALETTE.accent} />
          <CTRow label="Losses to carry forward" value={ct.lossesCarriedForward} />
        </CTSection>
      )}

      {capAllowances.details.length > 0 && (
        <CTSection title="CAPITAL ALLOWANCES">
          {capAllowances.totalAIA > 0 && <CTRow label="Annual Investment Allowance (AIA)" value={capAllowances.totalAIA} bold />}
          {capAllowances.totalWDA > 0 && <CTRow label="Writing Down Allowance (WDA)" value={capAllowances.totalWDA} bold />}
          {capAllowances.details.map((d, i) => (
            <CTRow key={i} label={`${d.name} (${d.method})`} value={d.allowance} indent sub={`Cost: ${fmt(d.cost)}`} />
          ))}
          <CTBoxRow box="275" label="Total capital allowances" value={capAllowances.total} bold />
        </CTSection>
      )}

      <CTSection title="TAX COMPUTATION">
        <CTBoxRow box="235" label="Profits chargeable to corporation tax" value={ct.taxableProfit} bold />
        <div style={{ padding: "12px", margin: "8px 0", background: PALETTE.bg, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: PALETTE.textDim, marginBottom: 8 }}>Rate calculation:</div>
          <CTRow label={`Lower limit (£${CT.lowerLimit.toLocaleString()} ÷ ${1 + associatedCompanies})`} text={fmt(ct.lower)} indent />
          <CTRow label={`Upper limit (£${CT.upperLimit.toLocaleString()} ÷ ${1 + associatedCompanies})`} text={fmt(ct.upper)} indent />
          {ct.marginalRelief > 0 && (
            <>
              <CTRow label={`Tax at main rate: ${fmt(ct.taxableProfit)} × 25%`} value={r2(ct.taxableProfit * CT.mainRate)} indent />
              <CTRow label={`Less: Marginal relief: 3/200 × (${fmt(ct.upper)} - ${fmt(ct.taxableProfit)})`} value={ct.marginalRelief} indent color={PALETTE.accent} />
            </>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: PALETTE.text, marginTop: 4 }}>Band: {ct.band} — Effective rate: {ct.effectiveRate}%</div>
        </div>
        <CTBoxRow box="430" label="Corporation tax chargeable" value={ct.tax} bold color={PALETTE.warning} />
      </CTSection>

      {s455 > 0 && (
        <CTSection title="S455 TAX ON DIRECTORS' LOAN">
          <CTRow label="Director's loan balance at year end" value={Math.abs(dlaBalance)} />
          <CTBoxRow box="440" label="S455 tax (33.75%)" value={s455} bold color={PALETTE.danger} />
        </CTSection>
      )}

      <div style={{ borderTop: `2px solid ${PALETTE.accent}`, paddingTop: 16, marginTop: 16, marginBottom: 16 }}>
        <CTBoxRow box="TAX" label="TOTAL TAX PAYABLE" value={totalTaxPayable} bold color={PALETTE.warning} />
      </div>

      <CTSection title="ADDITIONAL INFORMATION">
        <CTRow label="Total dividends paid" value={totalDividends} sub="(not deductible)" />
        <CTRow label="Directors' loan balance" value={Math.abs(dlaBalance)} sub={dlaBalance > 0 ? "Director owes company" : dlaBalance < 0 ? "Company owes director" : "Balanced"} />
        <CTRow label="Fixed assets — total cost" value={fixedAssets.reduce((s, a) => s + Number(a.cost), 0)} />
      </CTSection>

      <CTSection title="KEY DATES">
        <CTRow label="Payment deadline (9 months + 1 day)" text={paymentDeadline || "Year end not set"} />
        <CTRow label="Filing deadline (12 months)" text={filingDeadline || "Year end not set"} />
      </CTSection>

      <div style={{ marginTop: 24, padding: 16, background: PALETTE.bg, borderRadius: 8, fontSize: 12, color: PALETTE.textMuted, textAlign: "center" }}>
        Generated {new Date().toLocaleDateString("en-GB")} — Verify all figures before filing. This does not constitute tax advice.
      </div>
    </Card>
  );
}

// ─── Profit & Loss ───

function PLView({ profile, transactions, expenses: personalExpenses, fixedAssets, paypalTxns }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];

  const incomeByCategory = {};
  INCOME_CATEGORIES.filter((c) => !EXCLUDE_INCOME.includes(c.id)).forEach((c) => {
    const total = active.filter((t) => t.type === "income" && t.category === c.id).reduce((s, t) => s + Number(t.amount), 0);
    if (total > 0) incomeByCategory[c.id] = { label: c.label, total: r2(total) };
  });
  const totalTurnover = r2(Object.values(incomeByCategory).reduce((s, c) => s + c.total, 0));

  const costOfSales = r2(active.filter((t) => t.type === "expense" && t.category === "materials").reduce((s, t) => s + Number(t.amount), 0));
  const grossProfit = r2(totalTurnover - costOfSales);

  const expenseByCategory = {};
  const nonDeductibleExpenses = {};
  EXPENSE_CATEGORIES.filter((c) => c.id !== "materials" && c.id !== "transfer" && c.hmrc).forEach((c) => {
    const total = active.filter((t) => t.type === "expense" && t.category === c.id).reduce((s, t) => s + Number(t.amount), 0);
    if (total > 0) {
      if (c.deductible === false) nonDeductibleExpenses[c.id] = { label: c.label, hmrc: c.hmrc, total: r2(total) };
      else expenseByCategory[c.id] = { label: c.label, hmrc: c.hmrc, total: r2(total) };
    }
  });

  const ppAuthorPayouts = r2((paypalTxns || []).filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const ppFees = r2((paypalTxns || []).filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  if (ppAuthorPayouts > 0) expenseByCategory["paypal_payouts"] = { label: "PayPal Author Payouts", hmrc: "Cost of goods sold", total: ppAuthorPayouts };
  if (ppFees > 0) expenseByCategory["paypal_fees"] = { label: "PayPal Fees", hmrc: "Interest and bank charges", total: ppFees };

  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  if (peTotal > 0) expenseByCategory["personal_expenses"] = { label: "Personal Expense Claims", hmrc: "Various (see breakdown)", total: peTotal };

  const capAllowances = calcCapitalAllowances(fixedAssets, profile?.year_start, profile?.year_end);
  if (capAllowances.total > 0) expenseByCategory["capital_allowances"] = { label: "Capital Allowances", hmrc: "Capital allowances", total: capAllowances.total };

  const totalExpenses = r2(Object.values(expenseByCategory).reduce((s, c) => s + c.total, 0));
  const totalNonDeductible = r2(Object.values(nonDeductibleExpenses).reduce((s, c) => s + c.total, 0));
  const netProfitBeforeTax = r2(grossProfit - totalExpenses);

  const ct = calcCorpTaxFull(netProfitBeforeTax, Number(profile?.associated_companies || 0), Number(profile?.brought_forward_losses || 0));
  const netProfitAfterTax = r2(ct.taxableProfit - ct.tax);

  return (
    <Card>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: PALETTE.text, marginBottom: 4 }}>{profile?.company_name || "Company"}</div>
        {profile?.company_reg && <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 4 }}>Company No. {profile.company_reg}</div>}
        <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 4 }}>PROFIT AND LOSS ACCOUNT</div>
        <div style={{ fontSize: 12, color: PALETTE.textDim }}>For the year ended {fmtDate(profile?.year_end)}</div>
      </div>

      <PLSection title="TURNOVER">
        {Object.values(incomeByCategory).map((c) => <PLRow key={c.label} label={c.label} value={c.total} indent />)}
        <PLRow label="Total Turnover" value={totalTurnover} bold />
      </PLSection>

      <PLSection title="COST OF SALES">
        {costOfSales > 0 ? <PLRow label="Materials & Stock" value={costOfSales} indent /> : <PLRow label="(none)" value={0} indent dim />}
        <PLRow label="GROSS PROFIT" value={grossProfit} bold color={PALETTE.income} />
      </PLSection>

      <PLSection title="ADMINISTRATIVE EXPENSES">
        {Object.values(expenseByCategory).map((c) => <PLRow key={c.label} label={`${c.label} (${c.hmrc})`} value={c.total} indent />)}
        <PLRow label="Total Allowable Expenses" value={totalExpenses} bold />
      </PLSection>

      {Object.keys(nonDeductibleExpenses).length > 0 && (
        <PLSection title="NON-DEDUCTIBLE EXPENSES">
          {Object.values(nonDeductibleExpenses).map((c) => <PLRow key={c.label} label={`${c.label} (non-deductible)`} value={c.total} indent color={PALETTE.orange} />)}
          <PLRow label="Total Non-Deductible" value={totalNonDeductible} bold color={PALETTE.orange} />
        </PLSection>
      )}

      <div style={{ borderTop: `2px solid ${PALETTE.border}`, paddingTop: 16, marginTop: 16 }}>
        <PLRow label="NET PROFIT BEFORE TAX" value={netProfitBeforeTax} bold color={netProfitBeforeTax >= 0 ? PALETTE.income : PALETTE.danger} />
        <PLRow label={`Corporation Tax @ ${ct.effectiveRate}%`} value={ct.tax} indent color={PALETTE.warning} />
        <div style={{ borderTop: `2px double ${PALETTE.border}`, paddingTop: 8, marginTop: 8 }}>
          <PLRow label="NET PROFIT AFTER TAX" value={netProfitAfterTax} bold color={netProfitAfterTax >= 0 ? PALETTE.income : PALETTE.danger} />
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: PALETTE.textMuted, textAlign: "center" }}>
        Generated {new Date().toLocaleDateString("en-GB")} — verify with client's accountant before filing
      </div>
    </Card>
  );
}

// ─── Year Summary ───

function SummaryView({ profile, transactions, expenses: personalExpenses, dividends, dla, fixedAssets, paypalTxns }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];

  const tradingIncome = r2(active.filter((t) => t.type === "income" && !EXCLUDE_INCOME.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0));
  const bankExpenses = r2(active.filter((t) => t.type === "expense" && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0));
  const ppExpenses = r2((paypalTxns || []).filter((t) => t.type === "author_payout" || t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  const totalExpenses = r2(bankExpenses + ppExpenses + peTotal);
  const netProfit = r2(tradingIncome - totalExpenses);

  const ct = calcCorpTaxFull(netProfit, Number(profile?.associated_companies || 0), Number(profile?.brought_forward_losses || 0));
  const totalDividends = dividends.reduce((s, d) => s + Number(d.amount), 0);

  let dlaBalance = 0;
  dla.forEach((e) => { if (e.direction === "to_director") dlaBalance += Number(e.amount); else dlaBalance -= Number(e.amount); });

  const seedMoney = Number(profile?.seed_money || 0);
  const capitalInjected = r2(active.filter((t) => t.type === "income" && t.category === "capital").reduce((s, t) => s + Number(t.amount), 0)) + seedMoney;

  const txnCount = transactions.length;
  const excludedCount = transactions.filter((t) => t.excluded).length;
  const uncategorised = active.filter((t) => !t.category).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <StatCard label="Trading Income" value={fmt(tradingIncome)} color={PALETTE.income} />
        <StatCard label="Total Expenses" value={fmt(totalExpenses)} color={PALETTE.expense} />
        <StatCard label="Net Profit" value={fmt(netProfit)} color={netProfit >= 0 ? PALETTE.income : PALETTE.danger} />
        <StatCard label={`Corp Tax @ ${ct.effectiveRate}%`} value={fmt(ct.tax)} color={PALETTE.warning} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Financial Summary</div>
          <SumRow label="Trading Income" value={fmt(tradingIncome)} color={PALETTE.income} />
          <SumRow label="Total Expenses" value={fmt(totalExpenses)} color={PALETTE.expense} />
          <SumRow label="Net Profit Before Tax" value={fmt(netProfit)} bold />
          <SumRow label="Corporation Tax" value={fmt(ct.tax)} color={PALETTE.warning} />
          <SumRow label="Net Profit After Tax" value={fmt(r2(ct.taxableProfit - ct.tax))} bold />
          <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 8, marginTop: 8 }} />
          <SumRow label="Dividends Paid" value={fmt(totalDividends)} />
          <SumRow label="Retained Profit" value={fmt(r2(ct.taxableProfit - ct.tax - totalDividends))} bold />
        </Card>

        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Balance Position</div>
          <SumRow label="Capital Injected" value={fmt(capitalInjected)} />
          <SumRow label="Directors' Loan" value={fmt(Math.abs(dlaBalance))} sub={dlaBalance > 0 ? "(director owes)" : dlaBalance < 0 ? "(company owes)" : ""} />
          <div style={{ borderTop: `1px solid ${PALETTE.border}`, paddingTop: 8, marginTop: 8 }} />
          <SumRow label="Total Transactions" value={String(txnCount)} />
          <SumRow label="Excluded" value={String(excludedCount)} />
          {uncategorised > 0 && <SumRow label="Uncategorised" value={String(uncategorised)} color={PALETTE.orange} />}
        </Card>
      </div>
    </div>
  );
}

// ─── Overview Tab ───

function OverviewTab({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.accountant.getClientTransactions(clientId),
      api.accountant.getClientExpenses(clientId),
      api.accountant.getClientDividends(clientId),
      api.accountant.getClientDLA(clientId),
      api.accountant.getClientFixedAssets(clientId),
      api.accountant.getClientPaypalTransactions(clientId).catch(() => []),
    ]).then(([txns, exp, divs, dla, assets, ppTxns]) => {
      const active = txns.filter((t) => !t.excluded);
      const income = active.filter((t) => t.type === "income" && t.category !== "transfer" && t.category !== "capital").reduce((s, t) => s + Number(t.amount), 0);
      const bankExpenses = active.filter((t) => t.type === "expense" && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0);
      const ppExpenses = (ppTxns || []).filter((t) => t.type === "author_payout" || t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0);
      const peExpenses = (exp || []).reduce((s, e) => s + Number(e.amount || 0), 0);
      const totalExpenses = r2(bankExpenses + ppExpenses + peExpenses);
      let dlaBalance = 0;
      dla.forEach((e) => { if (e.direction === "to_director") dlaBalance += Number(e.amount); else dlaBalance -= Number(e.amount); });
      setData({ income, expenses: totalExpenses, profit: r2(income - totalExpenses), totalDividends: divs.reduce((s, d) => s + Number(d.amount), 0), dlaBalance, totalAssets: assets.reduce((s, a) => s + Number(a.cost), 0) });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;
  if (!data) return <div style={{ color: PALETTE.textMuted }}>Failed to load</div>;

  const stats = [
    { label: "Trading Income", value: fmt(data.income), color: PALETTE.accent },
    { label: "Total Expenses", value: fmt(data.expenses), color: PALETTE.expense },
    { label: "Net Profit", value: fmt(data.profit), color: data.profit >= 0 ? PALETTE.accent : PALETTE.expense },
    { label: "Dividends Paid", value: fmt(data.totalDividends), color: PALETTE.purple },
    { label: "DLA Balance", value: fmt(Math.abs(data.dlaBalance)), color: data.dlaBalance > 0 ? PALETTE.warning : PALETTE.accent },
    { label: "Fixed Assets", value: fmt(data.totalAssets), color: PALETTE.blue },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {stats.map((s) => (
        <Card key={s.label}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>{s.label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "JetBrains Mono, monospace" }}>{s.value}</div>
        </Card>
      ))}
    </div>
  );
}

// ─── Data Tabs ───

function ReadOnlyTable({ headers, rows, emptyMessage }) {
  if (rows.length === 0) {
    return <Card><div style={{ textAlign: "center", padding: "24px 0", color: PALETTE.textMuted, fontSize: 13 }}>{emptyMessage || "No records"}</div></Card>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{headers.map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: PALETTE.textMuted, borderBottom: `1px solid ${PALETTE.border}`, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: "8px 12px", fontSize: 13, color: PALETTE.text, borderBottom: `1px solid ${PALETTE.border}` }}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function TransactionsTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExcluded, setShowExcluded] = useState(false);
  const [collapsed, setCollapsed] = useState(null);

  useEffect(() => { api.accountant.getClientTransactions(clientId).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [clientId]);

  const catLabel = (id) => ([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.id === id))?.label || id;

  const filtered = useMemo(() => {
    return data.filter((t) => showExcluded || !t.excluded);
  }, [data, showExcluded]);

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

  const isCollapsed = (key) => collapsed === null || collapsed.has(key);
  const toggleMonth = (key) => setCollapsed((prev) => {
    const base = prev || new Set(grouped.map((g) => g.key));
    const next = new Set(base);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  if (loading) return <Spinner />;

  const excludedCount = data.filter((t) => t.excluded).length;

  return (
    <div>
      {/* Excluded toggle */}
      {excludedCount > 0 && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setShowExcluded(!showExcluded)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8, cursor: "pointer",
              fontSize: 12, fontWeight: 500, border: "none",
              background: showExcluded ? PALETTE.orange + "20" : PALETTE.bg,
              color: showExcluded ? PALETTE.orange : PALETTE.textMuted,
            }}
          >
            {showExcluded ? "Hide" : "Show"} {excludedCount} excluded
          </button>
          <span style={{ fontSize: 12, color: PALETTE.textMuted }}>{filtered.length} of {data.length} transactions</span>
        </div>
      )}

      {/* Excluded summary banner */}
      {showExcluded && excludedCount > 0 && (() => {
        const excludedTxns = data.filter((t) => t.excluded);
        const excludedTotal = excludedTxns.reduce((s, t) => s + Number(t.amount), 0);
        const reasons = {};
        excludedTxns.forEach((t) => {
          const r = t.exclude_reason || "Manually excluded";
          reasons[r] = (reasons[r] || 0) + 1;
        });
        return (
          <Card style={{ marginBottom: 16, borderLeft: `3px solid ${PALETTE.orange}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: PALETTE.orange, marginBottom: 4 }}>
                  {excludedTxns.length} Excluded Transaction{excludedTxns.length !== 1 ? "s" : ""}
                </div>
                <div style={{ fontSize: 12, color: PALETTE.textMuted }}>
                  {Object.entries(reasons).map(([reason, count]) => `${reason} (${count})`).join(" · ")}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: PALETTE.orange, fontFamily: "JetBrains Mono, monospace" }}>
                {fmt(excludedTotal)}
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Grouped by month */}
      {grouped.length === 0 ? (
        <Card><div style={{ textAlign: "center", padding: 40, color: PALETTE.textMuted, fontSize: 13 }}>No transactions</div></Card>
      ) : (
        grouped.map((group) => {
          const monthLabel = new Date(group.key + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
          const monthIncome = group.transactions.filter((t) => t.type === "income" && !t.excluded && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0);
          const monthExpenses = group.transactions.filter((t) => t.type === "expense" && !t.excluded && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0);

          return (
            <Card key={group.key} style={{ marginBottom: 16 }}>
              <div
                onClick={() => toggleMonth(group.key)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: isCollapsed(group.key) ? 0 : 12 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: PALETTE.textMuted, transition: "transform 0.2s", display: "inline-block", transform: isCollapsed(group.key) ? "rotate(-90deg)" : "rotate(0deg)" }}>&#9660;</span>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>{monthLabel}</h3>
                  {isCollapsed(group.key) && <span style={{ fontSize: 12, color: PALETTE.textMuted }}>({group.transactions.length} transactions)</span>}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
                  <span style={{ color: PALETTE.income }}>+{fmt(monthIncome)}</span>
                  <span style={{ color: PALETTE.expense }}>-{fmt(monthExpenses)}</span>
                </div>
              </div>

              {!isCollapsed(group.key) && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px 100px 140px", gap: 0, padding: "6px 10px", borderBottom: `1px solid ${PALETTE.border}` }}>
                    {["Date", "Description", "Type", "Amount", "Category"].map((h) => (
                      <div key={h} style={{ fontSize: 11, color: PALETTE.textMuted, fontWeight: 600 }}>{h}</div>
                    ))}
                  </div>
                  {group.transactions.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "grid", gridTemplateColumns: "90px 1fr 80px 100px 140px",
                        gap: 0, padding: "8px 10px",
                        borderBottom: `1px solid ${PALETTE.border}`,
                        opacity: t.excluded ? 0.45 : 1,
                        borderLeft: `3px solid ${t.excluded ? PALETTE.orange : "transparent"}`,
                      }}
                    >
                      <div style={{ fontSize: 13, color: PALETTE.textDim }}>{fmtDate(t.date)}</div>
                      <div style={{ fontSize: 13, color: PALETTE.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: t.excluded ? "line-through" : "none" }}>
                        {t.description?.slice(0, 60)}
                        {t.excluded && t.exclude_reason && (
                          <span style={{ fontSize: 10, color: PALETTE.orange, fontStyle: "italic", marginLeft: 6 }}>({t.exclude_reason})</span>
                        )}
                        {t.excluded && t.notes && !t.exclude_reason && (
                          <span style={{ fontSize: 10, color: PALETTE.orange, fontStyle: "italic", marginLeft: 6 }}>({t.notes})</span>
                        )}
                      </div>
                      <div><Badge color={t.type === "income" ? PALETTE.income : t.type === "transfer" ? PALETTE.purple : PALETTE.expense}>{t.type}</Badge></div>
                      <div style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: t.type === "income" ? PALETTE.income : t.type === "transfer" ? PALETTE.purple : PALETTE.expense }}>{fmt(t.amount)}</div>
                      <div style={{ fontSize: 12, color: PALETTE.textDim }}>{catLabel(t.category)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}

function ExpensesTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(null);

  useEffect(() => { api.accountant.getClientExpenses(clientId).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [clientId]);

  const grouped = useMemo(() => {
    const groups = {};
    data.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = { key, expenses: [] };
      groups[key].expenses.push(e);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [data]);

  const isCollapsed = (key) => collapsed === null || collapsed.has(key);
  const toggleMonth = (key) => setCollapsed((prev) => {
    const base = prev || new Set(grouped.map((g) => g.key));
    const next = new Set(base);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  if (loading) return <Spinner />;

  if (data.length === 0) {
    return <Card><div style={{ textAlign: "center", padding: 40, color: PALETTE.textMuted, fontSize: 13 }}>No expenses</div></Card>;
  }

  return (
    <div>
      {grouped.map((group) => {
        const monthLabel = new Date(group.key + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        const monthTotal = group.expenses.reduce((s, e) => s + Number(e.amount), 0);

        return (
          <Card key={group.key} style={{ marginBottom: 16 }}>
            <div
              onClick={() => toggleMonth(group.key)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: isCollapsed(group.key) ? 0 : 12 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: PALETTE.textMuted, transition: "transform 0.2s", display: "inline-block", transform: isCollapsed(group.key) ? "rotate(-90deg)" : "rotate(0deg)" }}>&#9660;</span>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>{monthLabel}</h3>
                <span style={{ fontSize: 12, color: PALETTE.textMuted }}>({group.expenses.length} expense{group.expenses.length !== 1 ? "s" : ""})</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: PALETTE.expense, fontFamily: "JetBrains Mono, monospace" }}>{fmt(monthTotal)}</span>
            </div>

            {!isCollapsed(group.key) && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 100px 100px 80px", gap: 0, padding: "6px 10px", borderBottom: `1px solid ${PALETTE.border}` }}>
                  {["Date", "Description", "Category", "Amount", "Supplier", "Status"].map((h) => (
                    <div key={h} style={{ fontSize: 11, color: PALETTE.textMuted, fontWeight: 600 }}>{h}</div>
                  ))}
                </div>
                {group.expenses.map((e) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
                  return (
                    <div key={e.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 100px 100px 80px", gap: 0, padding: "8px 10px", borderBottom: `1px solid ${PALETTE.border}` }}>
                      <div style={{ fontSize: 13, color: PALETTE.textDim }}>{fmtDate(e.date)}</div>
                      <div style={{ fontSize: 13, color: PALETTE.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description?.slice(0, 60)}</div>
                      <div style={{ fontSize: 12, color: PALETTE.textDim }}>{cat?.label || e.category}</div>
                      <div style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: PALETTE.expense }}>{fmt(e.amount)}</div>
                      <div style={{ fontSize: 12, color: PALETTE.textDim }}>{e.supplier || "—"}</div>
                      <div><Badge color={e.status === "pending" ? PALETTE.warning : e.status === "reimbursed" ? PALETTE.income : PALETTE.blue}>{e.status}</Badge></div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function DividendsTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.accountant.getClientDividends(clientId).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [clientId]);
  if (loading) return <Spinner />;
  return <ReadOnlyTable headers={["Date", "Shareholder", "Amount", "Tax Year", "Voucher No"]} rows={data.map((d) => [new Date(d.date).toLocaleDateString("en-GB"), d.shareholder, fmt(d.amount), d.tax_year, d.voucher_no || ""])} emptyMessage="No dividends" />;
}

function DLATab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.accountant.getClientDLA(clientId).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [clientId]);
  if (loading) return <Spinner />;
  let balance = 0;
  return <ReadOnlyTable headers={["Date", "Description", "Direction", "Amount", "Balance"]} rows={data.map((e) => { if (e.direction === "to_director") balance += Number(e.amount); else balance -= Number(e.amount); return [new Date(e.date).toLocaleDateString("en-GB"), e.description, e.direction === "to_director" ? "To Director" : "To Company", fmt(e.amount), fmt(balance)]; })} emptyMessage="No DLA entries" />;
}

function AssetsTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.accountant.getClientFixedAssets(clientId).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [clientId]);
  if (loading) return <Spinner />;
  return <ReadOnlyTable headers={["Name", "Category", "Date Acquired", "Cost", "Depreciation", "Useful Life"]} rows={data.map((a) => [a.name, a.category, new Date(a.date_acquired).toLocaleDateString("en-GB"), fmt(a.cost), a.depreciation_method, `${a.useful_life_years} years`])} emptyMessage="No fixed assets" />;
}

function VATTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.accountant.getClientVATReturns(clientId).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [clientId]);
  if (loading) return <Spinner />;
  return <ReadOnlyTable headers={["Period", "Status", "Box 1 (Sales VAT)", "Box 4 (Reclaimed)", "Box 5 (Net)", "Box 6 (Sales)"]} rows={data.map((v) => [`${new Date(v.period_start).toLocaleDateString("en-GB")} - ${new Date(v.period_end).toLocaleDateString("en-GB")}`, v.status, fmt(v.box1_vat_due_sales), fmt(v.box4_vat_reclaimed), fmt(v.box5_net_vat), fmt(v.box6_total_sales)])} emptyMessage="No VAT returns" />;
}

// ─── Shared UI Components ───

function CTSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, borderBottom: `1px solid ${PALETTE.border}`, paddingBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function CTBoxRow({ box, label, value, text, bold, color, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0" }}>
      <span style={{ fontSize: 13, color: bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 700 : 400 }}>
        <span style={{ display: "inline-block", minWidth: 44, padding: "1px 6px", marginRight: 8, background: PALETTE.accent + "15", borderRadius: 4, fontSize: 10, fontWeight: 600, color: PALETTE.accent, textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>{box}</span>
        {label}{sub && <span style={{ fontSize: 11, color: PALETTE.textMuted, marginLeft: 8 }}>{sub}</span>}
      </span>
      {value !== undefined && value !== null && <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: bold ? 700 : 500, color: color || PALETTE.text }}>{typeof value === "number" ? fmt(value) : value}</span>}
      {text && !value && value !== 0 && <span style={{ fontSize: 13, color: PALETTE.text }}>{text}</span>}
    </div>
  );
}

function CTRow({ label, value, text, bold, indent, color, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", marginLeft: indent ? 52 : 0 }}>
      <span style={{ fontSize: 13, color: bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 700 : 400 }}>
        {label}{sub && <span style={{ fontSize: 11, color: PALETTE.textMuted, marginLeft: 8 }}>{sub}</span>}
      </span>
      {value !== undefined && value !== null && <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: bold ? 700 : 500, color: color || PALETTE.text }}>{typeof value === "number" ? fmt(value) : value}</span>}
      {text && !value && value !== 0 && <span style={{ fontSize: 13, color: PALETTE.text }}>{text}</span>}
    </div>
  );
}

function PLSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, borderBottom: `1px solid ${PALETTE.border}`, paddingBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function PLRow({ label, value, bold, indent, color, dim, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", marginLeft: indent ? 16 : 0 }}>
      <span style={{ fontSize: 13, color: dim ? PALETTE.textMuted : bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 700 : 400 }}>
        {label}{sub && <span style={{ fontSize: 11, color: PALETTE.textMuted, marginLeft: 8 }}>{sub}</span>}
      </span>
      {value !== null && value !== undefined && <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: bold ? 700 : 500, color: color || PALETTE.text }}>{typeof value === "number" ? fmt(value) : value}</span>}
    </div>
  );
}

function SumRow({ label, value, bold, color, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
      <span style={{ fontSize: 13, color: bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 600 : 400 }}>{label} {sub && <span style={{ fontSize: 11, color: PALETTE.textMuted }}>{sub}</span>}</span>
      <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: bold ? 700 : 500, color: color || PALETTE.text }}>{value}</span>
    </div>
  );
}
