import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

const Scanner = () => {
  const [batchInfo, setBatchInfo] = useState(null);
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [downloading, setDownloading] = useState(false);

  const inputRef = useRef(null);
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  // ---- Speak using Microsoft Heera / en-IN voice ----
  const speak = (text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const trySpeak = () => {
      const voices = window.speechSynthesis.getVoices();
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
    if (window.speechSynthesis.getVoices().length) { trySpeak(); }
    else { window.speechSynthesis.onvoiceschanged = () => { trySpeak(); window.speechSynthesis.onvoiceschanged = null; }; }
  };

  // ---- Fetch active batch summary (all active customers) ----
  const fetchBatchInfo = async () => {
    try {
      const res = await api.get("/scanner/current-batch");
      const batches = Array.isArray(res.data) ? res.data : [];
      setBatchInfo(batches.length > 0 ? batches : null);
    } catch (err) { setBatchInfo(null); }
  };

  useEffect(() => {
    fetchBatchInfo();
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

  // ---- Scan ----
  const handleScan = async (e) => {
    e.preventDefault();
    const id = scanInput.trim();
    if (!id) return;
    try {
      // No customerId — backend searches all active batches automatically
      const res = await api.post("/scanner/scan", { trackingId: id });
      const data = res.data;
      setScanResult(data);
      const timestamp = new Date().toLocaleTimeString();
      if (data.valid) {
        speak(data.routeName);
        setHistory((prev) => [{
          timestamp,
          trackingId: data.trackingId,
          customerName: data.customerName || "",
          routeId: data.routeId || "",
          routeName: data.routeName,
          address: data.address || "",
          valid: true,
        }, ...prev]);
      } else {
        speak("Invalid Package");
        setHistory((prev) => [{
          timestamp,
          trackingId: id,
          customerName: data.customerName || "",
          routeId: "",
          routeName: "",
          address: "",
          valid: false,
          message: data.message || "Invalid Package",
        }, ...prev]);
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
      const seen = new Set();
      const uniqueHistory = history.filter((item) => {
        if (seen.has(item.trackingId)) return false;
        seen.add(item.trackingId);
        return true;
      });
      const res = await api.post("/scanner/history-download", {
        customerId: null,
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
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download history. Please try again.");
    } finally { setDownloading(false); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

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

        {/* Active batch summary banner */}
        {batchInfo && Array.isArray(batchInfo) && batchInfo.length > 0 && (
          <div className="info-box">
            <strong>Today's active shipments:</strong>{" "}
            {batchInfo.map((b) => `${b.customerName} (${b.count})`).join(" · ")}
          </div>
        )}

        {/* Scan card */}
        <div className="card">
          <h2>Scan Barcode</h2>
          {(!batchInfo || batchInfo.length === 0) && (
            <p className="muted" style={{ marginBottom: "12px" }}>
              No shipment data loaded yet. Please ask admin to complete today's vehicle setup.
            </p>
          )}
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
        </div>

        {/* Result card */}
        {scanResult && (
          <div className={`card result-card ${scanResult.valid ? "result-valid" : "result-invalid"}`}>
            {scanResult.valid ? (
              <>
                <div className="result-hero">{scanResult.routeName}</div>
                {scanResult.customerName && (
                  <div style={{
                    fontSize: "13px", fontWeight: 600, color: "var(--brand-teal)",
                    letterSpacing: "0.5px", textTransform: "uppercase", marginTop: "6px",
                  }}>
                    {scanResult.customerName}
                  </div>
                )}
                <div className="result-details">
                  <span>Tracking ID: {scanResult.trackingId}</span>
                  {scanResult.routeId && <span>Route ID: {scanResult.routeId}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="result-hero result-hero-invalid">
                  {scanResult.message || "Invalid Package"}
                </div>
                {scanResult.customerName && (
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "6px" }}>
                    Customer: {scanResult.customerName}
                  </div>
                )}
              </>
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

            {/* Count badge */}
            <div style={{
              textAlign: "center", padding: "16px", marginBottom: "16px",
              background: "var(--brand-teal)", borderRadius: "10px", color: "white",
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
                  <th>Customer</th>
                  <th>Result</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, idx) => (
                  <tr key={idx} className={item.valid ? "row-valid" : "row-invalid"}>
                    <td>{item.timestamp}</td>
                    <td>{item.trackingId}</td>
                    <td>{item.customerName || "—"}</td>
                    <td>{item.valid ? item.routeName : item.message}</td>
                    <td>{item.address || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default Scanner;
