const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const Customer = require("../models/Customer");
const { protect, requireRole } = require("../middleware/auth");

const router = express.Router();
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
        // IMPORTANT: keep index alignment with `rows` — do NOT filter out blanks
        bestHeaders = row.map((cell) => String(cell || "").trim());
        bestRows = rows;
      }
    }
  }

  return { headers: bestHeaders, headerRowIndex: bestHeaderRowIndex, rows: bestRows };
}

// ---------------------------------------------------------------------------
// HELPER: compute readyForUpload consistently
// ---------------------------------------------------------------------------
function computeReadyForUpload(customer) {
  const hasMapping = !!(
    customer.loaderMapping?.trackingIdColumn &&
    (customer.loaderMapping?.routeIdColumn || customer.loaderMapping?.routeNameColumn)
  );
  return customer.extractionMode === "direct"
    ? hasMapping
    : hasMapping && customer.masterData?.entries?.length > 0;
}

// ---------------------------------------------------------------------------
// CUSTOMERS — CRUD
// ---------------------------------------------------------------------------

router.get("/customers", protect, requireRole("admin"), async (req, res) => {
  try {
    const customers = await Customer.find().sort({ displayName: 1 });
    const result = customers.map((c) => {
      const hasMapping = !!(
        c.loaderMapping?.trackingIdColumn &&
        (c.loaderMapping?.routeIdColumn || c.loaderMapping?.routeNameColumn)
      );
      const readyForUpload = c.extractionMode === "direct"
        ? hasMapping
        : hasMapping && c.masterData?.entries?.length > 0;

      return {
        id: c._id,
        name: c.name,
        displayName: c.displayName,
        extractionMode: c.extractionMode,
        readyForUpload,
        hasMasterData: c.masterData?.entries?.length > 0,
        masterDataCount: c.masterData?.entries?.length || 0,
        masterDataFile: c.masterData?.fileName || null,
        masterDataUploadedAt: c.masterData?.uploadedAt || null,
        hasLoaderMapping: hasMapping,
        loaderMapping: c.loaderMapping?.trackingIdColumn ? {
          trackingIdColumn: c.loaderMapping.trackingIdColumn,
          routeIdColumn: c.loaderMapping.routeIdColumn,
          routeNameColumn: c.loaderMapping.routeNameColumn,
          addressColumn: c.loaderMapping.addressColumn || "",
          sampleFileName: c.loaderMapping.sampleFileName,
          setAt: c.loaderMapping.setAt,
        } : null,
        createdAt: c.createdAt,
      };
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching customers" });
  }
});

router.post("/customers", protect, requireRole("admin"), async (req, res) => {
  try {
    const { name, displayName } = req.body;
    if (!name || !displayName)
      return res.status(400).json({ message: "name and displayName are required" });

    const normalizedName = name.trim().toUpperCase();
    const exists = await Customer.findOne({ name: normalizedName });
    if (exists)
      return res.status(409).json({ message: `Customer "${normalizedName}" already exists` });

    const customer = await Customer.create({
      name: normalizedName,
      displayName: displayName.trim(),
      createdBy: req.user.id,
    });

    res.status(201).json({
      message: `Customer "${customer.displayName}" created successfully`,
      id: customer._id,
      name: customer.name,
      displayName: customer.displayName,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating customer" });
  }
});

router.patch("/customers/:customerId", protect, requireRole("admin"), async (req, res) => {
  try {
    const { displayName } = req.body;
    if (!displayName)
      return res.status(400).json({ message: "displayName is required" });

    const customer = await Customer.findById(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    customer.displayName = displayName.trim();
    await customer.save();
    res.json({ message: "Customer updated successfully", displayName: customer.displayName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating customer" });
  }
});

router.delete("/customers/:customerId", protect, requireRole("admin"), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });
    res.json({ message: `Customer "${customer.displayName}" deleted successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while deleting customer" });
  }
});

// ---------------------------------------------------------------------------
// EXTRACTION MODE
// ---------------------------------------------------------------------------

router.post("/customers/:customerId/extraction-mode", protect, requireRole("admin"), async (req, res) => {
  try {
    const { mode } = req.body;
    if (!["route-lookup", "direct"].includes(mode))
      return res.status(400).json({ message: "mode must be 'route-lookup' or 'direct'" });

    const customer = await Customer.findById(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    const modeChanged = customer.extractionMode !== mode;
    customer.extractionMode = mode;

    if (modeChanged) {
      customer.loaderMapping = {};
      if (mode === "direct") {
        customer.masterData = { entries: [], fileName: null, uploadedAt: null };
      }
    }

    await customer.save();
    res.json({
      message: `Extraction mode set to "${mode}"${modeChanged ? ". Previous mapping cleared — please re-configure." : ""}`,
      extractionMode: mode,
      modeChanged,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while setting extraction mode" });
  }
});

// ---------------------------------------------------------------------------
// COLUMN PREVIEW
// ---------------------------------------------------------------------------

router.post("/preview-columns", protect, requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    const { headers, headerRowIndex } = readExcelHeaders(req.file.buffer);

    if (headers.length === 0)
      return res.status(400).json({ message: "Could not detect a header row in this file." });

    res.json({ headers, headerRowIndex });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while reading file columns" });
  }
});

// ---------------------------------------------------------------------------
// MASTER DATA
// ---------------------------------------------------------------------------

router.post("/customers/:customerId/master-data", protect, requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    if (customer.extractionMode === "direct")
      return res.status(400).json({ message: `"${customer.displayName}" uses direct mode. Master data is not required.` });

    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    const { routeIdColumn, routeNameColumn } = req.body;
    if (!routeIdColumn || !routeNameColumn)
      return res.status(400).json({ message: "routeIdColumn and routeNameColumn are required" });

    const { headers, headerRowIndex, rows } = readExcelHeaders(req.file.buffer);
    const routeIdCol = headers.indexOf(routeIdColumn);
    const routeNameCol = headers.indexOf(routeNameColumn);

    if (routeIdCol === -1 || routeNameCol === -1)
      return res.status(400).json({ message: "Selected columns were not found in the uploaded file" });

    const entries = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const routeId = String(row[routeIdCol] || "").trim().toUpperCase();
      const routeName = String(row[routeNameCol] || "").trim();
      if (routeId && routeName) entries.push({ routeId, routeName });
    }

    if (entries.length === 0)
      return res.status(400).json({ message: "No valid data rows found using the selected columns" });

    customer.masterData = {
      entries,
      fileName: req.file.originalname,
      uploadedAt: new Date(),
      uploadedBy: req.user.id,
    };
    await customer.save();

    res.json({
      message: `Master data for "${customer.displayName}" uploaded successfully`,
      count: entries.length,
      fileName: req.file.originalname,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while processing master data file" });
  }
});

router.get("/customers/:customerId/master-data", protect, requireRole("admin"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    if (!customer.masterData?.entries?.length)
      return res.json({ exists: false, customerName: customer.displayName });

    res.json({
      exists: true,
      customerName: customer.displayName,
      count: customer.masterData.entries.length,
      fileName: customer.masterData.fileName,
      uploadedAt: customer.masterData.uploadedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching master data" });
  }
});

// ---------------------------------------------------------------------------
// MASTER DATA DOWNLOAD
// ---------------------------------------------------------------------------
router.get("/customers/:customerId/master-data/download", protect, requireRole("admin"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    if (!customer.masterData?.entries?.length)
      return res.status(404).json({ message: "No master data found for this customer" });

    const rows = customer.masterData.entries.map((e) => ({
      "Route ID":   e.routeId,
      "Route Name": e.routeName,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, ws, "Master Data");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const safeName = customer.displayName.replace(/\s+/g, "_");
    const filename = `MasterData_${safeName}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while generating master data download" });
  }
});

router.delete("/customers/:customerId/master-data", protect, requireRole("admin"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    customer.masterData = { entries: [], fileName: null, uploadedAt: null };
    await customer.save();
    res.json({ message: `Master data for "${customer.displayName}" has been cleared` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while clearing master data" });
  }
});

// ---------------------------------------------------------------------------
// LOADER EXCEL MAPPING
// ---------------------------------------------------------------------------

router.post("/customers/:customerId/loader-mapping", protect, requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    if (!customer.extractionMode)
      return res.status(400).json({ message: "Please set the extraction mode before configuring the loader format." });

    if (!req.file)
      return res.status(400).json({ message: "No sample file uploaded" });

    const { headers } = readExcelHeaders(req.file.buffer);
    const { trackingIdColumn, routeIdColumn, routeNameColumn, addressColumn } = req.body;

    if (!trackingIdColumn)
      return res.status(400).json({ message: "trackingIdColumn is required" });

    if (customer.extractionMode === "route-lookup") {
      if (!routeIdColumn)
        return res.status(400).json({ message: "routeIdColumn is required for route-lookup mode" });
      if (!headers.includes(trackingIdColumn) || !headers.includes(routeIdColumn))
        return res.status(400).json({ message: "Selected columns were not found in the sample file" });

      customer.loaderMapping = {
        trackingIdColumn,
        routeIdColumn,
        routeNameColumn: "",
        addressColumn: addressColumn || "",
        sampleFileName: req.file.originalname,
        setAt: new Date(),
      };
    } else {
      if (!routeNameColumn)
        return res.status(400).json({ message: "routeNameColumn is required for direct mode" });
      if (!headers.includes(trackingIdColumn) || !headers.includes(routeNameColumn))
        return res.status(400).json({ message: "Selected columns were not found in the sample file" });

      customer.loaderMapping = {
        trackingIdColumn,
        routeIdColumn: "",
        routeNameColumn,
        addressColumn: addressColumn || "",
        sampleFileName: req.file.originalname,
        setAt: new Date(),
      };
    }

    customer.markModified("loaderMapping");
    await customer.save();
    res.json({
      message: `Loader Excel format saved for "${customer.displayName}".`,
      trackingIdColumn,
      routeIdColumn: customer.loaderMapping.routeIdColumn,
      routeNameColumn: customer.loaderMapping.routeNameColumn,
      addressColumn: customer.loaderMapping.addressColumn,
      extractionMode: customer.extractionMode,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while saving loader Excel mapping" });
  }
});

router.get("/customers/:customerId/loader-mapping", protect, requireRole("admin"), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    if (!customer.loaderMapping?.trackingIdColumn)
      return res.json({ exists: false, customerName: customer.displayName });

    res.json({
      exists: true,
      customerName: customer.displayName,
      extractionMode: customer.extractionMode,
      trackingIdColumn: customer.loaderMapping.trackingIdColumn,
      routeIdColumn: customer.loaderMapping.routeIdColumn,
      routeNameColumn: customer.loaderMapping.routeNameColumn,
      addressColumn: customer.loaderMapping.addressColumn || "",
      sampleFileName: customer.loaderMapping.sampleFileName,
      setAt: customer.loaderMapping.setAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching loader mapping" });
  }
});

module.exports = router;
