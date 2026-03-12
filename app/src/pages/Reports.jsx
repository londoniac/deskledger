import { useState, useEffect, useMemo } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../lib/constants.js";
import { fmt, r2, fmtDate } from "../lib/format.js";
import { Card, Button, StatCard, Select, ErrorMsg, Spinner } from "../components/ui.jsx";

// ─── CT600 Marginal Relief Calculation ───
// For FY2024+ (April 2023 onwards):
//   Small profits rate: 19% on profits up to lower limit
//   Main rate: 25% on profits above upper limit
//   Marginal relief between limits: Main rate minus fraction of (Upper - Profits) * (Profits/Profits)
//   Fraction = 3/200 (1.5%)
//   Limits are divided by (1 + associated companies)

const CT = {
  smallRate: 0.19,
  mainRate: 0.25,
  fraction: 3 / 200, // 0.015
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

  if (taxableProfit <= 0) {
    return { taxableProfit: 0, tax: 0, effectiveRate: 0, band: "No profit", marginalRelief: 0, lossesUsed, lossesCarriedForward, lower, upper };
  }

  if (taxableProfit <= lower) {
    // Small profits rate
    const tax = r2(taxableProfit * CT.smallRate);
    return { taxableProfit, tax, effectiveRate: 19, band: `Small profits rate (19%)`, marginalRelief: 0, lossesUsed, lossesCarriedForward, lower, upper };
  }

  if (taxableProfit > upper) {
    // Main rate
    const tax = r2(taxableProfit * CT.mainRate);
    return { taxableProfit, tax, effectiveRate: 25, band: `Main rate (25%)`, marginalRelief: 0, lossesUsed, lossesCarriedForward, lower, upper };
  }

  // Marginal relief band
  const taxAtMainRate = r2(taxableProfit * CT.mainRate);
  const marginalRelief = r2(CT.fraction * (upper - taxableProfit));
  const tax = r2(taxAtMainRate - marginalRelief);
  const effectiveRate = r2((tax / taxableProfit) * 100 * 100) / 100;

  return { taxableProfit, tax, effectiveRate, band: `Marginal relief (${effectiveRate}%)`, marginalRelief, lossesUsed, lossesCarriedForward, lower, upper };
}

// ─── Capital Allowances (AIA) ───
// Annual Investment Allowance: 100% deduction up to £1M for qualifying assets
// Writing Down Allowance: 18% (main pool) or 6% (special rate) on reducing balance
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

    // AIA: applies to assets acquired in the accounting period
    const inPeriod = ysDate && yeDate && acquired >= ysDate && acquired <= yeDate;
    const method = a.depreciation_method || "aia";

    if (method === "aia" && inPeriod && !disposed) {
      const aiaAvailable = AIA_LIMIT - aiaUsed;
      const aiaClaim = Math.min(cost, aiaAvailable);
      aiaUsed += aiaClaim;
      return { name: a.name, cost, method: "AIA", allowance: r2(aiaClaim), category: a.category };
    }

    // Writing Down Allowance for non-AIA assets
    if (!disposed) {
      const rate = a.category === "vehicle" ? 0.06 : 0.18; // special rate vs main pool
      const yearsOwned = yeDate ? Math.max(1, Math.ceil((yeDate - acquired) / (365.25 * 86400000))) : 1;
      // Reducing balance: NBV = cost * (1 - rate)^years, WDA this year = NBV_start * rate
      const nbvStart = cost * Math.pow(1 - rate, Math.max(0, yearsOwned - 1));
      const wda = r2(nbvStart * rate);
      return { name: a.name, cost, method: `WDA ${rate * 100}%`, allowance: wda, category: a.category };
    }

    return { name: a.name, cost, method: "Disposed", allowance: 0, category: a.category };
  });

  const totalAIA = r2(details.filter((d) => d.method === "AIA").reduce((s, d) => s + d.allowance, 0));
  const totalWDA = r2(details.filter((d) => d.method.startsWith("WDA")).reduce((s, d) => s + d.allowance, 0));
  const total = r2(totalAIA + totalWDA);

  return { totalAIA, totalWDA, total, details };
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
  const [reportView, setReportView] = useState("ct600");

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
            { value: "ct600", label: "CT600 Computation" },
            { value: "pl", label: "Profit & Loss" },
            { value: "summary", label: "Year Summary" },
          ]}
        />
      </div>

      <ErrorMsg message={error} />

      {reportView === "ct600" && <CT600Computation transactions={transactions} paypalTxns={paypalTxns} personalExpenses={personalExpenses} profile={profile} dividends={dividends} dlaData={dlaData} fixedAssets={fixedAssets} />}
      {reportView === "pl" && <ProfitAndLoss transactions={transactions} paypalTxns={paypalTxns} personalExpenses={personalExpenses} profile={profile} fixedAssets={fixedAssets} />}
      {reportView === "summary" && <YearSummary transactions={transactions} paypalTxns={paypalTxns} personalExpenses={personalExpenses} profile={profile} dividends={dividends} dlaData={dlaData} fixedAssets={fixedAssets} />}

      {/* Export & Downloads */}
      <ExportDownloads profile={profile} />
    </div>
  );
}

