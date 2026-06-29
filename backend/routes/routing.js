const express = require("express");
const multer  = require("multer");
const XLSX    = require("xlsx");
const RoutingJob = require("../models/RoutingJob");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// HELPER: reads an Excel buffer → { headers, headerRowIndex, rows }
// ---------------------------------------------------------------------------
function readExcelHeaders(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  let bestHeaders = [], bestHeaderRowIndex = -1, bestRows = [], bestMaxNonEmpty = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row      = rows[i];
      const nonEmpty = row.filter((c) => String(c || "").trim().length > 0);
      if (nonEmpty.length > bestMaxNonEmpty) {
        bestMaxNonEmpty    = nonEmpty.length;
        bestHeaderRowIndex = i;
        bestHeaders        = row.map((c) => String(c || "").trim());
        bestRows           = rows;
      }
    }
  }
  return { headers: bestHeaders, headerRowIndex: bestHeaderRowIndex, rows: bestRows };
}

function findColIdx(headers, colName) {
  if (!colName) return -1;
  const needle = String(colName).trim().toLowerCase();
  return headers.findIndex((h) => String(h).trim().toLowerCase() === needle);
}

// Extract 6-digit pincode from a full address string
function extractPincode(address) {
  const match = String(address || "").match(/\b(\d{6})\b/);
  return match ? match[1] : "";
}

