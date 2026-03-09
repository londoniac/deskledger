import { Router } from "express";

const router = Router();

// GET /api/expenses
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("personal_expenses")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/expenses
router.post("/", async (req, res, next) => {
  try {
    const expense = {
      id: req.body.id,
      user_id: req.userId,
      date: req.body.date,
      description: req.body.description,
      amount: req.body.amount,
      category: req.body.category || "office",
      supplier: req.body.supplier || "",
      receipt_path: req.body.receipt_path || null,
      receipt_name: req.body.receipt_name || req.body.receiptName || "",
      status: req.body.status || "pending",
      invoice_ref: req.body.invoice_ref || req.body.invoiceRef || "",
      notes: req.body.notes || "",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await req.supabase
      .from("personal_expenses")
      .upsert(expense, { onConflict: "id,user_id" })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/expenses/:id
router.put("/:id", async (req, res, next) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;

    const { data, error } = await req.supabase
      .from("personal_expenses")
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

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res, next) => {
  try {
    // Clean up receipt from storage
    const { data: exp } = await req.supabase
      .from("personal_expenses")
      .select("receipt_path")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();

    if (exp?.receipt_path) {
      await req.supabase.storage.from("documents").remove([exp.receipt_path]);
    }

    const { error } = await req.supabase
      .from("personal_expenses")
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
