import { useState, useEffect, createContext, useContext } from "react";
import { useAuth } from "./hooks/useAuth.jsx";
import { PALETTE } from "./lib/constants.js";
import api from "./lib/api.js";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Transactions from "./pages/Transactions.jsx";
import Import from "./pages/Import.jsx";
import Settings from "./pages/Settings.jsx";
import Budget from "./pages/Budget.jsx";
import Debts from "./pages/Debts.jsx";

// Workspace context — available to all child components
const WorkspaceContext = createContext({ mode: "business" });
export function useWorkspace() { return useContext(WorkspaceContext); }

const BUSINESS_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "transactions", label: "Transactions" },
  { id: "import", label: "Import" },
  { id: "settings", label: "Settings" },
];

const PERSONAL_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "budget", label: "Budget" },
  { id: "transactions", label: "Transactions" },
  { id: "debts", label: "Debts" },
  { id: "import", label: "Import" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [authPage, setAuthPage] = useState("login");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [mode, setMode] = useState(() => localStorage.getItem("dl_mode") || "business");
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (user) {
      api.profile.get().then(setProfile).catch(() => {});
    }
  }, [user]);

  const switchMode = (newMode) => {
    setMode(newMode);
    localStorage.setItem("dl_mode", newMode);
    setActiveTab("dashboard"); // reset to dashboard on switch
  };

  const tabs = mode === "personal" ? PERSONAL_TABS : BUSINESS_TABS;
  const displayName = mode === "business"
    ? (profile?.company_name || "Business")
    : "Personal";

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
    <WorkspaceContext.Provider value={{ mode }}>
      <div style={{ minHeight: "100vh", background: PALETTE.bg }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", height: 56,
          background: PALETTE.card, borderBottom: `1px solid ${PALETTE.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: PALETTE.accent, letterSpacing: -0.5 }}>DeskLedger</h1>

            {/* Mode switcher */}
            <div style={{ display: "flex", background: PALETTE.bg, borderRadius: 8, padding: 2, border: `1px solid ${PALETTE.border}` }}>
              <button
                onClick={() => switchMode("business")}
                style={{
                  padding: "5px 12px", border: "none", borderRadius: 6, cursor: "pointer",
                  fontSize: 11, fontWeight: 600,
                  background: mode === "business" ? PALETTE.accent : "transparent",
                  color: mode === "business" ? PALETTE.bg : PALETTE.textMuted,
                  transition: "all 0.2s",
                }}
              >
                Business
              </button>
              <button
                onClick={() => switchMode("personal")}
                style={{
                  padding: "5px 12px", border: "none", borderRadius: 6, cursor: "pointer",
                  fontSize: 11, fontWeight: 600,
                  background: mode === "personal" ? PALETTE.purple : "transparent",
                  color: mode === "personal" ? "#fff" : PALETTE.textMuted,
                  transition: "all 0.2s",
                }}
              >
                Personal
              </button>
            </div>

            <span style={{ fontSize: 12, color: PALETTE.textDim }}>{displayName}</span>

            {/* Divider */}
            <div style={{ width: 1, height: 24, background: PALETTE.border }} />

            {/* Tab nav */}
            <div style={{ display: "flex", gap: 2 }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "6px 14px", border: "none", borderRadius: 8, cursor: "pointer",
                    fontSize: 12, fontWeight: 500,
                    background: activeTab === tab.id ? (mode === "personal" ? PALETTE.purple + "20" : PALETTE.accent + "15") : "transparent",
                    color: activeTab === tab.id ? (mode === "personal" ? PALETTE.purple : PALETTE.accent) : PALETTE.textDim,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: PALETTE.textMuted }}>{user.email}</span>
            <button
              onClick={signOut}
              style={{ padding: "5px 12px", background: "transparent", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.textDim, fontSize: 11, cursor: "pointer" }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "budget" && <Budget />}
          {activeTab === "transactions" && <Transactions />}
          {activeTab === "debts" && <Debts />}
          {activeTab === "import" && <Import />}
          {activeTab === "settings" && <Settings onProfileUpdate={setProfile} />}
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