// Normalize address for keyword matching
function normalizeAddr(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Check if keyword appears in full address
function keywordMatch(keyword, fullAddress) {
  const kw   = normalizeAddr(keyword);
  const addr = normalizeAddr(fullAddress);
  if (!kw || !addr) return false;
  return addr.includes(kw);
}

// ---------------------------------------------------------------------------
// POST /api/routing/preview-columns
// ---------------------------------------------------------------------------
router.post(
  "/preview-columns",
  protect,
  requireRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const { headers } = readExcelHeaders(req.file.buffer);
      if (headers.length === 0)
        return res.status(400).json({ message: "Could not detect a header row in this file." });
      res.json({ headers });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error reading file" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/routing/process
// Accepts:
//   - addressMasterFile  (RouteName + Address keywords)
//   - pincodeMasterFile  (RouteName + Pincode)
//   - routingFile        (AWB, CustomerName, CustomerNumber, full Address)
//   + column mapping fields
// ---------------------------------------------------------------------------
router.post(
  "/process",
  protect,
  requireRole("admin"),
  upload.fields([
    { name: "addressMasterFile", maxCount: 1 },
    { name: "pincodeMasterFile", maxCount: 1 },
    { name: "routingFile",       maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const addressMasterFile = req.files?.addressMasterFile?.[0];
      const pincodeMasterFile = req.files?.pincodeMasterFile?.[0];
      const routingFile       = req.files?.routingFile?.[0];

      if (!addressMasterFile) return res.status(400).json({ message: "Address master file is required" });
      if (!pincodeMasterFile) return res.status(400).json({ message: "Pincode master file is required" });
      if (!routingFile)       return res.status(400).json({ message: "Routing file is required" });

      const {
        // address master columns
        addrMasterRouteNameCol,
        addrMasterAddressCol,
        // pincode master columns
        pinMasterRouteNameCol,
        pinMasterPincodeCol,
        // routing file columns
        routingAwbCol,
        routingCustomerNameCol,
        routingCustomerNumberCol,
        routingAddressCol,
      } = req.body;

      if (!addrMasterRouteNameCol || !addrMasterAddressCol)
        return res.status(400).json({ message: "Both columns are required for the address master file" });
      if (!pinMasterRouteNameCol || !pinMasterPincodeCol)
        return res.status(400).json({ message: "Both columns are required for the pincode master file" });
      if (!routingAwbCol || !routingAddressCol)
        return res.status(400).json({ message: "AWB and Address columns are required for the routing file" });

      // ── Parse address master file ──
      const { headers: amh, headerRowIndex: amIdx, rows: amRows } = readExcelHeaders(addressMasterFile.buffer);
      const amRouteNameCol = findColIdx(amh, addrMasterRouteNameCol);
      const amAddressCol   = findColIdx(amh, addrMasterAddressCol);
      if (amRouteNameCol === -1) return res.status(400).json({ message: `Column "${addrMasterRouteNameCol}" not found in address master file` });
      if (amAddressCol   === -1) return res.status(400).json({ message: `Column "${addrMasterAddressCol}" not found in address master file` });

      const addressEntries = [];
      for (let i = amIdx + 1; i < amRows.length; i++) {
        const row       = amRows[i];
        const routeName = String(row[amRouteNameCol] || "").trim();
        const address   = String(row[amAddressCol]   || "").trim();
        if (routeName && address) addressEntries.push({ routeName, address });
      }
      if (addressEntries.length === 0)
        return res.status(400).json({ message: "No valid rows found in address master file" });

      // ── Parse pincode master file ──
      const { headers: pmh, headerRowIndex: pmIdx, rows: pmRows } = readExcelHeaders(pincodeMasterFile.buffer);
      const pmRouteNameCol = findColIdx(pmh, pinMasterRouteNameCol);
      const pmPincodeCol   = findColIdx(pmh, pinMasterPincodeCol);
      if (pmRouteNameCol === -1) return res.status(400).json({ message: `Column "${pinMasterRouteNameCol}" not found in pincode master file` });
      if (pmPincodeCol   === -1) return res.status(400).json({ message: `Column "${pinMasterPincodeCol}" not found in pincode master file` });

      const pincodeMap = new Map(); // pincode → routeName
      for (let i = pmIdx + 1; i < pmRows.length; i++) {
        const row       = pmRows[i];
        const routeName = String(row[pmRouteNameCol] || "").trim();
        const pincode   = String(row[pmPincodeCol]   || "").trim();
        if (routeName && pincode && !pincodeMap.has(pincode)) {
          pincodeMap.set(pincode, routeName);
        }
      }
      if (pincodeMap.size === 0)
        return res.status(400).json({ message: "No valid rows found in pincode master file" });

      // ── Parse routing file ──
      const { headers: rh, headerRowIndex: rIdx, rows: rRows } = readExcelHeaders(routingFile.buffer);
      const rAwbCol        = findColIdx(rh, routingAwbCol);
      const rCustNameCol   = findColIdx(rh, routingCustomerNameCol   || "");
      const rCustNumberCol = findColIdx(rh, routingCustomerNumberCol || "");
      const rAddressCol    = findColIdx(rh, routingAddressCol);
      if (rAwbCol     === -1) return res.status(400).json({ message: `Column "${routingAwbCol}" not found in routing file` });
      if (rAddressCol === -1) return res.status(400).json({ message: `Column "${routingAddressCol}" not found in routing file` });

      // ── Match rows ──
      const results = [];
      let matchedCount = 0, unmatchedCount = 0;

      for (let i = rIdx + 1; i < rRows.length; i++) {
        const row            = rRows[i];
        const awb            = String(row[rAwbCol]        || "").trim();
        const customerName   = rCustNameCol   !== -1 ? String(row[rCustNameCol]   || "").trim() : "";
        const customerNumber = rCustNumberCol !== -1 ? String(row[rCustNumberCol] || "").trim() : "";
        const fullAddress    = String(row[rAddressCol]    || "").trim();

        if (!awb && !fullAddress) continue;

        let routeName   = "CHECK THIS";
        let matchMethod = "unmatched";

        // Step 1: keyword address match
        for (const entry of addressEntries) {
          if (entry.address && keywordMatch(entry.address, fullAddress)) {
            routeName   = entry.routeName;
            matchMethod = "address";
            break;
          }
        }

        // Step 2: pincode fallback
        if (matchMethod === "unmatched") {
          const pincode = extractPincode(fullAddress);
          if (pincode && pincodeMap.has(pincode)) {
            routeName   = pincodeMap.get(pincode);
            matchMethod = "pincode";
          }
        }

        if (matchMethod !== "unmatched") matchedCount++;
        else unmatchedCount++;

        results.push({ awb, customerName, customerNumber, address: fullAddress, routeName, matchMethod });
      }

      if (results.length === 0)
        return res.status(400).json({ message: "No valid rows found in routing file" });

      // ── Save job ──
      const masterEntries = addressEntries.map((e) => ({ routeName: e.routeName, address: e.address, pincode: "" }));

      const job = await RoutingJob.create({
        createdBy: req.user.id,
        masterMapping: {
          routeNameColumn: addrMasterRouteNameCol,
          addressColumn:   addrMasterAddressCol,
          pincodeColumn:   pinMasterPincodeCol,
        },
        routingMapping: {
          awbColumn:            routingAwbCol,
          customerNameColumn:   routingCustomerNameCol   || "",
          customerNumberColumn: routingCustomerNumberCol || "",
          addressColumn:        routingAddressCol,
        },
        masterEntries,
        results,
        masterFileName:  `${addressMasterFile.originalname} + ${pincodeMasterFile.originalname}`,
        routingFileName: routingFile.originalname,
        totalRows:       results.length,
        matchedCount,
        unmatchedCount,
      });

      res.json({
        jobId:          job._id,
        totalRows:      results.length,
        matchedCount,
        unmatchedCount,
        results,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error during routing process" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/routing/download/:jobId
// ---------------------------------------------------------------------------
router.get("/download/:jobId", protect, requireRole("admin"), async (req, res) => {
  try {
    const job = await RoutingJob.findById(req.params.jobId);
    if (!job) return res.status(404).json({ message: "Routing job not found" });

    const rows = job.results.map((r) => ({
      "AWB":             r.awb,
      "Customer Name":   r.customerName,
      "Customer Number": r.customerNumber,
      "Address":         r.address,
      "Route Name":      r.routeName,
      "Match Method":    r.matchMethod === "address" ? "Address Match"
                       : r.matchMethod === "pincode" ? "Pincode Match"
                       : "CHECK THIS",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 18 }, { wch: 40 }, { wch: 24 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, "Routing Results");

    const buffer   = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const date     = new Date().toISOString().slice(0, 10);
    const filename = `RoutingResults_${date}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating download" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/routing/jobs
// ---------------------------------------------------------------------------
router.get("/jobs", protect, requireRole("admin"), async (req, res) => {
  try {
    const jobs = await RoutingJob.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select("masterFileName routingFileName totalRows matchedCount unmatchedCount createdAt");
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching jobs" });
  }
});

module.exports = router;