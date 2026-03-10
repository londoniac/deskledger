import { Router } from "express";
import express from "express";

const router = Router();

// GET /api/invoices
router.get("/", async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from("invoices")
      .select("*")
      .eq("user_id", req.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/invoices
router.post("/", async (req, res, next) => {
  try {
    const inv = {
      id: req.body.id,
      user_id: req.userId,
      file_name: req.body.file_name || req.body.fileName,
      file_path: req.body.file_path || null,
      file_size: req.body.file_size || req.body.fileSize || 0,
      upload_date: req.body.upload_date || req.body.uploadDate,
      invoice_date: req.body.invoice_date || req.body.invoiceDate || null,
      supplier: req.body.supplier,
      description: req.body.description || "",
      original_currency: req.body.original_currency || req.body.originalCurrency || "GBP",
      original_amount: req.body.original_amount || req.body.originalAmount || 0,
      amount_gbp: req.body.amount_gbp || req.body.amountGBP || 0,
      category: req.body.category || "subscriptions",
      transaction_id: req.body.transaction_id || req.body.transactionId || null,
      notes: req.body.notes || "",
    };

    const { data, error } = await req.supabase
      .from("invoices")
      .upsert(inv, { onConflict: "id,user_id" })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/invoices/:id
router.put("/:id", async (req, res, next) => {
  try {
    const updates = { ...req.body };
    delete updates.id;
    delete updates.user_id;

    const { data, error } = await req.supabase
      .from("invoices")
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

// DELETE /api/invoices/:id
router.delete("/:id", async (req, res, next) => {
  try {
    // Get file path before deleting
    const { data: inv } = await req.supabase
      .from("invoices")
      .select("file_path")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();

    // Delete from storage if file exists
    if (inv?.file_path) {
      await req.supabase.storage.from("documents").remove([inv.file_path]);
    }

    const { error } = await req.supabase
      .from("invoices")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/invoices/:id/upload — upload invoice file (PDF, image)
router.post("/:id/upload", express.raw({ type: ["application/pdf", "image/*"], limit: "10mb" }), async (req, res, next) => {
  try {
    const invoiceId = req.params.id;
    const contentType = req.headers["content-type"] || "application/octet-stream";
    const fileName = req.headers["x-file-name"] || `invoice-${Date.now()}`;

    const extMap = {
      "application/pdf": ".pdf",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
    };
    const ext = extMap[contentType] || "";
    const storagePath = `${req.userId}/invoices/${invoiceId}${ext}`;

    // Remove old file if exists
    const { data: existing } = await req.supabase
      .from("invoices")
      .select("file_path")
      .eq("id", invoiceId)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (existing?.file_path) {
      await req.supabase.storage.from("documents").remove([existing.file_path]);
    }

    // Upload to Supabase Storage
    const { error: uploadErr } = await req.supabase.storage
      .from("documents")
      .upload(storagePath, req.body, {
        contentType,
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    // Update invoice record with file path
    const { data, error } = await req.supabase
      .from("invoices")
      .update({
        file_path: storagePath,
        file_name: fileName,
        file_size: req.body.length || 0,
      })
      .eq("id", invoiceId)
      .eq("user_id", req.userId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices/:id/file — presigned download URL
router.get("/:id/file", async (req, res, next) => {
  try {
    const { data: inv, error } = await req.supabase
      .from("invoices")
      .select("file_path, file_name")
      .eq("id", req.params.id)
      .eq("user_id", req.userId)
      .single();

    if (error || !inv?.file_path) {
      return res.status(404).json({ error: "File not found" });
    }

    const { data, error: storageError } = await req.supabase
      .storage.from("documents")
      .createSignedUrl(inv.file_path, 3600); // 1 hour

    if (storageError) throw storageError;
    res.json({ url: data.signedUrl, fileName: inv.file_name });
  } catch (err) {
    next(err);
  }
});

export default router;
