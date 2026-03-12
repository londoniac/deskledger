import { useState, useRef, useEffect } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES } from "../lib/constants.js";
import { fmt, fmtDate } from "../lib/format.js";
import { Card, Button, Badge, Input, Label, ErrorMsg, SuccessMsg } from "../components/ui.jsx";
import { useWorkspace } from "../App.jsx";

export default function Import() {
  const [file, setFile] = useState(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setMessage({ type: "", text: "" });
    setPreview(null);
    const reader = new FileReader();
    reader.onload = (e) => setCsvText(e.target.result);
    reader.readAsText(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.type === "text/csv")) handleFile(f);
  };

  const parsePreview = async () => {
    if (!csvText) return;
    setParsing(true);
    setMessage({ type: "", text: "" });
    try {
      const result = await api.import.parse(csvText, file?.name?.toLowerCase().includes("paypal") ? "paypal" : "bank");
      setPreview(result);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
    setParsing(false);
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    setMessage({ type: "", text: "" });
    try {
      const newTxns = preview.transactions.filter((t) => !t.isDuplicate);
      const result = await api.import.confirm(newTxns, preview.closingBalance, csvText, file?.name);
      const balMsg = preview.closingBalance ? ` Bank balance updated to ${fmt(preview.closingBalance.balance)}.` : "";
      setMessage({ type: "success", text: `Imported ${result.imported} transactions successfully.${balMsg}` });
      setPreview(null);
      setFile(null);
      setCsvText("");
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
    setImporting(false);
  };

  return (
    <div>
      {message.type === "error" && <ErrorMsg message={message.text} />}
      {message.type === "success" && <SuccessMsg message={message.text} />}

      {/* Upload area */}
      {!preview && (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Import Bank Statement</h3>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${PALETTE.border}`, borderRadius: 12, padding: 48,
              textAlign: "center", cursor: "pointer", transition: "border-color 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = PALETTE.accent)}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = PALETTE.border)}
          >
            <input
              ref={fileRef} type="file" accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, color: PALETTE.text, fontWeight: 500, marginBottom: 4 }}>
              {file ? file.name : "Drop a CSV file here or click to browse"}
            </div>
            <div style={{ fontSize: 12, color: PALETTE.textMuted }}>
              Supports most UK bank statement formats (Monzo, Starling, HSBC, Lloyds, etc.)
            </div>
          </div>

          {file && (
            <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
              <Button onClick={parsePreview} disabled={parsing}>
                {parsing ? "Parsing..." : "Parse & Preview"}
              </Button>
              <Button variant="ghost" onClick={() => { setFile(null); setCsvText(""); }}>Clear</Button>
              <span style={{ fontSize: 12, color: PALETTE.textMuted }}>{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          )}
        </Card>
      )}

      {/* Preview */}
      {preview && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>Import Preview</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Badge color={PALETTE.income}>{preview.newCount} new</Badge>
              {preview.duplicateCount > 0 && <Badge color={PALETTE.warning}>{preview.duplicateCount} duplicates</Badge>}
              <span style={{ fontSize: 12, color: PALETTE.textMuted }}>{preview.total} total rows</span>
              {preview.closingBalance && (
                <span style={{ fontSize: 12, color: PALETTE.accent, fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                  Balance: {fmt(preview.closingBalance.balance)}
                </span>
              )}
            </div>
          </div>

          <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["", "Date", "Description", "Type", "Amount", "Category"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, borderBottom: `1px solid ${PALETTE.border}`, position: "sticky", top: 0, background: PALETTE.card }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.transactions.map((t, i) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${PALETTE.border}`, opacity: t.isDuplicate ? 0.35 : 1 }}>
                      <td style={{ padding: "6px 10px", width: 30 }}>
                        {t.isDuplicate && <span title="Duplicate — will be skipped" style={{ fontSize: 14 }}>⚠️</span>}
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 13, color: PALETTE.textDim, whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                      <td style={{ padding: "6px 10px", fontSize: 13, color: PALETTE.text, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.description}
                        {t.isDuplicate && <span style={{ marginLeft: 8, fontSize: 11, color: PALETTE.warning }}>duplicate</span>}
                      </td>
                      <td style={{ padding: "6px 10px" }}>
                        <Badge color={t.type === "income" ? PALETTE.income : PALETTE.expense}>{t.type}</Badge>
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: t.type === "income" ? PALETTE.income : PALETTE.expense }}>
                        {fmt(t.amount)}
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: t.category ? PALETTE.textDim : PALETTE.textMuted }}>
                        {cat ? cat.label : t.category || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <Button onClick={confirmImport} disabled={importing || preview.newCount === 0}>
              {importing ? "Importing..." : `Import ${preview.newCount} Transactions`}
            </Button>
            <Button variant="ghost" onClick={() => { setPreview(null); setFile(null); setCsvText(""); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* PayPal Sync (Business mode only) */}
      <PayPalSync />

      {/* Tips */}
      <Card>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 8 }}>Tips</h3>
        <ul style={{ fontSize: 13, color: PALETTE.textDim, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
          <li>Download your bank statement as CSV from your bank's online portal</li>
          <li>Transactions are automatically categorised based on description keywords</li>
          <li>Duplicate transactions (same date, description, amount) are detected and skipped</li>
          <li>After import, review categories in the Transactions tab and adjust as needed</li>
          <li>Attach invoices/receipts to expense transactions for HMRC compliance</li>
        </ul>
      </Card>
    </div>
  );
}

function PayPalSync() {
  const { mode } = useWorkspace();
  const [hasCredentials, setHasCredentials] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Default: last 90 days
  const today = new Date().toISOString().split("T")[0];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(ninetyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  useEffect(() => {
    if (mode === "business") {
      api.paypal.hasCredentials()
        .then((r) => setHasCredentials(r.hasCredentials))
        .catch(() => {});
    }
  }, [mode]);

  if (mode !== "business") return null;

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setMessage({ type: "", text: "" });
    try {
      const res = await api.paypal.sync(
        new Date(startDate).toISOString(),
        new Date(endDate).toISOString()
      );
      setResult(res);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
    setSyncing(false);
  };

  if (!hasCredentials) {
    return (
      <Card style={{ marginBottom: 20, opacity: 0.7 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 4 }}>PayPal Sync</h3>
        <p style={{ fontSize: 13, color: PALETTE.textMuted }}>
          Set up your PayPal API credentials in Settings to enable automatic sync.
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text, marginBottom: 12 }}>PayPal Sync</h3>

      {message.type === "error" && <ErrorMsg message={message.text} />}

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <Label>From</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 160 }} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 160 }} />
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing..." : "Sync from PayPal"}
        </Button>
      </div>

      {result && (
        <div style={{ padding: "12px 16px", background: PALETTE.accentDim, borderRadius: 8, fontSize: 13, color: PALETTE.accent }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Sync complete</div>
          <div>Fetched {result.totalFetched} raw transactions from PayPal</div>
          <div>{result.kept} kept after filtering ({result.skipped} internal entries skipped, {result.currencyDupes} currency duplicates removed)</div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>
            {result.newImported} new transactions imported
            {result.alreadyExisted > 0 && `, ${result.alreadyExisted} already existed`}
          </div>
        </div>
      )}
    </Card>
  );
}