// ─── CT600 COMPUTATION ───
function CT600Computation({ transactions, paypalTxns, personalExpenses, profile, dividends, dlaData, fixedAssets }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];
  const nonDeductibleIds = EXPENSE_CATEGORIES.filter((c) => c.deductible === false).map((c) => c.id);

  // Box 145: Turnover
  const turnover = r2(active
    .filter((t) => t.type === "income" && !EXCLUDE_INCOME.includes(t.category))
    .reduce((s, t) => s + Number(t.amount), 0));

  // Allowable expenses (deductible only)
  const bankExpenses = r2(active
    .filter((t) => t.type === "expense" && t.category !== "transfer" && !nonDeductibleIds.includes(t.category))
    .reduce((s, t) => s + Number(t.amount), 0));

  const entertainmentExpenses = r2(active
    .filter((t) => t.type === "expense" && nonDeductibleIds.includes(t.category))
    .reduce((s, t) => s + Number(t.amount), 0));

  const ppAuthorPayouts = r2(paypalTxns.filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const ppFees = r2(paypalTxns.filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));

  // Capital allowances
  const capAllowances = calcCapitalAllowances(fixedAssets, profile?.year_start, profile?.year_end);

  // Total allowable expenses
  const totalAllowable = r2(bankExpenses + ppAuthorPayouts + ppFees + peTotal + capAllowances.total);

  // Box 155: Trading profit
  const tradingProfit = r2(turnover - totalAllowable);

  // Interest income (if separately tracked)
  const interestIncome = r2(active
    .filter((t) => t.type === "income" && t.category === "interest")
    .reduce((s, t) => s + Number(t.amount), 0));

  // Box 190: Income from property/investments (interest is also in turnover, show separately for CT600)
  // Box 235: Total profits before deductions
  const totalProfits = r2(tradingProfit);

  // CT computation with marginal relief
  const associatedCompanies = Number(profile?.associated_companies || 0);
  const broughtForwardLosses = Number(profile?.brought_forward_losses || 0);
  const ct = calcCorpTaxFull(totalProfits, associatedCompanies, broughtForwardLosses);

  // DLA
  const dlaEntries = Array.isArray(dlaData) ? dlaData : [];
  let dlaBalance = 0;
  dlaEntries.forEach((e) => {
    if (e.direction === "to_director") dlaBalance += Number(e.amount);
    else dlaBalance -= Number(e.amount);
  });
  const s455 = dlaBalance > 0 ? r2(dlaBalance * 0.3375) : 0;

  // Dividends
  const totalDividends = dividends.reduce((s, d) => s + Number(d.amount), 0);

  // Total tax payable
  const totalTaxPayable = r2(ct.tax + s455);

  // Deadlines
  const yearEnd = profile?.year_end;
  const paymentDeadline = yearEnd ? addMonths(yearEnd, 9, 1) : null;
  const filingDeadline = yearEnd ? addMonths(yearEnd, 12) : null;

  // Expense breakdown by HMRC category
  const expByHmrc = {};
  active.filter((t) => t.type === "expense" && t.category !== "transfer" && !nonDeductibleIds.includes(t.category)).forEach((t) => {
    const cat = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
    const effectiveCat = t.category === "marketing"
      ? EXPENSE_CATEGORIES.find((c) => c.id === "advertising") || cat
      : cat;
    const hmrc = effectiveCat?.hmrc || "Other";
    expByHmrc[hmrc] = (expByHmrc[hmrc] || 0) + Number(t.amount);
  });

  return (
    <Card>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: PALETTE.text, marginBottom: 4 }}>
          {profile?.company_name || "Company"}
        </div>
        {profile?.company_reg && <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 2 }}>Company No. {profile.company_reg}</div>}
        {profile?.tax_ref && <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 8 }}>UTR: {profile.tax_ref}</div>}
        <div style={{ fontSize: 16, fontWeight: 700, color: PALETTE.accent, marginBottom: 4 }}>
          CT600 CORPORATION TAX COMPUTATION
        </div>
        <div style={{ fontSize: 13, color: PALETTE.textDim }}>
          Accounting period: {fmtDate(profile?.year_start)} to {fmtDate(profile?.year_end)}
        </div>
      </div>

      {/* SECTION 1: Company Information */}
      <CTSection title="COMPANY INFORMATION">
        <CTBoxRow box="1" label="Company name" text={profile?.company_name || "—"} />
        <CTBoxRow box="2" label="Company registration number" text={profile?.company_reg || "—"} />
        <CTBoxRow box="3" label="Tax reference (UTR)" text={profile?.tax_ref || "—"} />
        <CTBoxRow box="30" label="Start of accounting period" text={fmtDate(profile?.year_start) || "—"} />
        <CTBoxRow box="35" label="End of accounting period" text={fmtDate(profile?.year_end) || "—"} />
        <CTBoxRow box="60" label="Associated companies in this period" text={String(associatedCompanies)} />
      </CTSection>

      {/* SECTION 2: Turnover and Trading Profit */}
      <CTSection title="TURNOVER AND INCOME">
        <CTBoxRow box="145" label="Turnover" value={turnover} />
        {interestIncome > 0 && <CTBoxRow box="172" label="of which: interest/investment income" value={interestIncome} sub="(included in turnover above)" />}
      </CTSection>

      <CTSection title="ALLOWABLE EXPENSES">
        {Object.entries(expByHmrc).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
          <CTRow key={cat} label={cat} value={r2(amt)} indent />
        ))}
        {ppAuthorPayouts > 0 && <CTRow label="PayPal author payouts" value={ppAuthorPayouts} indent />}
        {ppFees > 0 && <CTRow label="PayPal fees" value={ppFees} indent />}
        {peTotal > 0 && <CTRow label="Personal expense claims" value={peTotal} indent />}
        {capAllowances.total > 0 && (
          <>
            <CTRow label="Capital allowances (see below)" value={capAllowances.total} indent />
          </>
        )}
        <CTRow label="Total allowable expenses" value={totalAllowable} bold />
      </CTSection>

      <CTSection title="TRADING PROFIT">
        <CTBoxRow box="155" label="Net trading profit (Turnover - Expenses)" value={tradingProfit} bold
          color={tradingProfit >= 0 ? PALETTE.accent : PALETTE.danger} />
      </CTSection>

      {/* Non-deductible */}
      {entertainmentExpenses > 0 && (
        <CTSection title="DISALLOWABLE EXPENSES (ADD BACK)">
          <CTRow label="Client entertainment (not deductible for CT)" value={entertainmentExpenses} color={PALETTE.orange} />
          <div style={{ padding: "4px 12px", fontSize: 11, color: PALETTE.textMuted }}>
            Entertainment is excluded from allowable expenses above and does not reduce taxable profit.
          </div>
        </CTSection>
      )}

      {/* Losses */}
      {broughtForwardLosses > 0 && (
        <CTSection title="LOSSES">
          <CTRow label="Brought forward trading losses" value={broughtForwardLosses} />
          <CTRow label="Losses utilised this period" value={ct.lossesUsed} color={PALETTE.accent} />
          <CTRow label="Losses to carry forward" value={ct.lossesCarriedForward} />
        </CTSection>
      )}

      {/* Capital Allowances detail */}
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

      {/* Tax Computation */}
      <CTSection title="TAX COMPUTATION">
        <CTBoxRow box="235" label="Profits chargeable to corporation tax" value={ct.taxableProfit} bold />

        <div style={{ padding: "12px", margin: "8px 0", background: PALETTE.bg, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: PALETTE.textDim, marginBottom: 8 }}>Rate calculation:</div>
          <CTRow label={`Lower limit (£${(CT.lowerLimit).toLocaleString()} ÷ ${1 + associatedCompanies})`} text={fmt(ct.lower)} indent />
          <CTRow label={`Upper limit (£${(CT.upperLimit).toLocaleString()} ÷ ${1 + associatedCompanies})`} text={fmt(ct.upper)} indent />

          {ct.taxableProfit <= ct.lower && ct.taxableProfit > 0 && (
            <CTRow label={`Tax at small profits rate: ${fmt(ct.taxableProfit)} × 19%`} value={ct.tax} indent />
          )}
          {ct.taxableProfit > ct.upper && (
            <CTRow label={`Tax at main rate: ${fmt(ct.taxableProfit)} × 25%`} value={ct.tax} indent />
          )}
          {ct.marginalRelief > 0 && (
            <>
              <CTRow label={`Tax at main rate: ${fmt(ct.taxableProfit)} × 25%`} value={r2(ct.taxableProfit * CT.mainRate)} indent />
              <CTRow label={`Less: Marginal relief: 3/200 × (${fmt(ct.upper)} - ${fmt(ct.taxableProfit)})`} value={ct.marginalRelief} indent color={PALETTE.accent} />
            </>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: PALETTE.text, marginTop: 4 }}>
            Band: {ct.band} — Effective rate: {ct.effectiveRate}%
          </div>
        </div>

        <CTBoxRow box="430" label="Corporation tax chargeable" value={ct.tax} bold color={PALETTE.warning} />
      </CTSection>

      {/* S455 */}
      {s455 > 0 && (
        <CTSection title="S455 TAX ON DIRECTORS' LOAN">
          <CTRow label="Director's loan balance at year end" value={Math.abs(dlaBalance)} />
          <CTBoxRow box="440" label="S455 tax (33.75% of overdrawn balance)" value={s455} bold color={PALETTE.danger} />
          <div style={{ padding: "4px 12px", fontSize: 11, color: PALETTE.textMuted }}>
            Repayable to company when the loan is repaid within 9 months of year end.
          </div>
        </CTSection>
      )}

      {/* Total Tax */}
      <div style={{ borderTop: `2px solid ${PALETTE.accent}`, paddingTop: 16, marginTop: 16, marginBottom: 16 }}>
        <CTBoxRow box="TAX" label="TOTAL TAX PAYABLE" value={totalTaxPayable} bold color={PALETTE.warning}
          style={{ fontSize: 15 }} />
      </div>

      {/* Additional Information */}
      <CTSection title="ADDITIONAL INFORMATION">
        <CTRow label="Total dividends paid in period" value={totalDividends} sub="(not deductible — for personal tax planning)" />
        <CTRow label="Directors' loan account balance" value={Math.abs(dlaBalance)}
          sub={dlaBalance > 0 ? "Director owes company" : dlaBalance < 0 ? "Company owes director" : "Balanced"} />
        <CTRow label="Fixed assets — total cost" value={fixedAssets.reduce((s, a) => s + Number(a.cost), 0)} />
        <CTRow label="Fixed assets — items" text={`${fixedAssets.length}`} />
      </CTSection>

      {/* Key Dates */}
      <CTSection title="KEY DATES">
        <CTRow label="Payment deadline (9 months + 1 day after year end)" text={paymentDeadline || "Set year end in Settings"} />
        <CTRow label="Filing deadline (12 months after year end)" text={filingDeadline || "Set year end in Settings"} />
      </CTSection>

      {/* Data completeness */}
      <DataCompleteness transactions={transactions} fixedAssets={fixedAssets} profile={profile} dlaBalance={dlaBalance} />

      <div style={{ marginTop: 24, padding: 16, background: PALETTE.bg, borderRadius: 8, fontSize: 12, color: PALETTE.textMuted, textAlign: "center" }}>
        Generated {new Date().toLocaleDateString("en-GB")} — This computation is for reference only.
        Verify all figures with your accountant before filing your CT600. This does not constitute tax advice.
      </div>
    </Card>
  );
}

