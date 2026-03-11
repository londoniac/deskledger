import { useState, useEffect, useMemo } from "react";
import api from "../lib/api.js";
import { PALETTE } from "../lib/constants.js";
import { fmt, fmtDate } from "../lib/format.js";
import { Card, Badge, Button, Input, Label, ErrorMsg, SuccessMsg, Spinner } from "../components/ui.jsx";

const TYPE_LABELS = {
  author_payout: "Author Payout",
  transfer_in: "Transfer In",
  fee: "PayPal Fee",
  refund: "Refund",
  other: "Other",
};

const TYPE_COLOURS = {
  author_payout: PALETTE.expense,
  transfer_in: PALETTE.purple,
  fee: PALETTE.orange,
  refund: PALETTE.cyan,
  other: PALETTE.textDim,
};

export default function PayPal() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Sync controls
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const today = new Date().toISOString().split("T")[0];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(ninetyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  // Filter
  const [typeFilter, setTypeFilter] = useState("all");

  // Collapsed months
  const [collapsed, setCollapsed] = useState(new Set());
  const toggleMonth = (key) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  useEffect(() => {
    api.paypal.getTransactions()
      .then((data) => setTransactions(data || []))
      .catch((e) => setMessage({ type: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setMessage({ type: "", text: "" });
    try {
      const res = await api.paypal.sync(
        new Date(startDate).toISOString(),
        new Date(endDate).toISOString()
      );
      setSyncResult(res);
      // Reload transactions
      const data = await api.paypal.getTransactions();
      setTransactions(data || []);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
    setSyncing(false);
  };

  const handleClearAll = async () => {
    if (!confirm(`Delete all ${transactions.length} PayPal transactions? This cannot be undone.`)) return;
    try {
      const res = await api.paypal.clearAll();
      setTransactions([]);
      setSyncResult(null);
      setMessage({ type: "success", text: `Cleared ${res.deleted} PayPal transactions.` });
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const deleteTransaction = async (id) => {
    if (!confirm("Delete this PayPal transaction?")) return;
    try {
      await api.paypal.deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const filtered = useMemo(() => {
    if (typeFilter === "all") return transactions;
    return transactions.filter((t) => t.type === typeFilter);
  }, [transactions, typeFilter]);

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

  // Summary stats
  const stats = useMemo(() => {
    const payouts = transactions.filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || 0), 0);
    const transfers = transactions.filter((t) => t.type === "transfer_in").reduce((s, t) => s + Number(t.gbp_amount || 0), 0);
    const fees = transactions.filter((t) => t.type === "fee").reduce((s, t) => s + Number(t.fee_amount || t.gbp_amount || 0), 0);
    const refunds = transactions.filter((t) => t.type === "refund").reduce((s, t) => s + Number(t.gbp_amount || 0), 0);
    return { payouts, transfers, fees, refunds, balance: transfers - payouts - fees - refunds };
  }, [transactions]);

  if (loading) return <Spinner />;

  return (
    <div>
      {message.type === "error" && <ErrorMsg message={message.text} />}
      {message.type === "success" && <SuccessMsg message={message.text} />}

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Transferred In", value: fmt(stats.transfers), color: PALETTE.purple },
          { label: "Author Payouts", value: fmt(stats.payouts), color: PALETTE.expense },
          { label: "PayPal Fees", value: fmt(stats.fees), color: PALETTE.orange },
          { label: "Refunds", value: fmt(stats.refunds), color: PALETTE.cyan },
        ].map((s) => (
          <div key={s.label} style={{
            flex: 1, minWidth: 160, background: PALETTE.card,
            border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 4, fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "JetBrains Mono, monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Sync controls */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
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
          {transactions.length > 0 && (
            <Button onClick={handleClearAll} style={{ background: PALETTE.danger }}>
              Clear All
            </Button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: PALETTE.textMuted }}>{filtered.length} of {transactions.length} transactions</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                padding: "6px 10px", background: PALETTE.bg, color: PALETTE.text,
                border: `1px solid ${PALETTE.border}`, borderRadius: 6, fontSize: 12, outline: "none",
              }}
            >
              <option value="all">All Types</option>
              <option value="author_payout">Author Payouts</option>
              <option value="transfer_in">Transfers In</option>
              <option value="fee">Fees</option>
              <option value="refund">Refunds</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {syncResult && (
          <div style={{ marginTop: 12, padding: "12px 16px", background: PALETTE.accentDim, borderRadius: 8, fontSize: 13, color: PALETTE.accent }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Sync complete</div>
            <div>Fetched {syncResult.totalFetched} raw events from PayPal</div>
            <div>{syncResult.kept} kept after filtering ({syncResult.skipped} internal entries skipped, {syncResult.currencyDupes} currency duplicates removed{syncResult.notifDupes > 0 ? `, ${syncResult.notifDupes} notification duplicates removed` : ""})</div>
            {syncResult.gbpResolved > 0 && (
              <div>{syncResult.gbpResolved} GBP amounts resolved from companion events</div>
            )}
            <div style={{ fontWeight: 600, marginTop: 4 }}>
              {syncResult.newImported} new transactions imported
              {syncResult.alreadyExisted > 0 && `, ${syncResult.alreadyExisted} already existed`}
            </div>
          </div>
        )}
      </Card>

      {/* Transaction list */}
      {grouped.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: PALETTE.textMuted, fontSize: 13 }}>
            No PayPal transactions yet. Use the sync button above to fetch from PayPal.
          </div>
        </Card>
      ) : (
        grouped.map((group) => {
          const monthPayouts = group.transactions.filter((t) => t.type === "author_payout").reduce((s, t) => s + Number(t.gbp_amount || 0), 0);
          const monthTransfers = group.transactions.filter((t) => t.type === "transfer_in").reduce((s, t) => s + Number(t.gbp_amount || 0), 0);
          const monthLabel = new Date(group.key + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

          return (
            <Card key={group.key} style={{ marginBottom: 16 }}>
              {/* Month header */}
              <div
                onClick={() => toggleMonth(group.key)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: collapsed.has(group.key) ? 0 : 12 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: PALETTE.textMuted, transition: "transform 0.2s", display: "inline-block", transform: collapsed.has(group.key) ? "rotate(-90deg)" : "rotate(0deg)" }}>&#9660;</span>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: PALETTE.text }}>{monthLabel}</h3>
                  {collapsed.has(group.key) && <span style={{ fontSize: 12, color: PALETTE.textMuted }}>({group.transactions.length} transactions)</span>}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
                  {monthTransfers > 0 && <span style={{ color: PALETTE.purple }}>+{fmt(monthTransfers)}</span>}
                  {monthPayouts > 0 && <span style={{ color: PALETTE.expense }}>-{fmt(monthPayouts)}</span>}
                </div>
              </div>

              {/* Rows */}
              {!collapsed.has(group.key) && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 110px 100px 100px 40px", gap: 0, padding: "6px 10px", borderBottom: `1px solid ${PALETTE.border}` }}>
                    {["Date", "Description", "Type", "Author", "Original", "GBP", ""].map((h) => (
                      <div key={h} style={{ fontSize: 11, color: PALETTE.textMuted, fontWeight: 600 }}>{h}</div>
                    ))}
                  </div>

                  {group.transactions.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr 120px 110px 100px 100px 40px",
                        gap: 0,
                        padding: "8px 10px",
                        borderBottom: `1px solid ${PALETTE.border}`,
                        borderLeft: `3px solid ${TYPE_COLOURS[t.type] || "transparent"}`,
                      }}
                    >
                      <div style={{ fontSize: 13, color: PALETTE.textDim }}>{fmtDate(t.date)}</div>
                      <div style={{ fontSize: 13, color: PALETTE.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.description}
                      </div>
                      <div>
                        <Badge color={TYPE_COLOURS[t.type] || PALETTE.textDim}>
                          {TYPE_LABELS[t.type] || t.type}
                        </Badge>
                      </div>
                      <div style={{ fontSize: 12, color: PALETTE.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.author_name || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: PALETTE.textMuted, fontFamily: "JetBrains Mono, monospace" }}>
                        {t.currency !== "GBP" ? `${t.currency} ${Number(t.amount).toFixed(2)}` : "—"}
                      </div>
                      <div style={{ fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: t.gbp_amount == null ? PALETTE.warning : (TYPE_COLOURS[t.type] || PALETTE.text) }}>
                        {t.gbp_amount != null ? fmt(t.gbp_amount) : "No rate"}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <button
                          onClick={() => deleteTransaction(t.id)}
                          title="Delete"
                          style={{ background: "none", border: "none", color: PALETTE.textMuted, cursor: "pointer", fontSize: 13, padding: 2 }}
                        >&#128465;</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
