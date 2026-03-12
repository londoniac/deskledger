import { useState, useEffect, useMemo, useRef } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES } from "../lib/constants.js";
import { fmt, fmtDate } from "../lib/format.js";
import { Card, Button, Input, Label, Select, Badge, ErrorMsg, SuccessMsg, Spinner } from "../components/ui.jsx";

const STATUS_COLORS = { pending: PALETTE.warning, invoiced: PALETTE.blue, reimbursed: PALETTE.income };

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [collapsed, setCollapsed] = useState(new Set());
  const [uploading, setUploading] = useState(null);

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "", amount: "", category: "office", supplier: "",
    status: "pending", invoice_ref: "", notes: "",
    original_amount: "", original_currency: "",
  });
  const [formFile, setFormFile] = useState(null);
  const formFileRef = useRef();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await api.expenses.getAll();
      setExpenses(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.date || !form.description || !form.amount) {
      setError("Date, description, and amount are required");
      return;
    }
    try {
      setError("");
      const id = editing || `exp-${Date.now()}`;
      const payload = { ...form, id };
      if (editing) {
        await api.expenses.update(editing, form);
      } else {
        await api.expenses.save(payload);
      }
      // Upload receipt file if one was selected
      if (formFile) {
        await api.expenses.uploadReceipt(id, formFile);
      }
      setSuccess(editing ? "Expense updated" : "Expense added");
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
      await api.expenses.delete(id);
      setSuccess("Expense deleted");
      setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n; });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleUpload(id, file) {
    if (!file) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only PDF, JPEG, PNG, GIF, and WebP files are supported");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB");
      return;
    }
    try {
      setUploading(id);
      setError("");
      await api.expenses.uploadReceipt(id, file);
      setSuccess(`Receipt uploaded: ${file.name}`);
      load();
    } catch (e) {
      setError(`Upload failed: ${e.message}`);
    } finally {
      setUploading(null);
    }
  }

  async function handleViewReceipt(id) {
    try {
      const { url } = await api.expenses.getFileUrl(id);
      window.open(url, "_blank");
    } catch (e) {
      setError("Could not load receipt file");
    }
  }

  function startEdit(exp) {
    setForm({
      date: exp.date, description: exp.description, amount: exp.amount,
      category: exp.category, supplier: exp.supplier || "",
      status: exp.status, invoice_ref: exp.invoice_ref || "", notes: exp.notes || "",
      original_amount: exp.original_amount || "", original_currency: exp.original_currency || "",
    });
    setEditing(exp.id);
    setShowForm(true);
  }

  function resetForm() {
    setForm({ date: new Date().toISOString().split("T")[0], description: "", amount: "", category: "office", supplier: "", status: "pending", invoice_ref: "", notes: "", original_amount: "", original_currency: "" });
    setFormFile(null);
  }

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleMonth(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Group by month
  const grouped = useMemo(() => {
    const groups = {};
    expenses.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = { key, expenses: [] };
      groups[key].expenses.push(e);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [expenses]);

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const pendingCount = expenses.filter((e) => e.status === "pending").length;
  const withReceipts = expenses.filter((e) => e.receipt_path).length;

  const categoryOptions = EXPENSE_CATEGORIES.filter((c) => c.id !== "transfer").map((c) => ({ value: c.id, label: c.label }));
  const statusOptions = [
    { value: "pending", label: "Pending" },
    { value: "invoiced", label: "Invoiced" },
    { value: "reimbursed", label: "Reimbursed" },
  ];

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text }}>Business Expenses</h2>
        <Button onClick={() => { setShowForm(!showForm); setEditing(null); resetForm(); }}>
          {showForm ? "Cancel" : "Add Expense"}
        </Button>
      </div>

      <ErrorMsg message={error} />
      <SuccessMsg message={success} />

      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Total Expenses</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.expense, fontFamily: "JetBrains Mono, monospace" }}>{fmt(totalExpenses)}</div>
          <div style={{ fontSize: 11, color: PALETTE.textDim, marginTop: 4 }}>{expenses.length} expenses</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Pending Review</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.warning }}>{pendingCount}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 6 }}>Receipts Attached</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: PALETTE.income }}>{withReceipts} / {expenses.length}</div>
        </Card>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text, marginBottom: 16 }}>
            {editing ? "Edit Expense" : "Add New Expense"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Office supplies from Amazon" />
            </div>
            <div>
              <Label>Amount (£)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="29.99" />
            </div>
            <div>
              <Label>Original Amount (optional)</Label>
              <div style={{ display: "flex", gap: 8 }}>
                <Select
                  value={form.original_currency || ""}
                  onChange={(v) => setForm({ ...form, original_currency: v })}
                  options={[{ value: "", label: "—" }, { value: "USD", label: "USD" }, { value: "EUR", label: "EUR" }, { value: "MXN", label: "MXN" }]}
                  style={{ width: 80 }}
                />
                <Input
                  type="number" step="0.01"
                  value={form.original_amount}
                  onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
                  placeholder="Invoice amount"
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ fontSize: 11, color: PALETTE.textMuted, marginTop: 4 }}>If the invoice is in a foreign currency, enter it here. The GBP amount above should be what you actually paid.</div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={categoryOptions} style={{ width: "100%" }} />
            </div>
            <div>
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="e.g. Amazon" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={statusOptions} style={{ width: "100%" }} />
            </div>
            <div>
              <Label>Invoice Reference</Label>
              <Input value={form.invoice_ref} onChange={(e) => setForm({ ...form, invoice_ref: e.target.value })} placeholder="Optional" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <Label>Receipt / Invoice</Label>
              <input
                ref={formFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files[0];
                  if (!f) return;
                  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
                  if (!allowed.includes(f.type)) {
                    setError("Only PDF, JPEG, PNG, GIF, and WebP files are supported");
                    return;
                  }
                  if (f.size > 10 * 1024 * 1024) {
                    setError("File must be under 10MB");
                    return;
                  }
                  setFormFile(f);
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Button variant="outline" onClick={() => formFileRef.current?.click()} style={{ fontSize: 12 }}>
                  {formFile ? "Change File" : "Attach File"}
                </Button>
                {formFile && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: PALETTE.income }}>&#128206; {formFile.name}</span>
                    <span style={{ fontSize: 11, color: PALETTE.textMuted }}>({(formFile.size / 1024).toFixed(1)} KB)</span>
                    <button
                      onClick={() => { setFormFile(null); if (formFileRef.current) formFileRef.current.value = ""; }}
                      style={{ background: "none", border: "none", color: PALETTE.danger, cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                      title="Remove file"
                    >&times;</button>
                  </div>
                )}
                {!formFile && editing && (
                  <span style={{ fontSize: 12, color: PALETTE.textMuted }}>
                    {expenses.find((e) => e.id === editing)?.receipt_path ? "Existing receipt will be kept unless replaced" : "No file attached"}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={handleSave}>{editing ? "Update" : "Save"}</Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Expense list grouped by month */}
      {grouped.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: PALETTE.textMuted, fontSize: 13 }}>
            No expenses recorded yet. Click "Add Expense" to get started.
          </div>
        </Card>
      ) : (
        grouped.map((group) => {
          const monthLabel = new Date(group.key + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
          const monthTotal = group.expenses.reduce((s, e) => s + Number(e.amount), 0);
          const isCollapsed = collapsed.has(group.key);

          return (
            <Card key={group.key} style={{ marginBottom: 16 }}>
              <div
                onClick={() => toggleMonth(group.key)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: isCollapsed ? 0 : 12 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: PALETTE.textMuted, transition: "transform 0.2s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>&#9660;</span>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>{monthLabel}</h3>
                  <span style={{ fontSize: 12, color: PALETTE.textMuted }}>({group.expenses.length} expense{group.expenses.length !== 1 ? "s" : ""})</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: PALETTE.expense, fontFamily: "JetBrains Mono, monospace" }}>{fmt(monthTotal)}</span>
              </div>

              {!isCollapsed && group.expenses.map((exp) => (
                <ExpenseRow
                  key={exp.id}
                  expense={exp}
                  isExpanded={expanded.has(exp.id)}
                  onToggle={() => toggleExpand(exp.id)}
                  onEdit={() => startEdit(exp)}
                  onDelete={() => handleDelete(exp.id)}
                  onUpload={(file) => handleUpload(exp.id, file)}
                  onViewReceipt={() => handleViewReceipt(exp.id)}
                  uploading={uploading === exp.id}
                />
              ))}
            </Card>
          );
        })
      )}
    </div>
  );
}

