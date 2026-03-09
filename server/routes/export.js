import { Router } from "express";
import JSZip from "jszip";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../services/constants.js";
import { fmt, r2 } from "../services/format.js";

const router = Router();

// GET /api/export/accountant-pack
router.get("/accountant-pack", async (req, res, next) => {
  try {
    // Fetch all user data
    const [profileRes, txnRes, invRes, expRes, ppRes] = await Promise.all([
      req.supabase.from("user_profiles").select("*").eq("id", req.userId).single(),
      req.supabase.from("transactions").select("*").eq("user_id", req.userId).order("date", { ascending: false }),
      req.supabase.from("invoices").select("*").eq("user_id", req.userId).order("created_at", { ascending: false }),
      req.supabase.from("personal_expenses").select("*").eq("user_id", req.userId).order("date", { ascending: false }),
      req.supabase.from("paypal_transactions").select("*").eq("user_id", req.userId).order("date", { ascending: false }),
    ]);

    const profile = profileRes.data || {};
    const transactions = txnRes.data || [];
    const invoices = invRes.data || [];
    const personalExpenses = expRes.data || [];
    const paypalTransactions = ppRes.data || [];

    const active = transactions.filter((t) => !t.excluded);
    const income = active.filter((t) => t.type === "income" && t.category !== "transfer");
    const expenses = active.filter((t) => t.type === "expense" && t.category !== "transfer");
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

    // Tax summary
    const taxLines = [
      `CORPORATION TAX COMPUTATION`,
      `${companyName}`,
      `Period: ${profile.year_start || "N/A"} to ${profile.year_end || "N/A"}`,
      `Tax Reference: ${profile.tax_ref || "N/A"}`,
      `Company Reg: ${profile.company_reg || "N/A"}`,
      `Generated: ${new Date().toLocaleDateString("en-GB")}`,
      ``,
      `TRADING INCOME: ${fmt(totalIncome)}`,
      `TOTAL EXPENSES: ${fmt(totalExpenses)}`,
      `  Bank/Direct: ${fmt(totalBankExpenses)}`,
      `  PayPal Payouts: ${fmt(ppAuthorPayouts)}`,
      `  PayPal Fees: ${fmt(ppFees)}`,
      `  Personal Claims: ${fmt(peTotal)}`,
      ``,
      `NET PROFIT: ${fmt(profit)}`,
      `Corporation Tax @ ${taxRate}%: ${fmt(corpTax)}`,
      `Profit After Tax: ${fmt(profit - corpTax)}`,
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
