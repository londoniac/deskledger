import { Router } from "express";

const router = Router();

// GET /api/transactions
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("transactions")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions — upsert batch
router.post("/", async (req, res, next) => {
  try {
    const txns = req.body;
    if (!Array.isArray(txns)) {
      return res.status(400).json({ error: "Expected array of transactions" });
    }

    const rows = txns.map((t) => ({
      id: t.id,
      user_id: req.userId,
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      category: t.category || "",
      source: t.source || "manual",
      vat_rate: t.vat_rate || t.vatRate || 0,
      vat_amount: t.vat_amount || t.vatAmount || 0,
      reconciled: t.reconciled || false,
      excluded: t.excluded || false,
      exclude_reason: t.exclude_reason || t.excludeReason || null,
      notes: t.notes || "",
      invoice_id: t.invoice_id || t.invoiceId || null,
      linked_transaction_id: t.linked_transaction_id || t.linkedTransactionId || null,
      monzo_id: t.monzo_id || t.monzoId || null,
      local_currency: t.local_currency || t.localCurrency || null,
      local_amount: t.local_amount || t.localAmount || null,
      paypal_transaction_id: t.paypal_transaction_id || t.paypalTransactionId || null,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await req.supabase
      .from("transactions")
      .upsert(rows, { onConflict: "id,user_id" })
      .select();

    if (error) throw error;
    res.json({ success: true, count: (data || []).length });
  } catch (err) {
    next(err);
  }
});

// PUT /api/transactions/:id — use named wildcard to support IDs with slashes
router.put("/:id(*)", async (req, res, next) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;

    const { data, error } = await req.supabase
      .from("transactions")
      .update(updates)
      .eq("id", id)
      .eq("user_id", req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/transactions/:id — use named wildcard to support IDs with slashes
router.delete("/:id(*)", async (req, res, next) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const { error } = await req.supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_id", req.userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
