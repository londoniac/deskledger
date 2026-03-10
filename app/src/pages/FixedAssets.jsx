import { useState, useEffect } from "react";
import { PALETTE } from "../lib/constants.js";
import { fmt, fmtDate } from "../lib/format.js";
import { Card, Button, Input, Label, Select, ErrorMsg, SuccessMsg, Spinner, Badge } from "../components/ui.jsx";
import api from "../lib/api.js";

const CATEGORIES = [
  { value: "computer_equipment", label: "Computer Equipment" },
  { value: "office_equipment", label: "Office Equipment" },
  { value: "furniture", label: "Furniture" },
  { value: "vehicle", label: "Vehicle" },
  { value: "machinery", label: "Machinery" },
  { value: "other", label: "Other" },
];

const METHODS = [
  { value: "straight_line", label: "Straight Line" },
  { value: "reducing_balance", label: "Reducing Balance" },
  { value: "aia", label: "Annual Investment Allowance (100%)" },
];

export default function FixedAssets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({
    name: "", description: "", cost: "", date_acquired: new Date().toISOString().split("T")[0],
    category: "computer_equipment", depreciation_method: "straight_line",
    useful_life_years: "3", annual_rate: "33.33", notes: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await api.fixedAssets.getAll();
      setAssets(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.name || !form.cost || !form.date_acquired) {
      setError("Name, cost, and acquisition date are required");
      return;
    }
    try {
      setError("");
      const payload = {
        ...form,
        cost: Number(form.cost),
        useful_life_years: Number(form.useful_life_years),
        annual_rate: Number(form.annual_rate),
      };
      if (editing) {
        await api.fixedAssets.update(editing, payload);
        setSuccess("Asset updated");
      } else {
        await api.fixedAssets.save(payload);
        setSuccess("Asset added");
      }
      setShowForm(false);
      setEditing(null);
      resetForm();
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.fixedAssets.delete(id);
      setSuccess("Asset deleted");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function resetForm() {
    setForm({ name: "", description: "", cost: "", date_acquired: new Date().toISOString().split("T")[0], category: "computer_equipment", depreciation_method: "straight_line", useful_life_years: "3", annual_rate: "33.33", notes: "" });
  }

  function startEdit(a) {
    setForm({
      name: a.name, description: a.description || "", cost: a.cost,
      date_acquired: a.date_acquired, category: a.category,
      depreciation_method: a.depreciation_method, useful_life_years: String(a.useful_life_years),
      annual_rate: String(a.annual_rate), notes: a.notes || "",
    });
    setEditing(a.id);
    setShowForm(true);
  }

  // Update rate when method changes
  function handleMethodChange(method) {
    let rate = form.annual_rate;
    let life = form.useful_life_years;
    if (method === "straight_line") {
      rate = String(Math.round(10000 / Number(life)) / 100);
    } else if (method === "reducing_balance") {
      rate = "25";
    } else if (method === "aia") {
      rate = "100";
      life = "1";
    }
    setForm({ ...form, depreciation_method: method, annual_rate: rate, useful_life_years: life });
  }

  const totalCost = assets.reduce((s, a) => s + Number(a.cost), 0);
  const totalDepreciation = assets.reduce((s, a) => s + Number(a.total_depreciation || 0), 0);
  const totalNBV = assets.reduce((s, a) => s + Number(a.current_value || 0), 0);

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text }}>Fixed Assets</h2>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); resetForm(); }}>
          {showForm ? "Cancel" : "Add Asset"}
        </Button>
      </div>

      <ErrorMsg message={error} />
      <SuccessMsg message={success} />

      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Total Cost</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.text, fontFamily: "JetBrains Mono, monospace" }}>{fmt(totalCost)}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Total Depreciation</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.orange, fontFamily: "JetBrains Mono, monospace" }}>{fmt(totalDepreciation)}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Net Book Value</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.accent, fontFamily: "JetBrains Mono, monospace" }}>{fmt(totalNBV)}</div>
        </Card>
      </div>

      {/* Form */}
      {showForm && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>
            {editing ? "Edit Asset" : "Add New Asset"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MacBook Pro" />
            </div>
            <div>
              <Label>Cost (£)</Label>
              <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="1299.00" />
            </div>
            <div>
              <Label>Date Acquired</Label>
              <Input type="date" value={form.date_acquired} onChange={(e) => setForm({ ...form, date_acquired: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES} style={{ width: "100%" }} />
            </div>
            <div>
              <Label>Depreciation Method</Label>
              <Select value={form.depreciation_method} onChange={handleMethodChange} options={METHODS} style={{ width: "100%" }} />
            </div>
            <div>
              <Label>Useful Life (years)</Label>
              <Input type="number" value={form.useful_life_years} onChange={(e) => {
                const life = e.target.value;
                const rate = form.depreciation_method === "straight_line" ? String(Math.round(10000 / Number(life)) / 100) : form.annual_rate;
                setForm({ ...form, useful_life_years: life, annual_rate: rate });
              }} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional details" />
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

      {/* Asset List */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>Asset Register</div>
        {assets.length === 0 ? (
          <div style={{ color: PALETTE.textDim, fontSize: 13 }}>No fixed assets recorded yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                {["Name", "Category", "Acquired", "Cost", "Depreciation", "NBV", "Method", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, color: PALETTE.textMuted, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} style={{ borderBottom: `1px solid ${PALETTE.border}22` }}>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.text }}>{a.name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <Badge color={PALETTE.blue}>{CATEGORIES.find((c) => c.value === a.category)?.label || a.category}</Badge>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: PALETTE.textDim }}>{fmtDate(a.date_acquired)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.text }}>{fmt(a.cost)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", color: PALETTE.orange }}>{fmt(a.total_depreciation)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, fontFamily: "JetBrains Mono, monospace", color: PALETTE.accent }}>{fmt(a.current_value)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: PALETTE.textDim }}>
                    {a.depreciation_method === "aia" ? "AIA" : a.depreciation_method === "straight_line" ? "SL" : "RB"}
                    {a.depreciation_method !== "aia" && ` ${a.useful_life_years}yr`}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <Button variant="ghost" onClick={() => startEdit(a)} style={{ fontSize: 11, padding: "4px 8px" }}>Edit</Button>
                    <Button variant="ghost" onClick={() => handleDelete(a.id)} style={{ fontSize: 11, padding: "4px 8px", color: PALETTE.danger }}>Delete</Button>
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
