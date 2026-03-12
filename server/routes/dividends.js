import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { dividendSchema } from "../schemas.js";

const router = Router();

// GET /api/dividends
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("dividends")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/dividends
router.post("/", validate(dividendSchema), async (req, res, next) => {
  try {
    const d = req.body;
    const row = {
      id: d.id || `div-${Date.now()}`,
      user_id: req.userId,
      date: d.date,
      amount: d.amount,
      shareholder: d.shareholder,
      tax_year: d.tax_year,
      voucher_no: d.voucher_no || "",
      notes: d.notes || "",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await req.supabase
      .from("dividends")
      .upsert(row, { onConflict: "id,user_id" })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/dividends/:id
router.put("/:id", async (req, res, next) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;

    const { data, error } = await req.supabase
      .from("dividends")
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

// DELETE /api/dividends/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from("dividends")
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