function DataCompleteness({ transactions, fixedAssets, profile, dlaBalance }) {
  const issues = [];
  if (!profile?.company_reg) issues.push("Company registration number not set");
  if (!profile?.tax_ref) issues.push("Tax reference (UTR) not set");
  if (!profile?.year_start || !profile?.year_end) issues.push("Financial year dates not set");
  const active = transactions.filter((t) => !t.excluded);
  const uncategorised = active.filter((t) => !t.category).length;
  if (uncategorised > 0) issues.push(`${uncategorised} transaction${uncategorised !== 1 ? "s" : ""} uncategorised`);
  if (dlaBalance > 0 && !profile?.year_end) issues.push("Year end needed to calculate S455 repayment deadline");

  if (issues.length === 0) return null;

  return (
    <div style={{ marginTop: 16, padding: 16, background: PALETTE.dangerDim, borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: PALETTE.danger, marginBottom: 8 }}>Missing information:</div>
      {issues.map((issue, i) => (
        <div key={i} style={{ fontSize: 12, color: PALETTE.danger, padding: "2px 0" }}>• {issue}</div>
      ))}
    </div>
  );
}

// ─── CT600 Helper Components ───

function CTSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: PALETTE.accent, textTransform: "uppercase",
        letterSpacing: 0.5, marginBottom: 8, borderBottom: `1px solid ${PALETTE.border}`, paddingBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function CTBoxRow({ box, label, value, text, bold, color, sub, style }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", ...style }}>
      <span style={{ fontSize: 13, color: bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 700 : 400 }}>
        <span style={{
          display: "inline-block", minWidth: 44, padding: "1px 6px", marginRight: 8,
          background: PALETTE.accent + "15", borderRadius: 4, fontSize: 10, fontWeight: 600,
          color: PALETTE.accent, textAlign: "center", fontFamily: "JetBrains Mono, monospace",
        }}>
          {box}
        </span>
        {label}
        {sub && <span style={{ fontSize: 11, color: PALETTE.textMuted, marginLeft: 8 }}>{sub}</span>}
      </span>
      {value !== undefined && value !== null && (
        <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: bold ? 700 : 500, color: color || PALETTE.text }}>
          {typeof value === "number" ? fmt(value) : value}
        </span>
      )}
      {text && !value && value !== 0 && (
        <span style={{ fontSize: 13, color: PALETTE.text }}>{text}</span>
      )}
    </div>
  );
}

