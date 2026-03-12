import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { fixedAssetSchema } from "../schemas.js";

const router = Router();

// GET /api/fixed-assets
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("fixed_assets")
      .select("*")
      .eq("user_id", req.userId)
      .order("date_acquired", { ascending: false });

    if (error) throw error;

    // Compute depreciation for each asset
    const now = new Date();
    const assets = (data || []).map((a) => {
      const cost = Number(a.cost);
      const acquired = new Date(a.date_acquired);
      const disposed = a.date_disposed ? new Date(a.date_disposed) : null;
      const endDate = disposed || now;
      const yearsHeld = (endDate - acquired) / (365.25 * 24 * 60 * 60 * 1000);
      const rate = Number(a.annual_rate) / 100;
      const usefulLife = Number(a.useful_life_years);

      let totalDepreciation = 0;
      let currentValue = cost;

      if (a.depreciation_method === "straight_line") {
        const annualDep = cost / usefulLife;
        totalDepreciation = Math.min(annualDep * yearsHeld, cost);
        currentValue = cost - totalDepreciation;
      } else if (a.depreciation_method === "reducing_balance") {
        currentValue = cost * Math.pow(1 - rate, yearsHeld);
        totalDepreciation = cost - currentValue;
      } else if (a.depreciation_method === "aia") {
        // Annual Investment Allowance — 100% first year
        totalDepreciation = cost;
        currentValue = 0;
      }

      const r2 = (n) => Math.round(n * 100) / 100;

      return {
        ...a,
        total_depreciation: r2(totalDepreciation),
        current_value: r2(Math.max(currentValue, 0)),
        years_held: Math.round(yearsHeld * 10) / 10,
      };
    });

    res.json(assets);
  } catch (err) {
    next(err);
  }
});

// POST /api/fixed-assets
router.post("/", validate(fixedAssetSchema), async (req, res, next) => {
  try {
    const d = req.body;
    const row = {
      id: d.id || `fa-${Date.now()}`,
      user_id: req.userId,
      name: d.name,
      description: d.description || "",
      cost: d.cost,
      date_acquired: d.date_acquired,
      date_disposed: d.date_disposed || null,
      disposal_proceeds: d.disposal_proceeds || 0,
      category: d.category,
      depreciation_method: d.depreciation_method || "straight_line",
      useful_life_years: d.useful_life_years || 3,
      annual_rate: d.annual_rate || 33.33,
      transaction_id: d.transaction_id || null,
      notes: d.notes || "",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await req.supabase
      .from("fixed_assets")
      .upsert(row, { onConflict: "id,user_id" })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/fixed-assets/:id
router.put("/:id", async (req, res, next) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.user_id;

    const { data, error } = await req.supabase
      .from("fixed_assets")
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

// DELETE /api/fixed-assets/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from("fixed_assets")
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
