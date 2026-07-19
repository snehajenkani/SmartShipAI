const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const ShipmentBatch = require("../models/ShipmentBatch");
const Customer = require("../models/Customer");
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
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i];
      const nonEmpty = row.filter((cell) => String(cell || "").trim().length > 0);
      if (nonEmpty.length > bestMaxNonEmpty) {
        bestMaxNonEmpty = nonEmpty.length;
        bestHeaderRowIndex = i;
        bestHeaders = row.map((cell) => String(cell || "").trim());
        bestRows = rows;
      }
    }
  }
  return { headers: bestHeaders, headerRowIndex: bestHeaderRowIndex, rows: bestRows };
}

// ---------------------------------------------------------------------------
// HELPER: find column index by exact case-insensitive match
// ---------------------------------------------------------------------------
function findColIdx(headers, colName) {
  if (!colName) return -1;
  const needle = String(colName).trim().toLowerCase();
  return headers.findIndex((h) => String(h).trim().toLowerCase() === needle);
}

// ---------------------------------------------------------------------------
// HELPERS: Color Master matching (Branch/Area keyword match, then Pincode fallback)
// Mirrors the address/pincode matching logic used in routing.js
// ---------------------------------------------------------------------------
function normalizeAddr(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordMatch(keyword, fullAddress) {
  const kw = normalizeAddr(keyword);
  const addr = normalizeAddr(fullAddress);
  if (!kw || !addr) return false;
  return addr.includes(kw);
}

function extractPincode(address) {
  const match = String(address || "").match(/\b(\d{6})\b/);
  return match ? match[1] : "";
}

// ---------------------------------------------------------------------------
// HELPER: resolveColor — decides what background color a scan result should use
// Priority: 1) per-row color from the daily Excel (entry.color) — most specific
//           2) Color Master: Branch/Area keyword match against the entry's address
//           3) Color Master: Pincode fallback match
//           4) "" (no color)
// ---------------------------------------------------------------------------
function resolveColor(entry, customer) {
  if (entry.color) return entry.color;

  const colorEntries = customer?.colorMaster?.entries || [];
  if (colorEntries.length === 0) return "";

  const fullAddress = entry.address || "";

  // Branch/Area keyword match first
  for (const ce of colorEntries) {
    if (ce.branch && keywordMatch(ce.branch, fullAddress)) return ce.colour;
    if (ce.area && keywordMatch(ce.area, fullAddress)) return ce.colour;
  }

  // Pincode fallback
  const pincode = extractPincode(fullAddress);
  if (pincode) {
    const pincodeMatch = colorEntries.find((ce) => ce.pincode && ce.pincode === pincode);
    if (pincodeMatch) return pincodeMatch.colour;
  }

  return "";
}

// ---------------------------------------------------------------------------
// HELPER: parse entries from a file buffer for a given customer
// ---------------------------------------------------------------------------
function parseEntriesFromBuffer(buffer, customer) {
  const { headers, headerRowIndex, rows } = readExcelHeaders(buffer);
  const trackingIdCol = findColIdx(headers, customer.loaderMapping.trackingIdColumn);
  if (trackingIdCol === -1)
    throw new Error(`Column "${customer.loaderMapping.trackingIdColumn}" not found in file.`);

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
  const addressColIdx = findColIdx(headers, customer.loaderMapping?.addressColumn);
  const customerNameColIdx = findColIdx(headers, customer.loaderMapping?.customerNameColumn);
  const customerNumberColIdx = findColIdx(headers, customer.loaderMapping?.customerNumberColumn);
  const colorColIdx = findColIdx(headers, customer.loaderMapping?.colorColumn);
  const noOfPacksColIdx = findColIdx(headers, customer.loaderMapping?.noOfPacksColumn);

  // Parses the "No. of Packs" cell to a positive integer, defaulting to 1
  // whenever the column isn't mapped or the cell is blank/invalid.
  const parseNoOfPacks = (row) => {
    if (noOfPacksColIdx === -1) return 1;
    const raw = String(row[noOfPacksColIdx] || "").trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  if (customer.extractionMode === "route-lookup") {
    const routeIdCol = findColIdx(headers, customer.loaderMapping.routeIdColumn);
    if (routeIdCol === -1)
      throw new Error(`Column "${customer.loaderMapping.routeIdColumn}" not found in file.`);
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const trackingId = String(row[trackingIdCol] || "").trim().toUpperCase();
      const routeId = String(row[routeIdCol] || "").trim().toUpperCase();
      const address = addressColIdx !== -1 ? String(row[addressColIdx] || "").trim() : "";
      const customerName = customerNameColIdx !== -1 ? String(row[customerNameColIdx] || "").trim() : "";
      const customerNumber = customerNumberColIdx !== -1 ? String(row[customerNumberColIdx] || "").trim() : "";
      const color = colorColIdx !== -1 ? String(row[colorColIdx] || "").trim() : "";
      const noOfPacks = parseNoOfPacks(row);
      if (trackingId && routeId) entries.push({ trackingId, routeId, routeName: "", address, customerName, customerNumber, color, noOfPacks, scanCount: 0 });
    }
  } else {
    const routeNameCol = findColIdx(headers, customer.loaderMapping.routeNameColumn);
    if (routeNameCol === -1)
      throw new Error(`Column "${customer.loaderMapping.routeNameColumn}" not found in file.`);
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const trackingId = String(row[trackingIdCol] || "").trim().toUpperCase();
      const routeName = String(row[routeNameCol] || "").trim();
      const address = addressColIdx !== -1 ? String(row[addressColIdx] || "").trim() : "";
      const customerName = customerNameColIdx !== -1 ? String(row[customerNameColIdx] || "").trim() : "";
      const customerNumber = customerNumberColIdx !== -1 ? String(row[customerNumberColIdx] || "").trim() : "";
      const color = colorColIdx !== -1 ? String(row[colorColIdx] || "").trim() : "";
      const noOfPacks = parseNoOfPacks(row);
      if (trackingId && routeName) entries.push({ trackingId, routeId: "", routeName, address, customerName, customerNumber, color, noOfPacks, scanCount: 0 });
    }
  }

  return { entries, meta };
}

