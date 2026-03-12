import { Router } from "express";
import { validate, dbError } from "../middleware/validate.js";
import { debtSchema, debtPaymentSchema } from "../schemas.js";

const router = Router();

// GET /api/debts — all debt accounts
router.get("/", async (req, res) => {
  const { data, error } = await req.supabase
    .from("debt_accounts")
    .select("*")
    .eq("user_id", req.userId)
    .order("created_at", { ascending: true });
  if (error) return dbError(res, error, "Fetch debts");
  res.json(data);
});

// POST /api/debts — create/upsert debt account
router.post("/", validate(debtSchema), async (req, res) => {
  const row = { ...req.body, user_id: req.userId, updated_at: new Date().toISOString() };
  const { data, error } = await req.supabase
    .from("debt_accounts")
    .upsert(row, { onConflict: "id,user_id" })
    .select()
    .single();
  if (error) return dbError(res, error, "Save debt");
  res.json(data);
});

// PUT /api/debts/:id — update debt account
router.put("/:id", async (req, res) => {
  const { data, error } = await req.supabase
    .from("debt_accounts")
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("user_id", req.userId)
    .select()
    .single();
  if (error) return dbError(res, error, "Update debt");
  res.json(data);
});

// DELETE /api/debts/:id
router.delete("/:id", async (req, res) => {
  const { error } = await req.supabase
    .from("debt_accounts")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return dbError(res, error, "Delete debt");
  res.json({ success: true });
});

// GET /api/debts/:id/payments — payment history for a debt
router.get("/:id/payments", async (req, res) => {
  const { data, error } = await req.supabase
    .from("debt_payments")
    .select("*")
    .eq("user_id", req.userId)
    .eq("debt_account_id", req.params.id)
    .order("date", { ascending: false });
  if (error) return dbError(res, error, "Fetch payments");
  res.json(data);
});

// POST /api/debts/:id/payments — log a payment
router.post("/:id/payments", validate(debtPaymentSchema), async (req, res) => {
  const row = { ...req.body, user_id: req.userId, debt_account_id: req.params.id };
  const { data, error } = await req.supabase
    .from("debt_payments")
    .insert(row)
    .select()
    .single();
  if (error) return dbError(res, error, "Save payment");
  res.json(data);
});

export default router;