function ExpenseRow({ expense, isExpanded, onToggle, onEdit, onDelete, onUpload, onViewReceipt, uploading }) {
  const fileRef = useRef();
  const cat = EXPENSE_CATEGORIES.find((c) => c.id === expense.category);

  return (
    <div style={{ borderBottom: `1px solid ${PALETTE.border}22` }}>
      {/* Main row — click to expand */}
      <div
        onClick={onToggle}
        style={{
          display: "grid", gridTemplateColumns: "100px 1fr 120px 100px 100px 80px",
          alignItems: "center", padding: "10px 12px", cursor: "pointer",
          background: isExpanded ? PALETTE.bg : "transparent",
          borderRadius: isExpanded ? "8px 8px 0 0" : 0,
          transition: "background 0.15s",
        }}
      >
        <span style={{ fontSize: 13, color: PALETTE.textDim }}>{fmtDate(expense.date)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: PALETTE.textMuted, transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }}>&#9660;</span>
          <span style={{ fontSize: 13, color: PALETTE.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{expense.description}</span>
          {expense.receipt_path && <span style={{ fontSize: 10, color: PALETTE.income }} title="Receipt attached">&#128206;</span>}
        </div>
        <span style={{ fontSize: 12, color: PALETTE.textDim }}>{cat?.label || expense.category}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: PALETTE.expense, fontFamily: "JetBrains Mono, monospace" }}>{fmt(expense.amount)}</span>
        <Badge color={STATUS_COLORS[expense.status]}>{expense.status}</Badge>
        <span style={{ fontSize: 12, color: PALETTE.textDim }}>{expense.supplier || "—"}</span>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: "16px 20px", background: PALETTE.bg, borderRadius: "0 0 8px 8px", marginBottom: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 4 }}>Category</div>
              <div style={{ fontSize: 13, color: PALETTE.text }}>{cat?.label || expense.category}</div>
              {cat?.hmrc && <div style={{ fontSize: 11, color: PALETTE.textDim }}>HMRC: {cat.hmrc}</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 4 }}>Supplier</div>
              <div style={{ fontSize: 13, color: PALETTE.text }}>{expense.supplier || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 4 }}>Invoice Ref</div>
              <div style={{ fontSize: 13, color: PALETTE.text }}>{expense.invoice_ref || "—"}</div>
            </div>
            {expense.original_amount && (
              <div>
                <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 4 }}>Original Amount</div>
                <div style={{ fontSize: 13, color: PALETTE.text, fontFamily: "JetBrains Mono, monospace" }}>
                  {expense.original_currency || "USD"} {Number(expense.original_amount).toFixed(2)}
                </div>
              </div>
            )}
            {expense.notes && (
              <div style={{ gridColumn: "span 3" }}>
                <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 13, color: PALETTE.text }}>{expense.notes}</div>
              </div>
            )}
          </div>

          {/* Receipt section */}
          <div style={{ padding: 16, borderRadius: 8, border: `1px dashed ${PALETTE.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: PALETTE.text, marginBottom: 8 }}>Receipt / Invoice</div>
            {expense.receipt_path ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, color: PALETTE.income }}>&#128206; {expense.receipt_name || "File attached"}</span>
                <Button variant="outline" onClick={onViewReceipt} style={{ fontSize: 11, padding: "4px 12px" }}>View / Download</Button>
                <label style={{ cursor: "pointer" }}>
                  <Button variant="ghost" onClick={() => fileRef.current?.click()} style={{ fontSize: 11, padding: "4px 12px" }}>Replace</Button>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style={{ display: "none" }}
                    onChange={(e) => { if (e.target.files[0]) onUpload(e.target.files[0]); }} />
                </label>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 8 }}>
                  No receipt attached. Upload a PDF or image of the invoice/receipt.
                </div>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" style={{ display: "none" }}
                  onChange={(e) => { if (e.target.files[0]) onUpload(e.target.files[0]); }} />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ fontSize: 12 }}>
                  {uploading ? "Uploading..." : "Upload Receipt"}
                </Button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" onClick={onEdit} style={{ fontSize: 12 }}>Edit</Button>
            <Button variant="ghost" onClick={onDelete} style={{ fontSize: 12, color: PALETTE.danger }}>Delete</Button>
          </div>
        </div>
      )}
    </div>
  );
}