// ---------------------------------------------------------------------------
// HELPER: registerScan — increments an entry's scanCount and figures out
// whether this scan is a duplicate ("Already Scanned") or, for multi-pack
// tracking IDs, how far through the packs this tracking ID is.
// Mutates `entry` in place; caller is responsible for markModified + save.
// ---------------------------------------------------------------------------
function registerScan(entry) {
  const noOfPacks = entry.noOfPacks && entry.noOfPacks > 0 ? entry.noOfPacks : 1;
  const previousCount = entry.scanCount || 0;

  // Once scanCount reaches noOfPacks, the tracking ID is fully scanned —
  // any further scan is a duplicate and must NOT push the count past
  // noOfPacks (no "3/2"). It's flagged alreadyScanned instead, whether
  // there's 1 pack or several.
  const alreadyScanned = previousCount >= noOfPacks;

  if (!alreadyScanned) {
    entry.scanCount = previousCount + 1;
  }
  // else: leave entry.scanCount untouched — stays capped at noOfPacks

  const packsComplete = entry.scanCount >= noOfPacks;

  return {
    noOfPacks,
    scanCount: entry.scanCount,
    alreadyScanned,
    packsComplete,
  };
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
        customerNumber: c.customerNumber || "",
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
// POST /api/scanner/upload  — ADMIN ONLY (single file, one customer)
// Supports optional per-file column overrides: trackingIdColumn, routeIdColumn,
// routeNameColumn, addressColumn passed in req.body
// ---------------------------------------------------------------------------
router.post("/upload", protect, requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const { customerId, trackingIdColumn, routeIdColumn, routeNameColumn, addressColumn, customerNameColumn, customerNumberColumn, colorColumn, noOfPacksColumn } = req.body;
    if (!customerId) return res.status(400).json({ message: "customerId is required" });

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    if (!customer.extractionMode)
      return res.status(400).json({ message: `No extraction mode configured for "${customer.displayName}".` });
    if (!customer.loaderMapping?.trackingIdColumn)
      return res.status(400).json({ message: `No Excel format configured for "${customer.displayName}".` });

    // Build a merged mapping: saved mapping + any per-file overrides
    const effectiveCustomer = {
      ...customer.toObject(),
      loaderMapping: {
        ...customer.loaderMapping,
        ...(trackingIdColumn && { trackingIdColumn }),
        ...(routeIdColumn    && { routeIdColumn }),
        ...(routeNameColumn  && { routeNameColumn }),
        ...(addressColumn    && { addressColumn }),
        ...(customerNameColumn   && { customerNameColumn }),
        ...(customerNumberColumn && { customerNumberColumn }),
        ...(colorColumn          && { colorColumn }),
        ...(noOfPacksColumn      && { noOfPacksColumn }),
      },
    };

    let entries, meta;
    try { ({ entries, meta } = parseEntriesFromBuffer(req.file.buffer, effectiveCustomer)); }
    catch (err) { return res.status(400).json({ message: err.message }); }

    if (entries.length === 0)
      return res.status(400).json({ message: "No valid rows found in this file" });

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
});

