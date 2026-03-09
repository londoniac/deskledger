import { useState, useRef } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES } from "../lib/constants.js";
import { fmt, fmtDate } from "../lib/format.js";
import { Card, Button, Badge, ErrorMsg, SuccessMsg } from "../components/ui.jsx";

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
      const result = await api.import.confirm(newTxns);
      setMessage({ type: "success", text: `Imported ${result.imported} transactions successfully` });
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

      {/* Manual entry */}
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
