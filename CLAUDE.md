# DeskLedger — CLAUDE.md

> This file keeps Claude aligned with DeskLedger's purpose, architecture, and priorities.
> Always read this before suggesting changes or new features.

---

## What This Product Is

DeskLedger is a **hybrid personal finance + UK business accounting SaaS** for limited company directors. It serves two distinct but related purposes:

1. **Personal finance** — budgeting, debt tracking, personal expense management
2. **UK business accounting** — collect all data needed for the corporation tax return (CT600) and future VAT quarterly obligations

Both sides are intentional and should be maintained. Do not remove or deprecate personal finance features.

**Stack:** React + Vite (frontend) · Express (backend) · Supabase (database)

---

## Directory Structure

```
deskledger/
├── .claude/settings.local.json
├── CLAUDE.md                         ← this file
├── README.md
├── package.json
├── render.yaml
│
├── app/                              # Frontend (React + Vite)
│   └── src/
│       ├── components/ui.jsx
│       ├── hooks/useAuth.jsx
│       ├── lib/                      # api.js, constants.js, format.js, supabase.js
│       └── pages/
│           ├── Budget.jsx            # Personal finance — KEEP
│           ├── Dashboard.jsx
│           ├── Debts.jsx             # Personal finance — KEEP
│           ├── Import.jsx
│           ├── Login.jsx / Signup.jsx
│           ├── Settings.jsx
│           └── Transactions.jsx
│
├── server/                           # Backend (Express)
│   ├── middleware/auth.js
│   ├── routes/                       # budgets, debts, expenses, export, import,
│   │                                 # invoices, paypal, profile, transactions
│   └── services/                    # constants, csv, format, paypal
│
└── supabase/migrations/
    ├── 001_schema.sql
    ├── 002_rls.sql
    └── 003_personal_finance.sql      # Personal finance schema — KEEP
```

---

## Two Sides of the App — Keep Them Separate

| Side | Pages | Purpose |
|---|---|---|
| **Personal finance** | Budget.jsx, Debts.jsx | Personal budgeting and debt tracking for the director |
| **Business accounting** | Dashboard, Transactions, Import, Invoices, Settings | UK Ltd company bookkeeping and tax preparation |

When modifying one side, do not break the other. The personal finance schema lives in `003_personal_finance.sql` — treat it as stable.

---

## Priority Order for Development

1. 🔴 **Corporation tax completeness** — highest priority
2. 🟡 **VAT system** — build correctly for future VAT registration (not urgently needed now, but must be architected properly)
3. 🟢 **Personal finance features** — maintained but not actively extended unless asked

---

## What Currently Works — Don't Break These

| Feature | Notes |
|---|---|
| Transaction management | CSV import, HMRC-aligned auto-categorisation, income/expense tracking |
| Invoice management | Upload/store supplier invoices, link to transactions, multi-currency + GBP conversion |
| Personal expenses | Receipt uploads, reimbursement workflow |
| PayPal integration | Encrypted credentials, multi-currency sync |
| Dashboard | Income, expenses, net profit, corp tax estimate, charts |
| Accountant pack export | ZIP with CSVs + tax summary |
| Corporation tax rates | 19% / 25% / 26.5% (2026 marginal) — all correct |
| Seed capital & transfers | Correctly excluded from trading income — do not remove |
| Company details | Company name, Companies House reg, HMRC tax reference |
| Budget & debt tracking | Personal finance features — stable, keep working |

---

## Corporation Tax — Priority Gaps to Fill

The CT rate calculation is correct. What's missing is the supporting data and reports needed for a complete CT600 filing.

**Build in this order:**

1. **Profit & Loss report** — Formal P&L output to `reports/`. Accountants need this, not just CSV dumps.
2. **Directors' loan account (DLA) tracking** — Money taken beyond salary/dividends = director's loan. Overdrawn DLA at year end triggers **S455 tax** (33.75% of outstanding balance, repayable when loan repaid). Must be tracked separately — never categorised as an expense.
3. **Dividends tracking** — Essential for director/shareholder tax planning. Track separately from salary.
4. **CT600 box mapping** — Map existing data to specific CT600 return boxes so the user can self-file or give a complete pack to their accountant.

**Future additions (lower priority):**
- Balance sheet (assets, liabilities, equity)
- Depreciation / capital allowances (equipment is categorised but not depreciated over time)
- Year-end journal adjustments (accruals, prepayments)

---

## VAT — Build for the Future, Not Urgently

The user is **not currently VAT registered** but will be in future. The data model already has `vat_rate` and `vat_amount` fields. When building VAT features:

