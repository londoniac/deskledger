import { useState, useEffect } from "react";
import api from "../lib/api.js";
import { PALETTE } from "../lib/constants.js";
import { Card, Button, Input, Label, Select, ErrorMsg, SuccessMsg, Spinner } from "../components/ui.jsx";
import { useWorkspace } from "../App.jsx";

const TAX_RATES = [
  { value: "19", label: "19% (Small profits)" },
  { value: "25", label: "25% (Main rate)" },
  { value: "26.5", label: "26.5% (2026+)" },
];

function Toggle({ value, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11, cursor: "pointer",
          background: value ? PALETTE.accent : PALETTE.border,
          position: "relative", transition: "background 0.2s",
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 9, background: "#fff",
          position: "absolute", top: 2, left: value ? 20 : 2, transition: "left 0.2s",
        }} />
      </div>
      <span style={{ fontSize: 13, color: PALETTE.textDim }}>{label}</span>
    </label>
  );
}

export default function Settings({ onProfileUpdate }) {
  const { mode } = useWorkspace();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [form, setForm] = useState({
    company_name: "",
    company_reg: "",
    tax_ref: "",
    year_start: "",
    year_end: "",
    seed_money: "0",
    tax_rate: "19",
    vat_registered: false,
    vat_number: "",
  });

  useEffect(() => {
    api.profile.get()
      .then((p) => {
        setProfile(p);
        setForm({
          company_name: p.company_name || "",
          company_reg: p.company_reg || "",
          tax_ref: p.tax_ref || "",
          year_start: p.year_start || "",
          year_end: p.year_end || "",
          seed_money: String(p.seed_money || 0),
          tax_rate: String(p.tax_rate || 19),
          vat_registered: p.vat_registered || false,
          vat_number: p.vat_number || "",
        });
      })
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const isBusiness = mode === "business";

  const save = async () => {
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const data = {
        ...form,
        seed_money: Number(form.seed_money) || 0,
        tax_rate: Number(form.tax_rate) || 19,
        year_start: form.year_start || null,
        year_end: form.year_end || null,
      };
      await api.profile.update(data);
      onProfileUpdate?.(data);
      setMessage({ type: "success", text: "Settings saved" });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  const downloadExport = (type) => {
    const url = type === "pack" ? api.export.accountantPackUrl() : api.export.transactionsCsvUrl();
    window.open(url, "_blank");
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 700 }}>
      {message.type === "error" && <ErrorMsg message={message.text} />}
      {message.type === "success" && <SuccessMsg message={message.text} />}

      {/* Company / Personal Details */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 20 }}>
          {isBusiness ? "Company Details" : "Profile"}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>{isBusiness ? "Company Name" : "Display Name"}</Label>
            <Input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} placeholder={isBusiness ? "Your Ltd Company" : "Your name"} />
          </div>
          {isBusiness && (
            <>
              <div>
                <Label>Company Registration Number</Label>
                <Input value={form.company_reg} onChange={(e) => update("company_reg", e.target.value)} placeholder="12345678" />
              </div>
              <div>
                <Label>Tax Reference (UTR)</Label>
                <Input value={form.tax_ref} onChange={(e) => update("tax_ref", e.target.value)} placeholder="1234567890" />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Financial Year (Business) / Tax Year (Personal) */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 20 }}>
          {isBusiness ? "Financial Year" : "Tax Year"}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <Label>Year Start</Label>
            <Input type="date" value={form.year_start} onChange={(e) => update("year_start", e.target.value)} />
          </div>
          <div>
            <Label>Year End</Label>
            <Input type="date" value={form.year_end} onChange={(e) => update("year_end", e.target.value)} />
          </div>
          {isBusiness && (
            <>
              <div>
                <Label>Seed Capital (£)</Label>
                <Input type="number" value={form.seed_money} onChange={(e) => update("seed_money", e.target.value)} placeholder="0" />
              </div>
              <div>
                <Label>Corporation Tax Rate</Label>
                <Select value={form.tax_rate} onChange={(v) => update("tax_rate", v)} options={TAX_RATES} style={{ width: "100%" }} />
              </div>
            </>
          )}
        </div>
      </Card>

      {/* VAT (Business only) */}
      {isBusiness && (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 20 }}>VAT</h3>
          <div style={{ marginBottom: form.vat_registered ? 16 : 0 }}>
            <Toggle value={form.vat_registered} onChange={(v) => update("vat_registered", v)} label="VAT Registered" />
          </div>
          {form.vat_registered && (
            <div>
              <Label>VAT Number</Label>
              <Input value={form.vat_number} onChange={(e) => update("vat_number", e.target.value)} placeholder="GB 123 4567 89" style={{ maxWidth: 300 }} />
            </div>
          )}
        </Card>
      )}

      {/* PayPal Integration (Business only) */}
      {isBusiness && <PayPalSettings profile={profile} />}

      {/* Save */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Data Maintenance */}
      {isBusiness && <DataMaintenance />}

      {/* Export */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 8 }}>Export</h3>
        <p style={{ fontSize: 13, color: PALETTE.textDim, marginBottom: 16 }}>
          {isBusiness ? "Download your data for your accountant or personal records." : "Download your transaction data."}
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          {isBusiness && <Button variant="outline" onClick={() => downloadExport("pack")}>Download Accountant Pack (.zip)</Button>}
          <Button variant="outline" onClick={() => downloadExport("csv")}>Export Transactions (.csv)</Button>
        </div>
      </Card>

      {/* Account info */}
      <Card>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 12 }}>Account</h3>
        <div style={{ fontSize: 13, color: PALETTE.textDim }}>
          <div style={{ marginBottom: 4 }}>Email: <span style={{ color: PALETTE.text }}>{profile?.email}</span></div>
          <div style={{ marginBottom: 4 }}>Plan: <span style={{ color: PALETTE.accent, fontWeight: 600 }}>{profile?.subscription_plan || "Starter"}</span></div>
          <div>Status: <span style={{ color: PALETTE.accent }}>{profile?.subscription_status || "Trial"}</span>
            {profile?.trial_ends_at && (
              <span style={{ color: PALETTE.textMuted, marginLeft: 8 }}>
                (expires {new Date(profile.trial_ends_at).toLocaleDateString("en-GB")})
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function PayPalSettings({ profile }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Check addon access
  const status = profile?.subscription_status;
  const addons = profile?.addons || [];
  const hasAccess = addons.includes("paypal") || status === "trial" || status === "admin";

  useEffect(() => {
    if (hasAccess) {
      api.paypal.hasCredentials()
        .then((r) => { setHasCredentials(r.hasCredentials); setSandbox(r.sandbox); })
        .catch(() => {});
    }
  }, [hasAccess]);

  const testConnection = async () => {
    if (!clientId || !clientSecret) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.paypal.test(clientId, clientSecret, sandbox);
      setTestResult(result.success ? "success" : "error");
    } catch (e) {
      setTestResult("error");
      setMessage({ type: "error", text: e.message });
    }
    setTesting(false);
  };

  const saveCredentials = async () => {
    if (!clientId || !clientSecret) return;
    setSaving(true);
    try {
      await api.paypal.saveCredentials(clientId, clientSecret, sandbox);
      setHasCredentials(true);
      setMessage({ type: "success", text: "PayPal credentials saved securely" });
      setClientId("");
      setClientSecret("");
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  if (!hasAccess) {
    return (
      <Card style={{ marginBottom: 20, opacity: 0.6 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 8 }}>PayPal Integration</h3>
        <p style={{ fontSize: 13, color: PALETTE.textMuted }}>
          PayPal sync is available as an addon (+£2.99/mo). Upgrade your plan to enable it.
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 4 }}>PayPal Integration</h3>
      <p style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 16 }}>
        Connect your PayPal to auto-sync transactions. Credentials are encrypted with AES-256.
      </p>

      {message.type === "error" && <ErrorMsg message={message.text} />}
      {message.type === "success" && <SuccessMsg message={message.text} />}

      {hasCredentials && (
        <div style={{ padding: "10px 14px", background: PALETTE.accentDim, borderRadius: 8, color: PALETTE.accent, fontSize: 13, marginBottom: 16 }}>
          PayPal credentials are saved. You can sync from the Import tab. Enter new credentials below to update them.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <Label>Client ID</Label>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Your PayPal Client ID" />
        </div>
        <div>
          <Label>Client Secret</Label>
          <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Your PayPal Client Secret" />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <Toggle value={sandbox} onChange={setSandbox} label="Sandbox Mode" />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button variant="outline" onClick={testConnection} disabled={!clientId || !clientSecret || testing}>
          {testing ? "Testing..." : "Test Connection"}
        </Button>
        <Button onClick={saveCredentials} disabled={!clientId || !clientSecret || saving}>
          {saving ? "Saving..." : "Save Credentials"}
        </Button>
        {testResult === "success" && <span style={{ fontSize: 12, color: PALETTE.accent }}>Connected successfully</span>}
        {testResult === "error" && <span style={{ fontSize: 12, color: PALETTE.expense }}>Connection failed</span>}
      </div>

      <p style={{ fontSize: 11, color: PALETTE.textMuted, marginTop: 12 }}>
        Get your credentials from developer.paypal.com → My Apps & Credentials → Create App
      </p>
    </Card>
  );
}

function DataMaintenance() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const runFix = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await api.transactions.fixExclusions();
      setResult(res);
    } catch (e) {
      setResult({ error: e.message });
    }
    setRunning(false);
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 8 }}>Data Maintenance</h3>
      <p style={{ fontSize: 13, color: PALETTE.textDim, marginBottom: 12 }}>
        Fix transaction exclusions: marks seed capital, failed payments, reversals, and inter-account transfers
        so they don't affect your P&L calculations.
      </p>
      <Button variant="outline" onClick={runFix} disabled={running}>
        {running ? "Running..." : "Fix Transaction Exclusions"}
      </Button>
      {result && !result.error && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: PALETTE.accentDim, borderRadius: 8, fontSize: 13, color: PALETTE.accent }}>
          <div style={{ fontWeight: 600 }}>Fixed {result.fixed} of {result.total} transactions</div>
          {result.details?.map((d, i) => (
            <div key={i} style={{ fontSize: 12, marginTop: 4, color: d.status === "fixed" ? PALETTE.accent : PALETTE.danger }}>
              {d.status === "fixed" ? "Fixed" : "Error"}: {d.description}
              {d.applied?.exclude_reason && ` → ${d.applied.exclude_reason}`}
              {d.applied?.category && ` (${d.applied.category})`}
            </div>
          ))}
        </div>
      )}
      {result?.error && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: PALETTE.dangerDim, borderRadius: 8, fontSize: 13, color: PALETTE.danger }}>
          Error: {result.error}
        </div>
      )}
    </Card>
  );
}
