import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

const Scanner = () => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customersLoading, setCustomersLoading] = useState(true);

  // Single file upload
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Multi-file upload
  const [multiFiles, setMultiFiles] = useState([]);
  const [multiUploadStatus, setMultiUploadStatus] = useState(null);
  const [multiUploading, setMultiUploading] = useState(false);

  const [batchInfo, setBatchInfo] = useState(null);
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [downloading, setDownloading] = useState(false);

  const inputRef = useRef(null);
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  // ---- Speak using Microsoft Heera (English India) voice ----
  const speak = (text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();

      // Prefer Microsoft Heera or Ravi (Indian English), fallback to any en-IN
      const voice =
        voices.find(v => v.name === "Microsoft Heera Desktop - English (India)") ||
        voices.find(v => v.name === "Microsoft Heera - English (India)")         ||
        voices.find(v => v.name === "Microsoft Ravi Desktop - English (India)")  ||
        voices.find(v => v.name === "Microsoft Ravi - English (India)")          ||
        voices.find(v => v.lang === "en-IN");

      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = "en-IN";
      utterance.rate = 0.85;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    };

    // Voices may not be loaded yet on first call
    if (window.speechSynthesis.getVoices().length) {
      trySpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        trySpeak();
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  };

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await api.get("/scanner/customers");
        setCustomers(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setCustomersLoading(false);
      }
    };
    fetchCustomers();
  }, []);

  const fetchBatchInfo = async (customerId) => {
    if (!customerId) { setBatchInfo(null); return; }
    try {
      const res = await api.get(`/scanner/current-batch?customerId=${customerId}`);
      setBatchInfo(res.data.exists ? res.data : null);
    } catch (err) { setBatchInfo(null); }
  };

  const handleCustomerChange = (e) => {
    const id = e.target.value;
    setSelectedCustomerId(id);
    setFile(null); setMultiFiles([]); setUploadStatus(null); setMultiUploadStatus(null);
    setScanResult(null); setHistory([]);
    fetchBatchInfo(id);
  };

  useEffect(() => {
    inputRef.current?.focus();
    const refocus = (e) => {
      if (e.target.tagName === "INPUT" && e.target.type === "file") return;
      if (e.target.tagName === "BUTTON") return;
      if (e.target.tagName === "SELECT") return;
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    document.addEventListener("click", refocus);
    return () => document.removeEventListener("click", refocus);
  }, []);

  // ---- Single file upload ----
  const handleFileChange = (e) => { setFile(e.target.files[0]); setUploadStatus(null); };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) { setUploadStatus({ type: "error", message: "Please select a customer first" }); return; }
    if (!file) { setUploadStatus({ type: "error", message: "Please select a file first" }); return; }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("customerId", selectedCustomerId);

    setUploading(true); setUploadStatus(null);
    try {
      const res = await api.post("/scanner/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setUploadStatus({ type: "success", message: `✅ ${res.data.count} shipments loaded from 1 file.` });
      setFile(null);
      await fetchBatchInfo(selectedCustomerId);
      setScanResult(null); setHistory([]);
    } catch (err) {
      setUploadStatus({ type: "error", message: err.response?.data?.message || "Upload failed. Please try again." });
    } finally { setUploading(false); inputRef.current?.focus(); }
  };

  // ---- Multi-file upload ----
  const handleMultiFileChange = (e) => {
    setMultiFiles(Array.from(e.target.files));
    setMultiUploadStatus(null);
  };

  const handleMultiUpload = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) { setMultiUploadStatus({ type: "error", message: "Please select a customer first" }); return; }
    if (multiFiles.length === 0) { setMultiUploadStatus({ type: "error", message: "Please select at least one file" }); return; }

    const formData = new FormData();
    multiFiles.forEach((f) => formData.append("files", f));
    formData.append("customerId", selectedCustomerId);

    setMultiUploading(true); setMultiUploadStatus(null);
    try {
      const res = await api.post("/scanner/upload-multiple", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const warningNote = res.data.errors?.length
        ? ` (${res.data.errors.length} file(s) had errors)`
        : "";
      setMultiUploadStatus({
        type: "success",
        message: `✅ ${res.data.count} unique shipments merged from ${res.data.filesUploaded} file(s).${warningNote}`,
      });
      setMultiFiles([]);
      await fetchBatchInfo(selectedCustomerId);
      setScanResult(null); setHistory([]);
    } catch (err) {
      setMultiUploadStatus({ type: "error", message: err.response?.data?.message || "Upload failed. Please try again." });
    } finally { setMultiUploading(false); inputRef.current?.focus(); }
  };

  // ---- Scan ----
  const handleScan = async (e) => {
    e.preventDefault();
    const id = scanInput.trim();
    if (!id) return;

    try {
      const res = await api.post("/scanner/scan", {
        trackingId: id,
        customerId: selectedCustomerId || undefined,
      });
      const data = res.data;
      setScanResult(data);
      const timestamp = new Date().toLocaleTimeString();

      if (data.valid) {
        speak(data.routeName);
        setHistory((prev) => [{ timestamp, trackingId: data.trackingId, routeId: data.routeId || "", routeName: data.routeName, valid: true }, ...prev]);
      } else {
        speak("Invalid Package");
        setHistory((prev) => [{ timestamp, trackingId: id, routeId: "", routeName: "", valid: false, message: data.message || "Invalid Package" }, ...prev]);
      }
    } catch (err) {
      const message = err.response?.data?.message || "Something went wrong. Please try again.";
      setScanResult({ valid: false, message, error: true });
      speak("Invalid Package");
    } finally { setScanInput(""); inputRef.current?.focus(); }
  };

  // ---- Download history (deduplicated) ----
  const handleDownloadHistory = async () => {
    if (history.length === 0) return;
    setDownloading(true);
    try {
      // Keep only the first scan per tracking ID
      const seen = new Set();
      const uniqueHistory = history.filter((item) => {
        if (seen.has(item.trackingId)) return false;
        seen.add(item.trackingId);
        return true;
      });

      const res = await api.post("/scanner/history-download", {
        customerId: selectedCustomerId || null,
        history: uniqueHistory,
      }, { responseType: "blob" });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const contentDisposition = res.headers["content-disposition"];
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
        : "ScanHistory.xlsx";
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download history. Please try again.");
    } finally { setDownloading(false); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="page">
      <header className="top-bar">
        <div className="top-bar-logo">
          <img src={logo} alt="SmartShip Logistics" />
          <span className="top-bar-logo-label">Scanner</span>
        </div>
        <div className="top-bar-right">
          <span className="username-tag">{auth?.username}</span>
          {auth?.role === "admin" && (
            <button className="btn btn-outline" onClick={() => navigate("/admin")}>Admin Panel</button>
          )}
          <button className="btn btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="content">

        {/* Customer selector */}
        <div className="card">
          <h2>Select Customer</h2>
          <p className="helper-text">Choose which company's shipments you are loading today.</p>
          {customersLoading ? <p className="muted">Loading customers...</p> : customers.length === 0 ? (
            <p className="muted">No customers configured yet. Please contact admin.</p>
          ) : (
            <select value={selectedCustomerId} onChange={handleCustomerChange} style={{ width: "100%", maxWidth: "380px" }}>
              <option value="">— Select a customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.readyForUpload}>
                  {c.displayName} ({c.name}){!c.readyForUpload ? " — not configured" : ""}
                </option>
              ))}
            </select>
          )}
          {selectedCustomer && !selectedCustomer.readyForUpload && (
            <div className="error-message" style={{ marginTop: "12px" }}>
              This customer is not fully configured. Please ask admin to complete the setup.
            </div>
          )}
        </div>

        {selectedCustomer?.readyForUpload && (
          <>
            {/* ---- Upload section ---- */}
            <div className="card">
              <h2>Upload Today's Shipment Excel</h2>
              <p className="helper-text">
                Upload Excel file(s) for <strong>{selectedCustomer.displayName}</strong>.
                Column names don't need to match — the format is already saved by admin.
                {batchInfo && (
                  <span style={{ display: "block", marginTop: "6px", color: "var(--brand-teal)", fontWeight: 500 }}>
                    ✅ Currently loaded: {batchInfo.count} shipments
                    {batchInfo.fileNames?.length > 1
                      ? ` from ${batchInfo.fileNames.length} files`
                      : batchInfo.fileName ? ` (${batchInfo.fileName})` : ""}
                  </span>
                )}
              </p>

              {/* Single file */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Upload Single File
                </label>
                <form onSubmit={handleUpload} className="upload-form">
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                  <button type="submit" className="btn btn-primary" disabled={uploading}>
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </form>
                {uploadStatus && (
                  <div className={uploadStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "10px" }}>
                    {uploadStatus.message}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "4px 0 20px" }}>
                <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.5px" }}>OR MERGE MULTIPLE FILES</span>
                <div style={{ flex: 1, height: "1px", background: "var(--color-border)" }} />
              </div>

              {/* Multiple files */}
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Upload & Merge Multiple Files
                </label>
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)", margin: "0 0 10px 0" }}>
                  Select 2 or more Excel files — all will be merged into one batch. Duplicate tracking IDs keep the last file's entry.
                </p>
                <form onSubmit={handleMultiUpload} className="upload-form">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    multiple
                    onChange={handleMultiFileChange}
                  />
                  <button type="submit" className="btn btn-primary" disabled={multiUploading}>
                    {multiUploading ? "Merging..." : `Merge & Upload${multiFiles.length > 0 ? ` (${multiFiles.length})` : ""}`}
                  </button>
                </form>
                {multiFiles.length > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--color-text-muted)" }}>
                    {multiFiles.map((f, i) => (
                      <div key={i}>📄 {f.name}</div>
                    ))}
                  </div>
                )}
                {multiUploadStatus && (
                  <div className={multiUploadStatus.type === "success" ? "success-message" : "error-message"} style={{ marginTop: "10px" }}>
                    {multiUploadStatus.message}
                  </div>
                )}
              </div>
            </div>

            {/* Scan */}
            <div className="card">
              <h2>Scan Barcode</h2>
              <form onSubmit={handleScan} className="scan-form">
                <input
                  ref={inputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scan or enter Tracking ID..."
                  autoFocus
                />
              </form>
              {!batchInfo && (
                <p className="muted" style={{ marginTop: "12px" }}>
                  No shipment data loaded yet. Please upload today's Excel above before scanning.
                </p>
              )}
            </div>

            {/* Result card */}
            {scanResult && (
              <div className={`card result-card ${scanResult.valid ? "result-valid" : "result-invalid"}`}>
                {batchInfo?.meta && (
                  <div className="trip-banner">
                    {batchInfo.meta.tripSheetId && <span>Trip: {batchInfo.meta.tripSheetId}</span>}
                    {batchInfo.meta.vehicle && <span>Vehicle: {batchInfo.meta.vehicle}</span>}
                    {batchInfo.meta.date && <span>Date: {batchInfo.meta.date}</span>}
                  </div>
                )}
                {scanResult.valid ? (
                  <>
                    <div className="result-hero">{scanResult.routeName}</div>
                    <div className="result-details">
                      <span>Tracking ID: {scanResult.trackingId}</span>
                      {scanResult.routeId && <span>Route ID: {scanResult.routeId}</span>}
                    </div>
                  </>
                ) : (
                  <div className="result-hero result-hero-invalid">
                    {scanResult.message || "Invalid Package"}
                  </div>
                )}
              </div>
            )}

            {/* Scan history */}
            {history.length > 0 && (
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                  <h2 style={{ margin: 0 }}>Scan History</h2>
                  <button onClick={handleDownloadHistory} disabled={downloading} className="btn btn-primary" style={{ fontSize: "13px", padding: "8px 16px" }}>
                    {downloading ? "Downloading..." : "⬇ Download Excel"}
                  </button>
                </div>
                <div style={{
                  textAlign: "center",
                  padding: "16px",
                  marginBottom: "16px",
                  background: "var(--brand-teal)",
                  borderRadius: "10px",
                  color: "white"
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", opacity: 0.85 }}>
                    Total Shipments Scanned
                  </div>
                  <div style={{ fontSize: "52px", fontWeight: 800, lineHeight: 1.1 }}>
                    {new Set(history.filter(i => i.valid).map(i => i.trackingId)).size}
                  </div>
                </div>
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Tracking ID</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item, idx) => (
                      <tr key={idx} className={item.valid ? "row-valid" : "row-invalid"}>
                        <td>{item.timestamp}</td>
                        <td>{item.trackingId}</td>
                        <td>{item.valid ? item.routeName : item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Scanner;