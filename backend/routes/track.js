const express = require("express");
const router = express.Router();
const ShipmentBatch = require("../models/ShipmentBatch");
const ExtensionLookup = require("../models/ExtensionLookup");

// GET /api/public/track/:sid
// Public endpoint - no auth required
router.get("/track/:sid", async (req, res) => {
  const { sid } = req.params;

  try {
    // Search across all customers' shipment batches
    const batch = await ShipmentBatch.findOne({
      "entries.trackingId": sid,
      active: true
    });

    if (!batch) {
      return res.json({ found: false, message: "Tracking ID not found" });
    }

    const shipment = batch.entries.find(s => s.trackingId === sid.toUpperCase());

    if (!shipment) {
      return res.json({ found: false, message: "Tracking ID not found" });
    }

    return res.json({
      found: true,
      trackingId: sid,
      routeName: shipment.routeName || "N/A",
      routeId: shipment.routeId || "N/A",
    });

  } catch (err) {
    console.error("Track error:", err.message);
    res.status(500).json({ found: false, message: "Server error" });
  }
});

// GET /api/public/extension/lookup/:storeCode
// Public endpoint - no auth required - used by Chrome Extension
router.get("/extension/lookup/:storeCode", async (req, res) => {
  const storeCode = String(req.params.storeCode || "").trim().toUpperCase();
  if (!storeCode) return res.json({ found: false, message: "Store Code / Area is required" });

  try {
    const lookup = await ExtensionLookup.findOne({ "entries.storeCode": storeCode });
    if (!lookup) return res.json({ found: false, message: "Store Code / Area not found" });

    const entry = lookup.entries.find((e) => e.storeCode === storeCode);
    if (!entry) return res.json({ found: false, message: "Store Code / Area not found" });

    return res.json({
      found: true,
      storeCode: entry.storeCode,
      routeName: entry.routeName,
    });
  } catch (err) {
    console.error("Extension lookup error:", err.message);
    res.status(500).json({ found: false, message: "Server error" });
  }
});

module.exports = router;
