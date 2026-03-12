import JSZip from "jszip";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./constants.js";
import { fmt, r2 } from "./format.js";

/**
 * Generate the accountant pack ZIP for a given user.
 * @param {object} supabase - Supabase client (service key)
 * @param {string} userId - The user ID to generate the pack for
 * @returns {{ blob: Buffer, companyName: string, dateStr: string }}
 */
export async function generateAccountantPack(supabase, userId) {
  const [profileRes, txnRes, invRes, expRes, ppRes, divRes, dlaRes, faRes] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("invoices").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("personal_expenses").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("paypal_transactions").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("dividends").select("*").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("directors_loan").select("*").eq("user_id", userId).order("date", { ascending: true }),
    supabase.from("fixed_assets").select("*").eq("user_id", userId).order("date_acquired", { ascending: false }),
  ]);

  const profile = profileRes.data || {};
  const transactions = txnRes.data || [];
  const invoices = invRes.data || [];
  const personalExpenses = expRes.data || [];
  const paypalTransactions = ppRes.data || [];
  const dividends = divRes.data || [];
  const dlaEntries = dlaRes.data || [];
  const fixedAssets = faRes.data || [];

  const active = transactions.filter((t) => !t.excluded);
  const income = active.filter((t) => t.type === "income" && t.category !== "transfer" && t.category !== "capital");
  const expenses = active.filter((t) => t.type === "expense" && t.category !== "transfer" && t.type !== "reimbursement");
  const nonDeductibleIds = EXPENSE_CATEGORIES.filter((c) => c.deductible === false).map((c) => c.id);
  const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0);
  const totalBankExpenses = expenses.filter((t) => !nonDeductibleIds.includes(t.category)).reduce((s, t) => s + Number(t.amount), 0);
  const ppAuthorPayouts = paypalTransactions.filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0);
  const ppFees = paypalTransactions.filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0);
  const peTotal = personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalExpenses = totalBankExpenses + ppAuthorPayouts + ppFees + peTotal;
  const profit = totalIncome - totalExpenses;
  const taxRate = Number(profile.tax_rate) || 19;
  const corpTax = Math.max(0, profit * (taxRate / 100));
  const companyName = profile.company_name || "Company";

  const excluded = transactions.filter((t) => t.excluded);
  const reimbursements = transactions.filter((t) => t.type === "reimbursement");

  const zip = new JSZip();
  const dateStr = new Date().toISOString().split("T")[0];

  const monthKey = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = (key) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  };
  const esc = (s) => `"${(s || "").replace(/"/g, '""')}"`;

  // README
  zip.file("README.txt", [
    `${companyName} — Accounts Pack`,
    `Generated: ${new Date().toLocaleDateString("en-GB")}`,
    `Period: ${profile.year_start || "N/A"} to ${profile.year_end || "N/A"}`,
    ``,
    `Trading Income:     ${fmt(totalIncome)}`,
    `Total Expenses:     ${fmt(totalExpenses)}`,
    `Net Profit:         ${fmt(profit)}`,
    `Corp Tax Est:       ${fmt(corpTax)} @ ${taxRate}%`,
    ``,
    `Records: ${transactions.length} transactions, ${paypalTransactions.length} PayPal, ${invoices.length} invoices, ${personalExpenses.length} personal expenses`,
    ``,
    `FOLDER STRUCTURE:`,
    `  monthly/YYYY-MM/           — Transactions & expenses by month`,
    `  monthly/YYYY-MM/invoices/  — Invoice/receipt files for that month`,
    `  monthly/YYYY-MM/receipts/  — Personal expense receipts for that month`,
    `  bank-statements/           — Original CSV files from Monzo/bank`,
    `  summaries/                 — Full CSVs, tax summary, P&L data`,
    `  summaries/excluded.csv     — Excluded transactions (with reasons)`,
    `  summaries/reimbursements.csv — Director reimbursement payments`,
  ].join("\n"));

  // ─── MONTHLY FOLDERS ───
  const txnsByMonth = {};
  transactions.forEach((t) => {
    const mk = monthKey(t.date);
    if (!txnsByMonth[mk]) txnsByMonth[mk] = [];
    txnsByMonth[mk].push(t);
  });
  const peByMonth = {};
  personalExpenses.forEach((e) => {
    const mk = monthKey(e.date);
    if (!peByMonth[mk]) peByMonth[mk] = [];
    peByMonth[mk].push(e);
  });
  const ppByMonth = {};
  paypalTransactions.forEach((t) => {
    const mk = monthKey(t.date);
    if (!ppByMonth[mk]) ppByMonth[mk] = [];
    ppByMonth[mk].push(t);
  });
  const allMonths = [...new Set([...Object.keys(txnsByMonth), ...Object.keys(peByMonth), ...Object.keys(ppByMonth)])].sort();

  for (const mk of allMonths) {
    const folder = `monthly/${mk}`;
    const mTxns = txnsByMonth[mk] || [];
    const mPE = peByMonth[mk] || [];
    const mPP = ppByMonth[mk] || [];

    const txnHeaders = ["Date", "Description", "Source", "Type", "Amount (GBP)", "Category", "HMRC Category", "Excluded", "Exclude Reason", "Has Invoice", "Notes"];
    const txnRows = mTxns.map((t) => {
      const cat = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.id === t.category);
      const hmrc = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
      return [t.date, esc(t.description), t.source, t.type, Number(t.amount).toFixed(2), cat ? cat.label : "", hmrc ? hmrc.hmrc : "", t.excluded ? "Yes" : "No", esc(t.exclude_reason), t.invoice_id ? "Yes" : "No", esc(t.notes)];
    });
    zip.file(`${folder}/transactions.csv`, [txnHeaders.join(","), ...txnRows.map((r) => r.join(","))].join("\n"));

    if (mPE.length > 0) {
      const peHeaders = ["Date", "Description", "Amount (GBP)", "Original Amount", "Original Currency", "Category", "Supplier", "Status", "Has Receipt", "Notes"];
      const peRows = mPE.map((e) => {
        const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
        return [e.date, esc(e.description), Number(e.amount).toFixed(2), e.original_amount ? Number(e.original_amount).toFixed(2) : "", e.original_currency || "", cat ? cat.label : "", esc(e.supplier), e.status, e.receipt_path ? "Yes" : "No", esc(e.notes)];
      });
      zip.file(`${folder}/personal-expenses.csv`, [peHeaders.join(","), ...peRows.map((r) => r.join(","))].join("\n"));
    }

    if (mPP.length > 0) {
      const ppHeaders = ["Date", "Description", "Type", "Currency", "Amount", "GBP Amount", "Fee", "Event Code", "PayPal ID"];
      const ppRows = mPP.map((t) => [t.date, esc(t.description), t.type, t.currency, Number(t.amount).toFixed(2), Number(t.gbp_amount || 0).toFixed(2), Number(t.fee_amount || 0).toFixed(2), t.event_code || "", t.paypal_id || ""]);
      zip.file(`${folder}/paypal.csv`, [ppHeaders.join(","), ...ppRows.map((r) => r.join(","))].join("\n"));
    }

    const mActive = mTxns.filter((t) => !t.excluded);
    const mIncome = r2(mActive.filter((t) => t.type === "income" && t.category !== "transfer" && t.category !== "capital").reduce((s, t) => s + Number(t.amount), 0));
    const mExp = r2(mActive.filter((t) => t.type === "expense" && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0));
    const mPPExp = r2(mPP.filter((t) => t.type === "author_payout" || t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0));
    const mPETotal = r2(mPE.reduce((s, e) => s + Number(e.amount), 0));
    zip.file(`${folder}/summary.txt`, [
      `${monthLabel(mk)}`,
      `${"─".repeat(40)}`,
      `Trading Income:      ${fmt(mIncome)}`,
      `Bank Expenses:       ${fmt(mExp)}`,
      `PayPal Expenses:     ${fmt(mPPExp)}`,
      `Personal Expenses:   ${fmt(mPETotal)}`,
      `Net:                 ${fmt(r2(mIncome - mExp - mPPExp - mPETotal))}`,
      ``,
      `Transactions: ${mTxns.length} (${mTxns.filter((t) => t.excluded).length} excluded)`,
    ].join("\n"));
  }

  // ─── DOWNLOAD INVOICE/RECEIPT FILES INTO MONTHLY FOLDERS ───
  for (const inv of invoices) {
    if (!inv.file_path) continue;
    try {
      const { data, error } = await supabase.storage.from("documents").download(inv.file_path);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      const txn = transactions.find((t) => t.id === inv.transaction_id);
      const mk = txn ? monthKey(txn.date) : monthKey(inv.created_at || inv.upload_date);
      const fileName = inv.file_name || inv.file_path.split("/").pop();
      zip.file(`monthly/${mk}/invoices/${fileName}`, buf);
    } catch (e) { /* skip failed downloads */ }
  }

  for (const pe of personalExpenses) {
    if (!pe.receipt_path) continue;
    try {
      const { data, error } = await supabase.storage.from("documents").download(pe.receipt_path);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      const mk = monthKey(pe.date);
      const fileName = pe.receipt_name || pe.receipt_path.split("/").pop();
      zip.file(`monthly/${mk}/receipts/${fileName}`, buf);
    } catch (e) { /* skip failed downloads */ }
  }

  // ─── ORIGINAL BANK STATEMENTS ───
  try {
    const { data: stmtFiles } = await supabase.storage
      .from("documents")
      .list(`${userId}/statements`, { limit: 100, sortBy: { column: "name", order: "asc" } });
    if (stmtFiles && stmtFiles.length > 0) {
      for (const sf of stmtFiles) {
        try {
          const { data: fileData } = await supabase.storage
            .from("documents")
            .download(`${userId}/statements/${sf.name}`);
          if (fileData) {
            const buf = Buffer.from(await fileData.arrayBuffer());
            zip.file(`bank-statements/${sf.name}`, buf);
          }
        } catch (e) { /* skip */ }
      }
    }
  } catch (e) { /* skip if no statements */ }

  // ─── SUMMARIES FOLDER ───
  const txnHeaders = ["Date", "Description", "Source", "Type", "Amount (GBP)", "Category", "HMRC Category", "Excluded", "Exclude Reason", "Has Invoice", "Notes"];
  const txnRows = transactions.map((t) => {
    const cat = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.id === t.category);
    const hmrc = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
    return [t.date, esc(t.description), t.source, t.type, Number(t.amount).toFixed(2), cat ? cat.label : "", hmrc ? hmrc.hmrc : "", t.excluded ? "Yes" : "No", esc(t.exclude_reason), t.invoice_id ? "Yes" : "No", esc(t.notes)];
  });
  zip.file("summaries/all-transactions.csv", [txnHeaders.join(","), ...txnRows.map((r) => r.join(","))].join("\n"));

  if (excluded.length > 0) {
    const exHeaders = ["Date", "Description", "Source", "Type", "Amount (GBP)", "Category", "Exclude Reason", "Notes"];
    const exRows = excluded.map((t) => {
      const cat = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.id === t.category);
      return [t.date, esc(t.description), t.source, t.type, Number(t.amount).toFixed(2), cat ? cat.label : "", esc(t.exclude_reason), esc(t.notes)];
    });
    zip.file("summaries/excluded.csv", [exHeaders.join(","), ...exRows.map((r) => r.join(","))].join("\n"));
  }

  if (reimbursements.length > 0) {
    const reHeaders = ["Date", "Description", "Amount (GBP)", "Notes"];
    const reRows = reimbursements.map((t) => [t.date, esc(t.description), Number(t.amount).toFixed(2), esc(t.notes)]);
    zip.file("summaries/reimbursements.csv", [reHeaders.join(","), ...reRows.map((r) => r.join(","))].join("\n"));
  }

  if (paypalTransactions.length > 0) {
    const ppHeaders = ["Date", "Description", "Type", "Currency", "Amount", "GBP Amount", "Fee", "Event Code", "PayPal ID"];
    const ppRows = paypalTransactions.map((t) => [t.date, esc(t.description), t.type, t.currency, Number(t.amount).toFixed(2), Number(t.gbp_amount || 0).toFixed(2), Number(t.fee_amount || 0).toFixed(2), t.event_code || "", t.paypal_id || ""]);
    zip.file("summaries/paypal-transactions.csv", [ppHeaders.join(","), ...ppRows.map((r) => r.join(","))].join("\n"));
  }

  if (personalExpenses.length > 0) {
    const peHeaders = ["Date", "Description", "Amount (GBP)", "Original Amount", "Original Currency", "Category", "Supplier", "Status", "Has Receipt", "Notes"];
    const peRows = personalExpenses.map((e) => {
      const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
      return [e.date, esc(e.description), Number(e.amount).toFixed(2), e.original_amount ? Number(e.original_amount).toFixed(2) : "", e.original_currency || "", cat ? cat.label : "", esc(e.supplier), e.status, e.receipt_path ? "Yes" : "No", esc(e.notes)];
    });
    zip.file("summaries/personal-expenses.csv", [peHeaders.join(","), ...peRows.map((r) => r.join(","))].join("\n"));
  }

  if (dividends.length > 0) {
    const divHeaders = ["Date", "Shareholder", "Gross Amount (GBP)", "Tax Year", "Voucher No", "Notes"];
    const divRows = dividends.map((d) => [d.date, esc(d.shareholder), Number(d.amount).toFixed(2), d.tax_year, d.voucher_no || "", esc(d.notes)]);
    zip.file("summaries/dividends.csv", [divHeaders.join(","), ...divRows.map((r) => r.join(","))].join("\n"));
  }

  if (dlaEntries.length > 0) {
    let balance = 0;
    const dlaHeaders = ["Date", "Description", "Direction", "Amount (GBP)", "Running Balance", "Category", "Notes"];
    const dlaRows = dlaEntries.map((e) => {
      if (e.direction === "to_director") balance += Number(e.amount);
      else balance -= Number(e.amount);
      return [e.date, esc(e.description), e.direction, Number(e.amount).toFixed(2), r2(balance).toFixed(2), e.category || "", esc(e.notes)];
    });
    zip.file("summaries/directors-loan-account.csv", [dlaHeaders.join(","), ...dlaRows.map((r) => r.join(","))].join("\n"));
  }

  if (fixedAssets.length > 0) {
    const faHeaders = ["Name", "Category", "Date Acquired", "Cost (GBP)", "Depreciation Method", "Useful Life (Years)", "Notes"];
    const faRows = fixedAssets.map((a) => [
      esc(a.name), a.category, a.date_acquired, Number(a.cost).toFixed(2),
      a.depreciation_method, a.useful_life_years, esc(a.notes),
    ]);
    zip.file("summaries/fixed-assets.csv", [faHeaders.join(","), ...faRows.map((r) => r.join(","))].join("\n"));
  }

  // DLA summary
  let dlaBalance = 0;
  dlaEntries.forEach((e) => {
    if (e.direction === "to_director") dlaBalance += Number(e.amount);
    else dlaBalance -= Number(e.amount);
  });
  const s455 = dlaBalance > 0 ? r2(dlaBalance * 0.3375) : 0;
  const totalDividends = dividends.reduce((s, d) => s + Number(d.amount), 0);

  const expByHmrc = {};
  const nonDeductibleByHmrc = {};
  expenses.forEach((t) => {
    const cat = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
    const effectiveCat = t.category === "marketing"
      ? EXPENSE_CATEGORIES.find((c) => c.id === "advertising") || cat
      : cat;
    const hmrc = effectiveCat?.hmrc || "Other";
    if (effectiveCat?.deductible === false) {
      nonDeductibleByHmrc[hmrc] = (nonDeductibleByHmrc[hmrc] || 0) + Number(t.amount);
    } else {
      expByHmrc[hmrc] = (expByHmrc[hmrc] || 0) + Number(t.amount);
    }
  });
  const totalNonDeductible = Object.values(nonDeductibleByHmrc).reduce((s, v) => s + v, 0);

  const taxLines = [
    `═══════════════════════════════════════════════════════`,
    `  CORPORATION TAX COMPUTATION`,
    `  ${companyName}`,
    `═══════════════════════════════════════════════════════`,
    ``,
    `  Company Registration:  ${profile.company_reg || "N/A"}`,
    `  HMRC Tax Reference:    ${profile.tax_ref || "N/A"}`,
    `  Accounting Period:     ${profile.year_start || "N/A"} to ${profile.year_end || "N/A"}`,
    `  Generated:             ${new Date().toLocaleDateString("en-GB")}`,
    ``,
    `───────────────────────────────────────────────────────`,
    `  PROFIT AND LOSS`,
    `───────────────────────────────────────────────────────`,
    ``,
    `  TURNOVER`,
    `    Trading Income:                      ${fmt(totalIncome).padStart(12)}`,
    ``,
    `  EXPENSES`,
    ...Object.entries(expByHmrc).sort((a, b) => b[1] - a[1]).map(([cat, amt]) =>
      `    ${cat}:${" ".repeat(Math.max(1, 37 - cat.length))}${fmt(amt).padStart(12)}`),
    `    PayPal Author Payouts:               ${fmt(ppAuthorPayouts).padStart(12)}`,
    `    PayPal Fees:                         ${fmt(ppFees).padStart(12)}`,
    `    Personal Expense Claims:             ${fmt(peTotal).padStart(12)}`,
    `                                         ────────────`,
    `    TOTAL EXPENSES:                      ${fmt(totalExpenses).padStart(12)}`,
    ``,
    `  NET PROFIT BEFORE TAX:                 ${fmt(profit).padStart(12)}`,
    `  Corporation Tax @ ${taxRate}%:              ${fmt(corpTax).padStart(12)}`,
    `  NET PROFIT AFTER TAX:                  ${fmt(profit - corpTax).padStart(12)}`,
    ``,
    ...(totalNonDeductible > 0 ? [
      `───────────────────────────────────────────────────────`,
      `  NON-DEDUCTIBLE EXPENSES (DISALLOWABLE)`,
      `───────────────────────────────────────────────────────`,
      ``,
      ...Object.entries(nonDeductibleByHmrc).map(([cat, amt]) =>
        `    ${cat}:${" ".repeat(Math.max(1, 37 - cat.length))}${fmt(amt).padStart(12)}`),
      `    TOTAL NON-DEDUCTIBLE:                ${fmt(totalNonDeductible).padStart(12)}`,
      ``,
      `    NOTE: Non-deductible expenses are NOT included in`,
      `    the allowable expenses above. Entertainment costs`,
      `    cannot be claimed as a deduction for corporation tax.`,
    ] : []),
    ``,
    `───────────────────────────────────────────────────────`,
    `  ADDITIONAL ITEMS`,
    `───────────────────────────────────────────────────────`,
    ``,
    `  Dividends Paid:                        ${fmt(totalDividends).padStart(12)}`,
    `    (not deductible — for personal tax)`,
    ``,
    `  Directors' Loan Account:`,
    `    Closing Balance:                     ${fmt(Math.abs(dlaBalance)).padStart(12)}`,
    `    Status: ${dlaBalance > 0 ? "Director owes company" : dlaBalance < 0 ? "Company owes director" : "Balanced"}`,
    ...(s455 > 0 ? [
      `    S455 Tax Liability (33.75%):         ${fmt(s455).padStart(12)}`,
      `    (repayable when loan repaid within 9 months of year end)`,
    ] : []),
    ``,
    `  Fixed Assets:                          ${fixedAssets.length} item${fixedAssets.length !== 1 ? "s" : ""}`,
    `    Total Cost:                          ${fmt(fixedAssets.reduce((s, a) => s + Number(a.cost), 0)).padStart(12)}`,
    ``,
    `───────────────────────────────────────────────────────`,
    `  RECORDS INCLUDED`,
    `───────────────────────────────────────────────────────`,
    ``,
    `  Bank Transactions:    ${transactions.length}`,
    `  PayPal Transactions:  ${paypalTransactions.length}`,
    `  Invoices on File:     ${invoices.length}`,
    `  Personal Expenses:    ${personalExpenses.length}`,
    `  Dividend Payments:    ${dividends.length}`,
    `  DLA Entries:          ${dlaEntries.length}`,
    `  Fixed Assets:         ${fixedAssets.length}`,
    ``,
    `═══════════════════════════════════════════════════════`,
    `  This is a summary only. Verify with your accountant`,
    `  before filing. This does not constitute tax advice.`,
    `═══════════════════════════════════════════════════════`,
  ];
  zip.file("summaries/tax-summary.txt", taxLines.join("\n"));

  const blob = await zip.generateAsync({ type: "nodebuffer" });
  return { blob, companyName, dateStr };
}
