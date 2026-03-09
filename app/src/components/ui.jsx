import { PALETTE } from "../lib/constants.js";

export function Card({ children, style }) {
  return (
    <div style={{
      background: PALETTE.card, border: `1px solid ${PALETTE.border}`,
      borderRadius: 12, padding: 24, ...style,
    }}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 180, background: PALETTE.card,
      border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: 20,
    }}>
      <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || PALETTE.text, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: PALETTE.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Badge({ children, color }) {
  const c = color || PALETTE.accent;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 22,
      fontSize: 11, fontWeight: 600, textTransform: "uppercase",
      background: c + "18", color: c,
    }}>
      {children}
    </span>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, style }) {
  const styles = {
    primary: { background: PALETTE.accent, color: PALETTE.bg, border: "none" },
    danger: { background: PALETTE.danger, color: "#fff", border: "none" },
    ghost: { background: "transparent", color: PALETTE.textDim, border: "none" },
    outline: { background: "transparent", color: PALETTE.textDim, border: `1px solid ${PALETTE.border}` },
  };
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        ...styles[variant], ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Select({ value, onChange, options, style }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px 12px", background: PALETTE.bg, color: PALETTE.text,
        border: `1px solid ${PALETTE.border}`, borderRadius: 6, fontSize: 13,
        outline: "none", ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Input({ type = "text", value, onChange, placeholder, style, ...props }) {
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{
        width: "100%", padding: "8px 12px", background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`, borderRadius: 6,
        color: PALETTE.text, fontSize: 13, outline: "none", ...style,
      }}
      {...props}
    />
  );
}

export function Label({ children }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: PALETTE.textDim, marginBottom: 6, fontWeight: 500 }}>
      {children}
    </label>
  );
}

export function ErrorMsg({ message }) {
  if (!message) return null;
  return (
    <div style={{ padding: "10px 14px", background: PALETTE.dangerDim, borderRadius: 8, color: PALETTE.danger, fontSize: 13, marginBottom: 16 }}>
      {message}
    </div>
  );
}

export function SuccessMsg({ message }) {
  if (!message) return null;
  return (
    <div style={{ padding: "10px 14px", background: PALETTE.accentDim, borderRadius: 8, color: PALETTE.accent, fontSize: 13, marginBottom: 16 }}>
      {message}
    </div>
  );
}

export function Spinner() {
  return <div style={{ color: PALETTE.textDim, fontSize: 14 }}>Loading...</div>;
}
