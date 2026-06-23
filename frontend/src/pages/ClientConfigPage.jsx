import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

const ClientConfigPage = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const { customerId } = useParams();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [batchInfo, setBatchInfo] = useState(null);

  // ── Mode ──
  const [modeStatus, setModeStatus] = useState(null);
  const [modeBusy, setModeBusy] = useState(false);

  // ── Master data ──
  const [masterFile, setMasterFile] = useState(null);
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [masterRouteIdCol, setMasterRouteIdCol] = useState("");
  const [masterRouteNameCol, setMasterRouteNameCol] = useState("");
  const [masterStatus, setMasterStatus] = useState(null);
  const [masterBusy, setMasterBusy] = useState(false);
  const [masterDownloading, setMasterDownloading] = useState(false);

  // ── Loader excel ──
  const [loaderCardMode, setLoaderCardMode] = useState("upload");
  const [loaderFile, setLoaderFile] = useState(null);
  const [loaderHeaders, setLoaderHeaders] = useState([]);
  const [loaderTrackingIdCol, setLoaderTrackingIdCol] = useState("");
  const [loaderRouteIdCol, setLoaderRouteIdCol] = useState("");
  const [loaderRouteNameCol, setLoaderRouteNameCol] = useState("");
  const [loaderAddressCol, setLoaderAddressCol] = useState("");
  const [loaderStatus, setLoaderStatus] = useState(null);
  const [loaderBusy, setLoaderBusy] = useState(false);

  // ── Multi-file upload ──
  const [multiFiles, setMultiFiles] = useState([]);
  const [multiStatus, setMultiStatus] = useState(null);
  const [multiBusy, setMultiBusy] = useState(false);

  // ── Edit / delete ──
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState(null);
  const [editBusy, setEditBusy] = useState(false);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/customers");
      const found = res.data.find((c) => c.id === customerId);
      if (!found) { navigate("/admin"); return; }
      setCustomer(found);
      setLoaderCardMode(found.hasLoaderMapping ? "upload" : "setup");
    } catch (err) {
      navigate("/admin");
    } finally {
      setLoading(false);
    }
  };

  const fetchBatchInfo = async () => {
    try {
      const res = await api.get(`/scanner/current-batch?customerId=${customerId}`);
      setBatchInfo(res.data.exists ? res.data : null);
    } catch { setBatchInfo(null); }
  };

  useEffect(() => {
    fetchCustomer();
    fetchBatchInfo();
  }, [customerId]);

  const previewColumns = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/admin/preview-columns", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.headers || [];
  };

  // ── Mode ──
  const handleSetMode = async (mode) => {
    setModeBusy(true); setModeStatus(null);
    try {
      await api.post(`/admin/customers/${customerId}/extraction-mode`, { mode });
      setModeStatus({ type: "success", message: "Mode saved." });
      await fetchCustomer();
      setLoaderCardMode("setup");
    } catch (err) {
      setModeStatus({ type: "error", message: err.response?.data?.message || "Failed to set mode" });
    } finally { setModeBusy(false); }
  };

  // ── Master data ──
  const handleMasterFileChange = async (e) => {
    const file = e.target.files[0];
    setMasterFile(file); setMasterStatus(null); setMasterHeaders([]);
    setMasterRouteIdCol(""); setMasterRouteNameCol("");
    if (!file) return;
    try { setMasterHeaders(await previewColumns(file)); }
    catch { setMasterStatus({ type: "error", message: "Could not read columns from this file" }); }
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
      const res = await api.post(`/admin/customers/${customerId}/master-data`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMasterStatus({ type: "success", message: `${res.data.count} entries uploaded successfully.` });
      setMasterFile(null); setMasterHeaders([]); setMasterRouteIdCol(""); setMasterRouteNameCol("");
      await fetchCustomer();
    } catch (err) {
      setMasterStatus({ type: "error", message: err.response?.data?.message || "Upload failed" });
    } finally { setMasterBusy(false); }
  };

  const handleMasterDownload = async () => {
    setMasterDownloading(true);
    try {
      const res = await api.get(`/admin/customers/${customerId}/master-data/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `MasterData_${customer.displayName.replace(/\s+/g, "_")}.xlsx`);
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert("Failed to download master data."); }
    finally { setMasterDownloading(false); }
  };

  // ── Loader excel ──
  const handleLoaderFileChange = async (e) => {
    const file = e.target.files[0];
    setLoaderFile(file); setLoaderStatus(null); setLoaderHeaders([]);
    setLoaderTrackingIdCol(""); setLoaderRouteIdCol(""); setLoaderRouteNameCol(""); setLoaderAddressCol("");
    if (!file || loaderCardMode !== "setup") return;
    try { setLoaderHeaders(await previewColumns(file)); }
    catch { setLoaderStatus({ type: "error", message: "Could not read columns from this file" }); }
  };

  const handleLoaderSetupAndUpload = async (e) => {
    e.preventDefault();
    const isDirect = customer.extractionMode === "direct";
    const secondCol = isDirect ? loaderRouteNameCol : loaderRouteIdCol;
    if (!loaderFile || !loaderTrackingIdCol || !secondCol) {
      setLoaderStatus({ type: "error", message: "Select a file and all required columns" }); return;
    }
    setLoaderBusy(true); setLoaderStatus(null);
    try {
      const mappingForm = new FormData();
      mappingForm.append("file", loaderFile);
      mappingForm.append("trackingIdColumn", loaderTrackingIdCol);
      if (isDirect) mappingForm.append("routeNameColumn", loaderRouteNameCol);
      else mappingForm.append("routeIdColumn", loaderRouteIdCol);
      if (loaderAddressCol) mappingForm.append("addressColumn", loaderAddressCol);
      await api.post(`/admin/customers/${customerId}/loader-mapping`, mappingForm, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const uploadForm = new FormData();
      uploadForm.append("file", loaderFile);
      uploadForm.append("customerId", customerId);
      const res = await api.post("/scanner/upload", uploadForm, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setLoaderStatus({ type: "success", message: `✅ Format saved & ${res.data.count} shipments loaded.` });
      setLoaderFile(null); setLoaderHeaders([]);
      await fetchCustomer(); await fetchBatchInfo();
      setLoaderCardMode("upload");
    } catch (err) {
      setLoaderStatus({ type: "error", message: err.response?.data?.message || "Failed. Please try again." });
    } finally { setLoaderBusy(false); }
  };

  const handleLoaderUploadOnly = async (e) => {
    e.preventDefault();
    if (!loaderFile) { setLoaderStatus({ type: "error", message: "Please select a file" }); return; }
    const formData = new FormData();
    formData.append("file", loaderFile);
    formData.append("customerId", customerId);
    setLoaderBusy(true); setLoaderStatus(null);
    try {
      const res = await api.post("/scanner/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setLoaderStatus({ type: "success", message: `✅ ${res.data.count} shipments loaded.` });
      setLoaderFile(null); await fetchBatchInfo();
    } catch (err) {
      setLoaderStatus({ type: "error", message: err.response?.data?.message || "Upload failed" });
    } finally { setLoaderBusy(false); }
  };

  const handleMultiUpload = async (e) => {
    e.preventDefault();
    if (multiFiles.length === 0) { setMultiStatus({ type: "error", message: "Select at least one file" }); return; }
    const formData = new FormData();
    multiFiles.forEach((f) => formData.append("files", f));
    formData.append("customerId", customerId);
    setMultiBusy(true); setMultiStatus(null);
    try {
      const res = await api.post("/scanner/upload-multiple", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const note = res.data.errors?.length ? ` (${res.data.errors.length} file(s) had errors)` : "";
      setMultiStatus({ type: "success", message: `✅ ${res.data.count} shipments merged from ${res.data.filesUploaded || res.data.fileCount} files.${note}` });
      setMultiFiles([]); await fetchBatchInfo();
    } catch (err) {
      setMultiStatus({ type: "error", message: err.response?.data?.message || "Upload failed" });
    } finally { setMultiBusy(false); }
  };

  // ── Edit ──
  const handleEditCustomer = async (e) => {
    e.preventDefault();
    if (!editName.trim()) { setEditStatus({ type: "error", message: "Name is required" }); return; }
    setEditBusy(true); setEditStatus(null);
    try {
      await api.patch(`/admin/customers/${customerId}`, { displayName: editName.trim() });
      setEditStatus({ type: "success", message: "Name updated" });
      setShowEdit(false);
      await fetchCustomer();
    } catch (err) {
      setEditStatus({ type: "error", message: err.response?.data?.message || "Update failed" });
    } finally { setEditBusy(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${customer.displayName}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/customers/${customerId}`);
      navigate("/admin");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete client");
    }
  };

  const modeLabel = (mode) =>
    mode === "direct" ? "TrackingID → RouteName (Direct)" : "TrackingID → RouteID → RouteName";

  const handleLogout = () => { logout(); navigate("/login"); };

  if (loading) return (
    <div className="page">
      <header className="top-bar">
        <div className="top-bar-logo"><img src={logo} alt="SmartShip" /><span className="top-bar-logo-label">Admin</span></div>
        <div className="top-bar-right">
          <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main className="content"><p className="muted">Loading client...</p></main>
    </div>
  );

  return (
    <div className="page">
      <header className="top-bar">
        <div className="top-bar-logo">
          <img src={logo} alt="SmartShip Logistics" />
          <span className="top-bar-logo-label">Admin</span>
        </div>
        <div className="top-bar-right">
          <span className="username-tag">{auth?.username}</span>
          <button className="btn btn-outline" onClick={() => navigate("/scanner")}>Scanner</button>
          <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="content">

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button onClick={() => navigate("/admin")} style={{ background: "none", border: "none", color: "var(--brand-teal)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: 0 }}>
              ← Clients
            </button>
            <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>/ {customer.displayName}</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => { setShowEdit(!showEdit); setEditName(customer.displayName); setEditStatus(null); }}
              style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px", border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer" }}
            >Edit Name</button>
            <button
              onClick={handleDelete}
              style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px", border: "1.5px solid var(--color-invalid)", background: "transparent", color: "var(--color-invalid)", cursor: "pointer" }}
            >Delete Client</button>
          </div>
        </div>

        {/* Edit name form */}
        {showEdit && (
          <div className="card">
            <h2>Edit Client Name</h2>
            <form onSubmit={handleEditCustomer} className="upload-form-column">
              <div className="mapping-field">
                <label>Display Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="submit" className="btn btn-primary" disabled={editBusy}>{editBusy ? "Saving..." : "Save"}</button>
                <button type="button" onClick={() => setShowEdit(false)} style={{ fontSize: "14px", padding: "10px 20px", borderRadius: "8px", border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer" }}>Cancel</button>
              </div>
            </form>
            {editStatus && <div className={editStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>{editStatus.message}</div>}
          </div>
        )}

        {/* Status summary */}
        <div className="info-box">
          <strong>{customer.displayName}</strong>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "white", background: "var(--brand-teal)", borderRadius: "4px", padding: "2px 7px", marginLeft: "8px" }}>{customer.name}</span>
          <br />
          <span style={{ fontSize: "13px" }}>Mode: <strong>{customer.extractionMode ? modeLabel(customer.extractionMode) : "Not set"}</strong></span>
          <br />
          <span style={{ fontSize: "13px" }}>
            Master Data: {customer.hasMasterData ? `✅ ${customer.masterDataCount} entries` : "❌ Not uploaded"}&nbsp;&nbsp;
            Loader Format: {customer.hasLoaderMapping ? "✅ Configured" : "❌ Not set"}
          </span>
        </div>

        {/* ── SECTION 1: Lookup Mode ── */}
        <div className="section-label">Lookup Mode</div>
        <div className="card">
          <p className="helper-text" style={{ marginBottom: "16px" }}>
            How should SmartShip resolve a route name when a barcode is scanned?
            {customer.extractionMode && <span style={{ color: "var(--brand-teal)", fontWeight: 600 }}> Current: {modeLabel(customer.extractionMode)}</span>}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              { value: "route-lookup", title: "Route ID Lookup", desc: "Shipment Excel has Tracking ID + Route ID. Route ID is looked up in master data to get the Route Name." },
              { value: "direct", title: "Direct Route Name", desc: "Shipment Excel already contains the Route Name directly. No master data table needed." },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSetMode(opt.value)}
                disabled={modeBusy}
                style={{
                  padding: "16px 20px", borderRadius: "10px", border: "2px solid",
                  borderColor: customer.extractionMode === opt.value ? "var(--brand-teal)" : "var(--color-border)",
                  background: customer.extractionMode === opt.value ? "var(--color-primary-light)" : "var(--color-surface-raised)",
                  cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--brand-navy)", marginBottom: "4px" }}>{opt.title}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.5 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
          {modeStatus && <div className={modeStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>{modeStatus.message}</div>}
        </div>

        {/* ── SECTION 2: Master Route Data ── */}
        <div className="section-label">Master Route Data</div>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
            <p className="helper-text" style={{ margin: 0, flex: 1 }}>
              Upload the permanent Route ID → Route Name reference table for <strong>{customer.displayName}</strong>.
              Re-uploading replaces existing data.
            </p>
            {customer.hasMasterData && (
              <button
                onClick={handleMasterDownload}
                disabled={masterDownloading}
                style={{ fontSize: "13px", padding: "7px 16px", borderRadius: "6px", border: "1.5px solid var(--brand-teal)", background: "transparent", color: "var(--brand-teal)", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
              >
                {masterDownloading ? "Downloading..." : "⬇ Download"}
              </button>
            )}
          </div>
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
            <button type="submit" className="btn btn-primary" disabled={masterBusy} style={{ alignSelf: "flex-start" }}>
              {masterBusy ? "Uploading..." : masterHeaders.length > 0 ? "Confirm & Upload" : "Select a file to continue"}
            </button>
          </form>
          {masterStatus && <div className={masterStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>{masterStatus.message}</div>}
        </div>

        {/* ── SECTION 3: Shipment Excel ── */}
        <div className="section-label">Daily Shipment Data</div>
        <div className="card" style={{ border: "2px solid var(--brand-teal)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
            <p className="helper-text" style={{ margin: 0, flex: 1 }}>
              Upload today's shipment Excel for <strong>{customer.displayName}</strong>.
              {loaderCardMode === "upload" && " Column format is already configured — just pick the file."}
            </p>
            {loaderCardMode === "upload" && customer.hasLoaderMapping && (
              <button
                onClick={() => { setLoaderFile(null); setLoaderHeaders([]); setLoaderStatus(null); setLoaderCardMode("setup"); }}
                style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}
              >⚙ Change Column Format</button>
            )}
          </div>

          {batchInfo && (
            <div style={{ marginBottom: "14px", fontSize: "13px", color: "var(--brand-teal)", fontWeight: 500 }}>
              ✅ Currently loaded: {batchInfo.count} shipments
              {batchInfo.fileNames?.length > 1 ? ` from ${batchInfo.fileNames.length} files` : batchInfo.fileName ? ` (${batchInfo.fileName})` : ""}
            </div>
          )}

          {/* Setup mode */}
          {loaderCardMode === "setup" && (
            <form onSubmit={handleLoaderSetupAndUpload} className="upload-form-column">
              <p className="helper-text" style={{ marginTop: 0 }}>
                First time setup: select the file and map the columns. This format will be saved for future uploads.
              </p>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleLoaderFileChange} />
              {loaderHeaders.length > 0 && (
                <div className="mapping-row">
                  <div className="mapping-field">
                    <label>Tracking ID column</label>
                    <select value={loaderTrackingIdCol} onChange={(e) => setLoaderTrackingIdCol(e.target.value)}>
                      <option value="">Select...</option>
                      {loaderHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="mapping-field">
                    <label>{customer.extractionMode === "direct" ? "Route Name column" : "Route ID column"}</label>
                    <select
                      value={customer.extractionMode === "direct" ? loaderRouteNameCol : loaderRouteIdCol}
                      onChange={(e) => customer.extractionMode === "direct" ? setLoaderRouteNameCol(e.target.value) : setLoaderRouteIdCol(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {loaderHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="mapping-field">
                    <label>Address column <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(optional)</span></label>
                    <select value={loaderAddressCol} onChange={(e) => setLoaderAddressCol(e.target.value)}>
                      <option value="">— Skip —</option>
                      {loaderHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={loaderBusy} style={{ alignSelf: "flex-start" }}>
                {loaderBusy ? "Saving & Uploading..." : loaderHeaders.length > 0 ? "Confirm Format & Upload" : "Select a file to continue"}
              </button>
            </form>
          )}

          {/* Upload mode */}
          {loaderCardMode === "upload" && (
            <>
              {/* Single file */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Upload Single File</div>
                <form onSubmit={handleLoaderUploadOnly} className="upload-form">
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setLoaderFile(e.target.files[0]); setLoaderStatus(null); }} />
                  <button type="submit" className="btn btn-primary" disabled={loaderBusy}>
                    {loaderBusy ? "Uploading..." : "Upload"}
                  </button>
                </form>
              </div>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "4px 0 20px" }}>
                <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>OR MERGE MULTIPLE FILES</span>
                <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
              </div>

              {/* Multi file */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Upload & Merge Multiple Files</div>
                <form onSubmit={handleMultiUpload} className="upload-form">
                  <input type="file" accept=".xlsx,.xls,.csv" multiple onChange={(e) => { setMultiFiles(Array.from(e.target.files)); setMultiStatus(null); }} />
                  <button type="submit" className="btn btn-primary" disabled={multiBusy}>
                    {multiBusy ? "Merging..." : `Merge & Upload${multiFiles.length > 0 ? ` (${multiFiles.length})` : ""}`}
                  </button>
                </form>
                {multiFiles.length > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--color-text-muted)" }}>
                    {multiFiles.map((f, i) => <div key={i}>📄 {f.name}</div>)}
                  </div>
                )}
                {multiStatus && (
                  <div className={multiStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "10px" }}>
                    {multiStatus.message}
                  </div>
                )}
              </div>
            </>
          )}

          {loaderStatus && (
            <div className={loaderStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>
              {loaderStatus.message}
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

export default ClientConfigPage;
