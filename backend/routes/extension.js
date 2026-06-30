const express = require("express");
const multer  = require("multer");
const XLSX    = require("xlsx");
const ExtensionLookup = require("../models/ExtensionLookup");
const Customer         = require("../models/Customer");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// HELPER: reads an Excel buffer → { headers, headerRowIndex, rows }
// (same logic as routing.js, kept local to avoid cross-file coupling)
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

// ---------------------------------------------------------------------------
// POST /api/extension/preview-columns
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
// CUSTOMER LOOKUP DATA — persistent, reusable across sessions
// ===========================================================================

// GET /api/extension/customers — list customers with extension-lookup readiness info
router.get("/customers", protect, requireRole("admin"), async (req, res) => {
  try {
    const customers = await Customer.find().sort({ displayName: 1 });
    const lookups = await ExtensionLookup.find().select("customer entries fileName uploadedAt");
    const lookupMap = new Map(lookups.map((l) => [String(l.customer), l]));

    const result = customers.map((c) => {
      const lookup = lookupMap.get(String(c._id));
      return {
        id: c._id,
        name: c.name,
        displayName: c.displayName,
        hasLookupData: (lookup?.entries?.length || 0) > 0,
        fileName: lookup?.fileName || null,
        count: lookup?.entries?.length || 0,
        uploadedAt: lookup?.uploadedAt || null,
      };
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching customers" });
  }
});

// GET /api/extension/customers/:customerId/lookup — fetch saved lookup data status
router.get("/customers/:customerId/lookup", protect, requireRole("admin"), async (req, res) => {
  try {
    const lookup = await ExtensionLookup.findOne({ customer: req.params.customerId });
    if (!lookup) {
      return res.json({
        hasLookupData: false,
        fileName: null,
        count: 0,
        mapping: null,
        uploadedAt: null,
      });
    }
    res.json({
      hasLookupData: (lookup.entries?.length || 0) > 0,
      fileName: lookup.fileName || null,
      count: lookup.entries?.length || 0,
      mapping: lookup.mapping || null,
      uploadedAt: lookup.uploadedAt || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching lookup data" });
  }
});

// POST /api/extension/customers/:customerId/lookup — save/replace lookup file
router.post(
  "/customers/:customerId/lookup",
  protect,
  requireRole("admin"),
  upload.single("file"),
  async (req, res) => {
    try {
      const customer = await Customer.findById(req.params.customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const { storeCodeColumn, routeNameColumn } = req.body;
      if (!storeCodeColumn || !routeNameColumn)
        return res.status(400).json({ message: "storeCodeColumn and routeNameColumn are required" });

      const { headers, headerRowIndex, rows } = readExcelHeaders(req.file.buffer);
      const storeCodeCol = findColIdx(headers, storeCodeColumn);
      const routeNameCol = findColIdx(headers, routeNameColumn);
      if (storeCodeCol === -1) return res.status(400).json({ message: `Column "${storeCodeColumn}" not found` });
      if (routeNameCol === -1) return res.status(400).json({ message: `Column "${routeNameColumn}" not found` });

      const entries = [];
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row       = rows[i];
        const storeCode = String(row[storeCodeCol] || "").trim();
        const routeName = String(row[routeNameCol] || "").trim();
        if (storeCode && routeName) entries.push({ storeCode, routeName });
      }
      if (entries.length === 0)
        return res.status(400).json({ message: "No valid rows found in this file" });

      const update = {
        customer: customer._id,
        entries,
        mapping: { storeCodeColumn, routeNameColumn },
        fileName: req.file.originalname,
        uploadedBy: req.user.id,
        uploadedAt: new Date(),
      };

      await ExtensionLookup.findOneAndUpdate(
        { customer: customer._id },
        update,
        { upsert: true, new: true }
      );

      res.json({
        message: `Extension lookup data saved for "${customer.displayName}"`,
        count: entries.length,
        fileName: req.file.originalname,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error saving lookup data" });
    }
  }
);

// DELETE /api/extension/customers/:customerId/lookup — clear lookup data
router.delete("/customers/:customerId/lookup", protect, requireRole("admin"), async (req, res) => {
  try {
    await ExtensionLookup.findOneAndDelete({ customer: req.params.customerId });
    res.json({ message: "Lookup data cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error clearing lookup data" });
  }
});

module.exports = router;
