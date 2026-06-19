const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const ShipmentBatch = require("../models/ShipmentBatch");
const Customer = require("../models/Customer");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();

// Support multiple file uploads (up to 20 files)
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// HELPER: reads an Excel buffer → { headers, headerRowIndex, rows }
// Scans ALL sheets, picks the sheet+row with the MOST non-empty cells.
// ---------------------------------------------------------------------------
function readExcelHeaders(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  let bestHeaders = [];
  let bestHeaderRowIndex = -1;
  let bestRows = [];
  let bestMaxNonEmpty = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i];
      const nonEmpty = row.filter((cell) => String(cell || "").trim().length > 0);
      if (nonEmpty.length > bestMaxNonEmpty) {
        bestMaxNonEmpty = nonEmpty.length;
        bestHeaderRowIndex = i;
        bestHeaders = row.map((cell) => String(cell || "").trim()).filter(Boolean);
        bestRows = rows;
      }
    }
  }

  return { headers: bestHeaders, headerRowIndex: bestHeaderRowIndex, rows: bestRows };
}

// ---------------------------------------------------------------------------
// HELPER: parse entries from a single file buffer for a given customer
// ---------------------------------------------------------------------------
function parseEntriesFromBuffer(buffer, customer) {
  const { headers, headerRowIndex, rows } = readExcelHeaders(buffer);

  const trackingIdCol = headers.indexOf(customer.loaderMapping.trackingIdColumn);
  if (trackingIdCol === -1)
    throw new Error(`Column "${customer.loaderMapping.trackingIdColumn}" not found in file.`);

  // Extract metadata from rows above the header
  const meta = { tripSheetId: "", vehicle: "", date: "", route: "" };
  for (let i = 0; i < headerRowIndex; i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || "").trim().toLowerCase();
      const nextCell = String(row[j + 1] || "").trim();
      if (cell.includes("trip sheet") && nextCell) meta.tripSheetId = nextCell;
      if (cell.includes("vehicle") && nextCell) meta.vehicle = nextCell;
      if (cell.includes("date") && nextCell) meta.date = nextCell;
      if (cell.includes("route") && nextCell) meta.route = nextCell;
    }
  }

  const entries = [];

  if (customer.extractionMode === "route-lookup") {
    const routeIdCol = headers.indexOf(customer.loaderMapping.routeIdColumn);
    if (routeIdCol === -1)
      throw new Error(`Column "${customer.loaderMapping.routeIdColumn}" not found in file.`);

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const trackingId = String(row[trackingIdCol] || "").trim().toUpperCase();
      const routeId = String(row[routeIdCol] || "").trim().toUpperCase();
      if (trackingId && routeId) entries.push({ trackingId, routeId, routeName: "" });
    }
  } else {
    const routeNameCol = headers.indexOf(customer.loaderMapping.routeNameColumn);
    if (routeNameCol === -1)
      throw new Error(`Column "${customer.loaderMapping.routeNameColumn}" not found in file.`);

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const trackingId = String(row[trackingIdCol] || "").trim().toUpperCase();
      const routeName = String(row[routeNameCol] || "").trim();
      if (trackingId && routeName) entries.push({ trackingId, routeId: "", routeName });
    }
  }

  return { entries, meta };
}

