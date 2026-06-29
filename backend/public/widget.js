(function () {
  const API_BASE = "https://smartshipai-2.onrender.com/api/public";

  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    #ss-widget-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1d4ed8;
      color: white;
      border: none;
      border-radius: 50px;
      padding: 14px 22px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      z-index: 99999;
      box-shadow: 0 4px 16px rgba(29,78,216,0.4);
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: sans-serif;
      transition: background 0.2s;
    }
    #ss-widget-btn:hover { background: #1e40af; }

    #ss-widget-box {
      position: fixed;
      bottom: 82px;
      right: 24px;
      background: white;
      border-radius: 16px;
      padding: 24px;
      width: 320px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      z-index: 99999;
      display: none;
      font-family: sans-serif;
      border: 1px solid #e5e7eb;
    }

    #ss-widget-box h3 {
      margin: 0 0 4px;
      font-size: 17px;
      color: #1d4ed8;
      font-weight: 700;
    }

    #ss-widget-box p {
      margin: 0 0 16px;
      font-size: 13px;
      color: #6b7280;
    }

    #ss-widget-input {
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid #d1d5db;
      border-radius: 10px;
      font-size: 14px;
      box-sizing: border-box;
      outline: none;
      transition: border 0.2s;
    }
    #ss-widget-input:focus { border-color: #1d4ed8; }

    #ss-widget-submit {
      width: 100%;
      margin-top: 10px;
      padding: 11px;
      background: #1d4ed8;
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: background 0.2s;
    }
    #ss-widget-submit:hover { background: #1e40af; }
    #ss-widget-submit:disabled { background: #93c5fd; cursor: not-allowed; }

    #ss-widget-result {
      margin-top: 14px;
      font-size: 14px;
      min-height: 20px;
    }

    .ss-result-success {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      padding: 12px 14px;
      color: #1e40af;
    }

    .ss-result-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      padding: 12px 14px;
      color: #b91c1c;
    }

    .ss-result-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 13px;
    }
    .ss-result-row:last-child { margin-bottom: 0; }
    .ss-result-label { color: #6b7280; }
    .ss-result-value { font-weight: 600; color: #1e3a8a; }

    #ss-widget-close {
      position: absolute;
      top: 14px;
      right: 16px;
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #9ca3af;
      line-height: 1;
    }
    #ss-widget-close:hover { color: #374151; }
  `;
  document.head.appendChild(style);

  // Floating button
  const btn = document.createElement("button");
  btn.id = "ss-widget-btn";
  btn.innerHTML = "📦 Track Shipment";
  document.body.appendChild(btn);

  // Widget box
  const box = document.createElement("div");
  box.id = "ss-widget-box";
  box.innerHTML = `
    <button id="ss-widget-close">✕</button>
    <h3>Track Shipment</h3>
    <p>Enter your Tracking ID to get route details</p>
    <input id="ss-widget-input" type="text" placeholder="Enter Tracking ID / SID" />
    <button id="ss-widget-submit">Get Route</button>
    <div id="ss-widget-result"></div>
  `;
  document.body.appendChild(box);

  // Toggle open/close
  btn.addEventListener("click", () => {
    const isOpen = box.style.display === "block";
    box.style.display = isOpen ? "none" : "block";
    if (!isOpen) document.getElementById("ss-widget-input").focus();
  });

  document.getElementById("ss-widget-close").addEventListener("click", () => {
    box.style.display = "none";
  });

  // Allow Enter key to submit
  document.getElementById("ss-widget-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("ss-widget-submit").click();
  });

  // Track button click
  document.getElementById("ss-widget-submit").addEventListener("click", async () => {
    const sid = document.getElementById("ss-widget-input").value.trim();
    const result = document.getElementById("ss-widget-result");
    const submitBtn = document.getElementById("ss-widget-submit");

    if (!sid) {
      result.innerHTML = `<div class="ss-result-error">⚠️ Please enter a Tracking ID.</div>`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Searching...";
    result.innerHTML = "";

    try {
      const res = await fetch(`${API_BASE}/track/${encodeURIComponent(sid)}`);
      const data = await res.json();

      if (data.found) {
        result.innerHTML = `
          <div class="ss-result-success">
            <div class="ss-result-row">
              <span class="ss-result-label">Tracking ID</span>
              <span class="ss-result-value">${data.trackingId}</span>
            </div>
            <div class="ss-result-row">
              <span class="ss-result-label">Route Name</span>
              <span class="ss-result-value">${data.routeName}</span>
            </div>
            <div class="ss-result-row">
              <span class="ss-result-label">Route ID</span>
              <span class="ss-result-value">${data.routeId}</span>
            </div>
          </div>`;
      } else {
        result.innerHTML = `<div class="ss-result-error">❌ ${data.message || "Tracking ID not found."}</div>`;
      }
    } catch {
      result.innerHTML = `<div class="ss-result-error">⚠️ Could not connect. Please try again.</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Get Route";
    }
  });
})();
