import { useState, useEffect } from "react";
import { PALETTE } from "../lib/constants.js";
import { fmt, fmtDate } from "../lib/format.js";
import { Card, Button, Input, Label, Badge, ErrorMsg, SuccessMsg, Spinner } from "../components/ui.jsx";
import api from "../lib/api.js";

const STATUS_COLORS = { draft: PALETTE.warning, submitted: PALETTE.blue, filed: PALETTE.income };

export default function VATReturns() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);

  const [form, setForm] = useState({
    period_start: "",
    period_end: "",
    notes: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await api.vatReturns.getAll();
      setReturns(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.period_start || !form.period_end) {
      setError("Period start and end dates are required");
      return;
    }
    try {
      setError("");
      await api.vatReturns.save(form);
      setSuccess("VAT return period created");
      setShowForm(false);
      setForm({ period_start: "", period_end: "", notes: "" });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCalculate(id) {
    try {
      setError("");
      const result = await api.vatReturns.calculate(id);
      setSuccess("VAT return calculated from transactions");
      if (detail && detail.id === id) setDetail(result);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSubmit(id) {
    try {
      setError("");
      await api.vatReturns.submit(id);
      setSuccess("VAT return marked as submitted");
      setDetail(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.vatReturns.delete(id);
      setSuccess("VAT return deleted");
      if (detail && detail.id === id) setDetail(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function formatPeriod(start, end) {
    return `${fmtDate(start)} — ${fmtDate(end)}`;
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text }}>VAT Returns</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New VAT Period"}
        </Button>
      </div>

      <ErrorMsg message={error} />
      <SuccessMsg message={success} />

      {/* Create Period Form */}
      {showForm && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>New VAT Return Period</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <Label>Period Start</Label>
              <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
            </div>
            <div>
              <Label>Period End</Label>
              <Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Q1 2025-26" />
            </div>
          </div>
          <Button onClick={handleCreate}>Create Period</Button>
        </Card>
      )}

      {/* 9-Box Detail View */}
      {detail && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: PALETTE.text }}>
                VAT Return: {formatPeriod(detail.period_start, detail.period_end)}
              </div>
              <Badge color={STATUS_COLORS[detail.status]}>{detail.status}</Badge>
            </div>
            <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <BoxRow label="Box 1 — VAT due on sales" value={detail.box1_vat_due_sales} />
            <BoxRow label="Box 2 — VAT due on acquisitions" value={detail.box2_vat_due_acquisitions} />
            <BoxRow label="Box 3 — Total VAT due" value={detail.box3_total_vat_due} highlight />
            <BoxRow label="Box 4 — VAT reclaimed on purchases" value={detail.box4_vat_reclaimed} />
            <BoxRow label="Box 5 — Net VAT to pay/reclaim" value={detail.box5_net_vat} highlight
              color={detail.box5_net_vat > 0 ? PALETTE.danger : PALETTE.income} />
            <BoxRow label="Box 6 — Total sales (ex-VAT)" value={detail.box6_total_sales} />
            <BoxRow label="Box 7 — Total purchases (ex-VAT)" value={detail.box7_total_purchases} />
            <BoxRow label="Box 8 — Total supplies to EU/overseas" value={detail.box8_total_supplies} />
            <BoxRow label="Box 9 — Total acquisitions from EU/overseas" value={detail.box9_total_acquisitions} />
          </div>

          {detail.box5_net_vat !== 0 && (
            <div style={{ padding: 12, borderRadius: 8, background: detail.box5_net_vat > 0 ? PALETTE.dangerDim : PALETTE.accentDim, marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: detail.box5_net_vat > 0 ? PALETTE.danger : PALETTE.income }}>
                {detail.box5_net_vat > 0
                  ? `You owe HMRC ${fmt(detail.box5_net_vat)}`
                  : `HMRC owes you ${fmt(Math.abs(detail.box5_net_vat))}`}
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {detail.status === "draft" && (
              <>
                <Button onClick={() => handleCalculate(detail.id)}>Recalculate from Transactions</Button>
                <Button variant="outline" onClick={() => handleSubmit(detail.id)}>Mark as Submitted</Button>
                <Button variant="ghost" onClick={() => handleDelete(detail.id)} style={{ color: PALETTE.danger }}>Delete</Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Returns List */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>VAT Return Periods</div>
        {returns.length === 0 ? (
          <div style={{ color: PALETTE.textDim, fontSize: 13 }}>
            No VAT returns yet. Create a new period to get started.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                {["Period", "Status", "Net VAT (Box 5)", "Total Sales", "Total Purchases", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {returns.map((vr) => (
                <tr key={vr.id} style={{ borderBottom: `1px solid ${PALETTE.border}22`, cursor: "pointer" }}
                  onClick={() => setDetail(vr)}>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.text }}>{formatPeriod(vr.period_start, vr.period_end)}</td>
                  <td style={{ padding: "10px 12px" }}><Badge color={STATUS_COLORS[vr.status]}>{vr.status}</Badge></td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, fontFamily: "JetBrains Mono, monospace",
                    color: vr.box5_net_vat > 0 ? PALETTE.danger : PALETTE.income }}>
                    {fmt(Math.abs(vr.box5_net_vat))}
                    <span style={{ fontSize: 10, color: PALETTE.textMuted, marginLeft: 4 }}>
                      {vr.box5_net_vat > 0 ? "owe" : vr.box5_net_vat < 0 ? "reclaim" : ""}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.textDim, fontFamily: "JetBrains Mono, monospace" }}>{fmt(vr.box6_total_sales)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.textDim, fontFamily: "JetBrains Mono, monospace" }}>{fmt(vr.box7_total_purchases)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {vr.status === "draft" && (
                      <Button variant="ghost" onClick={(e) => { e.stopPropagation(); handleCalculate(vr.id); }} style={{ fontSize: 11, padding: "4px 8px" }}>
                        Calculate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div style={{ marginTop: 16, fontSize: 11, color: PALETTE.textMuted }}>
        VAT calculations are based on transaction data. Ensure all transactions have correct VAT rates assigned before calculating. Verify figures with your accountant before submission.
      </div>
    </div>
  );
}

function BoxRow({ label, value, highlight, color }) {
  return (
    <div style={{
      padding: 12, borderRadius: 8,
      background: highlight ? PALETTE.bg : "transparent",
      border: highlight ? `1px solid ${PALETTE.border}` : "none",
    }}>
      <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || PALETTE.text, fontFamily: "JetBrains Mono, monospace" }}>
        {fmt(value || 0)}
      </div>
    </div>
  );
}