**Core VAT work (do properly when asked):**
1. **VAT rate selector in transaction UI** — dropdown: 20% Standard, 5% Reduced, 0% Zero-rated, Exempt, Outside Scope. The `vat_rate` field exists in DB/state but has no UI input yet.
2. **Quarterly VAT periods** — Q1/Q2/Q3/Q4 with date ranges, period filtering, period locking
3. **9-box VAT return** — Box 1 (VAT due on sales), Box 4 (VAT reclaimable), Box 5 (net), Boxes 6–9 (net values)
4. **VAT return export** — PDF/CSV suitable for review or MTD submission

**Architecture note:** Design with MTD (Making Tax Digital) in mind. HMRC mandates digital submission for VAT-registered businesses. Don't build in a way that makes MTD API integration harder later.

**Also needed eventually:**
- Reverse charge (overseas supplier services — e.g. AWS, Google Ads, Stripe)
- VAT scheme toggle: Standard / Cash Accounting / Flat Rate
- Handle VAT on CSV imports (currently defaults to `vat_rate=0`)

---

## UK Tax Rules Reference

### Corporation Tax Rates
- **19%** — profits up to £50,000 (small profits rate)
- **25%** — profits over £250,000 (main rate)
- **26.5%** — effective marginal rate between £50,001–£250,000
- Payment deadline: 9 months + 1 day after financial year end
- Filing deadline: 12 months after financial year end

### Excluded from Trading Income (already implemented — do not remove)
- Seed capital / owner investment
- Owner transfers into the business
- Loan repayments received
- Dividends received (handled separately)

### HMRC Expense Categories
- Office costs (stationery, software, phone, broadband)
- Travel and subsistence (fuel, train, parking, meals on business travel)
- Employee costs (salaries, pensions, NI)
- Legal and professional costs (accountant, solicitor, consultancy)
- Advertising (marketing, ads) — note: client entertainment is **NOT deductible**
- Insurance
- Interest and bank charges
- Capital allowances (equipment/computers/furniture over £1,000)
- Cost of goods sold (materials, stock, direct costs)
- Training (courses, conferences, books)

**Entertainment is NOT tax deductible.** Always flag separately — never merge with advertising or travel.

### UK VAT Rates
- **20%** — Standard (most goods/services)
- **5%** — Reduced (domestic energy, children's car seats, etc.)
- **0%** — Zero-rated (food, books, children's clothes, etc.)
- **Exempt** — No VAT charged, cannot reclaim input VAT (insurance, finance, education)
- **Outside Scope** — Not subject to VAT (wages, MOT tests, etc.)

### Standard VAT Quarters
- Q1: 1 Feb – 30 Apr · Q2: 1 May – 31 Jul · Q3: 1 Aug – 31 Oct · Q4: 1 Nov – 31 Jan
- *(Stagger varies — support custom quarter start month in settings)*

### Directors' Loan Account
- Overdrawn at year end → **S455 tax: 33.75%** of outstanding balance
- S455 is repayable once the loan is repaid within 9 months of year end
- Track as a separate ledger, never as an expense category

---

## Data & Formatting Rules

- **Currency:** GBP (£) always, 2 decimal places
- **Dates:** DD/MM/YYYY — never MM/DD/YYYY
- `vat_rate` stored as integer (20, 5, 0) with separate `vat_amount` calculated field
- VAT calculation: `Gross × Rate / (100 + Rate)` for standard-rated (reverse charge method)
- For cash accounting VAT: use payment date, not invoice date
- Never modify source CSV files — always work on copies
- Never delete source data

---

## Report Output Convention

When generating reports, save to `reports/` with this naming:

```
reports/pl-statement-YYYY-MM-to-YYYY-MM.pdf
reports/corp-tax-computation-YYYY.pdf
reports/vat-return-YYYY-QN.pdf
reports/expense-summary-YYYY-MM.pdf
reports/transactions-export-YYYY.csv
```

---

## What NOT to Do

- ❌ Don't add US tax concepts (1099s, W-2s, Schedule C, etc.)
- ❌ Don't replace HMRC category names with generic equivalents
- ❌ Don't simplify CT rates to a flat 25% — marginal relief matters
- ❌ Don't remove seed capital / transfer exclusions from income calculations
- ❌ Don't merge entertainment with advertising — it's not deductible
- ❌ Don't use US date formats in the UI
- ❌ Don't remove or deprecate Budget.jsx, Debts.jsx, or 003_personal_finance.sql
- ❌ Don't give definitive tax advice — always caveat that the user should verify with their accountant

---

## Open Architectural Questions

1. **MTD API** — Direct HMRC submission, or export-and-upload only? (Decide before building VAT return export)
2. **Accounting year** — Does it match the tax year? Settings should support a custom year-end date.
3. **Multi-company** — Single company only for now, or planned to support multiple?
4. **Fixed assets** — Are fixed assets being tracked? Required before depreciation/capital allowances can be built.

---

*Updated to reflect actual project structure: hybrid personal + business tool, corporation tax priority, VAT future-ready.*
