import { useState, useEffect } from "react";
import { PALETTE } from "../lib/constants.js";
import { fmt, fmtDate } from "../lib/format.js";
import { Card, Button, Input, Label, Select, ErrorMsg, SuccessMsg, Spinner } from "../components/ui.jsx";
import api from "../lib/api.js";

export default function Dividends() {
  const [dividends, setDividends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const toggleGroup = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    shareholder: "",
    tax_year: getCurrentTaxYear(),
    voucher_no: "",
    notes: "",
  });

  function getCurrentTaxYear() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    // UK tax year runs 6 Apr to 5 Apr
    if (m >= 4) return `${y}-${String(y + 1).slice(2)}`;
    return `${y - 1}-${String(y).slice(2)}`;
  }

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await api.dividends.getAll();
      setDividends(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.date || !form.amount || !form.shareholder) {
      setError("Date, amount, and shareholder are required");
      return;
    }
    try {
      setError("");
      if (editing) {
        await api.dividends.update(editing, form);
        setSuccess("Dividend updated");
      } else {
        await api.dividends.save(form);
        setSuccess("Dividend recorded");
      }
      setShowForm(false);
      setEditing(null);
      setForm({ date: new Date().toISOString().split("T")[0], amount: "", shareholder: "", tax_year: getCurrentTaxYear(), voucher_no: "", notes: "" });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.dividends.delete(id);
      setSuccess("Dividend deleted");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(d) {
    setForm({
      date: d.date,
      amount: d.amount,
      shareholder: d.shareholder,
      tax_year: d.tax_year,
      voucher_no: d.voucher_no || "",
      notes: d.notes || "",
    });
    setEditing(d.id);
    setShowForm(true);
  }

  // Summary by tax year
  const byTaxYear = {};
  dividends.forEach((d) => {
    if (!byTaxYear[d.tax_year]) byTaxYear[d.tax_year] = { total: 0, count: 0 };
    byTaxYear[d.tax_year].total += Number(d.amount);
    byTaxYear[d.tax_year].count += 1;
  });

  // Summary by shareholder
  const byShareholder = {};
  dividends.forEach((d) => {
    if (!byShareholder[d.shareholder]) byShareholder[d.shareholder] = 0;
    byShareholder[d.shareholder] += Number(d.amount);
  });

  const totalDividends = dividends.reduce((sum, d) => sum + Number(d.amount), 0);

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text }}>Dividends</h2>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ date: new Date().toISOString().split("T")[0], amount: "", shareholder: "", tax_year: getCurrentTaxYear(), voucher_no: "", notes: "" }); }}>
          {showForm ? "Cancel" : "Record Dividend"}
        </Button>
      </div>

      <ErrorMsg message={error} />
      <SuccessMsg message={success} />

      {/* Summary Cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Total Dividends Paid</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.purple, fontFamily: "JetBrains Mono, monospace" }}>{fmt(totalDividends)}</div>
        </Card>
        {Object.entries(byTaxYear).map(([year, { total, count }]) => (
          <Card key={year} style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Tax Year {year}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.text, fontFamily: "JetBrains Mono, monospace" }}>{fmt(total)}</div>
            <div style={{ fontSize: 11, color: PALETTE.textDim, marginTop: 4 }}>{count} payment{count !== 1 ? "s" : ""}</div>
          </Card>
        ))}
      </div>

      {/* Shareholder breakdown */}
      {Object.keys(byShareholder).length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 12 }}>By Shareholder</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {Object.entries(byShareholder).map(([name, total]) => (
              <div key={name}>
                <span style={{ fontSize: 13, color: PALETTE.textDim }}>{name}: </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: PALETTE.text }}>{fmt(total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>
            {editing ? "Edit Dividend" : "Record New Dividend"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Gross Amount (£)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1000.00" />
            </div>
            <div>
              <Label>Shareholder</Label>
              <Input value={form.shareholder} onChange={(e) => setForm({ ...form, shareholder: e.target.value })} placeholder="e.g. Den Smith" />
            </div>
            <div>
              <Label>Tax Year</Label>
              <Input value={form.tax_year} onChange={(e) => setForm({ ...form, tax_year: e.target.value })} placeholder="2025-26" />
            </div>
            <div>
              <Label>Voucher No</Label>
              <Input value={form.voucher_no} onChange={(e) => setForm({ ...form, voucher_no: e.target.value })} placeholder="Optional" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={handleSave}>{editing ? "Update" : "Save"}</Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: PALETTE.textMuted }}>
            Note: Dividends are not a deductible expense and do not reduce your corporation tax liability. They are tracked here for your personal tax planning.
          </div>
        </Card>
      )}

      {/* Dividends List — grouped by tax year */}
      {dividends.length === 0 ? (
        <Card>
          <div style={{ color: PALETTE.textDim, fontSize: 13 }}>No dividends recorded yet.</div>
        </Card>
      ) : (
        Object.entries(byTaxYear).sort(([a], [b]) => b.localeCompare(a)).map(([year, { total, count }]) => {
          const yearDivs = dividends.filter((d) => d.tax_year === year);
          const isCollapsed = collapsed.has(year);
          return (
            <Card key={year} style={{ marginBottom: 16 }}>
              <div
                onClick={() => toggleGroup(year)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: isCollapsed ? 0 : 16 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: PALETTE.textMuted, transition: "transform 0.2s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>&#9660;</span>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>Tax Year {year}</h3>
                  <span style={{ fontSize: 12, color: PALETTE.textMuted }}>({count} payment{count !== 1 ? "s" : ""})</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: PALETTE.purple, fontFamily: "JetBrains Mono, monospace" }}>{fmt(total)}</span>
              </div>

              {!isCollapsed && (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                      {["Date", "Shareholder", "Amount", "Voucher", ""].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {yearDivs.map((d) => (
                      <tr key={d.id} style={{ borderBottom: `1px solid ${PALETTE.border}22` }}>
                        <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.textDim }}>{fmtDate(d.date)}</td>
                        <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.text }}>{d.shareholder}</td>
                        <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: PALETTE.purple, fontFamily: "JetBrains Mono, monospace" }}>{fmt(d.amount)}</td>
                        <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.textDim }}>{d.voucher_no || "—"}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <Button variant="ghost" onClick={() => startEdit(d)} style={{ fontSize: 11, padding: "4px 8px" }}>Edit</Button>
                          <Button variant="ghost" onClick={() => handleDelete(d.id)} style={{ fontSize: 11, padding: "4px 8px", color: PALETTE.danger }}>Delete</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
