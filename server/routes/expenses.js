import { Router } from "express";
import express from "express";
import { validate } from "../middleware/validate.js";
import { expenseSchema } from "../schemas.js";

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
router.post("/", validate(expenseSchema), async (req, res, next) => {
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
      original_amount: req.body.original_amount || null,
      original_currency: req.body.original_currency || null,
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

// POST /api/expenses/:id/upload — upload receipt file (PDF, image)
router.post("/:id/upload", express.raw({ type: ["application/pdf", "image/*"], limit: "10mb" }), async (req, res, next) => {
  try {
    const expenseId = req.params.id;
    const contentType = req.headers["content-type"] || "application/octet-stream";
    const fileName = req.headers["x-file-name"] || `receipt-${Date.now()}`;

    // Determine extension from content type
    const extMap = {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
    };
    const ext = extMap[contentType] || "";
    const storagePath = `${req.userId}/expenses/${expenseId}${ext}`;

    // Remove old file if exists
    const { data: existing } = await req.supabase
      .from("personal_expenses")
      .select("receipt_path")
      .eq("id", expenseId)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (existing?.receipt_path) {
      await req.supabase.storage.from("documents").remove([existing.receipt_path]);
    }

    // Upload to Supabase Storage
    const { error: uploadErr } = await req.supabase.storage
      .from("documents")
      .upload(storagePath, req.body, {
        contentType,
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    // Update expense record with file path
    const { data, error } = await req.supabase
      .from("personal_expenses")
      .update({
        receipt_path: storagePath,
        receipt_name: fileName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .eq("user_id", req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/expenses/:id/file — presigned download URL for receipt
router.get("/:id/file", async (req, res, next) => {
  try {
    const { data: exp, error } = await req.supabase
      .from("personal_expenses")
      .select("receipt_path, receipt_name")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (error || !exp?.receipt_path) {
      return res.status(404).json({ error: "No receipt file found" });
    }

    const { data, error: storageError } = await req.supabase
      .storage.from("documents")
      .createSignedUrl(exp.receipt_path, 3600);

    if (storageError) throw storageError;
    res.json({ url: data.signedUrl, fileName: exp.receipt_name });
  } catch (err) {
    next(err);
  }
});

export default router;
