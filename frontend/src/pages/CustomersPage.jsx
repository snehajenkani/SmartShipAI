import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

const CustomersPage = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState(null); // null | "scanning" | "routing"
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [createStatus, setCreateStatus] = useState(null);
  const [createBusy, setCreateBusy] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/customers");
      setCustomers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newDisplayName.trim()) {
      setCreateStatus({ type: "error", message: "Both fields are required" });
      return;
    }
    setCreateBusy(true);
    setCreateStatus(null);
    try {
      const res = await api.post("/admin/customers", {
        name: newName.trim(),
        displayName: newDisplayName.trim(),
      });
      setCreateStatus({ type: "success", message: `"${res.data.displayName}" created. Configure it below.` });
      setNewName("");
      setNewDisplayName("");
      await fetchCustomers();
      navigate(`/admin/client/${res.data.id}`);
    } catch (err) {
      setCreateStatus({ type: "error", message: err.response?.data?.message || "Failed to create client" });
    } finally {
      setCreateBusy(false);
    }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const modeLabel = (m) =>
    m === "direct" ? "TrackingID → RouteName" : "TrackingID → RouteID → RouteName";

  // ── MODE SELECTION SCREEN ──
  if (!mode) {
    return (
      <div className="page">
        <header className="top-bar">
          <div className="top-bar-logo">
            <img src={logo} alt="SmartShip Logistics" />
            <span className="top-bar-logo-label">Admin</span>
          </div>
          <div className="top-bar-right">
            <span className="username-tag">{auth?.username}</span>
            <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <main className="content" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--brand-navy)", marginBottom: 8, textAlign: "center" }}>
            What would you like to do?
          </h2>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 40, textAlign: "center", fontSize: 14 }}>
            Choose a module to get started
          </p>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", maxWidth: 1000 }}>
            {/* Scanning card */}
            <button
              onClick={() => setMode("scanning")}
              style={{
                flex: "1 1 280px", maxWidth: 300,
                padding: "36px 28px", borderRadius: 16,
                border: "2px solid var(--color-border)",
                background: "var(--color-surface-raised)",
                cursor: "pointer", textAlign: "left",
                transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand-teal)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>📦</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--brand-navy)", marginBottom: 8 }}>Scanning</div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                Upload shipment data and let loaders scan barcodes to identify routes with voice announcements.
              </div>
              <div style={{ marginTop: 20, fontSize: 13, fontWeight: 700, color: "var(--brand-teal)" }}>
                Get started →
              </div>
            </button>

            {/* Routing card */}
            <button
              onClick={() => navigate("/routing")}
              style={{
                flex: "1 1 280px", maxWidth: 300,
                padding: "36px 28px", borderRadius: 16,
                border: "2px solid var(--color-border)",
                background: "var(--color-surface-raised)",
                cursor: "pointer", textAlign: "left",
                transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>🗺️</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--brand-navy)", marginBottom: 8 }}>Routing</div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                Upload master route data and a shipment Excel to automatically assign route names based on address and pincode matching.
              </div>
              <div style={{ marginTop: 20, fontSize: 13, fontWeight: 700, color: "#6366f1" }}>
                Get started →
              </div>
            </button>

            {/* Extension card */}
            <button
              onClick={() => navigate("/extension")}
              style={{
                flex: "1 1 280px", maxWidth: 300,
                padding: "36px 28px", borderRadius: 16,
                border: "2px solid var(--color-border)",
                background: "var(--color-surface-raised)",
                cursor: "pointer", textAlign: "left",
                transition: "border-color 0.15s, box-shadow 0.15s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>🧩</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--brand-navy)", marginBottom: 8 }}>Extension</div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                Upload Store Code / Area to Route Name mapping used by the SmartShip Chrome Extension for instant staff lookups.
              </div>
              <div style={{ marginTop: 20, fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>
                Get started →
              </div>
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── SCANNING PANEL ──
  return (
    <div className="page">
      <header className="top-bar">
        <div className="top-bar-logo">
          <img src={logo} alt="SmartShip Logistics" />
          <span className="top-bar-logo-label">Admin</span>
        </div>
        <div className="top-bar-right">
          <span className="username-tag">{auth?.username}</span>
          <button className="btn btn-outline" onClick={() => setMode(null)}>← Home</button>
          <button className="btn btn-outline" onClick={() => navigate("/scanner")}>Scanner</button>
          <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="content">

        {/* ── SECTION 1: Register New Client ── */}
        <div className="section-label">Register New Client</div>
        <div className="card">
          <p className="helper-text" style={{ marginBottom: "16px" }}>
            Each client has independent master route data and shipment Excel format.
          </p>
          <form onSubmit={handleCreateCustomer} className="upload-form-column">
            <div className="mapping-row">
              <div className="mapping-field">
                <label>Client Code <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(e.g. UC, MP)</span></label>
                <input
                  type="text"
                  placeholder="UC"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.toUpperCase())}
                />
              </div>
              <div className="mapping-field">
                <label>Client Name <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(e.g. Urban Company)</span></label>
                <input
                  type="text"
                  placeholder="Urban Company"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={createBusy} style={{ alignSelf: "flex-start" }}>
              {createBusy ? "Creating..." : "Register Client"}
            </button>
          </form>
          {createStatus && (
            <div className={createStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>
              {createStatus.message}
            </div>
          )}
        </div>

        {/* ── SECTION 2: Manage Existing Clients ── */}
        <div className="section-label">Manage Existing Clients</div>
        <div className="card">
          <p className="helper-text" style={{ marginBottom: "16px" }}>
            Select a client to configure their route data, Excel format, and daily shipment uploads.
          </p>
          {loading ? (
            <p className="muted">Loading clients...</p>
          ) : customers.length === 0 ? (
            <p className="muted">No clients registered yet. Add one above.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/admin/client/${c.id}`)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px", borderRadius: "8px",
                    border: "1.5px solid var(--color-border)",
                    background: "var(--color-surface-raised)",
                    cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--brand-teal)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontWeight: 700, color: "var(--brand-navy)", fontSize: "15px" }}>{c.displayName}</span>
                      <span style={{
                        fontSize: "11px", fontWeight: 700, color: "white",
                        background: "var(--brand-teal)", borderRadius: "4px",
                        padding: "2px 7px", letterSpacing: "0.4px",
                      }}>{c.name}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <span>{c.extractionMode ? `Mode: ${modeLabel(c.extractionMode)}` : "⚠ Mode not configured"}</span>
                      <span>{c.hasLoaderMapping ? "✅ Loader format set" : "❌ No loader format"}</span>
                      {c.extractionMode === "route-lookup" && (
                        <span>{c.hasMasterData ? `✅ ${c.masterDataCount} master entries` : "❌ No master data"}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: "var(--brand-teal)", fontSize: "20px", marginLeft: "16px" }}>›</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── SECTION 3: Multi-Client Vehicle Dispatch ── */}
        <div className="section-label">Multi-Client Vehicle Dispatch</div>
        <div className="card" style={{ border: "2px solid var(--brand-teal)" }}>
          <p className="helper-text" style={{ marginBottom: "20px" }}>
            Load shipment data for multiple clients onto a single vehicle. Upload each client's
            Excel separately — the scanner will auto-identify which client a package belongs to.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/admin/vehicle")}
            style={{ fontSize: "15px", padding: "14px 28px", fontWeight: 700 }}
          >
            🚛 Set Up Today's Vehicle
          </button>
        </div>

      </main>
    </div>
  );
};

export default CustomersPage;
