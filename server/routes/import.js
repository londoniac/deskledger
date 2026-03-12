import { Router } from "express";
import { parseCSV, normalizeTransactions, autoCategory, extractClosingBalance } from "../services/csv.js";

const router = Router();

// POST /api/import/parse — upload CSV text, return parsed preview
router.post("/parse", async (req, res, next) => {
  try {
    const { csv, source } = req.body;
    if (!csv) {
      return res.status(400).json({ error: "No CSV data provided" });
    }

    const rows = parseCSV(csv);
    if (rows.length === 0) {
      return res.status(400).json({ error: "No valid rows found in CSV" });
    }

    const transactions = normalizeTransactions(rows, source || "bank");

    // Auto-categorise
    const categorized = transactions.map((t) => ({
      ...t,
      category: autoCategory(t.description),
    }));

    // Check for existing IDs to flag duplicates
    const ids = categorized.map((t) => t.id);
    const { data: existing } = await req.supabase
      .from("transactions")
      .select("id")
      .eq("user_id", req.userId)
      .in("id", ids);

    const existingIds = new Set((existing || []).map((e) => e.id));
    const preview = categorized.map((t) => ({
      ...t,
      isDuplicate: existingIds.has(t.id),
    }));

    // Extract closing balance from CSV (e.g. Monzo Balance column)
    const closingBalance = extractClosingBalance(rows);

    res.json({
      total: preview.length,
      newCount: preview.filter((t) => !t.isDuplicate).length,
      duplicateCount: preview.filter((t) => t.isDuplicate).length,
      transactions: preview,
      closingBalance,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/confirm — save parsed transactions
router.post("/confirm", async (req, res, next) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "No transactions to import" });
    }

    const rows = transactions.map((t) => ({
      id: t.id,
      user_id: req.userId,
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      category: t.category || "",
      source: t.source || "bank",
      vat_rate: t.vatRate || 0,
      vat_amount: t.vatAmount || 0,
      reconciled: false,
      excluded: false,
      notes: t.notes || "",
      monzo_id: t.monzoId || null,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await req.supabase
      .from("transactions")
      .upsert(rows, { onConflict: "id,user_id" })
      .select();

    if (error) throw error;

    // Save closing balance if provided (from CSV parse step)
    const { closingBalance, closingBalanceDate } = req.body;
    if (closingBalance != null) {
      await req.supabase
        .from("user_profiles")
        .update({
          bank_balance: closingBalance,
          bank_balance_date: closingBalanceDate || new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", req.userId);
    }

    // Save original CSV to storage for accountant pack
    const { csv: originalCsv, fileName } = req.body;
    if (originalCsv) {
      const dateStr = new Date().toISOString().split("T")[0];
      const safeName = (fileName || `bank-statement-${dateStr}.csv`).replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${req.userId}/statements/${dateStr}-${safeName}`;
      await req.supabase.storage
        .from("documents")
        .upload(storagePath, Buffer.from(originalCsv, "utf-8"), {
          contentType: "text/csv",
          upsert: true,
        });
    }

    res.json({ success: true, imported: (data || []).length });
  } catch (err) {
    next(err);
  }
});

export default router;
