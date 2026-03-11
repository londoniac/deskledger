import { Router } from "express";
import crypto from "crypto";
import { syncTransactions, testConnection } from "../services/paypal.js";

const router = Router();
const ALGO = "aes-256-gcm";
const ENC_KEY = process.env.ENCRYPTION_KEY;

function encrypt(text) {
  if (!ENC_KEY || !text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, Buffer.from(ENC_KEY, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(encoded) {
  if (!ENC_KEY || !encoded) return null;
  const [ivHex, tagHex, encrypted] = encoded.split(":");
  const decipher = crypto.createDecipheriv(ALGO, Buffer.from(ENC_KEY, "hex"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Check if user has PayPal addon
async function checkAddon(req, res, next) {
  const { data: profile } = await req.supabase
    .from("user_profiles")
    .select("subscription_status, subscription_plan, addons")
    .eq("id", req.userId)
    .single();

  if (!profile) return res.status(404).json({ error: "Profile not found" });

  const status = profile.subscription_status;
  const addons = profile.addons || [];
  const hasPaypal = addons.includes("paypal") || status === "trial" || status === "admin";

  if (!hasPaypal) {
    return res.status(403).json({ error: "PayPal addon required. Upgrade your subscription to enable PayPal sync." });
  }

  next();
}

// POST /api/paypal/test — test PayPal credentials
router.post("/test", checkAddon, async (req, res) => {
  const { client_id, client_secret, sandbox } = req.body;
  try {
    await testConnection(client_id, client_secret, sandbox || false);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// POST /api/paypal/save-credentials — encrypt and store PayPal credentials
router.post("/save-credentials", checkAddon, async (req, res) => {
  const { client_id, client_secret, sandbox } = req.body;

  const encId = encrypt(client_id);
  const encSecret = encrypt(client_secret);

  const { error } = await req.supabase
    .from("user_profiles")
    .update({
      paypal_client_id_enc: encId,
      paypal_secret_enc: encSecret,
      paypal_sandbox: sandbox || false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", req.userId);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/paypal/has-credentials — check if credentials are stored
router.get("/has-credentials", checkAddon, async (req, res) => {
  const { data: profile } = await req.supabase
    .from("user_profiles")
    .select("paypal_client_id_enc, paypal_sandbox")
    .eq("id", req.userId)
    .single();

  res.json({
    hasCredentials: !!profile?.paypal_client_id_enc,
    sandbox: profile?.paypal_sandbox || false,
  });
});

// POST /api/paypal/sync — sync transactions from PayPal API
router.post("/sync", checkAddon, async (req, res) => {
  const { start_date, end_date } = req.body;

  // Get stored credentials
  const { data: profile } = await req.supabase
    .from("user_profiles")
    .select("paypal_client_id_enc, paypal_secret_enc, paypal_sandbox")
    .eq("id", req.userId)
    .single();

  if (!profile?.paypal_client_id_enc || !profile?.paypal_secret_enc) {
    return res.status(400).json({ error: "PayPal credentials not configured. Go to Settings to add them." });
  }

  const clientId = decrypt(profile.paypal_client_id_enc);
  const clientSecret = decrypt(profile.paypal_secret_enc);

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: "Failed to decrypt PayPal credentials" });
  }

  try {
    const result = await syncTransactions(clientId, clientSecret, start_date, end_date, profile.paypal_sandbox);

    // Get existing PayPal transaction IDs to deduplicate
    const { data: existing } = await req.supabase
      .from("paypal_transactions")
      .select("paypal_id")
      .eq("user_id", req.userId);

    const existingIds = new Set((existing || []).map((t) => t.paypal_id));
    const newTxns = result.transactions.filter((t) => !existingIds.has(t.paypal_id));

    // Insert new transactions
    if (newTxns.length > 0) {
      const rows = newTxns.map((t) => ({
        id: `pp-${t.paypal_id || Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: req.userId,
        ...t,
      }));

      const { error } = await req.supabase
        .from("paypal_transactions")
        .upsert(rows, { onConflict: "id,user_id" });

      if (error) return res.status(400).json({ error: error.message });
    }

    res.json({
      success: true,
      totalFetched: result.totalRaw,
      kept: result.transactions.length,
      skipped: result.skipped,
      currencyDupes: result.currencyDupes,
      notifDupes: result.notifDupes || 0,
      newImported: newTxns.length,
      alreadyExisted: result.transactions.length - newTxns.length,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/paypal/transactions — get all PayPal transactions
router.get("/transactions", checkAddon, async (req, res) => {
  const { data, error } = await req.supabase
    .from("paypal_transactions")
    .select("*")
    .eq("user_id", req.userId)
    .order("date", { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/paypal/transactions — clear all PayPal transactions
router.delete("/transactions", checkAddon, async (req, res) => {
  const { error, count } = await req.supabase
    .from("paypal_transactions")
    .delete({ count: "exact" })
    .eq("user_id", req.userId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, deleted: count });
});

// DELETE /api/paypal/transactions/:id
router.delete("/transactions/:id", checkAddon, async (req, res) => {
  const { error } = await req.supabase
    .from("paypal_transactions")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.userId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

export default router;
