import { Router } from "express";
import { generateAccountantPack } from "../services/export.js";

const router = Router();

// GET /api/export/accountant-pack
router.get("/accountant-pack", async (req, res, next) => {
  try {
    const { blob, companyName, dateStr } = await generateAccountantPack(req.supabase, req.userId);
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
