import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { PALETTE } from "../lib/constants.js";

export default function Login({ onSwitch }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PALETTE.bg }}>
      <div style={{ width: 400, padding: 40, background: PALETTE.card, borderRadius: 16, border: `1px solid ${PALETTE.border}` }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, color: PALETTE.text }}>DeskLedger</h1>
        <p style={{ fontSize: 14, color: PALETTE.textMuted, marginBottom: 32 }}>UK Business Accounting</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: PALETTE.textDim, marginBottom: 6, fontWeight: 500 }}>Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              style={{ width: "100%", padding: "10px 14px", background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 8, color: PALETTE.text, fontSize: 14, outline: "none" }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, color: PALETTE.textDim, marginBottom: 6, fontWeight: 500 }}>Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              style={{ width: "100%", padding: "10px 14px", background: PALETTE.bg, border: `1px solid ${PALETTE.border}`, borderRadius: 8, color: PALETTE.text, fontSize: 14, outline: "none" }}
            />
          </div>

          {error && <div style={{ padding: "10px 14px", background: PALETTE.dangerDim, borderRadius: 8, color: PALETTE.danger, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <button
            type="submit" disabled={loading}
            style={{ width: "100%", padding: "12px", background: PALETTE.accent, color: PALETTE.bg, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: PALETTE.textMuted }}>
          Don't have an account?{" "}
          <span onClick={() => onSwitch("signup")} style={{ color: PALETTE.accent, cursor: "pointer", fontWeight: 500 }}>Sign up</span>
        </div>
      </div>
    </div>
  );
}