// ---------------------------------------------------------------------------
// POST /api/scanner/upload-multiple  — ADMIN ONLY (multiple files, one customer)
// Supports per-file column overrides via JSON field "fileMappings":
// [{ trackingIdColumn, routeIdColumn, routeNameColumn, addressColumn }, ...]
// parallel array matching files[]
// ---------------------------------------------------------------------------
router.post("/upload-multiple", protect, requireRole("admin"), upload.array("files", 20), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) return res.status(400).json({ message: "No files uploaded" });

    const { customerId, fileMappings: fileMappingsRaw } = req.body;
    if (!customerId) return res.status(400).json({ message: "customerId is required" });

    // Parse per-file mappings if provided
    let fileMappings = [];
    try { fileMappings = fileMappingsRaw ? JSON.parse(fileMappingsRaw) : []; } catch { fileMappings = []; }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    if (!customer.extractionMode)
      return res.status(400).json({ message: `No extraction mode configured for "${customer.displayName}".` });
    if (!customer.loaderMapping?.trackingIdColumn)
      return res.status(400).json({ message: `No Excel format configured for "${customer.displayName}".` });

    let allEntries = [];
    let combinedMeta = { tripSheetId: "", vehicle: "", date: "", route: "" };
    const fileNames = [];

    for (let i = 0; i < files.length; i++) {
      const file    = files[i];
      const mapping = fileMappings[i] || {};
      const effectiveCustomer = {
        ...customer.toObject(),
        loaderMapping: {
          ...customer.loaderMapping,
          ...(mapping.trackingIdColumn && { trackingIdColumn: mapping.trackingIdColumn }),
          ...(mapping.routeIdColumn    && { routeIdColumn:    mapping.routeIdColumn }),
          ...(mapping.routeNameColumn  && { routeNameColumn:  mapping.routeNameColumn }),
          ...(mapping.addressColumn    && { addressColumn:    mapping.addressColumn }),
          ...(mapping.customerNameColumn   && { customerNameColumn:   mapping.customerNameColumn }),
          ...(mapping.customerNumberColumn && { customerNumberColumn: mapping.customerNumberColumn }),
          ...(mapping.colorColumn          && { colorColumn:          mapping.colorColumn }),
          ...(mapping.noOfPacksColumn      && { noOfPacksColumn:      mapping.noOfPacksColumn }),
        },
      };

      let parsed;
      try { parsed = parseEntriesFromBuffer(file.buffer, effectiveCustomer); }
      catch (err) { return res.status(400).json({ message: `Error in file "${file.originalname}": ${err.message}` }); }
      allEntries = allEntries.concat(parsed.entries);
      fileNames.push(file.originalname);
      if (!combinedMeta.date && parsed.meta.date) combinedMeta = parsed.meta;
    }

    const seen = new Map();
    for (const entry of allEntries) seen.set(entry.trackingId, entry);
    const entries = Array.from(seen.values());

    if (entries.length === 0)
      return res.status(400).json({ message: "No valid rows found across all files" });

    await ShipmentBatch.updateMany({ customer: customerId }, { active: false });
    const batch = await ShipmentBatch.create({
      customer: customerId,
      extractionMode: customer.extractionMode,
      entries,
      uploadedBy: req.user.id,
      fileName: fileNames[0],
      fileNames,
      meta: combinedMeta,
      active: true,
    });

    res.json({
      message: `${files.length} file(s) merged and uploaded for "${customer.displayName}"`,
      count: entries.length,
      fileCount: files.length,
      fileNames,
      meta: batch.meta,
      customerName: customer.displayName,
      extractionMode: customer.extractionMode,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while processing shipment files" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scanner/upload-undelivered  — ADMIN ONLY
// Accepts a single undelivered Excel file with trackingId + reason columns.
// Merges into the current active batch as isUndelivered=true entries.
// Body fields: customerId, trackingIdColumn, reasonColumn
// ---------------------------------------------------------------------------
router.post("/upload-undelivered", protect, requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const { customerId, trackingIdColumn, reasonColumn } = req.body;
    if (!customerId)        return res.status(400).json({ message: "customerId is required" });
    if (!trackingIdColumn)  return res.status(400).json({ message: "trackingIdColumn is required" });

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    // Find the current active batch for this customer
    let batch = await ShipmentBatch.findOne({ customer: customerId, active: true }).sort({ createdAt: -1 });
    if (!batch) return res.status(404).json({ message: `No active shipment batch found for "${customer.displayName}". Upload daily data first.` });

    // Parse the undelivered file
    const { headers, headerRowIndex, rows } = readExcelHeaders(req.file.buffer);
    const tidColIdx    = findColIdx(headers, trackingIdColumn);
    const reasonColIdx = reasonColumn ? findColIdx(headers, reasonColumn) : -1;

    if (tidColIdx === -1)
      return res.status(400).json({ message: `Column "${trackingIdColumn}" not found in file` });

    const newEntries = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row        = rows[i];
      const trackingId = String(row[tidColIdx] || "").trim().toUpperCase();
      const reason     = reasonColIdx !== -1 ? String(row[reasonColIdx] || "").trim() : "Undelivered";
      if (!trackingId) continue;

      // If already in batch, update it; otherwise add new entry
      const existing = batch.entries.find((e) => e.trackingId === trackingId);
      if (existing) {
        existing.isUndelivered     = true;
        existing.undeliveredReason = reason || "Undelivered";
      } else {
        newEntries.push({
          trackingId,
          routeId:           "",
          routeName:         "",
          address:           "",
          isUndelivered:     true,
          undeliveredReason: reason || "Undelivered",
        });
      }
    }

    // Add new entries that weren't already in batch
    batch.entries.push(...newEntries);
    batch.markModified("entries");
    await batch.save();

    const totalUndelivered = batch.entries.filter((e) => e.isUndelivered).length;

    res.json({
      message: `Undelivered data merged for "${customer.displayName}"`,
      newEntries:      newEntries.length,
      updatedEntries:  (batch.entries.length - newEntries.length),
      totalUndelivered,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while processing undelivered file" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scanner/vehicle-upload  — ADMIN ONLY
// Upload one file per customer (multi-customer vehicle setup), merge into
// separate per-customer batches, all activated together.
// Body (multipart): files[], customerIds[] (parallel arrays)
// ---------------------------------------------------------------------------
router.post("/vehicle-upload", protect, requireRole("admin"), upload.array("files", 20), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0)
      return res.status(400).json({ message: "No files uploaded" });

    // customerIds can come as a JSON string or repeated field
    let customerIds = req.body.customerIds;
    if (typeof customerIds === "string") {
      try { customerIds = JSON.parse(customerIds); } catch { customerIds = [customerIds]; }
    }
    if (!Array.isArray(customerIds)) customerIds = [customerIds];

    if (files.length !== customerIds.length)
      return res.status(400).json({ message: "Number of files must match number of customer IDs" });

    const results = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const customerId = customerIds[i];

      try {
        const customer = await Customer.findById(customerId);
        if (!customer) { errors.push(`Customer ${customerId} not found`); continue; }
        if (!customer.extractionMode) { errors.push(`No extraction mode for "${customer.displayName}"`); continue; }
        if (!customer.loaderMapping?.trackingIdColumn) { errors.push(`No Excel format for "${customer.displayName}"`); continue; }

        let entries, meta;
        try { ({ entries, meta } = parseEntriesFromBuffer(file.buffer, customer)); }
        catch (err) { errors.push(`"${customer.displayName}": ${err.message}`); continue; }

        if (entries.length === 0) { errors.push(`"${customer.displayName}": No valid rows found`); continue; }

        await ShipmentBatch.updateMany({ customer: customerId }, { active: false });
        await ShipmentBatch.create({
          customer: customerId,
          extractionMode: customer.extractionMode,
          entries,
          uploadedBy: req.user.id,
          fileName: file.originalname,
          fileNames: [file.originalname],
          meta,
          active: true,
        });

        results.push({ customerId, customerName: customer.displayName, count: entries.length });
      } catch (err) {
        errors.push(`Unexpected error for customer ${customerId}: ${err.message}`);
      }
    }

    if (results.length === 0)
      return res.status(400).json({ message: "All uploads failed", errors });

    const totalCount = results.reduce((sum, r) => sum + r.count, 0);
    res.json({
      message: `Vehicle setup complete — ${results.length} customer(s) activated`,
      totalCount,
      customers: results,
      errors,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during vehicle upload" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scanner/current-batch
// ---------------------------------------------------------------------------
router.get("/current-batch", protect, requireRole("admin", "loader"), async (req, res) => {
  try {
    const { customerId } = req.query;

    if (customerId) {
      const batch = await ShipmentBatch.findOne({ customer: customerId, active: true }).sort({ createdAt: -1 });
      if (!batch) return res.json({ exists: false });
      return res.json({
        exists: true,
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

    // Filter out batches whose customer document was deleted
    const validBatches = batches.filter((b) => b.customer != null);

    res.json(validBatches.map((b) => ({
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
    if (!trackingId) return res.status(400).json({ message: "trackingId is required" });
    const cleanId = String(trackingId).trim().toUpperCase();

    if (customerId) {
      const customer = await Customer.findById(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });

      const batch = await ShipmentBatch.findOne({ customer: customerId, active: true }).sort({ createdAt: -1 });
      if (!batch)
        return res.status(404).json({
          valid: false,
          message: `No shipment data loaded for "${customer.displayName}". Ask admin to upload today's Excel.`,
        });

      const entry = batch.entries.find((e) => e.trackingId === cleanId);
      if (!entry)
        return res.json({
          valid: false,
          message: "Invalid Package",
          customerName: customer.displayName,
        });

      // ── Undelivered check (single-customer mode) ──
      if (entry.isUndelivered) {
        return res.json({
          valid: true,
          isUndelivered: true,
          undeliveredReason: entry.undeliveredReason || "Undelivered",
          customerName: customer.displayName,
          recipientName: entry.customerName || "",
          recipientNumber: entry.customerNumber || "",
          trackingId: entry.trackingId,
          routeId: entry.routeId || "",
          routeName: entry.routeName || "",
          address: entry.address || "",
          meta: batch.meta,
          extractionMode: customer.extractionMode,
        });
      }

      // ── Scan progress (already-scanned / multi-pack counter) ──
      const scanProgress = registerScan(entry);
      batch.markModified("entries");
      await batch.save();

      if (customer.extractionMode === "direct") {
        return res.json({
          valid: true,
          isUndelivered: false,
          customerName: customer.displayName,
          recipientName: entry.customerName || "",
          recipientNumber: entry.customerNumber || "",
          trackingId: entry.trackingId,
          routeId: "",
          routeName: entry.routeName,
          address: entry.address || "",
          color: resolveColor(entry, customer),
          meta: batch.meta,
          extractionMode: "direct",
          ...scanProgress,
        });
      }

      if (!customer.masterData?.entries?.length)
        return res.status(404).json({
          valid: false,
          message: `No master data for "${customer.displayName}". Contact admin.`,
        });

      const masterEntry = customer.masterData.entries.find((e) => e.routeId === entry.routeId);
      if (!masterEntry)
        return res.json({
          valid: false,
          message: "Invalid Package",
          customerName: customer.displayName,
          trackingId: entry.trackingId,
          routeId: entry.routeId,
        });

      return res.json({
        valid: true,
        isUndelivered: false,
        customerName: customer.displayName,
        recipientName: entry.customerName || "",
        recipientNumber: entry.customerNumber || "",
        trackingId: entry.trackingId,
        routeId: entry.routeId,
        routeName: masterEntry.routeName,
        address: entry.address || "",
        color: resolveColor(entry, customer),
        meta: batch.meta,
        extractionMode: "route-lookup",
        ...scanProgress,
      });
    }

    // No customerId — search ALL active batches (multi-customer vehicle mode)
    const allActiveBatches = await ShipmentBatch.find({ active: true }).populate("customer");

    // Filter out orphaned batches (customer was deleted but batch remains)
    const activeBatches = allActiveBatches.filter((b) => b.customer != null);

    if (activeBatches.length === 0)
      return res.status(404).json({ valid: false, message: "No shipment data uploaded for any customer yet." });

    for (const batch of activeBatches) {
      const customer = batch.customer;
      const entry = batch.entries.find((e) => e.trackingId === cleanId);
      if (!entry) continue;

      // ── Undelivered check (multi-customer mode) ──
      if (entry.isUndelivered) {
        return res.json({
          valid: true,
          isUndelivered: true,
          undeliveredReason: entry.undeliveredReason || "Undelivered",
          customerName: customer.displayName,
          recipientName: entry.customerName || "",
          recipientNumber: entry.customerNumber || "",
          trackingId: entry.trackingId,
          routeId: entry.routeId || "",
          routeName: entry.routeName || "",
          address: entry.address || "",
          meta: batch.meta,
          extractionMode: customer.extractionMode,
        });
      }

      // ── Scan progress (already-scanned / multi-pack counter) ──
      const scanProgress = registerScan(entry);
      batch.markModified("entries");
      await batch.save();

      if (customer.extractionMode === "direct") {
        return res.json({
          valid: true,
          isUndelivered: false,
          customerName: customer.displayName,
          recipientName: entry.customerName || "",
          recipientNumber: entry.customerNumber || "",
          trackingId: entry.trackingId,
          routeId: "",
          routeName: entry.routeName,
          address: entry.address || "",
          color: resolveColor(entry, customer),
          meta: batch.meta,
          extractionMode: "direct",
          ...scanProgress,
        });
      }

      // route-lookup mode: need master data
      if (!customer.masterData?.entries?.length) {
        return res.json({
          valid: false,
          message: `No master data for "${customer.displayName}". Contact admin.`,
          customerName: customer.displayName,
        });
      }

      const masterEntry = customer.masterData.entries.find((e) => e.routeId === entry.routeId);
      if (!masterEntry)
        return res.json({
          valid: false,
          message: "Invalid Package",
          customerName: customer.displayName,
          trackingId: entry.trackingId,
          routeId: entry.routeId,
        });

      return res.json({
        valid: true,
        isUndelivered: false,
        customerName: customer.displayName,
        recipientName: entry.customerName || "",
        recipientNumber: entry.customerNumber || "",
        trackingId: entry.trackingId,
        routeId: entry.routeId,
        routeName: masterEntry.routeName,
        address: entry.address || "",
        color: resolveColor(entry, customer),
        meta: batch.meta,
        extractionMode: "route-lookup",
        ...scanProgress,
      });
    }

    return res.json({ valid: false, message: "Invalid Package" });
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
    const customerLabel = customer?.displayName || "AllCustomers";

    // Exclude undelivered entries from the downloaded Excel sheet
    const deliveredHistory = history.filter((item) => !item.isUndelivered);

    const rows = deliveredHistory.map((item) => ({
      "Timestamp":       item.timestamp,
      "Tracking ID":     item.trackingId,
      "Customer":        item.customerName || "",
      "Customer Name":   item.recipientName || "",
      "Customer Number": item.recipientNumber || "",
      "Route ID":        item.routeId || "",
      "Route Name":      item.valid ? item.routeName : "",
      "Address":         item.address || "",
      "Status":          item.valid ? "Valid" : "Invalid",
      "Remarks":         item.valid ? "" : (item.message || "Invalid Package"),
    }));

    if (rows.length === 0)
      return res.status(400).json({ message: "No deliverable scan history to export (all entries were undelivered)" });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 35 }, { wch: 10 }, { wch: 28 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Scan History");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const date = new Date().toISOString().slice(0, 10);
    const filename = `ScanHistory_${customerLabel}_${date}.xlsx`.replace(/\s+/g, "_");

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating history file" });
  }
});

module.exports = router;