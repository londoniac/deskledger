import { Router } from "express";

const router = Router();

// GET /api/budgets?month=2024-10 — budgets for a month
router.get("/", async (req, res) => {
  const query = req.supabase
    .from("budgets")
    .select("*")
    .eq("user_id", req.userId);
  if (req.query.month) query.eq("month", req.query.month);
  const { data, error } = await query.order("category");
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/budgets — create or update budget
router.post("/", async (req, res) => {
  const row = { ...req.body, user_id: req.userId, updated_at: new Date().toISOString() };
  const { data, error } = await req.supabase
    .from("budgets")
    .upsert(row, { onConflict: "user_id,category,month" })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/budgets/:id
router.delete("/:id", async (req, res) => {
  const { error } = await req.supabase
    .from("budgets")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// --- Income Sources ---

// GET /api/budgets/income-sources
router.get("/income-sources", async (req, res) => {
  const { data, error } = await req.supabase
    .from("income_sources")
    .select("*")
    .eq("user_id", req.userId)
    .order("earner");
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/budgets/income-sources
router.post("/income-sources", async (req, res) => {
  const row = { ...req.body, user_id: req.userId };
  const { data, error } = await req.supabase
    .from("income_sources")
    .upsert(row, { onConflict: "id,user_id" })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/budgets/income-sources/:id
router.delete("/income-sources/:id", async (req, res) => {
  const { error } = await req.supabase
    .from("income_sources")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// --- Category Rules ---

// GET /api/budgets/rules
router.get("/rules", async (req, res) => {
  const { data, error } = await req.supabase
    .from("category_rules")
    .select("*")
    .eq("user_id", req.userId)
    .order("priority", { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/budgets/rules — save a category rule (learn from user)
router.post("/rules", async (req, res) => {
  const row = {
    user_id: req.userId,
    pattern: req.body.pattern.toLowerCase().trim(),
    category: req.body.category,
    type: req.body.type,
    priority: req.body.priority || 0,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await req.supabase
    .from("category_rules")
    .upsert(row, { onConflict: "user_id,pattern,type" })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/budgets/rules/:id
router.delete("/rules/:id", async (req, res) => {
  const { error } = await req.supabase
    .from("category_rules")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// --- Custom Categories ---

// GET /api/budgets/categories
router.get("/categories", async (req, res) => {
  const { data, error } = await req.supabase
    .from("custom_categories")
    .select("*")
    .eq("user_id", req.userId)
    .order("sort_order");
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/budgets/categories
router.post("/categories", async (req, res) => {
  const row = { ...req.body, user_id: req.userId };
  const { data, error } = await req.supabase
    .from("custom_categories")
    .upsert(row, { onConflict: "id,user_id" })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/budgets/categories/:id
router.delete("/categories/:id", async (req, res) => {
  const { error } = await req.supabase
    .from("custom_categories")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

export default router;
