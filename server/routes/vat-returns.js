import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { vatReturnSchema } from "../schemas.js";

const router = Router();

// GET /api/vat-returns
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("vat_returns")
      .select("*")
      .eq("user_id", req.userId)
      .order("period_start", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/vat-returns/:id — single return with detail
router.get("/:id", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("vat_returns")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/vat-returns — create or update a return
router.post("/", validate(vatReturnSchema), async (req, res, next) => {
  try {
    const d = req.body;
    const row = {
      id: d.id || `vat-${Date.now()}`,
      user_id: req.userId,
      period_start: d.period_start,
      period_end: d.period_end,
      status: d.status || "draft",
      box1_vat_due_sales: d.box1_vat_due_sales || 0,
      box2_vat_due_acquisitions: d.box2_vat_due_acquisitions || 0,
      box3_total_vat_due: d.box3_total_vat_due || 0,
      box4_vat_reclaimed: d.box4_vat_reclaimed || 0,
      box5_net_vat: d.box5_net_vat || 0,
      box6_total_sales: d.box6_total_sales || 0,
      box7_total_purchases: d.box7_total_purchases || 0,
      box8_total_supplies: d.box8_total_supplies || 0,
      box9_total_acquisitions: d.box9_total_acquisitions || 0,
      notes: d.notes || "",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await req.supabase
      .from("vat_returns")
      .upsert(row, { onConflict: "id,user_id" })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/vat-returns/:id/calculate — auto-calculate 9-box from transactions
router.post("/:id/calculate", async (req, res, next) => {
  try {
    // Get the return to find the period
    const { data: vatReturn, error: vrErr } = await req.supabase
      .from("vat_returns")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();

    if (vrErr) throw vrErr;
    if (vatReturn.status === "filed") {
      return res.status(400).json({ error: "Cannot recalculate a filed return" });
    }

    // Get transactions in this period
    const { data: txns, error: txErr } = await req.supabase
      .from("transactions")
      .select("*")
      .eq("user_id", req.userId)
      .eq("excluded", false)
      .gte("date", vatReturn.period_start)
      .lte("date", vatReturn.period_end);

    if (txErr) throw txErr;

    // Calculate 9-box values
    let box1 = 0, box2 = 0, box4 = 0, box6 = 0, box7 = 0, box8 = 0, box9 = 0;

    for (const t of (txns || [])) {
      const vatAmount = Number(t.vat_amount) || 0;
      const grossAmount = Number(t.amount) || 0;
      const netAmount = grossAmount - vatAmount;

      if (t.type === "income") {
        box1 += vatAmount;                 // VAT due on sales
        box6 += Math.abs(netAmount);       // Total sales ex-VAT
      } else if (t.type === "expense") {
        box4 += Math.abs(vatAmount);       // VAT reclaimable
        box7 += Math.abs(netAmount);       // Total purchases ex-VAT
      }
    }

    const box3 = box1 + box2;
    const box5 = box3 - box4;

    const r = (n) => Math.round(n * 100) / 100;

    const updates = {
      box1_vat_due_sales: r(box1),
      box2_vat_due_acquisitions: r(box2),
      box3_total_vat_due: r(box3),
      box4_vat_reclaimed: r(box4),
      box5_net_vat: r(box5),
      box6_total_sales: r(box6),
      box7_total_purchases: r(box7),
      box8_total_supplies: r(box8),
      box9_total_acquisitions: r(box9),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await req.supabase
      .from("vat_returns")
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

// PUT /api/vat-returns/:id
router.put("/:id", async (req, res, next) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;

    const { data, error } = await req.supabase
      .from("vat_returns")
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

// POST /api/vat-returns/:id/submit — mark as submitted and lock
router.post("/:id/submit", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("vat_returns")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .eq("status", "draft")
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(400).json({ error: "Return not found or already submitted" });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/vat-returns/:id — only draft returns
router.delete("/:id", async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from("vat_returns")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .eq("status", "draft");

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
