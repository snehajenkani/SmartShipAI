import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

// ---------------------------------------------------------------------------
// Beep helper
// ---------------------------------------------------------------------------
function playBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* ignore */ }
}

const ColSelect = ({ label, headers, value, onChange, required = true }) => (
  <div className="mapping-field">
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
// Master file upload/edit card — used both for first-time upload and editing
// ---------------------------------------------------------------------------
const MasterFileCard = ({
  title, description, color,
  savedFileName, savedCount, savedAt,
  editing, onStartEdit, onCancelEdit,
  file, headers, busy, onFileChange,
  routeNameCol, setRouteNameCol,
  secondLabel, secondValue, setSecondValue,
  onSave, saving, onClear,
}) => {
  const hasSaved = !!savedFileName;

  return (
    <div style={{
      flex: "1 1 320px",
      border: `2px solid ${hasSaved && !editing ? color : "var(--color-border)"}`,
      borderRadius: 10, padding: "18px 20px",
      background: "var(--color-surface-raised)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.4px" }}>
          {title}
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
        {description}
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
              <ColSelect label="Route Name column" headers={headers} value={routeNameCol} onChange={setRouteNameCol} />
              <ColSelect label={secondLabel}        headers={headers} value={secondValue}   onChange={setSecondValue} />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary"
                  disabled={!routeNameCol || !secondValue || saving}
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
// RoutingPage
// ---------------------------------------------------------------------------
const RoutingPage = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  // ── Customers ──
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // ── Master data state (for selected customer) ──
  const [masterInfo, setMasterInfo] = useState(null); // from GET /master
  const [masterLoading, setMasterLoading] = useState(false);

  // address card
  const [addrEditing, setAddrEditing] = useState(false);
  const [addrFile, setAddrFile]       = useState(null);
  const [addrHeaders, setAddrHeaders] = useState([]);
  const [addrBusy, setAddrBusy]       = useState(false);
  const [addrRouteNameCol, setAddrRouteNameCol] = useState("");
  const [addrAddressCol, setAddrAddressCol]     = useState("");
  const [addrSaving, setAddrSaving]   = useState(false);

  // pincode card
  const [pinEditing, setPinEditing] = useState(false);
  const [pinFile, setPinFile]       = useState(null);
  const [pinHeaders, setPinHeaders] = useState([]);
  const [pinBusy, setPinBusy]       = useState(false);
  const [pinRouteNameCol, setPinRouteNameCol] = useState("");
  const [pinPincodeCol, setPinPincodeCol]     = useState("");
  const [pinSaving, setPinSaving]   = useState(false);

  const [masterActionStatus, setMasterActionStatus] = useState(null);

  // ── Routing file step ──
  const [routingFile, setRoutingFile]       = useState(null);
  const [routingHeaders, setRoutingHeaders] = useState([]);
  const [routingAwbCol, setRoutingAwbCol]       = useState("");
  const [routingCustNameCol, setRoutingCustNameCol] = useState("");
  const [routingCustNumCol, setRoutingCustNumCol]   = useState("");
  const [routingAddressCol, setRoutingAddressCol]   = useState("");
  const [routingStatus, setRoutingStatus] = useState(null);
  const [routingBusy, setRoutingBusy]     = useState(false);

  // ── Results ──
  const [results, setResults]   = useState([]);
  const [jobId, setJobId]       = useState(null);
  const [summary, setSummary]   = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [filter, setFilter]     = useState("all");
  const beepedRef = useRef(false);

  const handleLogout = () => { logout(); navigate("/login"); };

  // ── Load customers ──
  const fetchCustomers = async () => {
    try {
      setCustomersLoading(true);
      const res = await api.get("/routing/customers");
      setCustomers(res.data);
    } catch (err) { console.error(err); }
    finally { setCustomersLoading(false); }
  };
  useEffect(() => { fetchCustomers(); }, []);

  // ── Load master info when customer selected ──
  const fetchMasterInfo = async (customerId) => {
    setMasterLoading(true);
    try {
      const res = await api.get(`/routing/customers/${customerId}/master`);
      setMasterInfo(res.data);
    } catch (err) { console.error(err); }
    finally { setMasterLoading(false); }
  };

  const handleSelectCustomer = (id) => {
    setSelectedCustomerId(id);
    setMasterInfo(null);
    setMasterActionStatus(null);
    setAddrEditing(false); setPinEditing(false);
    setAddrFile(null); setAddrHeaders([]); setAddrRouteNameCol(""); setAddrAddressCol("");
    setPinFile(null);  setPinHeaders([]);  setPinRouteNameCol("");  setPinPincodeCol("");
    setRoutingFile(null); setRoutingHeaders([]); setRoutingAwbCol(""); setRoutingCustNameCol(""); setRoutingCustNumCol(""); setRoutingAddressCol(""); setRoutingStatus(null);
    setResults([]); setJobId(null); setSummary(null); setFilter("all");
    if (id) fetchMasterInfo(id);
  };

  const previewColumns = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post("/routing/preview-columns", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.headers || [];
  };

  // ── Address file handlers ──
  const handleAddrFileChange = async (e) => {
    const file = e.target.files[0];
    setAddrFile(file); setAddrHeaders([]); setAddrRouteNameCol(""); setAddrAddressCol("");
    if (!file) return;
    setAddrBusy(true);
    try { setAddrHeaders(await previewColumns(file)); }
    catch { setMasterActionStatus({ type: "error", message: "Could not read columns from address file" }); }
    finally { setAddrBusy(false); }
  };

  const handleSaveAddress = async () => {
    if (!addrFile || !addrRouteNameCol || !addrAddressCol) return;
    setAddrSaving(true); setMasterActionStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", addrFile);
      fd.append("routeNameColumn", addrRouteNameCol);
      fd.append("addressColumn", addrAddressCol);
      await api.post(`/routing/customers/${selectedCustomerId}/master/address`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMasterActionStatus({ type: "success", message: "Address master data saved." });
      setAddrEditing(false);
      setAddrFile(null); setAddrHeaders([]); setAddrRouteNameCol(""); setAddrAddressCol("");
      await fetchMasterInfo(selectedCustomerId);
      await fetchCustomers();
    } catch (err) {
      setMasterActionStatus({ type: "error", message: err.response?.data?.message || "Failed to save address master" });
    } finally { setAddrSaving(false); }
  };

  // ── Pincode file handlers ──
  const handlePinFileChange = async (e) => {
    const file = e.target.files[0];
    setPinFile(file); setPinHeaders([]); setPinRouteNameCol(""); setPinPincodeCol("");
    if (!file) return;
    setPinBusy(true);
    try { setPinHeaders(await previewColumns(file)); }
    catch { setMasterActionStatus({ type: "error", message: "Could not read columns from pincode file" }); }
    finally { setPinBusy(false); }
  };

  const handleSavePincode = async () => {
    if (!pinFile || !pinRouteNameCol || !pinPincodeCol) return;
    setPinSaving(true); setMasterActionStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", pinFile);
      fd.append("routeNameColumn", pinRouteNameCol);
      fd.append("pincodeColumn", pinPincodeCol);
      await api.post(`/routing/customers/${selectedCustomerId}/master/pincode`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMasterActionStatus({ type: "success", message: "Pincode master data saved." });
      setPinEditing(false);
      setPinFile(null); setPinHeaders([]); setPinRouteNameCol(""); setPinPincodeCol("");
      await fetchMasterInfo(selectedCustomerId);
      await fetchCustomers();
    } catch (err) {
      setMasterActionStatus({ type: "error", message: err.response?.data?.message || "Failed to save pincode master" });
    } finally { setPinSaving(false); }
  };

  // ── Routing file handlers ──
  const handleRoutingFileChange = async (e) => {
    const file = e.target.files[0];
    setRoutingFile(file); setRoutingHeaders([]); setRoutingAwbCol(""); setRoutingCustNameCol(""); setRoutingCustNumCol(""); setRoutingAddressCol(""); setRoutingStatus(null);
    if (!file) return;
    setRoutingBusy(true);
    try { setRoutingHeaders(await previewColumns(file)); }
    catch { setRoutingStatus({ type: "error", message: "Could not read columns from routing file" }); }
    finally { setRoutingBusy(false); }
  };

  const handleProcess = async (e) => {
    e.preventDefault();
    if (!routingFile) { setRoutingStatus({ type: "error", message: "Please upload the routing file" }); return; }
    if (!routingAwbCol || !routingAddressCol) { setRoutingStatus({ type: "error", message: "AWB and Address columns are required" }); return; }

    setRoutingBusy(true); setRoutingStatus(null); beepedRef.current = false;
    try {
      const fd = new FormData();
      fd.append("customerId", selectedCustomerId);
      fd.append("routingFile", routingFile);
      fd.append("routingAwbCol", routingAwbCol);
      fd.append("routingCustomerNameCol", routingCustNameCol);
      fd.append("routingCustomerNumberCol", routingCustNumCol);
      fd.append("routingAddressCol", routingAddressCol);

      const res = await api.post("/routing/process", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResults(res.data.results);
      setJobId(res.data.jobId);
      setSummary({ total: res.data.totalRows, matched: res.data.matchedCount, unmatched: res.data.unmatchedCount });

      if (res.data.unmatchedCount > 0 && !beepedRef.current) {
        beepedRef.current = true;
        playBeep();
      }
    } catch (err) {
      setRoutingStatus({ type: "error", message: err.response?.data?.message || "Processing failed" });
    } finally { setRoutingBusy(false); }
  };

  const handleDownload = async () => {
    if (!jobId) return;
    setDownloading(true);
    try {
      const res  = await api.get(`/routing/download/${jobId}`, { responseType: "blob" });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href  = url;
      link.setAttribute("download", `RoutingResults_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert("Download failed. Please try again."); }
    finally { setDownloading(false); }
  };

  const handleProcessAnother = () => {
    setRoutingFile(null); setRoutingHeaders([]); setRoutingAwbCol(""); setRoutingCustNameCol(""); setRoutingCustNumCol(""); setRoutingAddressCol(""); setRoutingStatus(null);
    setResults([]); setJobId(null); setSummary(null); setFilter("all");
    beepedRef.current = false;
  };

  const filteredResults = results.filter((r) => {
    if (filter === "matched")   return r.matchMethod !== "unmatched";
    if (filter === "unmatched") return r.matchMethod === "unmatched";
    return true;
  });

  const bothMasterReady = masterInfo?.hasAddressMaster && masterInfo?.hasPincodeMaster;
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="page">
      <header className="top-bar">
        <div className="top-bar-logo">
          <img src={logo} alt="SmartShip Logistics" />
          <span className="top-bar-logo-label">Routing</span>
        </div>
        <div className="top-bar-right">
          <span className="username-tag">{auth?.username}</span>
          <button className="btn btn-outline" onClick={() => navigate("/admin")}>Admin Panel</button>
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
                    {c.displayName} ({c.name}) {c.hasAddressMaster && c.hasPincodeMaster ? "✅" : "⚠️ master data needed"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {selectedCustomerId && (
          <>
            {/* ── Master Data section (always visible, editable) ── */}
            <div className="section-label">Master Data — {selectedCustomer?.displayName}</div>
            <div className="card">
              <p className="helper-text" style={{ marginBottom: 20 }}>
                Master data is saved permanently for this customer. Upload once, then reuse for every routing job — use <strong>Change</strong> any time the data needs updating.
              </p>

              {masterLoading ? (
                <p className="muted">Loading master data...</p>
              ) : (
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <MasterFileCard
                    title="Address Master"
                    description="Route Name + short Address keywords (area names)."
                    color="var(--brand-teal)"
                    savedFileName={masterInfo?.addressFileName}
                    savedCount={masterInfo?.addressCount}
                    savedAt={masterInfo?.addressUploadedAt}
                    editing={addrEditing}
                    onStartEdit={() => setAddrEditing(true)}
                    onCancelEdit={() => { setAddrEditing(false); setAddrFile(null); setAddrHeaders([]); }}
                    file={addrFile}
                    headers={addrHeaders}
                    busy={addrBusy}
                    onFileChange={handleAddrFileChange}
                    routeNameCol={addrRouteNameCol}
                    setRouteNameCol={setAddrRouteNameCol}
                    secondLabel="Address column"
                    secondValue={addrAddressCol}
                    setSecondValue={setAddrAddressCol}
                    onSave={handleSaveAddress}
                    saving={addrSaving}
                  />

                  <MasterFileCard
                    title="Pincode Master"
                    description="Route Name + 6-digit Pincode. Used as fallback matching."
                    color="#6366f1"
                    savedFileName={masterInfo?.pincodeFileName}
                    savedCount={masterInfo?.pincodeCount}
                    savedAt={masterInfo?.pincodeUploadedAt}
                    editing={pinEditing}
                    onStartEdit={() => setPinEditing(true)}
                    onCancelEdit={() => { setPinEditing(false); setPinFile(null); setPinHeaders([]); }}
                    file={pinFile}
                    headers={pinHeaders}
                    busy={pinBusy}
                    onFileChange={handlePinFileChange}
                    routeNameCol={pinRouteNameCol}
                    setRouteNameCol={setPinRouteNameCol}
                    secondLabel="Pincode column"
                    secondValue={pinPincodeCol}
                    setSecondValue={setPinPincodeCol}
                    onSave={handleSavePincode}
                    saving={pinSaving}
                  />
                </div>
              )}

              {masterActionStatus && (
                <div className={masterActionStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: 16 }}>
                  {masterActionStatus.message}
                </div>
              )}
            </div>

            {/* ── Routing Excel upload (only when both masters ready) ── */}
            {bothMasterReady && (
              <>
                <div className="section-label">Upload Routing Excel</div>
                <div className="card">
                  <p className="helper-text" style={{ marginBottom: 16 }}>
                    Upload the routing Excel with <strong>AWB</strong>, Customer Name, Customer Number, and the <strong>full Address</strong> (including pincode).
                  </p>
                  <form onSubmit={handleProcess} className="upload-form-column">
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleRoutingFileChange} />
                    {routingBusy && !routingHeaders.length && <p className="muted">Reading columns...</p>}

                    {routingHeaders.length > 0 && (
                      <div className="mapping-row">
                        <ColSelect label="AWB column"             headers={routingHeaders} value={routingAwbCol}      onChange={setRoutingAwbCol} />
                        <ColSelect label="Customer Name column"   headers={routingHeaders} value={routingCustNameCol}  onChange={setRoutingCustNameCol}  required={false} />
                        <ColSelect label="Customer Number column" headers={routingHeaders} value={routingCustNumCol}   onChange={setRoutingCustNumCol}   required={false} />
                        <ColSelect label="Address column"         headers={routingHeaders} value={routingAddressCol}   onChange={setRoutingAddressCol} />
                      </div>
                    )}

                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={routingBusy || !routingFile}
                      style={{ alignSelf: "flex-start" }}
                    >
                      {routingBusy ? "Processing..." : "🔀 Process & Match Routes"}
                    </button>

                    {routingStatus && (
                      <div className={routingStatus.type === "success" ? "success-message" : "error-message"}>
                        {routingStatus.message}
                      </div>
                    )}
                  </form>
                </div>
              </>
            )}

            {!bothMasterReady && !masterLoading && (
              <div className="card" style={{ border: "1.5px dashed var(--color-border)", textAlign: "center", color: "var(--color-text-muted)", fontSize: 14 }}>
                ⚠️ Please upload and save both master files above before processing a routing Excel.
              </div>
            )}

            {/* ── Results ── */}
            {summary && (
              <>
                <div className="section-label">Results</div>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
                  {[
                    { label: "Total Rows", value: summary.total,     color: "var(--brand-navy)" },
                    { label: "Matched",    value: summary.matched,   color: "#16a34a" },
                    { label: "CHECK THIS", value: summary.unmatched, color: "#dc2626" },
                  ].map((s) => (
                    <div key={s.label} style={{
                      flex: "1 1 140px", padding: "16px 20px", borderRadius: 10,
                      background: "var(--color-surface-raised)", border: `2px solid ${s.color}22`, textAlign: "center",
                    }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 600, marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {summary.unmatched > 0 && (
                  <div style={{
                    background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 8,
                    padding: "12px 16px", marginBottom: 16, color: "#dc2626", fontSize: 14, fontWeight: 600,
                  }}>
                    ⚠️ {summary.unmatched} row{summary.unmatched > 1 ? "s" : ""} could not be matched — marked as <strong>CHECK THIS</strong>. Please verify manually before dispatch.
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                  <button className="btn btn-primary" onClick={handleDownload} disabled={downloading}>
                    {downloading ? "Downloading..." : "⬇ Download Results Excel"}
                  </button>
                  <button className="btn btn-outline" onClick={handleProcessAnother}>🔄 Process Another File</button>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {[
                    { key: "all",       label: `All (${summary.total})` },
                    { key: "matched",   label: `Matched (${summary.matched})` },
                    { key: "unmatched", label: `CHECK THIS (${summary.unmatched})` },
                  ].map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)} style={{
                      padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      border: "1.5px solid var(--color-border)",
                      background: filter === f.key ? "var(--brand-teal)" : "transparent",
                      color:      filter === f.key ? "white" : "var(--color-text-muted)",
                    }}>{f.label}</button>
                  ))}
                </div>

                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "var(--brand-navy)", color: "white" }}>
                          {["#", "AWB", "Customer Name", "Customer Number", "Address", "Route Name", "Match"].map((h) => (
                            <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResults.map((r, i) => {
                          const isUnmatched = r.matchMethod === "unmatched";
                          return (
                            <tr key={i} style={{
                              background: isUnmatched ? "#fef2f2" : i % 2 === 0 ? "var(--color-surface)" : "var(--color-surface-raised)",
                              borderBottom: "1px solid var(--color-border)",
                            }}>
                              <td style={{ padding: "9px 14px", color: "var(--color-text-muted)" }}>{i + 1}</td>
                              <td style={{ padding: "9px 14px", fontWeight: 600 }}>{r.awb || "—"}</td>
                              <td style={{ padding: "9px 14px" }}>{r.customerName || "—"}</td>
                              <td style={{ padding: "9px 14px" }}>{r.customerNumber || "—"}</td>
                              <td style={{ padding: "9px 14px", maxWidth: 260, wordBreak: "break-word" }}>{r.address || "—"}</td>
                              <td style={{ padding: "9px 14px", fontWeight: 700, color: isUnmatched ? "#dc2626" : "var(--brand-teal)" }}>
                                {r.routeName}
                              </td>
                              <td style={{ padding: "9px 14px" }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                                  background: r.matchMethod === "address" ? "#dcfce7" : r.matchMethod === "pincode" ? "#dbeafe" : "#fee2e2",
                                  color:      r.matchMethod === "address" ? "#16a34a" : r.matchMethod === "pincode" ? "#1d4ed8" : "#dc2626",
                                }}>
                                  {r.matchMethod === "address" ? "Address" : r.matchMethod === "pincode" ? "Pincode" : "CHECK THIS"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredResults.length === 0 && (
                          <tr>
                            <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>
                              No rows match this filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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

export default RoutingPage;