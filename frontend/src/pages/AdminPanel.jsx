import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

const AdminPanel = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState("home");
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customersLoading, setCustomersLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [createStatus, setCreateStatus] = useState(null);
  const [createBusy, setCreateBusy] = useState(false);

  const [editingDisplayName, setEditingDisplayName] = useState("");
  const [editStatus, setEditStatus] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const [modeStatus, setModeStatus] = useState(null);
  const [modeBusy, setModeBusy] = useState(false);

  const [masterFile, setMasterFile] = useState(null);
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [masterRouteIdCol, setMasterRouteIdCol] = useState("");
  const [masterRouteNameCol, setMasterRouteNameCol] = useState("");
  const [masterStatus, setMasterStatus] = useState(null);
  const [masterBusy, setMasterBusy] = useState(false);
  const [masterDownloading, setMasterDownloading] = useState(false);

  const [loaderFile, setLoaderFile] = useState(null);
  const [loaderHeaders, setLoaderHeaders] = useState([]);
  const [loaderTrackingIdCol, setLoaderTrackingIdCol] = useState("");
  const [loaderRouteIdCol, setLoaderRouteIdCol] = useState("");
  const [loaderRouteNameCol, setLoaderRouteNameCol] = useState("");
  const [loaderStatus, setLoaderStatus] = useState(null);
  const [loaderBusy, setLoaderBusy] = useState(false);

  const fetchCustomers = async () => {
    try {
      setCustomersLoading(true);
      const res = await api.get("/admin/customers");
      setCustomers(res.data);
      if (selectedCustomer) {
        const updated = res.data.find((c) => c.id === selectedCustomer.id);
        if (updated) setSelectedCustomer(updated);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCustomersLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const previewColumns = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/admin/preview-columns", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.headers || [];
  };

  const resetConfigForms = () => {
    setMasterFile(null); setMasterHeaders([]); setMasterRouteIdCol(""); setMasterRouteNameCol(""); setMasterStatus(null);
    setLoaderFile(null); setLoaderHeaders([]); setLoaderTrackingIdCol(""); setLoaderRouteIdCol(""); setLoaderRouteNameCol(""); setLoaderStatus(null);
  };

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setModeStatus(null); setEditStatus(null); setShowEditForm(false);
    resetConfigForms();
    setView(customer.extractionMode ? "configure" : "mode");
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newDisplayName.trim()) {
      setCreateStatus({ type: "error", message: "Both fields are required" }); return;
    }
    setCreateBusy(true); setCreateStatus(null);
    try {
      const res = await api.post("/admin/customers", { name: newName.trim(), displayName: newDisplayName.trim() });
      setCreateStatus({ type: "success", message: `"${res.data.displayName}" created! Now configure it.` });
      setNewName(""); setNewDisplayName("");
      await fetchCustomers();
      const fresh = { id: res.data.id, name: res.data.name, displayName: res.data.displayName, extractionMode: null };
      setSelectedCustomer(fresh);
      setView("mode");
    } catch (err) {
      setCreateStatus({ type: "error", message: err.response?.data?.message || "Failed to create customer" });
    } finally { setCreateBusy(false); }
  };

  const handleDeleteCustomer = async () => {
    if (!window.confirm(`Delete "${selectedCustomer.displayName}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/customers/${selectedCustomer.id}`);
      setSelectedCustomer(null); setView("home");
      await fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete customer");
    }
  };

  const handleEditCustomer = async (e) => {
    e.preventDefault();
    if (!editingDisplayName.trim()) { setEditStatus({ type: "error", message: "Display name is required" }); return; }
    setEditBusy(true); setEditStatus(null);
    try {
      await api.patch(`/admin/customers/${selectedCustomer.id}`, { displayName: editingDisplayName.trim() });
      setEditStatus({ type: "success", message: "Name updated successfully" });
      setShowEditForm(false);
      await fetchCustomers();
    } catch (err) {
      setEditStatus({ type: "error", message: err.response?.data?.message || "Update failed" });
    } finally { setEditBusy(false); }
  };

  const handleSetMode = async (mode) => {
    setModeBusy(true); setModeStatus(null);
    try {
      const res = await api.post(`/admin/customers/${selectedCustomer.id}/extraction-mode`, { mode });
      setModeStatus({ type: "success", message: res.data.message });
      const updated = { ...selectedCustomer, extractionMode: mode };
      setSelectedCustomer(updated);
      await fetchCustomers();
      setTimeout(() => { setView("configure"); resetConfigForms(); }, 800);
    } catch (err) {
      setModeStatus({ type: "error", message: err.response?.data?.message || "Failed to set mode" });
    } finally { setModeBusy(false); }
  };

  const handleMasterFileChange = async (e) => {
    const file = e.target.files[0];
    setMasterFile(file); setMasterStatus(null); setMasterHeaders([]); setMasterRouteIdCol(""); setMasterRouteNameCol("");
    if (!file) return;
    try { setMasterHeaders(await previewColumns(file)); }
    catch (err) { setMasterStatus({ type: "error", message: "Could not read columns from this file" }); }
  };

  const handleMasterUpload = async (e) => {
    e.preventDefault();
    if (!masterFile || !masterRouteIdCol || !masterRouteNameCol) {
      setMasterStatus({ type: "error", message: "Select a file and both columns" }); return;
    }
    const formData = new FormData();
    formData.append("file", masterFile);
    formData.append("routeIdColumn", masterRouteIdCol);
    formData.append("routeNameColumn", masterRouteNameCol);
    setMasterBusy(true); setMasterStatus(null);
    try {
      const res = await api.post(`/admin/customers/${selectedCustomer.id}/master-data`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMasterStatus({ type: "success", message: `${res.data.count} entries uploaded successfully.` });
      setMasterFile(null); setMasterHeaders([]); setMasterRouteIdCol(""); setMasterRouteNameCol("");
      await fetchCustomers();
    } catch (err) {
      setMasterStatus({ type: "error", message: err.response?.data?.message || "Upload failed" });
    } finally { setMasterBusy(false); }
  };

  // Download master data as Excel
  const handleMasterDownload = async () => {
    setMasterDownloading(true);
    try {
      const res = await api.get(`/admin/customers/${selectedCustomer.id}/master-data/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const safeName = selectedCustomer.displayName.replace(/\s+/g, "_");
      link.setAttribute("download", `MasterData_${safeName}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download master data. Please try again.");
    } finally { setMasterDownloading(false); }
  };

  const handleLoaderFileChange = async (e) => {
    const file = e.target.files[0];
    setLoaderFile(file); setLoaderStatus(null); setLoaderHeaders([]); setLoaderTrackingIdCol(""); setLoaderRouteIdCol(""); setLoaderRouteNameCol("");
    if (!file) return;
    try { setLoaderHeaders(await previewColumns(file)); }
    catch (err) { setLoaderStatus({ type: "error", message: "Could not read columns from this file" }); }
  };

  const handleLoaderMappingSave = async (e) => {
    e.preventDefault();
    const mode = selectedCustomer.extractionMode;
    const secondCol = mode === "direct" ? loaderRouteNameCol : loaderRouteIdCol;
    if (!loaderFile || !loaderTrackingIdCol || !secondCol) {
      setLoaderStatus({ type: "error", message: "Select a sample file and both columns" }); return;
    }
    const formData = new FormData();
    formData.append("file", loaderFile);
    formData.append("trackingIdColumn", loaderTrackingIdCol);
    if (mode === "direct") formData.append("routeNameColumn", loaderRouteNameCol);
    else formData.append("routeIdColumn", loaderRouteIdCol);
    setLoaderBusy(true); setLoaderStatus(null);
    try {
      const res = await api.post(`/admin/customers/${selectedCustomer.id}/loader-mapping`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLoaderStatus({ type: "success", message: res.data.message });
      setLoaderFile(null); setLoaderHeaders([]); setLoaderTrackingIdCol(""); setLoaderRouteIdCol(""); setLoaderRouteNameCol("");
      await fetchCustomers();
    } catch (err) {
      setLoaderStatus({ type: "error", message: err.response?.data?.message || "Save failed" });
    } finally { setLoaderBusy(false); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const modeLabel = (mode) =>
    mode === "direct" ? "TrackingID → RouteName" : "TrackingID → RouteID → RouteName";

  return (
    <div className="page">
      <header className="top-bar">
        <div className="top-bar-logo">
          <img src={logo} alt="SmartShip Logistics" />
          <span className="top-bar-logo-label">Admin Panel</span>
        </div>
        <div className="top-bar-right">
          <span className="username-tag">{auth?.username}</span>
          <button className="btn btn-outline" onClick={() => navigate("/scanner")}>Scanner</button>
          <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="content">

        {/* ================================================================
            VIEW: HOME
        ================================================================ */}
        {view === "home" && (
          <>
            <div className="card">
              <h2>Add New Customer</h2>
              <p className="helper-text">Create a new customer company. Each customer has independent master data and Excel format.</p>
              <form onSubmit={handleCreateCustomer} className="upload-form-column">
                <div className="mapping-row">
                  <div className="mapping-field">
                    <label>Short Code (e.g. UC, MEDPLUS)</label>
                    <input type="text" placeholder="UC" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  </div>
                  <div className="mapping-field">
                    <label>Display Name (e.g. Urban Company)</label>
                    <input type="text" placeholder="Urban Company" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={createBusy}>
                  {createBusy ? "Creating..." : "Create Customer"}
                </button>
              </form>
              {createStatus && (
                <div className={createStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>
                  {createStatus.message}
                </div>
              )}
            </div>

            <div className="card">
              <h2>Select Existing Customer</h2>
              <p className="helper-text">Choose a customer to configure or update their settings.</p>
              {customersLoading ? <p className="muted">Loading...</p> : customers.length === 0 ? (
                <p className="muted">No customers yet. Create one above.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 18px", borderRadius: "8px", border: "1.5px solid var(--color-border)",
                        background: "var(--color-surface-raised)", cursor: "pointer", textAlign: "left",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--brand-teal)"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--brand-navy)", fontSize: "15px" }}>{c.displayName}</div>
                        <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                          {c.extractionMode ? `Mode: ${modeLabel(c.extractionMode)}` : "⚠️ Mode not configured"}
                          {" · "}
                          {c.hasLoaderMapping ? "✅ Loader format set" : "❌ No loader format"}
                          {c.extractionMode === "route-lookup" && (" · " + (c.hasMasterData ? `✅ ${c.masterDataCount} master entries` : "❌ No master data"))}
                        </div>
                      </div>
                      <span style={{ color: "var(--brand-teal)", fontSize: "20px" }}>›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ================================================================
            VIEW: MODE
        ================================================================ */}
        {view === "mode" && selectedCustomer && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
              <button onClick={() => setView("home")} style={{ background: "none", border: "none", color: "var(--brand-teal)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: 0 }}>
                ← Back
              </button>
              <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>{selectedCustomer.displayName}</span>
            </div>

            <div className="card">
              <h2>How should route names be looked up?</h2>
              <p className="helper-text">
                Choose how SmartShip AI finds the route name when a barcode is scanned.
                This setting is saved permanently for <strong>{selectedCustomer.displayName}</strong>.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
                <button
                  onClick={() => handleSetMode("route-lookup")}
                  disabled={modeBusy}
                  style={{
                    padding: "20px 24px", borderRadius: "10px", border: "2px solid var(--color-border)",
                    background: selectedCustomer.extractionMode === "route-lookup" ? "var(--color-primary-light)" : "var(--color-surface-raised)",
                    borderColor: selectedCustomer.extractionMode === "route-lookup" ? "var(--brand-teal)" : "var(--color-border)",
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--brand-navy)", marginBottom: "6px" }}>
                    Option 1 — TrackingID → RouteID → RouteName
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                    Loader's Excel has Tracking ID + Route ID columns. Route ID is looked up against admin's master table to get Route Name.
                  </div>
                </button>

                <button
                  onClick={() => handleSetMode("direct")}
                  disabled={modeBusy}
                  style={{
                    padding: "20px 24px", borderRadius: "10px", border: "2px solid var(--color-border)",
                    background: selectedCustomer.extractionMode === "direct" ? "var(--color-primary-light)" : "var(--color-surface-raised)",
                    borderColor: selectedCustomer.extractionMode === "direct" ? "var(--brand-teal)" : "var(--color-border)",
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--brand-navy)", marginBottom: "6px" }}>
                    Option 2 — TrackingID → RouteName (Direct)
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                    Loader's Excel already has Tracking ID + Route Name. No master table needed.
                  </div>
                </button>
              </div>

              {modeStatus && (
                <div className={modeStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "16px" }}>
                  {modeStatus.message}
                </div>
              )}
            </div>
          </>
        )}

        {/* ================================================================
            VIEW: CONFIGURE
        ================================================================ */}
        {view === "configure" && selectedCustomer && (
          <>
            {/* Breadcrumb + actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button onClick={() => setView("home")} style={{ background: "none", border: "none", color: "var(--brand-teal)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: 0 }}>
                  ← All Customers
                </button>
                <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>/ {selectedCustomer.displayName}</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { setView("mode"); setModeStatus(null); }}
                  style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px", border: "1.5px solid var(--brand-teal)", background: "transparent", color: "var(--brand-teal)", cursor: "pointer", fontWeight: 600 }}>
                  Change Mode
                </button>
                <button onClick={() => { setShowEditForm(!showEditForm); setEditingDisplayName(selectedCustomer.displayName); setEditStatus(null); }}
                  style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px", border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer" }}>
                  Edit Name
                </button>
                <button onClick={handleDeleteCustomer}
                  style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px", border: "1.5px solid var(--color-invalid)", background: "transparent", color: "var(--color-invalid)", cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            </div>

            {/* Edit name form */}
            {showEditForm && (
              <div className="card">
                <h2>Edit Customer Name</h2>
                <form onSubmit={handleEditCustomer} className="upload-form-column">
                  <div className="mapping-field">
                    <label>Display Name</label>
                    <input type="text" value={editingDisplayName} onChange={(e) => setEditingDisplayName(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="submit" className="btn btn-primary" disabled={editBusy}>{editBusy ? "Saving..." : "Save"}</button>
                    <button type="button" onClick={() => setShowEditForm(false)}
                      style={{ fontSize: "14px", padding: "10px 20px", borderRadius: "8px", border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </form>
                {editStatus && (
                  <div className={editStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>
                    {editStatus.message}
                  </div>
                )}
              </div>
            )}

            {/* Status summary */}
            <div className="info-box">
              <strong>{selectedCustomer.displayName}</strong> &nbsp;·&nbsp;
              <span style={{ fontSize: "13px" }}>Mode: <strong>{modeLabel(selectedCustomer.extractionMode)}</strong></span>
              <br />
              <span style={{ fontSize: "13px" }}>
                Master Data: {selectedCustomer.hasMasterData ? `✅ ${selectedCustomer.masterDataCount} entries` : "❌ Not uploaded"}&nbsp;&nbsp;
              </span>
              <span style={{ fontSize: "13px" }}>
                Loader Format: {selectedCustomer.hasLoaderMapping ? "✅ Configured" : "❌ Not set"}
              </span>
            </div>

            {/* Master data card — always shown */}
            <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "6px" }}>
                  <h2 style={{ margin: 0 }}>Master Data</h2>
                  {selectedCustomer.hasMasterData && (
                    <button
                      onClick={handleMasterDownload}
                      disabled={masterDownloading}
                      style={{
                        fontSize: "13px", padding: "7px 16px", borderRadius: "6px",
                        border: "1.5px solid var(--brand-teal)", background: "transparent",
                        color: "var(--brand-teal)", cursor: "pointer", fontWeight: 600,
                        display: "flex", alignItems: "center", gap: "6px",
                      }}
                    >
                      {masterDownloading ? "Downloading..." : "⬇ Download Master Data"}
                    </button>
                  )}
                </div>
                <p className="helper-text">
                  Upload the master reference data for <strong>{selectedCustomer.displayName}</strong>.
                  Re-uploading replaces the existing data. Use the download button to recover a previously uploaded file.
                </p>
                <form onSubmit={handleMasterUpload} className="upload-form-column">
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleMasterFileChange} />
                  {masterHeaders.length > 0 && (
                    <div className="mapping-row">
                      <div className="mapping-field">
                        <label>Which column is Route ID?</label>
                        <select value={masterRouteIdCol} onChange={(e) => setMasterRouteIdCol(e.target.value)}>
                          <option value="">Select column...</option>
                          {masterHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div className="mapping-field">
                        <label>Which column is Route Name?</label>
                        <select value={masterRouteNameCol} onChange={(e) => setMasterRouteNameCol(e.target.value)}>
                          <option value="">Select column...</option>
                          {masterHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={masterBusy}>
                    {masterBusy ? "Uploading..." : "Confirm & Upload"}
                  </button>
                </form>
                {masterStatus && (
                  <div className={masterStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>
                    {masterStatus.message}
                  </div>
                )}
            </div>

            {/* Loader mapping card */}
            <div className="card">
              <h2>Loader Excel Format — Column Mapping</h2>
              <p className="helper-text">
                Upload a sample of <strong>{selectedCustomer.displayName}</strong>'s daily shipment Excel.
                {selectedCustomer.extractionMode === "direct"
                  ? " Set which columns hold the Tracking ID and Route Name."
                  : " Set which columns hold the Tracking ID and Route ID."}
                {" "}Saved permanently — loaders won't be asked anything.
              </p>
              <form onSubmit={handleLoaderMappingSave} className="upload-form-column">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleLoaderFileChange} />
                {loaderHeaders.length > 0 && (
                  <div className="mapping-row">
                    <div className="mapping-field">
                      <label>Which column is Tracking ID?</label>
                      <select value={loaderTrackingIdCol} onChange={(e) => setLoaderTrackingIdCol(e.target.value)}>
                        <option value="">Select column...</option>
                        {loaderHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div className="mapping-field">
                      <label>Which column is {selectedCustomer.extractionMode === "direct" ? "Route Name" : "Route ID"}?</label>
                      <select
                        value={selectedCustomer.extractionMode === "direct" ? loaderRouteNameCol : loaderRouteIdCol}
                        onChange={(e) =>
                          selectedCustomer.extractionMode === "direct"
                            ? setLoaderRouteNameCol(e.target.value)
                            : setLoaderRouteIdCol(e.target.value)
                        }
                      >
                        <option value="">Select column...</option>
                        {loaderHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                <button type="submit" className="btn btn-primary" disabled={loaderBusy}>
                  {loaderBusy ? "Saving..." : "Confirm & Save Format"}
                </button>
              </form>
              {loaderStatus && (
                <div className={loaderStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>
                  {loaderStatus.message}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;