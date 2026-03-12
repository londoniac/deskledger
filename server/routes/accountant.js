import { Router } from "express";
import { generateAccountantPack } from "../services/export.js";

const router = Router();

// Middleware: require accountant role
async function requireAccountant(req, res, next) {
  try {
    const { data: profile } = await req.supabase
      .from("user_profiles").select("role").eq("id", req.userId).maybeSingle();
    if (profile?.role !== "accountant") {
      return res.status(403).json({ error: "Accountant access required" });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Middleware: require access to specific client
async function requireClientAccess(req, res, next) {
  try {
    const clientId = req.params.clientId;
    const { data: link } = await req.supabase
      .from("accountant_clients")
      .select("access_level")
      .eq("accountant_id", req.userId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!link) {
      return res.status(403).json({ error: "You do not have access to this client" });
    }
    req.clientId = clientId;
    req.clientAccess = link.access_level;
    next();
  } catch (err) {
    next(err);
  }
}

router.use(requireAccountant);

// GET /api/accountant/clients — list all clients
router.get("/clients", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("accountant_clients")
      .select("client_id, access_level, created_at, client:client_id(email, company_name, company_reg)")
      .eq("accountant_id", req.userId);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// All client-specific routes require client access
router.use("/client/:clientId", requireClientAccess);

// GET /api/accountant/client/:clientId/profile
router.get("/client/:clientId/profile", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("user_profiles")
      .select("company_name, company_reg, tax_ref, year_start, year_end, tax_rate, vat_registered, vat_number, email")
      .eq("id", req.clientId)
      .maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/accountant/client/:clientId/transactions
router.get("/client/:clientId/transactions", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("transactions")
      .select("*")
      .eq("user_id", req.clientId)
      .order("date", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/accountant/client/:clientId/expenses
router.get("/client/:clientId/expenses", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("personal_expenses")
      .select("*")
      .eq("user_id", req.clientId)
      .order("date", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/accountant/client/:clientId/dividends
router.get("/client/:clientId/dividends", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("dividends")
      .select("*")
      .eq("user_id", req.clientId)
      .order("date", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/accountant/client/:clientId/dla
router.get("/client/:clientId/dla", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("directors_loan")
      .select("*")
      .eq("user_id", req.clientId)
      .order("date", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/accountant/client/:clientId/vat-returns
router.get("/client/:clientId/vat-returns", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("vat_returns")
      .select("*")
      .eq("user_id", req.clientId)
      .order("period_start", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/accountant/client/:clientId/fixed-assets
router.get("/client/:clientId/fixed-assets", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("fixed_assets")
      .select("*")
      .eq("user_id", req.clientId)
      .order("date_acquired", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/accountant/client/:clientId/export/accountant-pack
router.get("/client/:clientId/export/accountant-pack", async (req, res, next) => {
  try {
    const { blob, companyName, dateStr } = await generateAccountantPack(req.supabase, req.clientId);
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename="${companyName.replace(/[^a-zA-Z0-9]/g, "-")}-accounts-${dateStr}.zip"`);
    res.send(blob);
  } catch (err) {
    next(err);
  }
});

export default router;
