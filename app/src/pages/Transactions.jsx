import { useState, useEffect, useMemo, useRef } from "react";
import api from "../lib/api.js";
import { PALETTE, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PERSONAL_EXPENSE_CATEGORIES, PERSONAL_INCOME_CATEGORIES } from "../lib/constants.js";
import { fmt, r2, fmtDate } from "../lib/format.js";
import { Card, Badge, Button, Select, Input, ErrorMsg, SuccessMsg, Spinner } from "../components/ui.jsx";
import { useWorkspace } from "../App.jsx";

export default function Transactions() {
  const { mode } = useWorkspace();
  const [transactions, setTransactions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showExcluded, setShowExcluded] = useState(false);

  // Collapsed months — start all collapsed (null = all collapsed until initialized)
  const [collapsed, setCollapsed] = useState(null);
  const isCollapsed = (key) => collapsed === null || collapsed.has(key);
  const toggleMonth = (key) => setCollapsed((prev) => {
    const base = prev || new Set(grouped.map((g) => g.key));
    const next = new Set(base);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  // Expanded detail rows
  const [expanded, setExpanded] = useState(new Set());
  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Close edit if expanding a different row
    if (editId && editId !== id) setEditId(null);
  };

  // Editing
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});

  // Invoice state per transaction
  const [invoiceMap, setInvoiceMap] = useState({}); // txnId -> invoice object
  const [uploading, setUploading] = useState(null); // txnId currently uploading
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null); // txnId for file input

  useEffect(() => {
    async function load() {
      try {
        const [txnResult, profResult, invResult] = await Promise.allSettled([
          api.transactions.getAll(),
          api.profile.get(),
          api.invoices.getAll(),
        ]);

        if (txnResult.status === "fulfilled") setTransactions(txnResult.value || []);
        else setMessage({ type: "error", text: `Failed to load transactions: ${txnResult.reason?.message || "Unknown error"}` });

        if (profResult.status === "fulfilled") setProfile(profResult.value);

        // Build invoice map keyed by transaction_id
        if (invResult.status === "fulfilled" && invResult.value) {
          const map = {};
          invResult.value.forEach((inv) => {
            if (inv.transaction_id) map[inv.transaction_id] = inv;
          });
          setInvoiceMap(map);
        }
      } catch (e) {
        setMessage({ type: "error", text: e.message });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const isBusiness = mode === "business";
  const expenseCats = isBusiness ? EXPENSE_CATEGORIES : PERSONAL_EXPENSE_CATEGORIES;
  const incomeCats = isBusiness ? INCOME_CATEGORIES : PERSONAL_INCOME_CATEGORIES;
  const ALL_CATEGORIES = [...expenseCats, ...incomeCats];

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (!showExcluded && t.excluded) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, search, typeFilter, categoryFilter, sourceFilter, showExcluded]);

  // Group by month
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = { key, transactions: [] };
      groups[key].transactions.push(t);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered]);

  const sources = useMemo(() => {
    const s = new Set(transactions.map((t) => t.source));
    return [...s].sort();
  }, [transactions]);

  const startEdit = (t) => {
    setEditId(t.id);
    setEditData({
      description: t.description,
      type: t.type,
      amount: t.amount,
      category: t.category,
      vat_rate: t.vat_rate || 0,
      notes: t.notes || "",
      excluded: t.excluded || false,
    });
    // Make sure it's expanded
    setExpanded((prev) => new Set(prev).add(t.id));
  };

  const saveEdit = async () => {
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const vatAmount = r2(Number(editData.amount) * (Number(editData.vat_rate) / (100 + Number(editData.vat_rate))));
      const updated = await api.transactions.update(editId, {
        ...editData,
        vat_amount: vatAmount,
        updated_at: new Date().toISOString(),
      });
      setTransactions((prev) => prev.map((t) => (t.id === editId ? { ...t, ...updated } : t)));

      // Learn: save category rule if category was changed
      const original = transactions.find((t) => t.id === editId);
      if (original && editData.category && editData.category !== original.category && original.description) {
        const words = original.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(" ");
        if (words) {
          api.budgets.saveRule({ pattern: words, category: editData.category, type: editData.type }).catch(() => {});
        }
      }

      setEditId(null);
      setMessage({ type: "success", text: "Transaction updated" });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
    setSaving(false);
  };

  const deleteTransaction = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await api.transactions.delete(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      setExpanded((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setMessage({ type: "success", text: "Transaction deleted" });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  // Quick-save category from inline dropdown
  const quickSaveCategory = async (txnId, newCategory) => {
    try {
      const updated = await api.transactions.update(txnId, {
        category: newCategory,
        updated_at: new Date().toISOString(),
      });
      setTransactions((prev) => prev.map((t) => (t.id === txnId ? { ...t, ...updated } : t)));

      // Learn: save category rule
      const original = transactions.find((t) => t.id === txnId);
      if (original && newCategory && newCategory !== original.category && original.description) {
        const words = original.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(" ");
        if (words) {
          api.budgets.saveRule({ pattern: words, category: newCategory, type: original.type }).catch(() => {});
        }
      }
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  // Quick-save type from inline dropdown
  const quickSaveType = async (txnId, newType) => {
    try {
      const updates = { type: newType, updated_at: new Date().toISOString() };
      // If changing to transfer/reimbursement, update category and exclude from P&L
      if (newType === "transfer") updates.category = "transfer";
      else if (newType === "reimbursement") {
        updates.category = "reimbursement";
        updates.excluded = true;
        updates.exclude_reason = "Director reimbursement";
      } else {
        const txn = transactions.find((t) => t.id === txnId);
        if (txn?.category === "transfer" || txn?.category === "reimbursement") updates.category = "";
        if (txn?.exclude_reason === "Director reimbursement") {
          updates.excluded = false;
          updates.exclude_reason = null;
        }
      }
      const updated = await api.transactions.update(txnId, updates);
      setTransactions((prev) => prev.map((t) => (t.id === txnId ? { ...t, ...updated } : t)));
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const toggleExclude = async (t) => {
    try {
      const updated = await api.transactions.update(t.id, {
        excluded: !t.excluded,
        exclude_reason: !t.excluded ? "Manually excluded" : null,
        updated_at: new Date().toISOString(),
      });
      setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...updated } : x)));
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const moveToPersonalExpenses = async (t) => {
    if (!confirm(`Move "${t.description}" (${fmt(t.amount)}) to Personal Expenses?\n\nThis will exclude it from company totals and create a personal expense for reimbursement.`)) return;
    try {
      // 1. Create personal expense entry
      await api.expenses.save({
        id: `pe-${t.id}`,
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: t.category || "",
        supplier: t.description,
        status: "pending",
        invoice_ref: "",
        notes: `Moved from bank transaction ${t.id}`,
      });
      // 2. Exclude the bank transaction
      const updated = await api.transactions.update(t.id, {
        excluded: true,
        exclude_reason: "Moved to personal expenses",
        updated_at: new Date().toISOString(),
      });
      setTransactions((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...updated } : x)));
      setMessage({ type: "success", text: `Moved to Personal Expenses. View in the Expenses tab.` });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  // Invoice upload
  const handleFileSelect = (txnId) => {
    setUploadTarget(txnId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    e.target.value = ""; // reset input

    const txn = transactions.find((t) => t.id === uploadTarget);
    if (!txn) return;

    setUploading(uploadTarget);
    setMessage({ type: "", text: "" });
    try {
      // Create or get existing invoice record linked to this transaction
      let invoice = invoiceMap[uploadTarget];
      if (!invoice) {
        invoice = await api.invoices.save({
          id: crypto.randomUUID(),
          file_name: file.name,
          upload_date: new Date().toISOString().split("T")[0],
          supplier: txn.description,
          description: txn.description,
          amount_gbp: txn.amount,
          category: txn.category || "other",
          transaction_id: txn.id,
        });
      }

      // Upload the actual file
      const updated = await api.invoices.uploadFile(invoice.id, file);
      setInvoiceMap((prev) => ({ ...prev, [uploadTarget]: updated }));

      // Link invoice to transaction if not already
      if (!txn.invoice_id) {
        const txnUpdated = await api.transactions.update(txn.id, {
          invoice_id: invoice.id,
          updated_at: new Date().toISOString(),
        });
        setTransactions((prev) => prev.map((t) => (t.id === txn.id ? { ...t, ...txnUpdated } : t)));
      }

      setMessage({ type: "success", text: `Invoice "${file.name}" uploaded` });
    } catch (err) {
      setMessage({ type: "error", text: `Upload failed: ${err.message}` });
    }
    setUploading(null);
    setUploadTarget(null);
  };

  const viewInvoice = async (invoiceId) => {
    try {
      const { url } = await api.invoices.getFileUrl(invoiceId);
      window.open(url, "_blank");
    } catch (err) {
      setMessage({ type: "error", text: `Could not get file: ${err.message}` });
    }
  };

  const removeInvoice = async (txnId, invoiceId) => {
    if (!confirm("Remove this invoice?")) return;
    try {
      await api.invoices.delete(invoiceId);
      setInvoiceMap((prev) => {
        const next = { ...prev };
        delete next[txnId];
        return next;
      });
      // Unlink from transaction
      const txnUpdated = await api.transactions.update(txnId, {
        invoice_id: null,
        updated_at: new Date().toISOString(),
      });
      setTransactions((prev) => prev.map((t) => (t.id === txnId ? { ...t, ...txnUpdated } : t)));
      setMessage({ type: "success", text: "Invoice removed" });
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  };

  if (loading) return <Spinner />;

  const detailLabel = { fontSize: 11, color: PALETTE.textMuted, fontWeight: 600, marginBottom: 2 };
  const detailValue = { fontSize: 13, color: PALETTE.text, marginBottom: 12 };

  return (
    <div>
      {/* Hidden file input for invoice uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Filters */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..." style={{ width: 220, flex: "none" }}
          />
          <Select
            value={typeFilter} onChange={setTypeFilter}
            options={[{ value: "all", label: "All Types" }, { value: "income", label: "Income" }, { value: "expense", label: "Expenses" }, { value: "transfer", label: "Transfers" }, { value: "reimbursement", label: "Reimbursements" }]}
          />
          <Select
            value={categoryFilter} onChange={setCategoryFilter}
            options={[{ value: "all", label: "All Categories" }, ...ALL_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]}
          />
          {sources.length > 1 && (
            <Select
              value={sourceFilter} onChange={setSourceFilter}
              options={[{ value: "all", label: "All Sources" }, ...sources.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))]}
            />
          )}
          {(() => {
            const excludedCount = transactions.filter((t) => t.excluded).length;
            return excludedCount > 0 ? (
              <button
                onClick={() => setShowExcluded(!showExcluded)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                  fontSize: 12, fontWeight: 500, border: "none",
                  background: showExcluded ? PALETTE.orange + "20" : PALETTE.bg,
                  color: showExcluded ? PALETTE.orange : PALETTE.textMuted,
                  transition: "all 0.2s",
                }}
              >
                {showExcluded ? "Hide" : "Show"} {excludedCount} excluded
              </button>
            ) : null;
          })()}
          <div style={{ marginLeft: "auto", fontSize: 12, color: PALETTE.textMuted }}>
            {filtered.length} of {transactions.length} transactions
          </div>
        </div>
      </Card>

      {message.type === "error" && <ErrorMsg message={message.text} />}
      {message.type === "success" && <SuccessMsg message={message.text} />}

      {/* Excluded summary banner */}
      {showExcluded && (() => {
        const excludedTxns = transactions.filter((t) => t.excluded);
        if (excludedTxns.length === 0) return null;
        const excludedTotal = r2(excludedTxns.reduce((s, t) => s + Number(t.amount), 0));
        const reasons = {};
        excludedTxns.forEach((t) => {
          const r = t.exclude_reason || "Manually excluded";
          reasons[r] = (reasons[r] || 0) + 1;
        });
        return (
          <Card style={{ marginBottom: 16, borderLeft: `3px solid ${PALETTE.orange}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: PALETTE.orange, marginBottom: 4 }}>
                  {excludedTxns.length} Excluded Transaction{excludedTxns.length !== 1 ? "s" : ""}
                </div>
                <div style={{ fontSize: 12, color: PALETTE.textMuted }}>
                  {Object.entries(reasons).map(([reason, count]) => `${reason} (${count})`).join(" · ")}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: PALETTE.orange, fontFamily: "JetBrains Mono, monospace" }}>
                {fmt(excludedTotal)}
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Transaction groups */}
      {grouped.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: PALETTE.textMuted, fontSize: 13 }}>
            {transactions.length === 0 ? "No transactions yet. Go to Import to upload a bank statement." : "No transactions match your filters."}
          </div>
        </Card>
      ) : (
        grouped.map((group) => {
          const monthIncome = r2(group.transactions.filter((t) => t.type === "income" && !t.excluded && t.category !== "transfer").reduce((s, t) => s + Number(t.amount), 0));
          const monthExpenses = r2(group.transactions.filter((t) => t.type === "expense" && !t.excluded && t.category !== "transfer" && t.type !== "reimbursement").reduce((s, t) => s + Number(t.amount), 0));
          const monthLabel = new Date(group.key + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

          return (
            <Card key={group.key} style={{ marginBottom: 16 }}>
              {/* Month header */}
              <div
                onClick={() => toggleMonth(group.key)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: isCollapsed(group.key) ? 0 : 16 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: PALETTE.textMuted, transition: "transform 0.2s", display: "inline-block", transform: isCollapsed(group.key) ? "rotate(-90deg)" : "rotate(0deg)" }}>&#9660;</span>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>{monthLabel}</h3>
                  {isCollapsed(group.key) && <span style={{ fontSize: 12, color: PALETTE.textMuted }}>({group.transactions.length} transactions)</span>}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
                  <span style={{ color: PALETTE.income }}>+{fmt(monthIncome)}</span>
                  <span style={{ color: PALETTE.expense }}>-{fmt(monthExpenses)}</span>
                </div>
              </div>

              {/* Transaction rows */}
              {!isCollapsed(group.key) && (
                <div>
                  {/* Table header */}
                  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px 110px 100px 160px 50px", gap: 0, padding: "6px 10px", borderBottom: `1px solid ${PALETTE.border}` }}>
                    {["Date", "Description", "Source", "Type", "Amount", "Category", ""].map((h) => (
                      <div key={h} style={{ fontSize: 11, color: PALETTE.textMuted, fontWeight: 600 }}>{h}</div>
                    ))}
                  </div>

                  {group.transactions.map((t) => {
                    const cat = ALL_CATEGORIES.find((c) => c.id === t.category);
                    const hmrcCat = EXPENSE_CATEGORIES.find((c) => c.id === t.category);
                    const isExpanded = expanded.has(t.id);
                    const isEditing = editId === t.id;
                    const invoice = invoiceMap[t.id] || (t.invoice_id ? invoiceMap[t.id] : null);
                    const isUploading = uploading === t.id;

                    return (
                      <div key={t.id} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                        {/* Summary row — clickable */}
                        <div
                          onClick={() => toggleExpand(t.id)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "100px 1fr 80px 110px 100px 160px 50px",
                            gap: 0,
                            padding: "10px 10px",
                            cursor: "pointer",
                            opacity: t.excluded ? 0.4 : 1,
                            borderLeft: `3px solid ${t.excluded ? "transparent" : t.category === "transfer" ? PALETTE.purple : t.type === "reimbursement" ? PALETTE.cyan : !t.category ? PALETTE.orange : "transparent"}`,
                            background: isExpanded ? PALETTE.bg : "transparent",
                            transition: "background 0.15s",
                          }}
                        >
                          <div style={{ fontSize: 13, color: PALETTE.textDim, whiteSpace: "nowrap" }}>{fmtDate(t.date)}</div>
                          <div style={{
                            fontSize: 13, color: PALETTE.text,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            textDecoration: t.excluded ? "line-through" : "none",
                            display: "flex", alignItems: "center", gap: 6,
                          }}>
                            <span style={{ fontSize: 10, color: PALETTE.textMuted, transition: "transform 0.2s", display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                            {t.description}
                            {(invoice || t.invoice_id) && <span style={{ fontSize: 10, color: PALETTE.accent }} title="Has invoice">&#128206;</span>}
                            {t.excluded && t.exclude_reason && (
                              <span style={{ fontSize: 10, color: PALETTE.orange, fontStyle: "italic", flexShrink: 0 }}>
                                ({t.exclude_reason})
                              </span>
                            )}
                          </div>
                          <div><Badge color={t.source === "bank" ? PALETTE.blue : t.source === "paypal" ? PALETTE.cyan : PALETTE.textDim}>{t.source}</Badge></div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <select
                              value={t.type}
                              onChange={(e) => quickSaveType(t.id, e.target.value)}
                              style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                                color: t.type === "income" ? PALETTE.income : t.type === "transfer" ? PALETTE.purple : t.type === "reimbursement" ? PALETTE.cyan : PALETTE.expense,
                                outline: "none", padding: "2px 0",
                              }}
                            >
                              <option value="income">Income</option>
                              <option value="expense">Expense</option>
                              <option value="transfer">Transfer</option>
                              <option value="reimbursement">Reimbursement</option>
                            </select>
                          </div>
                          <div style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: t.type === "income" ? PALETTE.income : t.type === "transfer" ? PALETTE.purple : t.type === "reimbursement" ? PALETTE.cyan : PALETTE.expense }}>
                            {fmt(t.amount)}
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <select
                              value={t.category || ""}
                              onChange={(e) => quickSaveCategory(t.id, e.target.value)}
                              style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                fontSize: 12, outline: "none", padding: "2px 0", maxWidth: 130,
                                color: t.category ? PALETTE.textDim : PALETTE.orange,
                              }}
                            >
                              <option value="">Uncategorised</option>
                              {(t.type === "income" ? incomeCats : t.type === "transfer" ? [{ id: "transfer", label: "Transfer" }] : t.type === "reimbursement" ? [{ id: "reimbursement", label: "Director Reimbursement" }] : expenseCats).map((c) => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => deleteTransaction(t.id)} title="Delete" style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 13, padding: 2 }}>&#128465;</button>
                          </div>
                        </div>

                        {/* Expanded detail panel */}
                        {isExpanded && (
                          <div style={{
                            padding: "16px 20px 20px",
                            background: PALETTE.bg,
                            borderTop: `1px solid ${PALETTE.border}`,
                          }}>
                            {/* Edit mode */}
                            {isEditing ? (
                              <div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                                  <div>
                                    <div style={detailLabel}>Description <span style={{ fontSize: 10, color: PALETTE.textMuted, fontWeight: 400 }}>(locked)</span></div>
                                    <div style={{ ...detailValue, padding: "8px 12px", background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.textDim }}>{editData.description}</div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Type</div>
                                    <Select value={editData.type} onChange={(v) => setEditData({ ...editData, type: v, category: v === "transfer" ? "transfer" : v === "reimbursement" ? "reimbursement" : "" })}
                                      options={[{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }, { value: "transfer", label: "Transfer" }, { value: "reimbursement", label: "Reimbursement" }]} style={{ width: "100%" }} />
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Amount (GBP) <span style={{ fontSize: 10, color: PALETTE.textMuted, fontWeight: 400 }}>(locked)</span></div>
                                    <div style={{ ...detailValue, padding: "8px 12px", background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 6, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: PALETTE.textDim }}>{fmt(editData.amount)}</div>
                                  </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                                  <div>
                                    <div style={detailLabel}>Category</div>
                                    <Select
                                      value={editData.category}
                                      onChange={(v) => setEditData({ ...editData, category: v })}
                                      options={[{ value: "", label: "Select..." }, ...(editData.type === "transfer" ? [{ id: "transfer", label: "Transfer" }] : editData.type === "reimbursement" ? [{ id: "reimbursement", label: "Director Reimbursement" }] : editData.type === "income" ? incomeCats : expenseCats).map((c) => ({ value: c.id, label: c.label }))]}
                                      style={{ width: "100%" }}
                                    />
                                  </div>
                                  <div>
                                    <div style={detailLabel}>VAT Rate</div>
                                    <Select
                                      value={String(Number(editData.vat_rate) < 0 ? editData.vat_rate : Number(editData.vat_rate))}
                                      onChange={(v) => setEditData({ ...editData, vat_rate: Number(v) })}
                                      options={[
                                        { value: "0", label: "No VAT (0%)" },
                                        { value: "20", label: "Standard (20%)" },
                                        { value: "5", label: "Reduced (5%)" },
                                        { value: "-1", label: "Exempt" },
                                        { value: "-2", label: "Outside Scope" },
                                      ]}
                                      style={{ width: "100%" }}
                                    />
                                    {Number(editData.vat_rate) > 0 && (
                                      <div style={{ fontSize: 11, color: PALETTE.textMuted, marginTop: 4 }}>
                                        VAT: {fmt(r2(Number(editData.amount) * (Number(editData.vat_rate) / (100 + Number(editData.vat_rate)))))}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Notes</div>
                                    <Input value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} placeholder="Add notes..." />
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Button onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
                                  <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              /* Read-only detail view */
                              <div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                                  <div>
                                    <div style={detailLabel}>Description</div>
                                    <div style={detailValue}>{t.description}</div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Date</div>
                                    <div style={detailValue}>{fmtDate(t.date)}</div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Amount</div>
                                    <div style={{ ...detailValue, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: t.type === "income" ? PALETTE.income : t.type === "transfer" ? PALETTE.purple : t.type === "reimbursement" ? PALETTE.cyan : PALETTE.expense }}>
                                      {fmt(t.amount)}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Type</div>
                                    <div style={detailValue}>
                                      <Badge color={t.type === "income" ? PALETTE.income : t.type === "transfer" ? PALETTE.purple : t.type === "reimbursement" ? PALETTE.cyan : PALETTE.expense}>{t.type}</Badge>
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                                  <div>
                                    <div style={detailLabel}>Category</div>
                                    <div style={detailValue}>{cat ? cat.label : t.category || "Uncategorised"}</div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>HMRC Category</div>
                                    <div style={detailValue}>{hmrcCat?.hmrc || "—"}</div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Source</div>
                                    <div style={detailValue}>{t.source}</div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>VAT</div>
                                    <div style={detailValue}>
                                      {Number(t.vat_rate) > 0
                                        ? `${t.vat_rate}% (${fmt(t.vat_amount)})`
                                        : Number(t.vat_rate) === -1 ? "Exempt"
                                        : Number(t.vat_rate) === -2 ? "Outside Scope"
                                        : "None"}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                                  <div>
                                    <div style={detailLabel}>Status</div>
                                    <div style={detailValue}>
                                      {t.excluded
                                        ? <Badge color={PALETTE.orange}>Excluded</Badge>
                                        : <Badge color={PALETTE.income}>Active</Badge>}
                                      {t.exclude_reason && <div style={{ fontSize: 11, color: PALETTE.textMuted, marginTop: 2 }}>{t.exclude_reason}</div>}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Notes</div>
                                    <div style={detailValue}>{t.notes || "—"}</div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Internal ID</div>
                                    <div style={{ ...detailValue, fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: PALETTE.textMuted, wordBreak: "break-all" }}>{t.id}</div>
                                  </div>
                                  <div>
                                    <div style={detailLabel}>Last Updated</div>
                                    <div style={detailValue}>{t.updated_at ? fmtDate(t.updated_at) : "—"}</div>
                                  </div>
                                </div>

                                {/* Invoice / Receipt section */}
                                <div style={{
                                  padding: "14px 16px",
                                  background: PALETTE.card,
                                  borderRadius: 8,
                                  border: `1px solid ${PALETTE.border}`,
                                  marginBottom: 16,
                                }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: PALETTE.text, marginBottom: 10 }}>
                                    Invoice / Receipt
                                  </div>
                                  {invoice ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                      <div style={{
                                        width: 36, height: 36, borderRadius: 6,
                                        background: PALETTE.accent + "15", display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 16,
                                      }}>
                                        &#128206;
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, color: PALETTE.text }}>{invoice.file_name || "Invoice"}</div>
                                        <div style={{ fontSize: 11, color: PALETTE.textMuted }}>
                                          Uploaded {invoice.upload_date ? fmtDate(invoice.upload_date) : ""}
                                        </div>
                                      </div>
                                      <Button variant="outline" onClick={() => viewInvoice(invoice.id)} style={{ fontSize: 12, padding: "6px 12px" }}>
                                        View
                                      </Button>
                                      <Button variant="ghost" onClick={() => removeInvoice(t.id, invoice.id)} style={{ fontSize: 12, padding: "6px 12px", color: PALETTE.danger }}>
                                        Remove
                                      </Button>
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                      <div style={{ fontSize: 12, color: PALETTE.textMuted, flex: 1 }}>
                                        No invoice attached. Upload a PDF or image file.
                                      </div>
                                      <Button
                                        variant="outline"
                                        onClick={() => handleFileSelect(t.id)}
                                        disabled={isUploading}
                                        style={{ fontSize: 12, padding: "6px 14px" }}
                                      >
                                        {isUploading ? "Uploading..." : "Upload Invoice"}
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <Button onClick={() => startEdit(t)} style={{ fontSize: 12, padding: "6px 14px" }}>Edit</Button>
                                  <Button
                                    variant={t.excluded ? "outline" : "ghost"}
                                    onClick={() => toggleExclude(t)}
                                    style={{ fontSize: 12, padding: "6px 14px" }}
                                  >
                                    {t.excluded ? "Include in Accounts" : "Exclude from Accounts"}
                                  </Button>
                                  {t.type === "expense" && !t.excluded && t.exclude_reason !== "Moved to personal expenses" && (
                                    <Button
                                      variant="ghost"
                                      onClick={() => moveToPersonalExpenses(t)}
                                      style={{ fontSize: 12, padding: "6px 14px", color: PALETTE.purple }}
                                    >
                                      Move to Personal Expenses
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
