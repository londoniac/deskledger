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
import Dividends from "./pages/Dividends.jsx";
import DLA from "./pages/DLA.jsx";
import VATReturns from "./pages/VATReturns.jsx";
import FixedAssets from "./pages/FixedAssets.jsx";
import Reports from "./pages/Reports.jsx";
import Expenses from "./pages/Expenses.jsx";
import PayPalPage from "./pages/PayPal.jsx";
import AccountantDashboard from "./pages/AccountantDashboard.jsx";
import AccountantClientView from "./pages/AccountantClientView.jsx";

// Workspace context — available to all child components
const WorkspaceContext = createContext({ mode: "business" });
export function useWorkspace() { return useContext(WorkspaceContext); }

const BUSINESS_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "transactions", label: "Transactions" },
  { id: "expenses", label: "Expenses" },
  { id: "import", label: "Import" },
  { id: "dividends", label: "Dividends" },
  { id: "dla", label: "DLA" },
  { id: "assets", label: "Assets" },
  { id: "vat", label: "VAT" },
  { id: "reports", label: "Tax & Reports" },
  { id: "settings", label: "Settings" },
];

const ACCOUNTANT_TABS = [
  { id: "clients", label: "Clients" },
];

// TEMPORARILY HIDDEN — personal tabs will return when personal mode is re-enabled
// const PERSONAL_TABS = [
//   { id: "dashboard", label: "Dashboard" },
//   { id: "budget", label: "Budget" },
//   { id: "transactions", label: "Transactions" },
//   { id: "debts", label: "Debts" },
//   { id: "import", label: "Import" },
//   { id: "settings", label: "Settings" },
// ];

export default function App() {
  const { user, loading, signOut, mfaRequired } = useAuth();
  const [authPage, setAuthPage] = useState("login");
  const [activeTab, setActiveTab] = useState("dashboard");
  const mode = "business";
  const [profile, setProfile] = useState(null);
  const [paypalConnected, setPaypalConnected] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);

  const isAccountant = profile?.role === "accountant";

  useEffect(() => {
    if (user && !mfaRequired) {
      api.profile.get().then((p) => {
        setProfile(p);
        // Set default tab based on role
        if (p.role === "accountant") {
          setActiveTab("clients");
        }
      }).catch(() => {});
      api.paypal.hasCredentials()
        .then((r) => setPaypalConnected(r.hasCredentials))
        .catch(() => {});
    }
  }, [user, mfaRequired]);

  const tabs = isAccountant
    ? ACCOUNTANT_TABS
    : paypalConnected
      ? [...BUSINESS_TABS.slice(0, 3), { id: "paypal", label: "PayPal" }, ...BUSINESS_TABS.slice(3)]
      : BUSINESS_TABS;

  const displayName = isAccountant
    ? "Accountant"
    : profile?.company_name || "Business";

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

  // MFA gate — user is logged in but hasn't verified 2FA yet
  if (mfaRequired) {
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

            <span style={{ fontSize: 12, color: PALETTE.textDim }}>{displayName}</span>

            {/* Divider */}
            <div style={{ width: 1, height: 24, background: PALETTE.border }} />

            {/* Tab nav */}
            <div style={{ display: "flex", gap: 2 }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === "clients") setSelectedClientId(null);
                  }}
                  style={{
                    padding: "6px 14px", border: "none", borderRadius: 8, cursor: "pointer",
                    fontSize: 12, fontWeight: 500,
                    background: activeTab === tab.id ? PALETTE.accent + "15" : "transparent",
                    color: activeTab === tab.id ? PALETTE.accent : PALETTE.textDim,
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
          {isAccountant ? (
            // Accountant views
            <>
              {activeTab === "clients" && !selectedClientId && (
                <AccountantDashboard onSelectClient={(id) => setSelectedClientId(id)} />
              )}
              {activeTab === "clients" && selectedClientId && (
                <AccountantClientView clientId={selectedClientId} onBack={() => setSelectedClientId(null)} />
              )}
            </>
          ) : (
            // Business/personal views
            <>
              {activeTab === "dashboard" && <Dashboard />}
              {activeTab === "budget" && <Budget />}
              {activeTab === "transactions" && <Transactions />}
              {activeTab === "debts" && <Debts />}
              {activeTab === "import" && <Import />}
              {activeTab === "paypal" && <PayPalPage />}
              {activeTab === "expenses" && <Expenses />}
              {activeTab === "dividends" && <Dividends />}
              {activeTab === "dla" && <DLA />}
              {activeTab === "assets" && <FixedAssets />}
              {activeTab === "vat" && <VATReturns />}
              {activeTab === "reports" && <Reports />}
              {activeTab === "settings" && <Settings onProfileUpdate={setProfile} onPaypalConnected={() => setPaypalConnected(true)} />}
            </>
          )}
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
