import { useState, useEffect } from "react";
import { PALETTE } from "../lib/constants.js";
import { fmt, fmtDate } from "../lib/format.js";
import { Card, Button, Input, Label, Select, ErrorMsg, SuccessMsg, Spinner } from "../components/ui.jsx";
import api from "../lib/api.js";

export default function DLA() {
  const [data, setData] = useState({ entries: [], summary: { closing_balance: 0, s455_liable: false, s455_amount: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    direction: "to_director",
    description: "",
    category: "",
    notes: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const result = await api.dla.getAll();
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.date || !form.amount || !form.description) {
      setError("Date, amount, and description are required");
      return;
    }
    try {
      setError("");
      if (editing) {
        await api.dla.update(editing, form);
        setSuccess("Entry updated");
      } else {
        await api.dla.save(form);
        setSuccess("Entry recorded");
      }
      setShowForm(false);
      setEditing(null);
      setForm({ date: new Date().toISOString().split("T")[0], amount: "", direction: "to_director", description: "", category: "", notes: "" });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.dla.delete(id);
      setSuccess("Entry deleted");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(entry) {
    setForm({
      date: entry.date,
      amount: entry.amount,
      direction: entry.direction,
      description: entry.description,
      category: entry.category || "",
      notes: entry.notes || "",
    });
    setEditing(entry.id);
    setShowForm(true);
  }

  const { entries, summary } = data;

  const directionOptions = [
    { value: "to_director", label: "Company → Director (loan/withdrawal)" },
    { value: "to_company", label: "Director → Company (repayment)" },
  ];

  const categoryOptions = [
    { value: "", label: "— None —" },
    { value: "loan", label: "Loan / Drawing" },
    { value: "salary", label: "Salary" },
    { value: "dividend", label: "Dividend" },
    { value: "expense_reimbursement", label: "Expense Reimbursement" },
    { value: "repayment", label: "Loan Repayment" },
    { value: "capital_injection", label: "Capital Injection" },
    { value: "other", label: "Other" },
  ];

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text }}>Directors' Loan Account</h2>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ date: new Date().toISOString().split("T")[0], amount: "", direction: "to_director", description: "", category: "", notes: "" }); }}>
          {showForm ? "Cancel" : "Add Entry"}
        </Button>
      </div>

      <ErrorMsg message={error} />
      <SuccessMsg message={success} />

      {/* Summary Cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Closing Balance</div>
          <div style={{
            fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
            color: summary.closing_balance > 0 ? PALETTE.danger : PALETTE.income,
          }}>
            {fmt(Math.abs(summary.closing_balance))}
          </div>
          <div style={{ fontSize: 11, color: PALETTE.textDim, marginTop: 4 }}>
            {summary.closing_balance > 0
              ? "Director owes company"
              : summary.closing_balance < 0
                ? "Company owes director"
                : "Balanced"}
          </div>
        </Card>

        {summary.s455_liable && (
          <Card style={{ flex: 1, minWidth: 200, borderColor: PALETTE.danger }}>
            <div style={{ fontSize: 12, color: PALETTE.danger, marginBottom: 6, fontWeight: 600 }}>S455 Tax Warning</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: PALETTE.danger, fontFamily: "JetBrains Mono, monospace" }}>
              {fmt(summary.s455_amount)}
            </div>
            <div style={{ fontSize: 11, color: PALETTE.textDim, marginTop: 4 }}>
              33.75% of {fmt(summary.closing_balance)} overdrawn balance
            </div>
            <div style={{ fontSize: 11, color: PALETTE.textMuted, marginTop: 8 }}>
              Repay before 9 months after year end to reclaim S455 tax. Verify with your accountant.
            </div>
          </Card>
        )}

        <Card style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Total Entries</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: PALETTE.text }}>{entries.length}</div>
        </Card>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>
            {editing ? "Edit Entry" : "New DLA Entry"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Amount (£)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="500.00" />
            </div>
            <div>
              <Label>Direction</Label>
              <Select value={form.direction} onChange={(v) => setForm({ ...form, direction: v })} options={directionOptions} style={{ width: "100%" }} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Director's drawing" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={categoryOptions} style={{ width: "100%" }} />
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
        </Card>
      )}

      {/* Entries List */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>DLA Ledger</div>
        {entries.length === 0 ? (
          <div style={{ color: PALETTE.textDim, fontSize: 13 }}>No entries yet. Add the first DLA entry above.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                {["Date", "Description", "Direction", "Amount", "Balance", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: `1px solid ${PALETTE.border}22` }}>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.textDim }}>{fmtDate(entry.date)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.text }}>{entry.description}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    <span style={{
                      color: entry.direction === "to_director" ? PALETTE.danger : PALETTE.income,
                      fontSize: 11, fontWeight: 600,
                    }}>
                      {entry.direction === "to_director" ? "→ Director" : "→ Company"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, fontFamily: "JetBrains Mono, monospace",
                    color: entry.direction === "to_director" ? PALETTE.danger : PALETTE.income }}>
                    {fmt(entry.amount)}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontFamily: "JetBrains Mono, monospace",
                    color: entry.running_balance > 0 ? PALETTE.danger : PALETTE.income }}>
                    {fmt(Math.abs(entry.running_balance))}
                    <span style={{ fontSize: 10, color: PALETTE.textMuted, marginLeft: 4 }}>
                      {entry.running_balance > 0 ? "DR" : entry.running_balance < 0 ? "CR" : ""}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <Button variant="ghost" onClick={() => startEdit(entry)} style={{ fontSize: 11, padding: "4px 8px" }}>Edit</Button>
                    <Button variant="ghost" onClick={() => handleDelete(entry.id)} style={{ fontSize: 11, padding: "4px 8px", color: PALETTE.danger }}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
