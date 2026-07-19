import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import logo from "../assets/logo.jpg";

// Picks readable text color (black/white) for any background color the admin
// used in Excel — works for hex codes ("#4CAF50") and named colors ("orange").
const getContrastText = (color) => {
  if (!color) return null;
  try {
    const probe = document.createElement("div");
    probe.style.color = color;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    const nums = rgb.match(/\d+/g);
    if (!nums) return null;
    const [r, g, b] = nums.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111111" : "#ffffff";
  } catch {
    return null;
  }
};

const Scanner = () => {
  const [batchInfo, setBatchInfo] = useState(null);
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [downloading, setDownloading] = useState(false);
  // Auto-locks to whichever customer the FIRST successful scan belongs to,
  // so the progress counter tracks that customer's total instead of summing
  // every active customer on the vehicle. Resets on page reload (per session).
  const [lockedCustomer, setLockedCustomer] = useState(null);

  const inputRef = useRef(null);
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  // ---- Speak using Microsoft Heera / en-IN voice ----
  const speak = (text) => {
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const doSpeak = (voices) => {
      const voice =
        voices.find(v => v.name === "Microsoft Heera Desktop - English (India)") ||
        voices.find(v => v.name === "Microsoft Heera - English (India)")         ||
        voices.find(v => v.name === "Microsoft Ravi Desktop - English (India)")  ||
        voices.find(v => v.name === "Microsoft Ravi - English (India)")          ||
        voices.find(v => v.lang === "en-IN")                                     ||
        voices.find(v => v.lang.startsWith("en"));
      const utterance = new SpeechSynthesisUtterance(String(text));
      if (voice) utterance.voice = voice;
      utterance.lang  = "en-IN";
      utterance.rate  = 0.85;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak(voices);
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        doSpeak(window.speechSynthesis.getVoices());
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  };

  // ---- Fetch active batch summary ----
  const fetchBatchInfo = async () => {
    try {
      const res = await api.get("/scanner/current-batch");
      const batches = Array.isArray(res.data) ? res.data : [];
      setBatchInfo(batches.length > 0 ? batches : null);
    } catch { setBatchInfo(null); }
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
      const res = await api.post("/scanner/scan", { trackingId: id });
      const data = res.data;
      const timestamp = new Date().toLocaleTimeString();

      if (data.valid && data.isUndelivered) {
        // ── Undelivered package ──
        const reason = data.undeliveredReason || "Undelivered";
        setScanResult({ ...data, isUndelivered: true });
        speak(reason);
        setLockedCustomer((prev) => prev || data.customerName || null);
        setHistory((prev) => [{
          timestamp,
          trackingId: data.trackingId || id,
          customerName: data.customerName || "",
          recipientName: data.recipientName || "",
          recipientNumber: data.recipientNumber || "",
          routeId: "",
          routeName: "",
          address: data.address || "",
          valid: true,
          isUndelivered: true,
          undeliveredReason: reason,
        }, ...prev]);

      } else if (data.valid) {
        // ── Valid delivered package ──
        const routeName = data.routeName || "";
        const noOfPacks = data.noOfPacks || 1;
        const scanCount = data.scanCount || 1;

        if (data.alreadyScanned) {
          // Duplicate scan — for multi-pack IDs, mention it's fully done
          speak(noOfPacks > 1 ? `Already Scanned. All ${noOfPacks} packs done.` : "Already Scanned");
        } else if (noOfPacks > 1) {
          // Multi-pack tracking ID — announce route name + pack progress
          speak(`${routeName || data.customerName || "Valid Package"}. Pack ${scanCount} of ${noOfPacks}.`);
        } else {
          // speak route name; fall back to customer name so TTS is never silent
          speak(routeName || data.customerName || "Valid Package");
        }

        setScanResult(data);
        setLockedCustomer((prev) => prev || data.customerName || null);
        setHistory((prev) => [{
          timestamp,
          trackingId: data.trackingId || id,
          customerName: data.customerName || "",
          recipientName: data.recipientName || "",
          recipientNumber: data.recipientNumber || "",
          routeId: data.routeId || "",
          routeName,
          address: data.address || "",
          valid: true,
          isUndelivered: false,
          alreadyScanned: !!data.alreadyScanned,
          noOfPacks,
          scanCount,
        }, ...prev]);

      } else {
        // ── Invalid ──
        setScanResult(data);
        speak("Invalid Package");
        setHistory((prev) => [{
          timestamp,
          trackingId: id,
          customerName: data.customerName || "",
          recipientName: data.recipientName || "",
          recipientNumber: data.recipientNumber || "",
          routeId: "",
          routeName: "",
          address: "",
          valid: false,
          isUndelivered: false,
          message: data.message || "Invalid Package",
        }, ...prev]);
      }
    } catch (err) {
      const message = err.response?.data?.message || "Something went wrong. Please try again.";
      setScanResult({ valid: false, message, error: true });
      speak("Invalid Package");
    } finally {
      setScanInput("");
      inputRef.current?.focus();
    }
  };

  // ---- Download history (excludes undelivered) ----
  const handleDownloadHistory = async () => {
    if (history.length === 0) return;
    setDownloading(true);
    try {
      // Filter out undelivered entries — backend also excludes them, but filter here too
      const seen = new Set();
      const uniqueHistory = history
        .filter((item) => !item.isUndelivered)
        .filter((item) => {
          if (seen.has(item.trackingId)) return false;
          seen.add(item.trackingId);
          return true;
        });

      if (uniqueHistory.length === 0) {
        alert("No deliverable scan history to export. All scanned items were undelivered.");
        setDownloading(false);
        return;
      }

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
    } catch {
      alert("Failed to download history. Please try again.");
    } finally { setDownloading(false); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  // Total tracking IDs — once a customer is locked in (from the first scan),
  // this is that customer's batch count. Before that, it's not shown at all,
  // since we don't yet know which customer this session belongs to.
  const totalTrackingIds = lockedCustomer && Array.isArray(batchInfo)
    ? (batchInfo.find((b) => b.customerName === lockedCustomer)?.count || 0)
    : 0;

  // Scanned count scoped to the locked customer (falls back to counting
  // everything if no lock has been set yet, which shouldn't normally happen
  // since the history card only renders after the first scan).
  const scannedCount = new Set(
    history
      .filter((i) => i.valid && !i.isUndelivered && (!lockedCustomer || i.customerName === lockedCustomer))
      .map((i) => i.trackingId)
  ).size;

  // Only show a column if at least one row actually has data for it —
  // avoids a table full of "—" placeholders for columns this customer
  // never mapped.
  const hasCustomerNameData   = history.some((i) => i.recipientName);
  const hasCustomerNumberData = history.some((i) => i.recipientNumber);
  const hasPacksData          = history.some((i) => i.noOfPacks > 1);
  const hasAddressData        = history.some((i) => i.address);

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
        {batchInfo && batchInfo.length > 0 && (
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
          <>
            {/* ── Undelivered result ── */}
            {scanResult.valid && scanResult.isUndelivered ? (
              <div className="card result-card" style={{
                border: "2px solid #f59e0b",
                background: "#fffbeb",
              }}>
                <div style={{
                  fontSize: "13px", fontWeight: 700, color: "#b45309",
                  letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "6px",
                }}>
                  ⚠️ Undelivered Package
                </div>
                <div style={{ fontSize: "28px", fontWeight: 800, color: "#92400e", marginBottom: "8px" }}>
                  {scanResult.undeliveredReason || "Undelivered"}
                </div>
                {scanResult.customerName && (
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#b45309", marginBottom: "6px" }}>
                    {scanResult.customerName}
                  </div>
                )}
                <div className="result-details">
                  <span>Tracking ID: {scanResult.trackingId}</span>
                </div>
              </div>

            ) : scanResult.valid && scanResult.alreadyScanned ? (
              /* ── Already scanned (duplicate — single-pack, or all packs done) ── */
              <div className="card result-card" style={{
                border: "2px solid #6b7280",
                background: "#f3f4f6",
              }}>
                <div style={{
                  fontSize: "13px", fontWeight: 700, color: "#4b5563",
                  letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "6px",
                }}>
                  ⚠️ Already Scanned
                  {scanResult.noOfPacks > 1 && ` — All ${scanResult.noOfPacks} Packs Done`}
                </div>
                <div style={{ fontSize: "28px", fontWeight: 800, color: "#374151", marginBottom: "8px" }}>
                  {scanResult.routeName}
                </div>
                {scanResult.customerName && (
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#4b5563", marginBottom: "6px" }}>
                    {scanResult.customerName}
                  </div>
                )}
                <div className="result-details">
                  <span>Tracking ID: {scanResult.trackingId}</span>
                </div>
              </div>

            ) : scanResult.valid ? (
              /* ── Valid delivered result ── */
              <div
                className="card result-card result-valid"
                style={
                  scanResult.color
                    ? { backgroundColor: scanResult.color, borderColor: scanResult.color }
                    : undefined
                }
              >
                {scanResult.noOfPacks > 1 && (
                  <div style={{
                    display: "inline-block", fontSize: "13px", fontWeight: 700,
                    color: scanResult.color ? getContrastText(scanResult.color) : "var(--brand-navy)",
                    background: scanResult.color ? "rgba(255,255,255,0.35)" : "var(--color-primary-light)",
                    borderRadius: "20px", padding: "3px 12px", marginBottom: "8px",
                  }}>
                    📦 Pack {scanResult.scanCount} of {scanResult.noOfPacks}
                    {scanResult.packsComplete ? " — Complete" : ""}
                  </div>
                )}
                <div
                  className="result-hero"
                  style={scanResult.color ? { color: getContrastText(scanResult.color) } : undefined}
                >
                  {scanResult.routeName}
                </div>
                {scanResult.customerName && (
                  <div style={{
                    fontSize: "13px", fontWeight: 600,
                    color: scanResult.color ? getContrastText(scanResult.color) : "var(--brand-teal)",
                    letterSpacing: "0.5px", textTransform: "uppercase", marginTop: "6px",
                    opacity: scanResult.color ? 0.85 : 1,
                  }}>
                    {scanResult.customerName}
                  </div>
                )}
                <div
                  className="result-details"
                  style={scanResult.color ? { color: getContrastText(scanResult.color), opacity: 0.85 } : undefined}
                >
                  <span>Tracking ID: {scanResult.trackingId}</span>
                  {scanResult.routeId && <span>Route ID: {scanResult.routeId}</span>}
                  {scanResult.address && <span className="address-detail">Address: {scanResult.address}</span>}
                </div>
              </div>

            ) : (
              /* ── Invalid result ── */
              <div className="card result-card result-invalid">
                <div className="result-hero result-hero-invalid">
                  {scanResult.message || "Invalid Package"}
                </div>
                {scanResult.customerName && (
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "6px" }}>
                    Customer: {scanResult.customerName}
                  </div>
                )}
              </div>
            )}
          </>
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
                Shipments Scanned{lockedCustomer ? ` — ${lockedCustomer}` : ""}
              </div>
              <div style={{ fontSize: "52px", fontWeight: 800, lineHeight: 1.1 }}>
                {scannedCount}
                {totalTrackingIds > 0 && (
                  <span style={{ fontSize: "28px", opacity: 0.75 }}> / {totalTrackingIds}</span>
                )}
              </div>
              {history.some(i => i.isUndelivered) && (
                <div style={{ fontSize: "13px", opacity: 0.85, marginTop: 4 }}>
                  + {history.filter(i => i.isUndelivered).length} undelivered (excluded from Excel)
                </div>
              )}
            </div>

            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Tracking ID</th>
                  <th>Customer</th>
                  {hasCustomerNameData && <th>Customer Name</th>}
                  {hasCustomerNumberData && <th>Customer Number</th>}
                  <th>Result</th>
                  {hasPacksData && <th>Packs</th>}
                  {hasAddressData && <th>Address</th>}
                </tr>
              </thead>
              <tbody>
                {history.map((item, idx) => (
                  <tr
                    key={idx}
                    className={item.isUndelivered ? "" : item.valid ? "row-valid" : "row-invalid"}
                    style={item.isUndelivered ? {
                      background: "#fffbeb",
                      borderLeft: "3px solid #f59e0b",
                    } : item.alreadyScanned ? {
                      background: "#f3f4f6",
                      borderLeft: "3px solid #6b7280",
                    } : {}}
                  >
                    <td>{item.timestamp}</td>
                    <td>{item.trackingId}</td>
                    <td>{item.customerName || "—"}</td>
                    {hasCustomerNameData && <td>{item.recipientName || "—"}</td>}
                    {hasCustomerNumberData && <td>{item.recipientNumber || "—"}</td>}
                    <td>
                      {item.isUndelivered
                        ? <span style={{ color: "#b45309", fontWeight: 600 }}>⚠️ {item.undeliveredReason || "Undelivered"}</span>
                        : item.alreadyScanned
                          ? <span style={{ color: "#4b5563", fontWeight: 600 }}>⚠️ Already Scanned</span>
                          : item.valid
                            ? item.routeName
                            : item.message}
                    </td>
                    {hasPacksData && (
                      <td>
                        {item.valid && !item.isUndelivered && item.noOfPacks > 1
                          ? `${item.scanCount} / ${item.noOfPacks}`
                          : ""}
                      </td>
                    )}
                    {hasAddressData && <td>{item.address || ""}</td>}
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