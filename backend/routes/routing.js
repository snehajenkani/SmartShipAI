const express = require("express");
const multer  = require("multer");
const XLSX    = require("xlsx");
const RoutingJob = require("../models/RoutingJob");
const Customer    = require("../models/Customer");
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

function extractPincode(address) {
  const match = String(address || "").match(/\b(\d{6})\b/);
  return match ? match[1] : "";
}

function normalizeAddr(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

// ===========================================================================
// CUSTOMER ROUTING MASTER DATA — persistent, reusable across sessions
// ===========================================================================

// GET /api/routing/customers — list customers with routing-master readiness info
router.get("/customers", protect, requireRole("admin"), async (req, res) => {
  try {
    const customers = await Customer.find().sort({ displayName: 1 });
    const result = customers.map((c) => ({
      id: c._id,
      name: c.name,
      displayName: c.displayName,
      hasAddressMaster: (c.routingMaster?.addressEntries?.length || 0) > 0,
      hasPincodeMaster: (c.routingMaster?.pincodeEntries?.length || 0) > 0,
      addressFileName:  c.routingMaster?.addressFileName || null,
      pincodeFileName:  c.routingMaster?.pincodeFileName || null,
      addressCount:     c.routingMaster?.addressEntries?.length || 0,
      pincodeCount:     c.routingMaster?.pincodeEntries?.length || 0,
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching customers" });
  }
});

// GET /api/routing/customers/:customerId/master — fetch saved master data status
router.get("/customers/:customerId/master", protect, requireRole("admin"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const rm = customer.routingMaster || {};
    res.json({
      hasAddressMaster: (rm.addressEntries?.length || 0) > 0,
      hasPincodeMaster: (rm.pincodeEntries?.length || 0) > 0,
      addressFileName:  rm.addressFileName || null,
      addressCount:     rm.addressEntries?.length || 0,
      addressMapping:   rm.addressMapping || null,
      addressUploadedAt: rm.addressUploadedAt || null,
      pincodeFileName:  rm.pincodeFileName || null,
      pincodeCount:     rm.pincodeEntries?.length || 0,
      pincodeMapping:   rm.pincodeMapping || null,
      pincodeUploadedAt: rm.pincodeUploadedAt || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching master data" });
  }
});

// POST /api/routing/customers/:customerId/master/address — save/replace address master file
router.post(
  "/customers/:customerId/master/address",
  protect,
  requireRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const { routeNameColumn, addressColumn } = req.body;
      if (!routeNameColumn || !addressColumn)
        return res.status(400).json({ message: "routeNameColumn and addressColumn are required" });

      const { headers, headerRowIndex, rows } = readExcelHeaders(req.file.buffer);
      const routeNameCol = findColIdx(headers, routeNameColumn);
      const addressCol   = findColIdx(headers, addressColumn);
      if (routeNameCol === -1) return res.status(400).json({ message: `Column "${routeNameColumn}" not found` });
      if (addressCol   === -1) return res.status(400).json({ message: `Column "${addressColumn}" not found` });

      const entries = [];
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row       = rows[i];
        const routeName = String(row[routeNameCol] || "").trim();
        const address   = String(row[addressCol]   || "").trim();
        if (routeName && address) entries.push({ routeName, address });
      }
      if (entries.length === 0)
        return res.status(400).json({ message: "No valid rows found in this file" });

      customer.routingMaster = customer.routingMaster || {};
      customer.routingMaster.addressEntries    = entries;
      customer.routingMaster.addressMapping    = { routeNameColumn, addressColumn };
      customer.routingMaster.addressFileName   = req.file.originalname;
      customer.routingMaster.addressUploadedAt = new Date();
      customer.routingMaster.uploadedBy        = req.user.id;
      customer.markModified("routingMaster");
      await customer.save();

      res.json({
        message: `Address master saved for "${customer.displayName}"`,
        count: entries.length,
        fileName: req.file.originalname,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error saving address master" });
    }
  }
);

// POST /api/routing/customers/:customerId/master/pincode — save/replace pincode master file
router.post(
  "/customers/:customerId/master/pincode",
  protect,
  requireRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const { routeNameColumn, pincodeColumn } = req.body;
      if (!routeNameColumn || !pincodeColumn)
        return res.status(400).json({ message: "routeNameColumn and pincodeColumn are required" });

      const { headers, headerRowIndex, rows } = readExcelHeaders(req.file.buffer);
      const routeNameCol = findColIdx(headers, routeNameColumn);
      const pincodeCol   = findColIdx(headers, pincodeColumn);
      if (routeNameCol === -1) return res.status(400).json({ message: `Column "${routeNameColumn}" not found` });
      if (pincodeCol   === -1) return res.status(400).json({ message: `Column "${pincodeColumn}" not found` });

      const entries = [];
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row       = rows[i];
        const routeName = String(row[routeNameCol] || "").trim();
        const pincode   = String(row[pincodeCol]   || "").trim();
        if (routeName && pincode) entries.push({ routeName, pincode });
      }
      if (entries.length === 0)
        return res.status(400).json({ message: "No valid rows found in this file" });

      customer.routingMaster = customer.routingMaster || {};
      customer.routingMaster.pincodeEntries    = entries;
      customer.routingMaster.pincodeMapping    = { routeNameColumn, pincodeColumn };
      customer.routingMaster.pincodeFileName   = req.file.originalname;
      customer.routingMaster.pincodeUploadedAt = new Date();
      customer.routingMaster.uploadedBy        = req.user.id;
      customer.markModified("routingMaster");
      await customer.save();

      res.json({
        message: `Pincode master saved for "${customer.displayName}"`,
        count: entries.length,
        fileName: req.file.originalname,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error saving pincode master" });
    }
  }
);

// DELETE /api/routing/customers/:customerId/master/address — clear address master
router.delete("/customers/:customerId/master/address", protect, requireRole("admin"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    customer.routingMaster = customer.routingMaster || {};
    customer.routingMaster.addressEntries    = [];
    customer.routingMaster.addressMapping    = null;
    customer.routingMaster.addressFileName   = null;
    customer.routingMaster.addressUploadedAt = null;
    customer.markModified("routingMaster");
    await customer.save();
    res.json({ message: "Address master cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error clearing address master" });
  }
});

// DELETE /api/routing/customers/:customerId/master/pincode — clear pincode master
router.delete("/customers/:customerId/master/pincode", protect, requireRole("admin"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    customer.routingMaster = customer.routingMaster || {};
    customer.routingMaster.pincodeEntries    = [];
    customer.routingMaster.pincodeMapping    = null;
    customer.routingMaster.pincodeFileName   = null;
    customer.routingMaster.pincodeUploadedAt = null;
    customer.markModified("routingMaster");
    await customer.save();
    res.json({ message: "Pincode master cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error clearing pincode master" });
  }
});

// ===========================================================================
// PROCESS ROUTING — uses the customer's SAVED master data (no re-upload needed)
// ===========================================================================
router.post(
  "/process",
  protect,
  requireRole("admin"),
  upload.fields([{ name: "routingFile", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { customerId, routingAwbCol, routingCustomerNameCol, routingCustomerNumberCol, routingAddressCol } = req.body;
      const routingFile = req.files?.routingFile?.[0];

      if (!customerId)   return res.status(400).json({ message: "customerId is required" });
      if (!routingFile)  return res.status(400).json({ message: "Routing file is required" });
      if (!routingAwbCol || !routingAddressCol)
        return res.status(400).json({ message: "AWB and Address columns are required for the routing file" });

      const customer = await Customer.findById(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      const addressEntries = customer.routingMaster?.addressEntries || [];
      const pincodeEntries = customer.routingMaster?.pincodeEntries || [];

      if (addressEntries.length === 0)
        return res.status(400).json({ message: "No address master data saved for this customer. Please upload it first." });
      if (pincodeEntries.length === 0)
        return res.status(400).json({ message: "No pincode master data saved for this customer. Please upload it first." });

      const pincodeMap = new Map();
      for (const e of pincodeEntries) {
        if (e.pincode && !pincodeMap.has(e.pincode)) pincodeMap.set(e.pincode, e.routeName);
      }

      // ── Parse routing file ──
      const { headers: rh, headerRowIndex: rIdx, rows: rRows } = readExcelHeaders(routingFile.buffer);
      const rAwbCol        = findColIdx(rh, routingAwbCol);
      const rCustNameCol   = findColIdx(rh, routingCustomerNameCol   || "");
      const rCustNumberCol = findColIdx(rh, routingCustomerNumberCol || "");
      const rAddressCol    = findColIdx(rh, routingAddressCol);
      if (rAwbCol     === -1) return res.status(400).json({ message: `Column "${routingAwbCol}" not found in routing file` });
      if (rAddressCol === -1) return res.status(400).json({ message: `Column "${routingAddressCol}" not found in routing file` });

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

        for (const entry of addressEntries) {
          if (entry.address && keywordMatch(entry.address, fullAddress)) {
            routeName   = entry.routeName;
            matchMethod = "address";
            break;
          }
        }

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

      const masterEntries = addressEntries.map((e) => ({ routeName: e.routeName, address: e.address, pincode: "" }));

      const job = await RoutingJob.create({
        createdBy: req.user.id,
        masterMapping: {
          routeNameColumn: customer.routingMaster?.addressMapping?.routeNameColumn || "",
          addressColumn:   customer.routingMaster?.addressMapping?.addressColumn || "",
          pincodeColumn:   customer.routingMaster?.pincodeMapping?.pincodeColumn || "",
        },
        routingMapping: {
          awbColumn:            routingAwbCol,
          customerNameColumn:   routingCustomerNameCol   || "",
          customerNumberColumn: routingCustomerNumberCol || "",
          addressColumn:        routingAddressCol,
        },
        masterEntries,
        results,
        masterFileName:  `${customer.routingMaster?.addressFileName || ""} + ${customer.routingMaster?.pincodeFileName || ""}`,
        routingFileName: routingFile.originalname,
        totalRows:       results.length,
        matchedCount,
        unmatchedCount,
      });

      res.json({
        jobId: job._id,
        totalRows: results.length,
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