import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { profileUpdateSchema } from "../schemas.js";

const router = Router();

// GET /api/profile
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("user_profiles")
      .select("*")
      .eq("id", req.userId)
      .maybeSingle();

    if (error) throw error;

    // Auto-create profile if it doesn't exist (e.g. trigger didn't fire)
    if (!data) {
      const { data: newProfile, error: createErr } = await req.supabase
        .from("user_profiles")
        .insert({ id: req.userId, email: req.user.email || "" })
        .select()
        .single();
      if (createErr) throw createErr;
      return res.json(newProfile);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/profile
router.put("/", validate(profileUpdateSchema), async (req, res, next) => {
  try {
    const allowed = [
      "company_name", "company_reg", "tax_ref", "year_start", "year_end",
      "seed_money", "tax_rate", "vat_registered", "vat_number",
      "vat_scheme", "vat_flat_rate", "vat_registration_date", "vat_quarter_start",
      "paypal_sandbox",
      "account_type",
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await req.supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