function CTRow({ label, value, text, bold, indent, color, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", marginLeft: indent ? 52 : 0 }}>
      <span style={{ fontSize: 13, color: bold ? PALETTE.text : PALETTE.textDim, fontWeight: bold ? 700 : 400 }}>
        {label}
        {sub && <span style={{ fontSize: 11, color: PALETTE.textMuted, marginLeft: 8 }}>{sub}</span>}
      </span>
      {value !== undefined && value !== null && (
        <span style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace", fontWeight: bold ? 700 : 500, color: color || PALETTE.text }}>
          {typeof value === "number" ? fmt(value) : value}
        </span>
      )}
      {text && !value && value !== 0 && (
        <span style={{ fontSize: 13, color: PALETTE.text }}>{text}</span>
      )}
    </div>
  );
}

// ─── PROFIT AND LOSS (unchanged) ───

function ProfitAndLoss({ transactions, paypalTxns, personalExpenses, profile, fixedAssets }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];

  const incomeByCategory = {};
  INCOME_CATEGORIES.filter((c) => !EXCLUDE_INCOME.includes(c.id)).forEach((c) => {
    const total = active
      .filter((t) => t.type === "income" && t.category === c.id)
      .reduce((s, t) => s + Number(t.amount), 0);
    if (total > 0) incomeByCategory[c.id] = { label: c.label, total: r2(total) };
  });
  const totalTurnover = r2(Object.values(incomeByCategory).reduce((s, c) => s + c.total, 0));

  const costOfSales = r2(active
    .filter((t) => t.type === "expense" && t.category === "materials")
    .reduce((s, t) => s + Number(t.amount), 0));
  const grossProfit = r2(totalTurnover - costOfSales);

  const expenseByCategory = {};
  const nonDeductibleExpenses = {};
  EXPENSE_CATEGORIES.filter((c) => c.id !== "materials" && c.id !== "transfer" && c.hmrc).forEach((c) => {
    const total = active
      .filter((t) => t.type === "expense" && t.category === c.id)
      .reduce((s, t) => s + Number(t.amount), 0);
    if (total > 0) {
      if (c.deductible === false) {
        nonDeductibleExpenses[c.id] = { label: c.label, hmrc: c.hmrc, total: r2(total) };
      } else {
        expenseByCategory[c.id] = { label: c.label, hmrc: c.hmrc, total: r2(total) };
      }
    }
  });

  const ppAuthorPayouts = r2(paypalTxns.filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const ppFees = r2(paypalTxns.filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  if (ppAuthorPayouts > 0) expenseByCategory["paypal_payouts"] = { label: "PayPal Author Payouts", hmrc: "Cost of goods sold", total: ppAuthorPayouts };
  if (ppFees > 0) expenseByCategory["paypal_fees"] = { label: "PayPal Fees", hmrc: "Interest and bank charges", total: ppFees };

  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  if (peTotal > 0) expenseByCategory["personal_expenses"] = { label: "Personal Expense Claims", hmrc: "Various (see breakdown)", total: peTotal };

  const capAllowances = calcCapitalAllowances(fixedAssets, profile?.year_start, profile?.year_end);
  if (capAllowances.total > 0) {
    expenseByCategory["capital_allowances"] = { label: "Capital Allowances", hmrc: "Capital allowances", total: capAllowances.total };
  }

  const totalExpenses = r2(Object.values(expenseByCategory).reduce((s, c) => s + c.total, 0));
  const totalNonDeductible = r2(Object.values(nonDeductibleExpenses).reduce((s, c) => s + c.total, 0));
  const netProfitBeforeTax = r2(grossProfit - totalExpenses);

  const associatedCompanies = Number(profile?.associated_companies || 0);
  const broughtForwardLosses = Number(profile?.brought_forward_losses || 0);
  const ct = calcCorpTaxFull(netProfitBeforeTax, associatedCompanies, broughtForwardLosses);
  const netProfitAfterTax = r2(ct.taxableProfit - ct.tax);

  return (
    <Card>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: PALETTE.text, marginBottom: 4 }}>
          {profile?.company_name || "Company"}
        </div>
        {profile?.company_reg && <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 4 }}>Company No. {profile.company_reg}</div>}
        <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 4 }}>PROFIT AND LOSS ACCOUNT</div>
        <div style={{ fontSize: 12, color: PALETTE.textDim }}>For the year ended {fmtDate(profile?.year_end)}</div>
      </div>

      <PLSection title="TURNOVER">
        {Object.values(incomeByCategory).map((c) => (
          <PLRow key={c.label} label={c.label} value={c.total} indent />
        ))}
        <PLRow label="Total Turnover" value={totalTurnover} bold />
      </PLSection>

      <PLSection title="COST OF SALES">
        {costOfSales > 0 ? (
          <PLRow label="Materials & Stock" value={costOfSales} indent />
        ) : (
          <PLRow label="(none)" value={0} indent dim />
        )}
        <PLRow label="GROSS PROFIT" value={grossProfit} bold color={PALETTE.income} />
      </PLSection>

      <PLSection title="ADMINISTRATIVE EXPENSES">
        {Object.values(expenseByCategory).map((c) => (
          <PLRow key={c.label} label={`${c.label} (${c.hmrc})`} value={c.total} indent />
        ))}
        <PLRow label="Total Allowable Expenses" value={totalExpenses} bold />
      </PLSection>

      {Object.keys(nonDeductibleExpenses).length > 0 && (
        <PLSection title="NON-DEDUCTIBLE EXPENSES">
          {Object.values(nonDeductibleExpenses).map((c) => (
            <PLRow key={c.label} label={`${c.label} (non-deductible)`} value={c.total} indent color={PALETTE.orange} />
          ))}
          <PLRow label="Total Non-Deductible" value={totalNonDeductible} bold color={PALETTE.orange} />
        </PLSection>
      )}

      <div style={{ borderTop: `2px solid ${PALETTE.border}`, paddingTop: 16, marginTop: 16 }}>
        <PLRow label="NET PROFIT BEFORE TAX" value={netProfitBeforeTax} bold
          color={netProfitBeforeTax >= 0 ? PALETTE.income : PALETTE.danger} />
        <PLRow label={`Corporation Tax @ ${ct.effectiveRate}%`} value={ct.tax} indent color={PALETTE.warning} />
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

