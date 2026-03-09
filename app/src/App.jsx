import { useState } from "react";
import { useAuth } from "./hooks/useAuth.jsx";
import { PALETTE } from "./lib/constants.js";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";

// Placeholder components — will be built out from desktop app
function Dashboard() {
  return <div style={{ padding: 20, color: PALETTE.textDim }}>Dashboard — coming next</div>;
}

function Transactions() {
  return <div style={{ padding: 20, color: PALETTE.textDim }}>Transactions — coming next</div>;
}

function Import() {
  return <div style={{ padding: 20, color: PALETTE.textDim }}>Import — coming next</div>;
}

function Settings() {
  return <div style={{ padding: 20, color: PALETTE.textDim }}>Settings — coming next</div>;
}

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "transactions", label: "Transactions" },
  { id: "import", label: "Import" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [authPage, setAuthPage] = useState("login");
  const [activeTab, setActiveTab] = useState("dashboard");

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PALETTE.bg }}>
        <div style={{ color: PALETTE.textDim, fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    if (authPage === "signup") return <Signup onSwitch={setAuthPage} />;
    return <Login onSwitch={setAuthPage} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: PALETTE.bg }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 56,
        background: PALETTE.card, borderBottom: `1px solid ${PALETTE.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: PALETTE.accent, letterSpacing: -0.5 }}>DeskLedger</h1>
          <div style={{ display: "flex", gap: 4 }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "8px 16px", border: "none", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, fontWeight: 500,
                  background: activeTab === tab.id ? PALETTE.accent + "15" : "transparent",
                  color: activeTab === tab.id ? PALETTE.accent : PALETTE.textDim,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: PALETTE.textMuted }}>{user.email}</span>
          <button
            onClick={signOut}
            style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.textDim, fontSize: 12, cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "transactions" && <Transactions />}
        {activeTab === "import" && <Import />}
        {activeTab === "settings" && <Settings />}
      </div>
    </div>
  );
}
