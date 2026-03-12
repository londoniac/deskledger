import { useState, useEffect } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../lib/constants.js";
import { Card, Button, Badge, Spinner } from "../components/ui.jsx";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "expenses", label: "Expenses" },
  { id: "dividends", label: "Dividends" },
  { id: "dla", label: "DLA" },
  { id: "assets", label: "Assets" },
  { id: "vat", label: "VAT" },
];

function fmt(n) {
  return "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AccountantClientView({ clientId, onBack }) {
  const [tab, setTab] = useState("overview");
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.accountant.getClientProfile(clientId)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  const downloadPack = async () => {
    setDownloading(true);
    try {
      const url = api.accountant.clientAccountantPackUrl(clientId);
      await api.export.download(`/api/accountant/client/${clientId}/export/accountant-pack`, `${(profile?.company_name || "client").replace(/[^a-zA-Z0-9]/g, "-")}-accounts.zip`);
    } catch (e) {
      alert("Download failed: " + e.message);
    }
    setDownloading(false);
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="ghost" onClick={onBack} style={{ fontSize: 13, padding: "6px 10px" }}>
            ← Back to Clients
          </Button>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text }}>
            {profile?.company_name || "Client"}
          </h2>
          <Badge color={PALETTE.blue}>Read-only</Badge>
        </div>
        <Button onClick={downloadPack} disabled={downloading}>
          {downloading ? "Downloading..." : "Download Accountant Pack"}
        </Button>
      </div>

      {/* Company info */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, fontSize: 13 }}>
          <div>
            <div style={{ color: PALETTE.textMuted, fontSize: 11, marginBottom: 2 }}>Email</div>
            <div style={{ color: PALETTE.text }}>{profile?.email}</div>
          </div>
          <div>
            <div style={{ color: PALETTE.textMuted, fontSize: 11, marginBottom: 2 }}>Company Reg</div>
            <div style={{ color: PALETTE.text }}>{profile?.company_reg || "—"}</div>
          </div>
          <div>
            <div style={{ color: PALETTE.textMuted, fontSize: 11, marginBottom: 2 }}>Tax Ref</div>
            <div style={{ color: PALETTE.text }}>{profile?.tax_ref || "—"}</div>
          </div>
          <div>
            <div style={{ color: PALETTE.textMuted, fontSize: 11, marginBottom: 2 }}>Year</div>
            <div style={{ color: PALETTE.text }}>{profile?.year_start || "—"} to {profile?.year_end || "—"}</div>
          </div>
        </div>
      </Card>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "6px 14px", border: "none", borderRadius: 8, cursor: "pointer",
              fontSize: 12, fontWeight: 500,
              background: tab === t.id ? PALETTE.accent + "15" : "transparent",
              color: tab === t.id ? PALETTE.accent : PALETTE.textDim,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab clientId={clientId} />}
      {tab === "transactions" && <TransactionsTab clientId={clientId} />}
      {tab === "expenses" && <ExpensesTab clientId={clientId} />}
      {tab === "dividends" && <DividendsTab clientId={clientId} />}
      {tab === "dla" && <DLATab clientId={clientId} />}
      {tab === "assets" && <AssetsTab clientId={clientId} />}
      {tab === "vat" && <VATTab clientId={clientId} />}
    </div>
  );
}

