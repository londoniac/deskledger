import { Router } from "express";

const router = Router();

// GET /api/invitations — list invitations (sent for owners, received for accountants)
router.get("/", async (req, res, next) => {
  try {
    const { data: profile } = await req.supabase
      .from("user_profiles").select("role, email").eq("id", req.userId).maybeSingle();

    if (profile?.role === "accountant") {
      // Accountants see invitations sent to their email
      const { data, error } = await req.supabase
        .from("invitations")
        .select("*, from_profile:from_user_id(company_name, email)")
        .eq("to_email", profile.email)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return res.json(data || []);
    }

    // Business owners see invitations they sent
    const { data, error } = await req.supabase
      .from("invitations")
      .select("*")
      .eq("from_user_id", req.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/invitations — business owner invites accountant by email
router.post("/", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Check not inviting self
    const { data: profile } = await req.supabase
      .from("user_profiles").select("email").eq("id", req.userId).maybeSingle();
    if (profile?.email === email) {
      return res.status(400).json({ error: "You cannot invite yourself" });
    }

    // Check no existing pending invitation to this email
    const { data: existing } = await req.supabase
      .from("invitations")
      .select("id")
      .eq("from_user_id", req.userId)
      .eq("to_email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return res.status(400).json({ error: "An invitation to this email is already pending" });
    }

    const { data, error } = await req.supabase
      .from("invitations")
      .insert({
        from_user_id: req.userId,
        to_email: email,
        role: "accountant",
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/invitations/:id/accept — accountant accepts invitation
router.put("/:id/accept", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get the invitation
    const { data: inv, error: fetchErr } = await req.supabase
      .from("invitations")
      .select("*")
      .eq("id", id)
      .eq("status", "pending")
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!inv) return res.status(404).json({ error: "Invitation not found or already handled" });

    // Verify this user's email matches the invitation
    const { data: profile } = await req.supabase
      .from("user_profiles").select("email, role").eq("id", req.userId).maybeSingle();
    if (profile?.email !== inv.to_email) {
      return res.status(403).json({ error: "This invitation is not for you" });
    }

    // Update invitation status
    const { error: updateErr } = await req.supabase
      .from("invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", id);
    if (updateErr) throw updateErr;

    // Create accountant_clients relationship
    const { error: linkErr } = await req.supabase
      .from("accountant_clients")
      .upsert({
        accountant_id: req.userId,
        client_id: inv.from_user_id,
        access_level: "readonly",
      });
    if (linkErr) throw linkErr;

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/invitations/:id/decline — accountant declines invitation
router.put("/:id/decline", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await req.supabase
      .from("invitations")
      .update({ status: "declined" })
      .eq("id", id)
      .eq("status", "pending");
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/invitations/:id — business owner revokes invitation
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get the invitation to find the accountant
    const { data: inv } = await req.supabase
      .from("invitations")
      .select("*")
      .eq("id", id)
      .eq("from_user_id", req.userId)
      .maybeSingle();

    if (!inv) return res.status(404).json({ error: "Invitation not found" });

    // Update to revoked
    const { error } = await req.supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) throw error;

    // If it was accepted, also remove the accountant_clients link
    if (inv.status === "accepted") {
      // Find the accountant by email
      const { data: accountant } = await req.supabase
        .from("user_profiles")
        .select("id")
        .eq("email", inv.to_email)
        .eq("role", "accountant")
        .maybeSingle();
      if (accountant) {
        await req.supabase
          .from("accountant_clients")
          .delete()
          .eq("accountant_id", accountant.id)
          .eq("client_id", req.userId);
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
