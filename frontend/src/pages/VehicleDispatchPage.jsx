import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

const VehicleDispatchPage = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeBatches, setActiveBatches] = useState([]);

  // Which customers are selected for today's vehicle
  const [selectedIds, setSelectedIds] = useState([]);

  // Per-customer state for master data upload
  const [masterState, setMasterState] = useState({});
  // { [id]: { file, headers, routeIdCol, routeNameCol, status, busy, uploaded } }

  // Per-customer state for shipment excel upload
  const [loaderState, setLoaderState] = useState({});
  // { [id]: { file, multiFiles, status, busy, uploaded } }

  const [activateStatus, setActivateStatus] = useState(null);
  const [activateBusy, setActivateBusy] = useState(false);

  // ── Fetch ──
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get("/admin/customers");
      setCustomers(res.data);
      const ms = {}, ls = {};
      res.data.forEach((c) => {
        ms[c.id] = { file: null, headers: [], routeIdCol: "", routeNameCol: "", status: null, busy: false, uploaded: false };
        ls[c.id] = { file: null, multiFiles: [], status: null, busy: false, uploaded: false };
      });
      setMasterState(ms);
      setLoaderState(ls);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveBatches = async () => {
    try {
      const res = await api.get("/scanner/current-batch");
      setActiveBatches(Array.isArray(res.data) ? res.data : []);
    } catch { setActiveBatches([]); }
  };

  useEffect(() => { fetchCustomers(); fetchActiveBatches(); }, []);

  // ── Helpers to update nested state ──
  const setMS = (id, patch) => setMasterState(p => ({ ...p, [id]: { ...p[id], ...patch } }));
  const setLS = (id, patch) => setLoaderState(p => ({ ...p, [id]: { ...p[id], ...patch } }));

  const previewColumns = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post("/admin/preview-columns", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return res.data.headers || [];
  };

  // ── Toggle customer selection ──
  const toggleCustomer = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setActivateStatus(null);
  };

  // ── Master data handlers ──
  const handleMasterFileChange = async (id, file) => {
    setMS(id, { file, headers: [], routeIdCol: "", routeNameCol: "", status: null });
    if (!file) return;
    try {
      const headers = await previewColumns(file);
      setMS(id, { headers });
    } catch {
      setMS(id, { status: { type: "error", message: "Could not read columns from this file" } });
    }
  };

  const handleMasterUpload = async (e, id) => {
    e.preventDefault();
    const ms = masterState[id];
    if (!ms.file || !ms.routeIdCol || !ms.routeNameCol) {
      setMS(id, { status: { type: "error", message: "Select a file and map both columns" } });
      return;
    }
    setMS(id, { busy: true, status: null });
    const fd = new FormData();
    fd.append("file", ms.file);
    fd.append("routeIdColumn", ms.routeIdCol);
    fd.append("routeNameColumn", ms.routeNameCol);
    try {
      const res = await api.post(`/admin/customers/${id}/master-data`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMS(id, { busy: false, uploaded: true, file: null, headers: [], routeIdCol: "", routeNameCol: "", status: { type: "success", message: `✅ ${res.data.count} entries uploaded.` } });
      await fetchCustomers();
    } catch (err) {
      setMS(id, { busy: false, status: { type: "error", message: err.response?.data?.message || "Upload failed" } });
    }
  };

  // ── Loader excel handlers ──
  const handleLoaderSingleChange = (id, file) => {
    setLS(id, { file, multiFiles: [], status: null });
    setActivateStatus(null);
  };

  const handleLoaderMultiChange = (id, files) => {
    setLS(id, { multiFiles: files, file: null, status: null });
    setActivateStatus(null);
  };

  // ── Activate vehicle ──
  const handleActivate = async () => {
    if (selectedIds.length === 0) {
      setActivateStatus({ type: "error", message: "Select at least one client for today's vehicle." });
      return;
    }
    const missing = selectedIds.filter(id => {
      const ls = loaderState[id];
      return !ls?.file && !(ls?.multiFiles?.length > 0);
    });
    if (missing.length > 0) {
      const names = missing.map(id => customers.find(c => c.id === id)?.displayName || id);
      setActivateStatus({ type: "error", message: `Upload shipment Excel for: ${names.join(", ")}` });
      return;
    }

    setActivateBusy(true);
    setActivateStatus(null);
    const results = [], errors = [];

    for (const id of selectedIds) {
      const ls = loaderState[id];
      const cust = customers.find(c => c.id === id);
      try {
        if (ls.multiFiles?.length > 0) {
          const fd = new FormData();
          ls.multiFiles.forEach(f => fd.append("files", f));
          fd.append("customerId", id);
          const res = await api.post("/scanner/upload-multiple", fd, { headers: { "Content-Type": "multipart/form-data" } });
          results.push({ name: cust?.displayName, count: res.data.count });
        } else {
          const fd = new FormData();
          fd.append("file", ls.file);
          fd.append("customerId", id);
          const res = await api.post("/scanner/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
          results.push({ name: cust?.displayName, count: res.data.count });
        }
        setLS(id, { uploaded: true });
      } catch (err) {
        errors.push(`${cust?.displayName}: ${err.response?.data?.message || "failed"}`);
      }
    }

    const lines = results.map(r => `${r.name}: ${r.count} shipments`).join(" · ");
    const errNote = errors.length ? ` ⚠ ${errors.join("; ")}` : "";
    setActivateStatus({
      type: results.length > 0 ? "success" : "error",
      message: results.length > 0 ? `✅ Vehicle activated — ${lines}${errNote}` : `Activation failed. ${errNote}`
    });
    setActivateBusy(false);
    if (results.length > 0) await fetchActiveBatches();
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  // ── Ready check ──
  const allShipmentUploaded = selectedIds.length > 0 && selectedIds.every(id => {
    const ls = loaderState[id];
    return ls?.file || ls?.multiFiles?.length > 0;
  });
  const readyCustomers = customers.filter(c => c.readyForUpload);
  const notReadyCustomers = customers.filter(c => !c.readyForUpload);

  if (loading) return (
    <div className="page">
      <header className="top-bar">
        <div className="top-bar-logo"><img src={logo} alt="SmartShip" /><span className="top-bar-logo-label">Admin</span></div>
        <div className="top-bar-right"><button className="btn btn-outline" onClick={handleLogout}>Logout</button></div>
      </header>
      <main className="content"><p className="muted">Loading clients...</p></main>
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={() => navigate("/admin")} style={{ background: "none", border: "none", color: "var(--brand-teal)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: 0 }}>
            ← Clients
          </button>
          <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>/ Multi-Client Vehicle Dispatch</span>
        </div>

        {/* Active batches banner */}
        {activeBatches.length > 0 && (
          <div className="info-box">
            <strong>Currently active on vehicle:</strong>{" "}
            {activeBatches.map(b => `${b.customerName} (${b.count} shipments)`).join(" · ")}
          </div>
        )}

        {customers.length === 0 ? (
          <div className="card">
            <p className="muted">No clients registered. <button onClick={() => navigate("/admin")} style={{ background: "none", border: "none", color: "var(--brand-teal)", cursor: "pointer", fontWeight: 600, padding: 0 }}>Go back</button> to add one first.</p>
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════
                STEP 1 — Select clients for today's vehicle
            ══════════════════════════════════════════ */}
            <div className="section-label">Step 1 — Select Clients for Today's Vehicle</div>
            <div className="card">
              <p className="helper-text" style={{ marginBottom: "16px" }}>
                Check all clients whose packages are on today's vehicle. You can then upload master data and shipment files for each.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {customers.map(c => {
                  const selected = selectedIds.includes(c.id);
                  const ready = c.readyForUpload;
                  return (
                    <label
                      key={c.id}
                      htmlFor={`sel-${c.id}`}
                      style={{
                        display: "flex", alignItems: "center", gap: "14px",
                        padding: "14px 16px", borderRadius: "10px", cursor: ready ? "pointer" : "not-allowed",
                        border: `2px solid ${selected ? "var(--brand-teal)" : "var(--color-border)"}`,
                        background: selected ? "var(--color-primary-light)" : "var(--color-surface-raised)",
                        opacity: ready ? 1 : 0.5, transition: "all 0.15s",
                      }}
                    >
                      <input
                        id={`sel-${c.id}`}
                        type="checkbox"
                        checked={selected}
                        disabled={!ready}
                        onChange={() => toggleCustomer(c.id)}
                        style={{ width: "18px", height: "18px", accentColor: "var(--brand-teal)", cursor: ready ? "pointer" : "not-allowed" }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--brand-navy)" }}>{c.displayName}</span>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "white", background: "var(--brand-teal)", borderRadius: "4px", padding: "1px 6px", marginLeft: "8px" }}>{c.name}</span>
                        {!ready && <span style={{ fontSize: "12px", color: "var(--color-invalid)", marginLeft: "10px" }}>⚠ Not configured — <button onClick={e => { e.preventDefault(); navigate(`/admin/client/${c.id}`); }} style={{ background: "none", border: "none", color: "var(--brand-teal)", cursor: "pointer", fontWeight: 600, padding: 0, fontSize: "12px" }}>Set up</button></span>}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", textAlign: "right", lineHeight: 1.6 }}>
                        {c.hasMasterData ? <span style={{ color: "var(--brand-teal)" }}>✅ Master data ({c.masterDataCount})</span> : <span style={{ color: "var(--color-invalid)" }}>❌ No master data</span>}
                        <br />
                        {c.hasLoaderMapping ? <span style={{ color: "var(--brand-teal)" }}>✅ Format configured</span> : <span style={{ color: "var(--color-invalid)" }}>❌ Format not set</span>}
                      </div>
                    </label>
                  );
                })}
              </div>
              {selectedIds.length > 0 && (
                <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--brand-teal)", fontWeight: 600 }}>
                  {selectedIds.length} client{selectedIds.length > 1 ? "s" : ""} selected for today's vehicle.
                </div>
              )}
            </div>

            {selectedIds.length > 0 && (
              <>
                {/* ══════════════════════════════════════════
                    STEP 2 — Master Route Data (per selected client)
                ══════════════════════════════════════════ */}
                <div className="section-label">Step 2 — Master Route Data</div>
                <div className="card">
                  <p className="helper-text" style={{ marginBottom: "20px" }}>
                    Upload or update the permanent Route ID → Route Name reference table for each selected client.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {selectedIds.map(id => {
                      const c = customers.find(x => x.id === id);
                      const ms = masterState[id];
                      if (!c || !ms) return null;
                      return (
                        <div key={id} style={{
                          padding: "18px 20px", borderRadius: "10px",
                          border: `2px solid ${ms.uploaded || c.hasMasterData ? "var(--brand-teal)" : "var(--color-border)"}`,
                          background: "var(--color-surface-raised)",
                        }}>
                          {/* Client header */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                            <div>
                              <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--brand-navy)" }}>{c.displayName}</span>
                              <span style={{ fontSize: "11px", fontWeight: 600, color: "white", background: "var(--brand-teal)", borderRadius: "4px", padding: "1px 6px", marginLeft: "8px" }}>{c.name}</span>
                            </div>
                            {c.hasMasterData && (
                              <span style={{ fontSize: "12px", color: "var(--brand-teal)", fontWeight: 600 }}>
                                ✅ {c.masterDataCount} entries already loaded
                              </span>
                            )}
                          </div>

                          {/* Upload form */}
                          <form onSubmit={e => handleMasterUpload(e, id)} className="upload-form-column">
                            <input
                              type="file"
                              accept=".xlsx,.xls,.csv"
                              onChange={e => handleMasterFileChange(id, e.target.files[0])}
                            />
                            {ms.headers.length > 0 && (
                              <div className="mapping-row">
                                <div className="mapping-field">
                                  <label>Which column is Route ID?</label>
                                  <select value={ms.routeIdCol} onChange={e => setMS(id, { routeIdCol: e.target.value })}>
                                    <option value="">Select column...</option>
                                    {ms.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                  </select>
                                </div>
                                <div className="mapping-field">
                                  <label>Which column is Route Name?</label>
                                  <select value={ms.routeNameCol} onChange={e => setMS(id, { routeNameCol: e.target.value })}>
                                    <option value="">Select column...</option>
                                    {ms.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                  </select>
                                </div>
                              </div>
                            )}
                            <button type="submit" className="btn btn-primary" disabled={ms.busy} style={{ alignSelf: "flex-start" }}>
                              {ms.busy ? "Uploading..." : ms.headers.length > 0 ? "Confirm & Upload" : c.hasMasterData ? "Re-upload (optional)" : "Select a file to upload"}
                            </button>
                          </form>
                          {ms.status && (
                            <div className={ms.status.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "10px" }}>
                              {ms.status.message}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ══════════════════════════════════════════
                    STEP 3 — Shipment Excel (per selected client)
                ══════════════════════════════════════════ */}
                <div className="section-label">Step 3 — Shipment Excel for Today's Vehicle</div>
                <div className="card" style={{ border: "2px solid var(--brand-teal)" }}>
                  <p className="helper-text" style={{ marginBottom: "20px" }}>
                    Upload today's shipment Excel for each selected client. The scanner will auto-identify which client each package belongs to.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {selectedIds.map(id => {
                      const c = customers.find(x => x.id === id);
                      const ls = loaderState[id];
                      if (!c || !ls) return null;
                      const hasFile = ls.file || ls.multiFiles?.length > 0;
                      return (
                        <div key={id} style={{
                          padding: "18px 20px", borderRadius: "10px",
                          border: `2px solid ${hasFile ? "var(--brand-teal)" : "var(--color-border)"}`,
                          background: "var(--color-surface-raised)",
                        }}>
                          {/* Client header */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                            <div>
                              <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--brand-navy)" }}>{c.displayName}</span>
                              <span style={{ fontSize: "11px", fontWeight: 600, color: "white", background: "var(--brand-teal)", borderRadius: "4px", padding: "1px 6px", marginLeft: "8px" }}>{c.name}</span>
                            </div>
                            {hasFile && (
                              <span style={{ fontSize: "12px", color: "var(--brand-teal)", fontWeight: 600 }}>✅ File ready</span>
                            )}
                          </div>

                          {/* Single file */}
                          <div style={{ marginBottom: "14px" }}>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Upload Single File</div>
                            <input
                              type="file"
                              accept=".xlsx,.xls,.csv"
                              onChange={e => handleLoaderSingleChange(id, e.target.files[0])}
                              style={{ fontSize: "13px" }}
                            />
                            {ls.file && <div style={{ marginTop: "5px", fontSize: "13px", color: "var(--brand-teal)", fontWeight: 500 }}>📄 {ls.file.name}</div>}
                          </div>

                          {/* Divider */}
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "4px 0 14px" }}>
                            <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
                            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>OR MERGE MULTIPLE FILES</span>
                            <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
                          </div>

                          {/* Multi file */}
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Upload & Merge Multiple Files</div>
                            <input
                              type="file"
                              accept=".xlsx,.xls,.csv"
                              multiple
                              onChange={e => handleLoaderMultiChange(id, Array.from(e.target.files))}
                              style={{ fontSize: "13px" }}
                            />
                            {ls.multiFiles?.length > 0 && (
                              <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--color-text-muted)" }}>
                                {ls.multiFiles.map((f, i) => <div key={i}>📄 {f.name}</div>)}
                              </div>
                            )}
                          </div>

                          {ls.status && (
                            <div className={ls.status.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "10px" }}>
                              {ls.status.message}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Vehicle Manifest summary */}
                  {selectedIds.length > 0 && (
                    <div style={{ marginTop: "20px", padding: "14px 16px", background: "var(--color-surface)", borderRadius: "8px", border: "1.5px solid var(--color-border)" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
                        Vehicle Manifest
                      </div>
                      {selectedIds.map(id => {
                        const c = customers.find(x => x.id === id);
                        const ls = loaderState[id];
                        const file = ls?.file;
                        const multi = ls?.multiFiles;
                        const hasFile = file || multi?.length > 0;
                        return (
                          <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border)", fontSize: "13px" }}>
                            <span style={{ fontWeight: 600, color: "var(--brand-navy)" }}>{c?.displayName}</span>
                            <span style={{ color: hasFile ? "var(--brand-teal)" : "var(--color-invalid)", fontWeight: 500 }}>
                              {file ? `✅ ${file.name}` : multi?.length > 0 ? `✅ ${multi.length} files` : "❌ No file"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Activate button */}
                  <div style={{ marginTop: "20px" }}>
                    <button
                      onClick={handleActivate}
                      disabled={activateBusy || selectedIds.length === 0}
                      className="btn btn-primary"
                      style={{ width: "100%", padding: "16px", fontSize: "15px", fontWeight: 700 }}
                    >
                      {activateBusy
                        ? "Activating vehicle..."
                        : selectedIds.length === 0
                        ? "Select clients to activate"
                        : allShipmentUploaded
                        ? `🚛 Activate Vehicle — ${selectedIds.length} Client${selectedIds.length > 1 ? "s" : ""}`
                        : `🚛 Activate Vehicle — ${selectedIds.length} Client${selectedIds.length > 1 ? "s" : ""}`}
                    </button>

                    {activateStatus && (
                      <div className={activateStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "12px", fontSize: "14px" }}>
                        {activateStatus.message}
                        {activateStatus.type === "success" && (
                          <div style={{ marginTop: "10px", padding: "12px 16px", background: "rgba(255,255,255,0.6)", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "22px" }}>✅</span>
                            <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--brand-navy)" }}>
                              Vehicle is ready — loaders can start scanning!
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default VehicleDispatchPage;