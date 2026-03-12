import { Router } from "express";
import JSZip from "jszip";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../services/constants.js";
import { fmt, r2 } from "../services/format.js";

const router = Router();

// GET /api/export/accountant-pack
router.get("/accountant-pack", async (req, res, next) => {
  try {
    // Fetch all user data
    const [profileRes, txnRes, invRes, expRes, ppRes, divRes, dlaRes, faRes] = await Promise.all([
      req.supabase.from("user_profiles").select("*").eq("id", req.userId).maybeSingle(),
      req.supabase.from("transactions").select("*").eq("user_id", req.userId).order("date", { ascending: false }),
      req.supabase.from("invoices").select("*").eq("user_id", req.userId).order("created_at", { ascending: false }),
      req.supabase.from("personal_expenses").select("*").eq("user_id", req.userId).order("date", { ascending: false }),
      req.supabase.from("paypal_transactions").select("*").eq("user_id", req.userId).order("date", { ascending: false }),
      req.supabase.from("dividends").select("*").eq("user_id", req.userId).order("date", { ascending: false }),
      req.supabase.from("directors_loan").select("*").eq("user_id", req.userId).order("date", { ascending: true }),
      req.supabase.from("fixed_assets").select("*").eq("user_id", req.userId).order("date_acquired", { ascending: false }),
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
    const income = active.filter((t) => t.type === "income" && t.category !== "transfer");
    const expenses = active.filter((t) => t.type === "expense" && t.category !== "transfer" && t.type !== "reimbursement");
    const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0);
    const totalBankExpenses = expenses.reduce((s, t) => s + Number(t.amount), 0);
    const ppAuthorPayouts = paypalTransactions.filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0);
    const ppFees = paypalTransactions.filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.gbp_amount || t.amount || 0), 0);
    const peTotal = personalExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalExpenses = totalBankExpenses + ppAuthorPayouts + ppFees + peTotal;
    const profit = totalIncome - totalExpenses;
    const taxRate = Number(profile.tax_rate) || 19;
    const corpTax = Math.max(0, profit * (taxRate / 100));
    const companyName = profile.company_name || "Company";

    const zip = new JSZip();
    const dateStr = new Date().toISOString().split("T")[0];

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
    ].join("\n"));

    // Transactions CSV
    const txnHeaders = ["Date", "Description", "Source", "Type", "Amount (GBP)", "Category", "HMRC Category", "Excluded", "Has Invoice", "Notes"];
    const txnRows = transactions.map((t) => {
      const cat = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.id === t.category);
      const hmrc = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
      return [t.date, `"${(t.description || "").replace(/"/g, '""')}"`, t.source, t.type, Number(t.amount).toFixed(2), cat ? cat.label : "", hmrc ? hmrc.hmrc : "", t.excluded ? "Yes" : "No", t.invoice_id ? "Yes" : "No", `"${(t.notes || "").replace(/"/g, '""')}"`];
    });
    zip.file("transactions.csv", [txnHeaders.join(","), ...txnRows.map((r) => r.join(","))].join("\n"));

    // Income CSV
    const incHeaders = ["Date", "Description", "Source", "Amount (GBP)", "Category", "Notes"];
    const incRows = income.map((t) => {
      const cat = INCOME_CATEGORIES.find((c) => c.id === t.category);
      return [t.date, `"${(t.description || "").replace(/"/g, '""')}"`, t.source, Number(t.amount).toFixed(2), cat ? cat.label : "", `"${(t.notes || "").replace(/"/g, '""')}"`];
    });
    zip.file("income.csv", [incHeaders.join(","), ...incRows.map((r) => r.join(","))].join("\n"));

    // Expenses CSV
    const expHeaders = ["Date", "Description", "Source", "Amount (GBP)", "Category", "HMRC Category", "Has Invoice", "Notes"];
    const expRows = expenses.map((t) => {
      const cat = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
      return [t.date, `"${(t.description || "").replace(/"/g, '""')}"`, t.source, Number(t.amount).toFixed(2), cat ? cat.label : "", cat ? cat.hmrc : "", t.invoice_id ? "Yes" : "No", `"${(t.notes || "").replace(/"/g, '""')}"`];
    });
    zip.file("expenses.csv", [expHeaders.join(","), ...expRows.map((r) => r.join(","))].join("\n"));

    // PayPal CSV
    if (paypalTransactions.length > 0) {
      const ppHeaders = ["Date", "Description", "Type", "Currency", "Amount", "GBP Amount", "Fee", "Event Code", "PayPal ID"];
      const ppRows = paypalTransactions.map((t) => [t.date, `"${(t.description || "").replace(/"/g, '""')}"`, t.type, t.currency, Number(t.amount).toFixed(2), Number(t.gbp_amount || 0).toFixed(2), Number(t.fee_amount || 0).toFixed(2), t.event_code || "", t.paypal_id || ""]);
      zip.file("paypal-transactions.csv", [ppHeaders.join(","), ...ppRows.map((r) => r.join(","))].join("\n"));
    }

    // Personal expenses CSV
    if (personalExpenses.length > 0) {
      const peHeaders = ["Date", "Description", "Amount (GBP)", "Category", "Supplier", "Status", "Has Receipt", "Notes"];
      const peRows = personalExpenses.map((e) => {
        const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
        return [e.date, `"${(e.description || "").replace(/"/g, '""')}"`, Number(e.amount).toFixed(2), cat ? cat.label : "", `"${(e.supplier || "").replace(/"/g, '""')}"`, e.status, e.receipt_path ? "Yes" : "No", `"${(e.notes || "").replace(/"/g, '""')}"`];
      });
      zip.file("personal-expenses.csv", [peHeaders.join(","), ...peRows.map((r) => r.join(","))].join("\n"));
    }

    // Dividends CSV
    if (dividends.length > 0) {
      const divHeaders = ["Date", "Shareholder", "Gross Amount (GBP)", "Tax Year", "Voucher No", "Notes"];
      const divRows = dividends.map((d) => [d.date, `"${d.shareholder}"`, Number(d.amount).toFixed(2), d.tax_year, d.voucher_no || "", `"${(d.notes || "").replace(/"/g, '""')}"`]);
      zip.file("dividends.csv", [divHeaders.join(","), ...divRows.map((r) => r.join(","))].join("\n"));
    }

    // Directors' Loan Account CSV
    if (dlaEntries.length > 0) {
      let balance = 0;
      const dlaHeaders = ["Date", "Description", "Direction", "Amount (GBP)", "Running Balance", "Category", "Notes"];
      const dlaRows = dlaEntries.map((e) => {
        if (e.direction === "to_director") balance += Number(e.amount);
        else balance -= Number(e.amount);
        return [e.date, `"${(e.description || "").replace(/"/g, '""')}"`, e.direction, Number(e.amount).toFixed(2), r2(balance).toFixed(2), e.category || "", `"${(e.notes || "").replace(/"/g, '""')}"`];
      });
      zip.file("directors-loan-account.csv", [dlaHeaders.join(","), ...dlaRows.map((r) => r.join(","))].join("\n"));
    }

    // Fixed Assets CSV
    if (fixedAssets.length > 0) {
      const faHeaders = ["Name", "Category", "Date Acquired", "Cost (GBP)", "Depreciation Method", "Useful Life (Years)", "Notes"];
      const faRows = fixedAssets.map((a) => [
        `"${a.name}"`, a.category, a.date_acquired, Number(a.cost).toFixed(2),
        a.depreciation_method, a.useful_life_years, `"${(a.notes || "").replace(/"/g, '""')}"`
      ]);
      zip.file("fixed-assets.csv", [faHeaders.join(","), ...faRows.map((r) => r.join(","))].join("\n"));
    }

    // DLA summary
    let dlaBalance = 0;
    dlaEntries.forEach((e) => {
      if (e.direction === "to_director") dlaBalance += Number(e.amount);
      else dlaBalance -= Number(e.amount);
    });
    const s455 = dlaBalance > 0 ? r2(dlaBalance * 0.3375) : 0;
    const totalDividends = dividends.reduce((s, d) => s + Number(d.amount), 0);

    // Expense breakdown by HMRC category
    const expByHmrc = {};
    expenses.forEach((t) => {
      const cat = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
      const hmrc = cat?.hmrc || "Other";
      expByHmrc[hmrc] = (expByHmrc[hmrc] || 0) + Number(t.amount);
    });

    // Comprehensive tax summary
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
    zip.file("tax-summary.txt", taxLines.join("\n"));

    // Generate and send
    const blob = await zip.generateAsync({ type: "nodebuffer" });
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename="${companyName.replace(/[^a-zA-Z0-9]/g, "-")}-accounts-${dateStr}.zip"`);
    res.send(blob);
  } catch (err) {
    next(err);
  }
});

// GET /api/export/transactions.csv
router.get("/transactions.csv", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("transactions")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false });

    if (error) throw error;
    const headers = ["Date", "Description", "Source", "Type", "Amount", "Category", "Notes"];
    const rows = (data || []).map((t) => [t.date, `"${(t.description || "").replace(/"/g, '""')}"`, t.source, t.type, Number(t.amount).toFixed(2), t.category, `"${(t.notes || "").replace(/"/g, '""')}"`]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    res.set("Content-Type", "text/csv");
    res.set("Content-Disposition", `attachment; filename="transactions-${new Date().toISOString().split("T")[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
