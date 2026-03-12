import { useState, useEffect } from "react";
import api from "../lib/api.js";
import { PALETTE } from "../lib/constants.js";
import { Card, Button, Badge, Spinner } from "../components/ui.jsx";

export default function AccountantDashboard({ onSelectClient }) {
  const [clients, setClients] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [clientData, invData] = await Promise.all([
        api.accountant.getClients(),
        api.invitations.list(),
      ]);
      setClients(clientData || []);
      setInvitations((invData || []).filter((i) => i.status === "pending"));
    } catch (e) {
      // ignore
    }
    setLoading(false);
  };

  const acceptInvitation = async (id) => {
    setActionLoading(id);
    try {
      await api.invitations.accept(id);
      await loadData();
    } catch (e) {
      // ignore
    }
    setActionLoading(null);
  };

  const declineInvitation = async (id) => {
    setActionLoading(id);
    try {
      await api.invitations.decline(id);
      await loadData();
    } catch (e) {
      // ignore
    }
    setActionLoading(null);
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: PALETTE.text, marginBottom: 24 }}>Your Clients</h2>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: PALETTE.warning, marginBottom: 12 }}>Pending Invitations</h3>
          {invitations.map((inv) => (
            <div key={inv.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 0", borderBottom: `1px solid ${PALETTE.border}`,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: PALETTE.text }}>
                  {inv.from_profile?.company_name || "Unknown Company"}
                </div>
                <div style={{ fontSize: 12, color: PALETTE.textMuted }}>{inv.from_profile?.email}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={() => acceptInvitation(inv.id)} disabled={actionLoading === inv.id}>
                  {actionLoading === inv.id ? "..." : "Accept"}
                </Button>
                <Button variant="ghost" onClick={() => declineInvitation(inv.id)} disabled={actionLoading === inv.id}>
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Client list */}
      {clients.length === 0 && invitations.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 16, color: PALETTE.textDim, marginBottom: 8 }}>No clients yet</div>
            <div style={{ fontSize: 13, color: PALETTE.textMuted }}>
              Ask your clients to invite you from their Settings page
            </div>
          </div>
        </Card>
      )}

      {clients.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280, 1fr))", gap: 16 }}>
          {clients.map((c) => (
            <Card
              key={c.client_id}
              style={{ cursor: "pointer", transition: "border-color 0.2s" }}
            >
              <div onClick={() => onSelectClient(c.client_id)}>
                <div style={{ fontSize: 16, fontWeight: 600, color: PALETTE.text, marginBottom: 4 }}>
                  {c.client?.company_name || "Unnamed Company"}
                </div>
                <div style={{ fontSize: 12, color: PALETTE.textMuted, marginBottom: 8 }}>{c.client?.email}</div>
                {c.client?.company_reg && (
                  <div style={{ fontSize: 11, color: PALETTE.textMuted }}>Reg: {c.client.company_reg}</div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Badge color={PALETTE.accent}>Read-only</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