// ─── YEAR SUMMARY (unchanged) ───

function YearSummary({ transactions, paypalTxns, personalExpenses, profile, dividends, dlaData, fixedAssets }) {
  const active = transactions.filter((t) => !t.excluded);
  const EXCLUDE_INCOME = ["transfer", "capital"];

  const tradingIncome = r2(active.filter((t) => t.type === "income" && !EXCLUDE_INCOME.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0));
  const bankExpenses = r2(active.filter((t) => t.type === "expense" && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0));
  const ppExpenses = r2(paypalTxns.filter((t) => t.type === "author_payout" || t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
  const peTotal = r2(personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  const totalExpenses = r2(bankExpenses + ppExpenses + peTotal);
  const netProfit = r2(tradingIncome - totalExpenses);

  const associatedCompanies = Number(profile?.associated_companies || 0);
  const broughtForwardLosses = Number(profile?.brought_forward_losses || 0);
  const ct = calcCorpTaxFull(netProfit, associatedCompanies, broughtForwardLosses);
  const totalDividends = dividends.reduce((s, d) => s + Number(d.amount), 0);
  const totalAssets = fixedAssets.reduce((s, a) => s + Number(a.current_value || 0), 0);

  const dlaEntries = Array.isArray(dlaData) ? dlaData : [];
  let dlaBalance = 0;
  dlaEntries.forEach((e) => {
    if (e.direction === "to_director") dlaBalance += Number(e.amount);
    else dlaBalance -= Number(e.amount);
  });

  const seedMoney = Number(profile?.seed_money || 0);
  const capitalInjected = r2(active.filter((t) => t.type === "income" && t.category === "capital").reduce((s, t) => s + Number(t.amount), 0)) + seedMoney;

  const txnCount = transactions.length;
  const excludedCount = transactions.filter((t) => t.excluded).length;
  const uncategorised = active.filter((t) => !t.category).length;
  const vatTotal = r2(active.reduce((s, t) => s + Number(t.vat_amount || 0), 0));

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

// ─── Export Downloads ───

function ExportDownloads({ profile }) {
  const [packLoading, setPackLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  const handleDownload = async (path, fileName, setLoading) => {
    setLoading(true);
    try {
      await api.export.download(path, fileName);
    } catch (e) {
      alert("Download failed: " + e.message);
    }
    setLoading(false);
  };

  const packFileName = () => {
    const companySlug = (profile?.company_name || "company").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "").toLowerCase();
    const date = new Date().toISOString().split("T")[0];
    return `${companySlug}-accountant-pack-${date}.zip`;
  };

  return (
    <Card style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 8 }}>Export & Downloads</h3>
      <p style={{ fontSize: 13, color: PALETTE.textDim, marginBottom: 16 }}>
        Download your data for your accountant or personal records.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <Button variant="outline" disabled={packLoading} onClick={() => handleDownload("/api/export/accountant-pack", packFileName(), setPackLoading)}>
          {packLoading ? "Preparing..." : "Download Accountant Pack (.zip)"}
        </Button>
        <Button variant="outline" disabled={csvLoading} onClick={() => handleDownload("/api/export/transactions.csv", "transactions.csv", setCsvLoading)}>
          {csvLoading ? "Exporting..." : "Export Transactions (.csv)"}
        </Button>
      </div>
    </Card>
  );
}

// ─── Shared Helper Components ───

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
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-GB");
}
