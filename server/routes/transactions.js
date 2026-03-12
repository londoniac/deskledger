import { Router } from "express";
import { validate, dbError } from "../middleware/validate.js";
import { transactionBatch } from "../schemas.js";

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
router.post("/", validate(transactionBatch), async (req, res, next) => {
  try {
    const txns = req.body;

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

// PUT /api/transactions/by-id?id=... — supports IDs with slashes
router.put("/by-id", async (req, res, next) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing id query parameter" });
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

// DELETE /api/transactions/by-id?id=... — supports IDs with slashes
router.delete("/by-id", async (req, res, next) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing id query parameter" });
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

// POST /api/transactions/fix-exclusions — one-time fix to match desktop app rules
// Applies exclusion rules: seed capital, failed payments/reversals, inter-account transfers, verification deposits
router.post("/fix-exclusions", async (req, res, next) => {
  try {
    // Get all user transactions
    const { data: txns, error: fetchErr } = await req.supabase
      .from("transactions")
      .select("*")
      .eq("user_id", req.userId);

    if (fetchErr) throw fetchErr;
    if (!txns || txns.length === 0) return res.json({ fixed: 0, details: [] });

    const fixes = [];

    for (const t of txns) {
      const desc = (t.description || "").toLowerCase();
      const amount = Number(t.amount);
      let update = null;

      // 1. Seed capital — large income with "seed" or from a known parent company
      if (t.type === "income" && !t.excluded &&
          (desc.includes("seed") || desc.includes("capital") || desc.includes("lon in as co"))) {
        update = {
          excluded: true,
          exclude_reason: "capital_injection",
          category: "capital",
          notes: t.notes || "Seed capital / director's loan — excluded from trading income",
        };
      }

      // 2. PayPal verification deposits (tiny amounts from PayPal)
      if (t.type === "income" && !t.excluded && amount <= 0.05 &&
          (desc.includes("paypal") || desc.includes("verification"))) {
        update = {
          excluded: true,
          exclude_reason: "verification_deposit",
          notes: t.notes || "PayPal verification deposit — not real revenue",
        };
      }

      // 3. Inter-account transfers: Monzo→PayPal (expense side)
      if (t.type === "expense" && !t.excluded && t.source === "bank" &&
          desc.includes("paypal") && !desc.includes("failed") && !desc.includes("author")) {
        update = {
          excluded: true,
          exclude_reason: "inter_account_transfer",
          category: "transfer",
          notes: t.notes || "Inter-account transfer Monzo→PayPal — not a real expense",
        };
      }

      // 4. Failed payments — expense followed by immediate reversal
      // Detect "failed" in description on expense transactions
      if (t.type === "expense" && !t.excluded && t.source === "bank" &&
          (desc.includes("failed") || desc.includes("relates to a previous"))) {
        update = {
          excluded: true,
          exclude_reason: "failed_payment",
          notes: t.notes || "Failed payment — excluded (reversed immediately)",
        };
      }

      // 5. Reversals — income that's a reversal of a failed payment
      if (t.type === "income" && !t.excluded && t.source === "bank" &&
          (desc.includes("reversal") || desc.includes("relates to a previous") || desc.includes("failed"))) {
        update = {
          excluded: true,
          exclude_reason: "reversal",
          notes: t.notes || "Reversal of failed payment — excluded",
        };
      }

      // 6. Set correct categories for known expenses
      if (!t.excluded && t.type === "expense" && !t.category) {
        const d = desc;
        if (d.includes("supabase") || d.includes("resend") || d.includes("google") ||
            d.includes("github") || d.includes("software") || d.includes("adobe")) {
          update = { ...(update || {}), category: "subscriptions" };
        }
      }

      // 7. Set sales category for Stripe payouts
      if (!t.excluded && t.type === "income" && !t.category &&
          desc.includes("stripe")) {
        update = { ...(update || {}), category: "sales" };
      }

      if (update) {
        update.updated_at = new Date().toISOString();
        const { error: updateErr } = await req.supabase
          .from("transactions")
          .update(update)
          .eq("id", t.id)
          .eq("user_id", req.userId);

        if (updateErr) {
          fixes.push({ id: t.id, description: t.description, status: "error", error: "Update failed" });
        } else {
          fixes.push({ id: t.id, description: t.description, status: "fixed", applied: update });
        }
      }
    }

    res.json({ fixed: fixes.filter((f) => f.status === "fixed").length, total: txns.length, details: fixes });
  } catch (err) {
    next(err);
  }
});

export default router;
