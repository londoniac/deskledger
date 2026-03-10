import { Router } from "express";

const router = Router();

// GET /api/dla — returns entries + computed running balance
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("directors_loan")
      .select("*")
      .eq("user_id", req.userId)
      .order("date", { ascending: true });

    if (error) throw error;

    // Compute running balance: to_director increases balance (director owes company),
    // to_company decreases it (director repaying)
    let balance = 0;
    const entries = (data || []).map((entry) => {
      if (entry.direction === "to_director") {
        balance += Number(entry.amount);
      } else {
        balance -= Number(entry.amount);
      }
      return { ...entry, running_balance: Math.round(balance * 100) / 100 };
    });

    // Return in reverse chronological order for display, but balance computed chronologically
    entries.reverse();

    // Year-end S455 check
    const closingBalance = balance;
    const s455_liable = closingBalance > 0;
    const s455_amount = s455_liable ? Math.round(closingBalance * 0.3375 * 100) / 100 : 0;

    res.json({
      entries,
      summary: {
        closing_balance: closingBalance,
        s455_liable,
        s455_amount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/dla
router.post("/", async (req, res, next) => {
  try {
    const d = req.body;
    const row = {
      id: d.id || `dla-${Date.now()}`,
      user_id: req.userId,
      date: d.date,
      amount: d.amount,
      direction: d.direction,
      description: d.description,
      category: d.category || "",
      transaction_id: d.transaction_id || null,
      notes: d.notes || "",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await req.supabase
      .from("directors_loan")
      .upsert(row, { onConflict: "id,user_id" })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/dla/:id
router.put("/:id", async (req, res, next) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;

    const { data, error } = await req.supabase
      .from("directors_loan")
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

// DELETE /api/dla/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from("directors_loan")
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
