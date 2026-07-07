import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

// ---------------------------------------------------------------------------
// Small helper — column dropdown
// ---------------------------------------------------------------------------
const ColSelect = ({ label, headers, value, onChange, optional = false }) => (
  <div className="mapping-field">
    <label>{label}{optional && <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}> (optional)</span>}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{optional ? "— Skip —" : "Select column..."}</option>
      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  </div>
);

// ---------------------------------------------------------------------------
// Per-file column override card — shown after a file is selected
// ---------------------------------------------------------------------------
const FileColumnCard = ({ fileName, headers, extractionMode, mapping, onChange, onCopyPrevious }) => {
  if (!headers || headers.length === 0) return null;
  return (
    <div style={{
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      borderRadius: 8, padding: "12px 14px", marginTop: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)" }}>
          📄 {fileName} — column mapping
        </div>
        {onCopyPrevious && (
          <button
            type="button"
            onClick={onCopyPrevious}
            style={{
              fontSize: 11, fontWeight: 600, color: "var(--brand-teal)",
              background: "transparent", border: "1px solid var(--brand-teal)",
              borderRadius: 6, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            ↳ Same as previous file
          </button>
        )}
      </div>
      <div className="mapping-row">
        <ColSelect
          label="Tracking ID column"
          headers={headers}
          value={mapping.trackingIdColumn || ""}
          onChange={(v) => onChange({ ...mapping, trackingIdColumn: v })}
        />
        {extractionMode === "direct" ? (
          <ColSelect
            label="Route Name column"
            headers={headers}
            value={mapping.routeNameColumn || ""}
            onChange={(v) => onChange({ ...mapping, routeNameColumn: v })}
          />
        ) : (
          <ColSelect
            label="Route ID column"
            headers={headers}
            value={mapping.routeIdColumn || ""}
            onChange={(v) => onChange({ ...mapping, routeIdColumn: v })}
          />
        )}
        <ColSelect
          label="Address column"
          headers={headers}
          value={mapping.addressColumn || ""}
          onChange={(v) => onChange({ ...mapping, addressColumn: v })}
          optional
        />
        <ColSelect
          label="Customer Name column"
          headers={headers}
          value={mapping.customerNameColumn || ""}
          onChange={(v) => onChange({ ...mapping, customerNameColumn: v })}
          optional
        />
        <ColSelect
          label="Customer Number column"
          headers={headers}
          value={mapping.customerNumberColumn || ""}
          onChange={(v) => onChange({ ...mapping, customerNumberColumn: v })}
          optional
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ClientConfigPage
// ---------------------------------------------------------------------------
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

  // ── Loader excel setup ──
  const [loaderCardMode, setLoaderCardMode] = useState("upload");
  const [loaderFile, setLoaderFile] = useState(null);
  const [loaderHeaders, setLoaderHeaders] = useState([]);
  const [loaderTrackingIdCol, setLoaderTrackingIdCol] = useState("");
  const [loaderRouteIdCol, setLoaderRouteIdCol] = useState("");
  const [loaderRouteNameCol, setLoaderRouteNameCol] = useState("");
  const [loaderAddressCol, setLoaderAddressCol] = useState("");
  const [loaderCustomerNameCol, setLoaderCustomerNameCol] = useState("");
  const [loaderCustomerNumberCol, setLoaderCustomerNumberCol] = useState("");
  const [loaderStatus, setLoaderStatus] = useState(null);
  const [loaderBusy, setLoaderBusy] = useState(false);

  // ── Single file upload ──
  const [singleFile, setSingleFile] = useState(null);
  const [singleHeaders, setSingleHeaders] = useState([]);
  const [singleMapping, setSingleMapping] = useState({});
  const [singleStatus, setSingleStatus] = useState(null);
  const [singleBusy, setSingleBusy] = useState(false);

  // ── Multi file upload ──
  // Each entry: { file, headers, mapping }
  const [multiFileItems, setMultiFileItems] = useState([]);
  const [multiStatus, setMultiStatus] = useState(null);
  const [multiBusy, setMultiBusy] = useState(false);

  // ── Undelivered upload ──
  const [undelFile, setUndelFile] = useState(null);
  const [undelHeaders, setUndelHeaders] = useState([]);
  const [undelTrackingIdCol, setUndelTrackingIdCol] = useState("");
  const [undelReasonCol, setUndelReasonCol] = useState("");
  const [undelStatus, setUndelStatus] = useState(null);
  const [undelBusy, setUndelBusy] = useState(false);

  // ── Edit / delete ──
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState(null);
  const [editBusy, setEditBusy] = useState(false);

  // ---------------------------------------------------------------------------
  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/customers");
      const found = res.data.find((c) => c.id === customerId);
      if (!found) { navigate("/admin"); return; }
      setCustomer(found);
      setLoaderCardMode(found.hasLoaderMapping ? "upload" : "setup");
    } catch { navigate("/admin"); }
    finally { setLoading(false); }
  };

  const fetchBatchInfo = async () => {
    try {
      const res = await api.get(`/scanner/current-batch?customerId=${customerId}`);
      setBatchInfo(res.data.exists ? res.data : null);
    } catch { setBatchInfo(null); }
  };

  useEffect(() => { fetchCustomer(); fetchBatchInfo(); }, [customerId]);

  const previewColumns = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post("/admin/preview-columns", fd, {
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
    const fd = new FormData();
    fd.append("file", masterFile);
    fd.append("routeIdColumn", masterRouteIdCol);
    fd.append("routeNameColumn", masterRouteNameCol);
    setMasterBusy(true); setMasterStatus(null);
    try {
      const res = await api.post(`/admin/customers/${customerId}/master-data`, fd, {
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

  // ── Loader setup (first time) ──
  const handleLoaderFileChange = async (e) => {
    const file = e.target.files[0];
    setLoaderFile(file); setLoaderStatus(null); setLoaderHeaders([]);
    setLoaderTrackingIdCol(""); setLoaderRouteIdCol(""); setLoaderRouteNameCol(""); setLoaderAddressCol("");
    setLoaderCustomerNameCol(""); setLoaderCustomerNumberCol("");
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
      if (loaderCustomerNameCol) mappingForm.append("customerNameColumn", loaderCustomerNameCol);
      if (loaderCustomerNumberCol) mappingForm.append("customerNumberColumn", loaderCustomerNumberCol);
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

  // ── Single file upload (with per-file column override) ──
  const handleSingleFileChange = async (e) => {
    const file = e.target.files[0];
    setSingleFile(file); setSingleHeaders([]); setSingleMapping({}); setSingleStatus(null);
    if (!file) return;
    try { setSingleHeaders(await previewColumns(file)); }
    catch { setSingleStatus({ type: "error", message: "Could not read columns" }); }
  };

  const handleSingleUpload = async (e) => {
    e.preventDefault();
    if (!singleFile) { setSingleStatus({ type: "error", message: "Please select a file" }); return; }
    const fd = new FormData();
    fd.append("file", singleFile);
    fd.append("customerId", customerId);
    // Send per-file overrides if chosen
    if (singleMapping.trackingIdColumn) fd.append("trackingIdColumn", singleMapping.trackingIdColumn);
    if (singleMapping.routeIdColumn)    fd.append("routeIdColumn",    singleMapping.routeIdColumn);
    if (singleMapping.routeNameColumn)  fd.append("routeNameColumn",  singleMapping.routeNameColumn);
    if (singleMapping.addressColumn)    fd.append("addressColumn",    singleMapping.addressColumn);
    if (singleMapping.customerNameColumn)   fd.append("customerNameColumn",   singleMapping.customerNameColumn);
    if (singleMapping.customerNumberColumn) fd.append("customerNumberColumn", singleMapping.customerNumberColumn);
    setSingleBusy(true); setSingleStatus(null);
    try {
      const res = await api.post("/scanner/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSingleStatus({ type: "success", message: `✅ ${res.data.count} shipments loaded.` });
      setSingleFile(null); setSingleHeaders([]); setSingleMapping({});
      await fetchBatchInfo();
    } catch (err) {
      setSingleStatus({ type: "error", message: err.response?.data?.message || "Upload failed" });
    } finally { setSingleBusy(false); }
  };

  // ── Multi file upload (each file gets its own column mapping) ──
  const handleMultiFilesChange = async (e) => {
    const files = Array.from(e.target.files);
    setMultiStatus(null);
    const items = await Promise.all(files.map(async (file) => {
      let headers = [];
      try { headers = await previewColumns(file); } catch { /* ignore */ }
      return { file, headers, mapping: {} };
    }));
    setMultiFileItems(items);
  };

  const handleMultiMappingChange = (index, mapping) => {
    setMultiFileItems((prev) => prev.map((item, i) => i === index ? { ...item, mapping } : item));
  };

  // Copy the previous file's column mapping into this one — only for columns
  // whose selected header name actually exists in this file too.
  const handleCopyPreviousMapping = (index) => {
    setMultiFileItems((prev) => {
      const prevMapping = prev[index - 1]?.mapping || {};
      const currentHeaders = prev[index]?.headers || [];
      const filteredMapping = Object.fromEntries(
        Object.entries(prevMapping).filter(([, colName]) => colName && currentHeaders.includes(colName))
      );
      return prev.map((item, i) => i === index ? { ...item, mapping: filteredMapping } : item);
    });
  };

  const handleMultiUpload = async (e) => {
    e.preventDefault();
    if (multiFileItems.length === 0) { setMultiStatus({ type: "error", message: "Select at least one file" }); return; }
    const fd = new FormData();
    multiFileItems.forEach((item) => fd.append("files", item.file));
    fd.append("customerId", customerId);
    // Send per-file mappings as JSON array
    const mappings = multiFileItems.map((item) => item.mapping);
    fd.append("fileMappings", JSON.stringify(mappings));
    setMultiBusy(true); setMultiStatus(null);
    try {
      const res = await api.post("/scanner/upload-multiple", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMultiStatus({ type: "success", message: `✅ ${res.data.count} shipments merged from ${res.data.fileCount} files.` });
      setMultiFileItems([]);
      await fetchBatchInfo();
    } catch (err) {
      setMultiStatus({ type: "error", message: err.response?.data?.message || "Upload failed" });
    } finally { setMultiBusy(false); }
  };

  // ── Undelivered upload ──
  const handleUndelFileChange = async (e) => {
    const file = e.target.files[0];
    setUndelFile(file); setUndelHeaders([]); setUndelTrackingIdCol(""); setUndelReasonCol(""); setUndelStatus(null);
    if (!file) return;
    try { setUndelHeaders(await previewColumns(file)); }
    catch { setUndelStatus({ type: "error", message: "Could not read columns from this file" }); }
  };

  const handleUndelUpload = async (e) => {
    e.preventDefault();
    if (!undelFile)           { setUndelStatus({ type: "error", message: "Please select a file" }); return; }
    if (!undelTrackingIdCol)  { setUndelStatus({ type: "error", message: "Tracking ID column is required" }); return; }
    if (!batchInfo)           { setUndelStatus({ type: "error", message: "No active shipment batch found. Upload daily data first." }); return; }
    const fd = new FormData();
    fd.append("file", undelFile);
    fd.append("customerId", customerId);
    fd.append("trackingIdColumn", undelTrackingIdCol);
    if (undelReasonCol) fd.append("reasonColumn", undelReasonCol);
    setUndelBusy(true); setUndelStatus(null);
    try {
      const res = await api.post("/scanner/upload-undelivered", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setUndelStatus({ type: "success", message: `✅ Merged ${res.data.totalUndelivered} undelivered entries.` });
      setUndelFile(null); setUndelHeaders([]); setUndelTrackingIdCol(""); setUndelReasonCol("");
      await fetchBatchInfo();
    } catch (err) {
      setUndelStatus({ type: "error", message: err.response?.data?.message || "Upload failed" });
    } finally { setUndelBusy(false); }
  };

  // ── Edit / Delete ──
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
        <div className="top-bar-right"><button className="btn btn-outline" onClick={handleLogout}>Logout</button></div>
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
            <button onClick={() => { setShowEdit(!showEdit); setEditName(customer.displayName); setEditStatus(null); }}
              style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px", border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer" }}>
              Edit Name
            </button>
            <button onClick={handleDelete}
              style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "6px", border: "1.5px solid var(--color-invalid)", background: "transparent", color: "var(--color-invalid)", cursor: "pointer" }}>
              Delete Client
            </button>
          </div>
        </div>

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
              <button key={opt.value} onClick={() => handleSetMode(opt.value)} disabled={modeBusy} style={{
                padding: "16px 20px", borderRadius: "10px", border: "2px solid",
                borderColor: customer.extractionMode === opt.value ? "var(--brand-teal)" : "var(--color-border)",
                background: customer.extractionMode === opt.value ? "var(--color-primary-light)" : "var(--color-surface-raised)",
                cursor: "pointer", textAlign: "left", transition: "all 0.15s",
              }}>
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
              Upload the permanent Route ID → Route Name reference table for <strong>{customer.displayName}</strong>. Re-uploading replaces existing data.
            </p>
            {customer.hasMasterData && (
              <button onClick={handleMasterDownload} disabled={masterDownloading}
                style={{ fontSize: "13px", padding: "7px 16px", borderRadius: "6px", border: "1.5px solid var(--brand-teal)", background: "transparent", color: "var(--brand-teal)", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                {masterDownloading ? "Downloading..." : "⬇ Download"}
              </button>
            )}
          </div>
          <form onSubmit={handleMasterUpload} className="upload-form-column">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleMasterFileChange} />
            {masterHeaders.length > 0 && (
              <div className="mapping-row">
                <ColSelect label="Route ID column"   headers={masterHeaders} value={masterRouteIdCol}   onChange={setMasterRouteIdCol} />
                <ColSelect label="Route Name column" headers={masterHeaders} value={masterRouteNameCol} onChange={setMasterRouteNameCol} />
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={masterBusy} style={{ alignSelf: "flex-start" }}>
              {masterBusy ? "Uploading..." : masterHeaders.length > 0 ? "Confirm & Upload" : "Select a file to continue"}
            </button>
          </form>
          {masterStatus && <div className={masterStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>{masterStatus.message}</div>}
        </div>

        {/* ── SECTION 3: Daily Shipment Data ── */}
        <div className="section-label">Daily Shipment Data</div>
        <div className="card" style={{ border: "2px solid var(--brand-teal)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
            <p className="helper-text" style={{ margin: 0, flex: 1 }}>
              Upload today's shipment Excel for <strong>{customer.displayName}</strong>.
              {loaderCardMode === "upload" && " Column format is already configured — just pick the file."}
            </p>
            {loaderCardMode === "upload" && customer.hasLoaderMapping && (
              <button onClick={() => { setLoaderFile(null); setLoaderHeaders([]); setLoaderStatus(null); setLoaderCardMode("setup"); }}
                style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "1.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
                ⚙ Change Column Format
              </button>
            )}
          </div>

          {batchInfo && (
            <div style={{ marginBottom: "14px", fontSize: "13px", color: "var(--brand-teal)", fontWeight: 500 }}>
              ✅ Currently loaded: {batchInfo.count} shipments
              {batchInfo.fileNames?.length > 1 ? ` from ${batchInfo.fileNames.length} files` : batchInfo.fileName ? ` (${batchInfo.fileName})` : ""}
            </div>
          )}

          {/* Setup mode (first time) */}
          {loaderCardMode === "setup" && (
            <form onSubmit={handleLoaderSetupAndUpload} className="upload-form-column">
              <p className="helper-text" style={{ marginTop: 0 }}>
                First time setup: select the file and map the columns. This format will be saved for future uploads.
              </p>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleLoaderFileChange} />
              {loaderHeaders.length > 0 && (
                <div className="mapping-row">
                  <ColSelect label="Tracking ID column" headers={loaderHeaders} value={loaderTrackingIdCol} onChange={setLoaderTrackingIdCol} />
                  <ColSelect
                    label={customer.extractionMode === "direct" ? "Route Name column" : "Route ID column"}
                    headers={loaderHeaders}
                    value={customer.extractionMode === "direct" ? loaderRouteNameCol : loaderRouteIdCol}
                    onChange={customer.extractionMode === "direct" ? setLoaderRouteNameCol : setLoaderRouteIdCol}
                  />
                  <ColSelect label="Address column" headers={loaderHeaders} value={loaderAddressCol} onChange={setLoaderAddressCol} optional />
                  <ColSelect label="Customer Name column" headers={loaderHeaders} value={loaderCustomerNameCol} onChange={setLoaderCustomerNameCol} optional />
                  <ColSelect label="Customer Number column" headers={loaderHeaders} value={loaderCustomerNumberCol} onChange={setLoaderCustomerNumberCol} optional />
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={loaderBusy} style={{ alignSelf: "flex-start" }}>
                {loaderBusy ? "Saving & Uploading..." : loaderHeaders.length > 0 ? "Confirm Format & Upload" : "Select a file to continue"}
              </button>
              {loaderStatus && <div className={loaderStatus.type === "success" ? "success-message" : "error-message"}>{loaderStatus.message}</div>}
            </form>
          )}

          {/* Upload mode — single + multi with per-file dropdowns */}
          {loaderCardMode === "upload" && (
            <>
              {/* ── Single file ── */}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Upload Single File</div>
                <form onSubmit={handleSingleUpload} className="upload-form-column">
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleSingleFileChange} />
                  {singleFile && (
                    <FileColumnCard
                      fileName={singleFile.name}
                      headers={singleHeaders}
                      extractionMode={customer.extractionMode}
                      mapping={singleMapping}
                      onChange={setSingleMapping}
                    />
                  )}
                  <button type="submit" className="btn btn-primary" disabled={singleBusy} style={{ alignSelf: "flex-start", marginTop: 8 }}>
                    {singleBusy ? "Uploading..." : "Upload"}
                  </button>
                </form>
                {singleStatus && <div className={singleStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "10px" }}>{singleStatus.message}</div>}
              </div>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "4px 0 24px" }}>
                <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>OR MERGE MULTIPLE FILES</span>
                <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
              </div>

              {/* ── Multi file ── */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Upload & Merge Multiple Files</div>
                <form onSubmit={handleMultiUpload} className="upload-form-column">
                  <input type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleMultiFilesChange} />
                  {multiFileItems.map((item, i) => (
                    <FileColumnCard
                      key={i}
                      fileName={item.file.name}
                      headers={item.headers}
                      extractionMode={customer.extractionMode}
                      mapping={item.mapping}
                      onChange={(m) => handleMultiMappingChange(i, m)}
                      onCopyPrevious={i > 0 ? () => handleCopyPreviousMapping(i) : null}
                    />
                  ))}
                  <button type="submit" className="btn btn-primary" disabled={multiBusy} style={{ alignSelf: "flex-start", marginTop: 8 }}>
                    {multiBusy ? "Merging..." : `Merge & Upload${multiFileItems.length > 0 ? ` (${multiFileItems.length})` : ""}`}
                  </button>
                </form>
                {multiStatus && <div className={multiStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "10px" }}>{multiStatus.message}</div>}
              </div>
            </>
          )}
        </div>

        {/* ── SECTION 4: Undelivered Data ── */}
        <div className="section-label">Undelivered Data</div>
        <div className="card" style={{ border: "2px solid #f59e0b" }}>
          <p className="helper-text" style={{ marginBottom: "16px" }}>
            Upload yesterday's undelivered shipment file for <strong>{customer.displayName}</strong>.
            These will be merged into today's active batch — when a loader scans an undelivered barcode,
            the <strong>reason</strong> (e.g. Undelivered, Misroute) will be shown on screen.
            Undelivered entries are <strong>not included</strong> in the downloaded scan history Excel.
          </p>
          {!batchInfo && (
            <div style={{ marginBottom: 12, fontSize: 13, color: "#b45309", fontWeight: 600 }}>
              ⚠️ No active batch found. Upload daily shipment data first before adding undelivered data.
            </div>
          )}
          <form onSubmit={handleUndelUpload} className="upload-form-column">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUndelFileChange} />
            {undelHeaders.length > 0 && (
              <div className="mapping-row">
                <ColSelect label="Tracking ID column" headers={undelHeaders} value={undelTrackingIdCol} onChange={setUndelTrackingIdCol} />
                <ColSelect label="Reason column"      headers={undelHeaders} value={undelReasonCol}     onChange={setUndelReasonCol} optional />
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={undelBusy || !batchInfo} style={{ alignSelf: "flex-start" }}>
              {undelBusy ? "Uploading..." : undelHeaders.length > 0 ? "Merge Undelivered Data" : "Select a file to continue"}
            </button>
          </form>
          {undelStatus && <div className={undelStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px" }}>{undelStatus.message}</div>}
        </div>

      </main>
    </div>
  );
};

export default ClientConfigPage;