// ---------------------------------------------------------------------------
// GET /api/scanner/customers
// ---------------------------------------------------------------------------
router.get("/customers", protect, requireRole("admin", "loader"), async (req, res) => {
  try {
    const customers = await Customer.find().sort({ displayName: 1 });

    const result = customers.map((c) => {
      const hasMapping = !!(
        c.loaderMapping?.trackingIdColumn &&
        (c.loaderMapping?.routeIdColumn || c.loaderMapping?.routeNameColumn)
      );

      const readyForUpload =
        c.extractionMode === "direct"
          ? hasMapping
          : hasMapping && c.masterData?.entries?.length > 0;

      return {
        id: c._id,
        name: c.name,
        displayName: c.displayName,
        extractionMode: c.extractionMode,
        hasMasterData: c.masterData?.entries?.length > 0,
        hasLoaderMapping: hasMapping,
        readyForUpload,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching customers" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scanner/upload
// Single file upload — replaces existing batch for this customer.
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  protect,
  requireRole("admin", "loader"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "No file uploaded" });

      const { customerId } = req.body;
      if (!customerId)
        return res.status(400).json({ message: "customerId is required" });

      const customer = await Customer.findById(customerId);
      if (!customer)
        return res.status(404).json({ message: "Customer not found" });

      if (!customer.extractionMode)
        return res.status(400).json({ message: `No extraction mode configured for "${customer.displayName}".` });

      if (!customer.loaderMapping?.trackingIdColumn)
        return res.status(400).json({ message: `No Excel format configured for "${customer.displayName}".` });

      let entries, meta;
      try {
        ({ entries, meta } = parseEntriesFromBuffer(req.file.buffer, customer));
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }

      if (entries.length === 0)
        return res.status(400).json({ message: "No valid rows found in this file" });

      // Deactivate previous batches, create fresh one
      await ShipmentBatch.updateMany({ customer: customerId }, { active: false });
      const batch = await ShipmentBatch.create({
        customer: customerId,
        extractionMode: customer.extractionMode,
        entries,
        uploadedBy: req.user.id,
        fileName: req.file.originalname,
        fileNames: [req.file.originalname],
        meta,
        active: true,
      });

      res.json({
        message: `Shipment data for "${customer.displayName}" uploaded successfully`,
        count: entries.length,
        meta: batch.meta,
        fileName: batch.fileName,
        customerName: customer.displayName,
        extractionMode: customer.extractionMode,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error while processing shipment file" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/scanner/upload-multiple
// Multiple file upload — merges all files into one batch (deduped by trackingId).
// ---------------------------------------------------------------------------
router.post(
  "/upload-multiple",
  protect,
  requireRole("admin", "loader"),
  upload.array("files", 20),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0)
        return res.status(400).json({ message: "No files uploaded" });

      const { customerId } = req.body;
      if (!customerId)
        return res.status(400).json({ message: "customerId is required" });

      const customer = await Customer.findById(customerId);
      if (!customer)
        return res.status(404).json({ message: "Customer not found" });

      if (!customer.extractionMode)
        return res.status(400).json({ message: `No extraction mode configured for "${customer.displayName}".` });

      if (!customer.loaderMapping?.trackingIdColumn)
        return res.status(400).json({ message: `No Excel format configured for "${customer.displayName}".` });

      // Parse all files and merge entries (deduplicated by trackingId, last file wins)
      const mergedMap = new Map(); // trackingId → entry
      let combinedMeta = { tripSheetId: "", vehicle: "", date: "", route: "" };
      const fileNames = [];
      const errors = [];

      for (const file of req.files) {
        try {
          const { entries, meta } = parseEntriesFromBuffer(file.buffer, customer);
          fileNames.push(file.originalname);
          // Use meta from first file that has it
          if (!combinedMeta.date && meta.date) combinedMeta = { ...combinedMeta, ...meta };
          for (const entry of entries) {
            mergedMap.set(entry.trackingId, entry);
          }
        } catch (err) {
          errors.push(`${file.originalname}: ${err.message}`);
        }
      }

      if (mergedMap.size === 0) {
        return res.status(400).json({
          message: "No valid rows found across all uploaded files.",
          errors,
        });
      }

      const allEntries = Array.from(mergedMap.values());

      // Deactivate previous batches, create merged batch
      await ShipmentBatch.updateMany({ customer: customerId }, { active: false });
      const batch = await ShipmentBatch.create({
        customer: customerId,
        extractionMode: customer.extractionMode,
        entries: allEntries,
        uploadedBy: req.user.id,
        fileName: fileNames.join(", "),
        fileNames,
        meta: combinedMeta,
        active: true,
      });

      res.json({
        message: `Merged ${fileNames.length} file(s) for "${customer.displayName}" — ${allEntries.length} unique shipments loaded.`,
        count: allEntries.length,
        filesUploaded: fileNames.length,
        fileNames,
        meta: batch.meta,
        customerName: customer.displayName,
        extractionMode: customer.extractionMode,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error while processing shipment files" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/scanner/current-batch
// ---------------------------------------------------------------------------
router.get("/current-batch", protect, requireRole("admin", "loader"), async (req, res) => {
  try {
    const { customerId } = req.query;

    if (customerId) {
      const customer = await Customer.findById(customerId);
      if (!customer)
        return res.status(404).json({ message: "Customer not found" });

      const batch = await ShipmentBatch.findOne({ customer: customerId, active: true }).sort({ createdAt: -1 });

      if (!batch)
        return res.json({ exists: false, customerName: customer.displayName });

      return res.json({
        exists: true,
        customerName: customer.displayName,
        extractionMode: batch.extractionMode,
        meta: batch.meta,
        count: batch.entries.length,
        fileName: batch.fileName,
        fileNames: batch.fileNames || [batch.fileName],
        uploadedAt: batch.createdAt,
      });
    }

    const batches = await ShipmentBatch.find({ active: true })
      .populate("customer", "name displayName")
      .sort({ createdAt: -1 });

    res.json(batches.map((b) => ({
      exists: true,
      customerId: b.customer._id,
      customerName: b.customer.displayName,
      extractionMode: b.extractionMode,
      meta: b.meta,
      count: b.entries.length,
      fileName: b.fileName,
      fileNames: b.fileNames || [b.fileName],
      uploadedAt: b.createdAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching current batch" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scanner/scan
// ---------------------------------------------------------------------------
router.post("/scan", protect, requireRole("admin", "loader"), async (req, res) => {
  try {
    const { trackingId, customerId } = req.body;
    if (!trackingId)
      return res.status(400).json({ message: "trackingId is required" });

    const cleanId = String(trackingId).trim().toUpperCase();

    if (customerId) {
      const customer = await Customer.findById(customerId);
      if (!customer)
        return res.status(404).json({ message: "Customer not found" });

      const batch = await ShipmentBatch.findOne({ customer: customerId, active: true }).sort({ createdAt: -1 });
      if (!batch)
        return res.status(404).json({
          valid: false,
          message: `No daily shipment data uploaded yet for "${customer.displayName}". Please upload today's Excel first.`,
        });

      const entry = batch.entries.find((e) => e.trackingId === cleanId);
      if (!entry)
        return res.json({
          valid: false,
          message: "Invalid Package",
          reason: "Tracking ID not found in today's data",
          customerName: customer.displayName,
        });

      if (customer.extractionMode === "direct") {
        return res.json({
          valid: true,
          customerName: customer.displayName,
          trackingId: entry.trackingId,
          routeId: "",
          routeName: entry.routeName,
          meta: batch.meta,
          extractionMode: "direct",
        });
      }

      if (!customer.masterData?.entries?.length)
        return res.status(404).json({
          valid: false,
          message: `No master data uploaded yet for "${customer.displayName}". Please contact admin.`,
        });

      const masterEntry = customer.masterData.entries.find((e) => e.routeId === entry.routeId);
      if (!masterEntry)
        return res.json({
          valid: false,
          message: "Invalid Package",
          reason: "Route ID not found in master data",
          customerName: customer.displayName,
          trackingId: entry.trackingId,
          routeId: entry.routeId,
        });

      return res.json({
        valid: true,
        customerName: customer.displayName,
        trackingId: entry.trackingId,
        routeId: entry.routeId,
        routeName: masterEntry.routeName,
        meta: batch.meta,
        extractionMode: "route-lookup",
      });
    }

    // Search across all active batches
    const activeBatches = await ShipmentBatch.find({ active: true }).populate("customer");
    if (activeBatches.length === 0)
      return res.status(404).json({ valid: false, message: "No daily shipment data uploaded for any customer yet." });

    for (const batch of activeBatches) {
      const entry = batch.entries.find((e) => e.trackingId === cleanId);
      if (!entry) continue;

      const customer = batch.customer;

      if (customer.extractionMode === "direct") {
        return res.json({
          valid: true,
          customerName: customer.displayName,
          trackingId: entry.trackingId,
          routeId: "",
          routeName: entry.routeName,
          meta: batch.meta,
          extractionMode: "direct",
        });
      }

      if (!customer.masterData?.entries?.length) continue;

      const masterEntry = customer.masterData.entries.find((e) => e.routeId === entry.routeId);
      if (!masterEntry)
        return res.json({
          valid: false,
          message: "Invalid Package",
          reason: "Route ID not found in master data",
          customerName: customer.displayName,
          trackingId: entry.trackingId,
          routeId: entry.routeId,
        });

      return res.json({
        valid: true,
        customerName: customer.displayName,
        trackingId: entry.trackingId,
        routeId: entry.routeId,
        routeName: masterEntry.routeName,
        meta: batch.meta,
        extractionMode: "route-lookup",
      });
    }

    return res.json({
      valid: false,
      message: "Invalid Package",
      reason: "Tracking ID not found in today's data for any customer",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during scan" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scanner/history-download
// ---------------------------------------------------------------------------
router.post("/history-download", protect, requireRole("admin", "loader"), async (req, res) => {
  try {
    const { customerId, history } = req.body;

    if (!history || !Array.isArray(history) || history.length === 0)
      return res.status(400).json({ message: "No scan history to export" });

    const customer = customerId ? await Customer.findById(customerId) : null;
    const customerName = customer?.displayName || "Unknown";

    const rows = history.map((item) => ({
      "Timestamp":   item.timestamp,
      "Tracking ID": item.trackingId,
      "Route ID":    item.routeId || "",
      "Route Name":  item.valid ? item.routeName : "",
      "Status":      item.valid ? "Valid" : "Invalid",
      "Remarks":     item.valid ? "" : (item.message || "Invalid Package"),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 28 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Scan History");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `ScanHistory_${customerName}_${date}.xlsx`.replace(/\s+/g, "_");

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating history file" });
  }
});

module.exports = router;