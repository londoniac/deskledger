import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { journalEntrySchema } from "../schemas.js";

const router = Router();

// GET /api/journal-entries
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/journal-entries
router.post("/", validate(journalEntrySchema), async (req, res, next) => {
  try {
    const d = req.body;
    const row = {
      id: d.id || `je-${Date.now()}`,
      user_id: req.userId,
      date: d.date,
      description: d.description,
      debit_account: d.debit_account,
      credit_account: d.credit_account,
      amount: d.amount,
      type: d.type || "adjustment",
      period: d.period || "",
      notes: d.notes || "",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await req.supabase
      .from("journal_entries")
      .upsert(row, { onConflict: "id,user_id" })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/journal-entries/:id
router.put("/:id", async (req, res, next) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;

    const { data, error } = await req.supabase
      .from("journal_entries")
      .update(updates)
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/journal-entries/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from("journal_entries")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
