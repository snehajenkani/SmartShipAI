import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

const ColSelect = ({ label, headers, value, onChange, required = true }) => (
  <div classNAAame="mapping-field">
    <label>
      {label}
      {!required && <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}> (optional)</span>}
    </label>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select column...</option>
      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  </div>
);

// ---------------------------------------------------------------------------
// Lookup file upload/edit card — mirrors MasterFileCard from RoutingPage
// ---------------------------------------------------------------------------
const LookupFileCard = ({
  savedFileName, savedCount, savedAt,
  editing, onStartEdit, onCancelEdit,
  file, headers, busy, onFileChange,
  searchCol, setSearchCol,
  routeNameCol, setRouteNameCol,
  onSave, saving,
}) => {
  const hasSaved = !!savedFileName;
  const color = "var(--brand-teal)";

  return (
    <div style={{
      border: `2px solid ${hasSaved && !editing ? color : "var(--color-border)"}`,
      borderRadius: 10, padding: "18px 20px",
      background: "var(--color-surface-raised)",
      maxWidth: 480,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Location → Route Name
        </div>
        {hasSaved && !editing && (
          <button onClick={onStartEdit} style={{
            fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)",
            background: "none", border: "1px solid var(--color-border)", borderRadius: 6,
            padding: "4px 10px", cursor: "pointer",
          }}>
            ✏️ Change
          </button>
        )}
      </div>

      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Used by the Chrome Extension. Staff can type a store code, a place name, or any part of the location text — it'll partial-match and return the Route Name.
      </p>

      {/* SAVED STATE (not editing) */}
      {hasSaved && !editing && (
        <div style={{ fontSize: 13 }}>
          <div style={{ color, fontWeight: 700, marginBottom: 4 }}>✅ Saved & active</div>
          <div style={{ color: "var(--color-text-muted)" }}>
            📄 {savedFileName} · {savedCount} entries
            {savedAt && <> · {new Date(savedAt).toLocaleDateString()}</>}
          </div>
        </div>
      )}

      {/* UPLOAD / EDIT STATE */}
      {(!hasSaved || editing) && (
        <div>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ fontSize: 13 }} />
          {busy && <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>Reading columns...</p>}
          {file && !busy && headers.length === 0 && (
            <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>Could not read columns from this file.</p>
          )}
          {headers.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <ColSelect label="Searchable column (e.g. Location — contains code + place name)" headers={headers} value={searchCol} onChange={setSearchCol} />
              <ColSelect label="Route Name column (e.g. Branch Area)" headers={headers} value={routeNameCol} onChange={setRouteNameCol} />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary"
                  disabled={!searchCol || !routeNameCol || saving}
                  onClick={onSave}
                  style={{ fontSize: 13, padding: "8px 16px" }}
                >
                  {saving ? "Saving..." : "💾 Save"}
                </button>
                {editing && (
                  <button
                    className="btn btn-outline"
                    onClick={onCancelEdit}
                    style={{ fontSize: 13, padding: "8px 16px" }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ExtensionPage
// ---------------------------------------------------------------------------
const ExtensionPage = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  // ── Customers ──
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // ── Lookup data state (for selected customer) ──
  const [lookupInfo, setLookupInfo] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searchCol, setSearchCol] = useState("");
  const [routeNameCol, setRouteNameCol] = useState("");
  const [saving, setSaving] = useState(false);

  const [actionStatus, setActionStatus] = useState(null);

  const handleLogout = () => { logout(); navigate("/login"); };

  // ── Load customers ──
  const fetchCustomers = async () => {
    try {
      setCustomersLoading(true);
      const res = await api.get("/extension/customers");
      setCustomers(res.data);
    } catch (err) { console.error(err); }
    finally { setCustomersLoading(false); }
  };
  useEffect(() => { fetchCustomers(); }, []);

  // ── Load lookup info when customer selected ──
  const fetchLookupInfo = async (customerId) => {
    setLookupLoading(true);
    try {
      const res = await api.get(`/extension/customers/${customerId}/lookup`);
      setLookupInfo(res.data);
    } catch (err) { console.error(err); }
    finally { setLookupLoading(false); }
  };

  const handleSelectCustomer = (id) => {
    setSelectedCustomerId(id);
    setLookupInfo(null);
    setActionStatus(null);
    setEditing(false);
    setFile(null); setHeaders([]); setSearchCol(""); setRouteNameCol("");
    if (id) fetchLookupInfo(id);
  };

  const previewColumns = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post("/extension/preview-columns", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.headers || [];
  };

  const handleFileChange = async (e) => {
    const f = e.target.files[0];
    setFile(f); setHeaders([]); setSearchCol(""); setRouteNameCol("");
    if (!f) return;
    setBusy(true);
    try { setHeaders(await previewColumns(f)); }
    catch { setActionStatus({ type: "error", message: "Could not read columns from this file" }); }
    finally { setBusy(false); }
  };

  const handleSave = async () => {
    if (!file || !searchCol || !routeNameCol) return;
    setSaving(true); setActionStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("searchColumn", searchCol);
      fd.append("routeNameColumn", routeNameCol);
      await api.post(`/extension/customers/${selectedCustomerId}/lookup`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setActionStatus({ type: "success", message: "Extension lookup data saved." });
      setEditing(false);
      setFile(null); setHeaders([]); setSearchCol(""); setRouteNameCol("");
      await fetchLookupInfo(selectedCustomerId);
      await fetchCustomers();
    } catch (err) {
      setActionStatus({ type: "error", message: err.response?.data?.message || "Failed to save lookup data" });
    } finally { setSaving(false); }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="page">
      <header className="top-bar">
        <div className="top-bar-logo">
          <img src={logo} alt="SmartShip Logistics" />
          <span className="top-bar-logo-label">Extension</span>
        </div>
        <div className="top-bar-right">
          <span className="username-tag">{auth?.username}</span>
          <button className="btn btn-outline" onClick={() => navigate("/admin")}>Admin Panel</button>
          <button className="btn btn-outline" onClick={() => navigate("/routing")}>Routing</button>
          <button className="btn btn-outline" onClick={() => navigate("/scanner")}>Scanner</button>
          <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="content">

        {/* ── Customer selector ── */}
        <div className="section-label">Select Customer</div>
        <div className="card">
          {customersLoading ? (
            <p className="muted">Loading customers...</p>
          ) : customers.length === 0 ? (
            <p className="muted">No customers registered yet. Add one from the Admin Panel first.</p>
          ) : (
            <div className="mapping-field" style={{ maxWidth: 360 }}>
              <label>Customer</label>
              <select value={selectedCustomerId} onChange={(e) => handleSelectCustomer(e.target.value)}>
                <option value="">Select a customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} ({c.name}) {c.hasLookupData ? "✅" : "⚠️ lookup data needed"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {selectedCustomerId && (
          <>
            {/* ── Lookup Data section (always visible, editable) ── */}
            <div className="section-label">Extension Lookup Data — {selectedCustomer?.displayName}</div>
            <div className="card">
              <p className="helper-text" style={{ marginBottom: 20 }}>
                This data powers the SmartShip Chrome Extension. Staff enter a store code or place name and get the matching Route Name instantly, from any tab. Data is saved permanently until you change it.
              </p>

              {lookupLoading ? (
                <p className="muted">Loading lookup data...</p>
              ) : (
                <LookupFileCard
                  savedFileName={lookupInfo?.fileName}
                  savedCount={lookupInfo?.count}
                  savedAt={lookupInfo?.uploadedAt}
                  editing={editing}
                  onStartEdit={() => setEditing(true)}
                  onCancelEdit={() => { setEditing(false); setFile(null); setHeaders([]); }}
                  file={file}
                  headers={headers}
                  busy={busy}
                  onFileChange={handleFileChange}
                  searchCol={searchCol}
                  setSearchCol={setSearchCol}
                  routeNameCol={routeNameCol}
                  setRouteNameCol={setRouteNameCol}
                  onSave={handleSave}
                  saving={saving}
                />
              )}

              {actionStatus && (
                <div className={actionStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: 16 }}>
                  {actionStatus.message}
                </div>
              )}
            </div>
          </>
        )}

      </main>
    </div>
  );
};

export default ExtensionPage;