function OverviewTab({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.accountant.getClientTransactions(clientId),
      api.accountant.getClientExpenses(clientId),
      api.accountant.getClientDividends(clientId),
      api.accountant.getClientDLA(clientId),
      api.accountant.getClientFixedAssets(clientId),
    ]).then(([txns, exp, divs, dla, assets]) => {
      const active = txns.filter((t) => !t.excluded);
      const income = active.filter((t) => t.type === "income" && t.category !== "transfer" && t.category !== "capital")
        .reduce((s, t) => s + Number(t.amount), 0);
      const expenses = active.filter((t) => t.type === "expense" && t.category !== "transfer")
        .reduce((s, t) => s + Number(t.amount), 0);
      let dlaBalance = 0;
      dla.forEach((e) => {
        if (e.direction === "to_director") dlaBalance += Number(e.amount);
        else dlaBalance -= Number(e.amount);
      });
      setData({
        totalTransactions: txns.length,
        income, expenses,
        profit: income - expenses,
        totalDividends: divs.reduce((s, d) => s + Number(d.amount), 0),
        dlaBalance,
        totalAssets: assets.reduce((s, a) => s + Number(a.cost), 0),
        expenseCount: exp.length,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;
  if (!data) return <div style={{ color: PALETTE.textMuted }}>Failed to load</div>;

  const stats = [
    { label: "Trading Income", value: fmt(data.income), color: PALETTE.accent },
    { label: "Total Expenses", value: fmt(data.expenses), color: PALETTE.expense },
    { label: "Net Profit", value: fmt(data.profit), color: data.profit >= 0 ? PALETTE.accent : PALETTE.expense },
    { label: "Dividends Paid", value: fmt(data.totalDividends), color: PALETTE.purple },
    { label: "DLA Balance", value: fmt(Math.abs(data.dlaBalance)), color: data.dlaBalance > 0 ? PALETTE.warning : PALETTE.accent },
    { label: "Fixed Assets", value: fmt(data.totalAssets), color: PALETTE.blue },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {stats.map((s) => (
        <Card key={s.label}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>{s.label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "JetBrains Mono, monospace" }}>{s.value}</div>
        </Card>
      ))}
    </div>
  );
}

function ReadOnlyTable({ headers, rows, emptyMessage }) {
  if (rows.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "24px 0", color: PALETTE.textMuted, fontSize: 13 }}>
          {emptyMessage || "No records"}
        </div>
      </Card>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={{
                padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600,
                color: PALETTE.textMuted, borderBottom: `1px solid ${PALETTE.border}`,
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: "8px 12px", fontSize: 13, color: PALETTE.text,
                  borderBottom: `1px solid ${PALETTE.border}`,
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accountant.getClientTransactions(clientId)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;

  const catLabel = (id) => {
    const cat = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.id === id);
    return cat?.label || id;
  };

  return (
    <ReadOnlyTable
      headers={["Date", "Description", "Type", "Amount", "Category", "Excluded"]}
      rows={data.slice(0, 200).map((t) => [
        new Date(t.date).toLocaleDateString("en-GB"),
        t.description?.slice(0, 60),
        t.type,
        fmt(t.amount),
        catLabel(t.category),
        t.excluded ? "Yes" : "",
      ])}
      emptyMessage="No transactions"
    />
  );
}

function ExpensesTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accountant.getClientExpenses(clientId)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;

  return (
    <ReadOnlyTable
      headers={["Date", "Description", "Amount", "Category", "Supplier", "Status"]}
      rows={data.map((e) => {
        const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
        return [
          new Date(e.date).toLocaleDateString("en-GB"),
          e.description?.slice(0, 60),
          fmt(e.amount),
          cat?.label || e.category,
          e.supplier,
          e.status,
        ];
      })}
      emptyMessage="No expenses"
    />
  );
}

function DividendsTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accountant.getClientDividends(clientId)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;

  return (
    <ReadOnlyTable
      headers={["Date", "Shareholder", "Amount", "Tax Year", "Voucher No"]}
      rows={data.map((d) => [
        new Date(d.date).toLocaleDateString("en-GB"),
        d.shareholder,
        fmt(d.amount),
        d.tax_year,
        d.voucher_no || "",
      ])}
      emptyMessage="No dividends"
    />
  );
}

function DLATab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accountant.getClientDLA(clientId)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;

  let balance = 0;
  const rows = data.map((e) => {
    if (e.direction === "to_director") balance += Number(e.amount);
    else balance -= Number(e.amount);
    return [
      new Date(e.date).toLocaleDateString("en-GB"),
      e.description,
      e.direction === "to_director" ? "To Director" : "To Company",
      fmt(e.amount),
      fmt(balance),
    ];
  });

  return (
    <ReadOnlyTable
      headers={["Date", "Description", "Direction", "Amount", "Balance"]}
      rows={rows}
      emptyMessage="No DLA entries"
    />
  );
}

function AssetsTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accountant.getClientFixedAssets(clientId)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;

  return (
    <ReadOnlyTable
      headers={["Name", "Category", "Date Acquired", "Cost", "Depreciation", "Useful Life"]}
      rows={data.map((a) => [
        a.name,
        a.category,
        new Date(a.date_acquired).toLocaleDateString("en-GB"),
        fmt(a.cost),
        a.depreciation_method,
        `${a.useful_life_years} years`,
      ])}
      emptyMessage="No fixed assets"
    />
  );
}

function VATTab({ clientId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accountant.getClientVATReturns(clientId)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner />;

  return (
    <ReadOnlyTable
      headers={["Period", "Status", "Box 1 (Sales VAT)", "Box 4 (Reclaimed)", "Box 5 (Net)", "Box 6 (Sales)"]}
      rows={data.map((v) => [
        `${new Date(v.period_start).toLocaleDateString("en-GB")} - ${new Date(v.period_end).toLocaleDateString("en-GB")}`,
        v.status,
        fmt(v.box1_vat_due_sales),
        fmt(v.box4_vat_reclaimed),
        fmt(v.box5_net_vat),
        fmt(v.box6_total_sales),
      ])}
      emptyMessage="No VAT returns"
    />
  );
}
