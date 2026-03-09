import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { PALETTE } from "../lib/constants.js";

export default function Signup({ onSwitch }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PALETTE.bg }}>
        <div style={{ width: 400, padding: 40, background: PALETTE.card, borderRadius: 16, border: `1px solid ${PALETTE.border}`, textAlign: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: PALETTE.accent, marginBottom: 12 }}>Check your email</h2>
          <p style={{ fontSize: 14, color: PALETTE.textDim, marginBottom: 24 }}>
            We've sent a confirmation link to <strong style={{ color: PALETTE.text }}>{email}</strong>. Click it to activate your account.
          </p>
          <span onClick={() => onSwitch("login")} style={{ color: PALETTE.accent, cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Back to login</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PALETTE.bg }}>
      <div style={{ width: 400, padding: 40, background: PALETTE.card, borderRadius: 16, border: `1px solid ${PALETTE.border}` }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, color: PALETTE.text }}>Create Account</h1>
        <p style={{ fontSize: 14, color: PALETTE.textMuted, marginBottom: 32 }}>14-day free trial. No card required.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: PALETTE.textDim, marginBottom: 6, fontWeight: 500 }}>Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              style={{ width: "100%", padding: "10px 14px", background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 8, color: PALETTE.text, fontSize: 14, outline: "none" }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: PALETTE.textDim, marginBottom: 6, fontWeight: 500 }}>Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              style={{ width: "100%", padding: "10px 14px", background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 8, color: PALETTE.text, fontSize: 14, outline: "none" }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, color: PALETTE.textDim, marginBottom: 6, fontWeight: 500 }}>Confirm Password</label>
            <input
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              style={{ width: "100%", padding: "10px 14px", background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 8, color: PALETTE.text, fontSize: 14, outline: "none" }}
            />
          </div>

          {error && <div style={{ padding: "10px 14px", background: PALETTE.dangerDim, borderRadius: 8, color: PALETTE.danger, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <button
            type="submit" disabled={loading}
            style={{ width: "100%", padding: "12px", background: PALETTE.accent, color: PALETTE.bg, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Creating account..." : "Start Free Trial"}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: PALETTE.textMuted }}>
          Already have an account?{" "}
          <span onClick={() => onSwitch("login")} style={{ color: PALETTE.accent, cursor: "pointer", fontWeight: 500 }}>Sign in</span>
        </div>
      </div>
    </div>
  );
}
