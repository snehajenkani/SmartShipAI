const express = require("express");
const router = express.Router();
const ShipmentBatch = require("../models/ShipmentBatch");
const ExtensionLookup = require("../models/ExtensionLookup");

// ---------------------------------------------------------------------------
// HELPER: normalize + partial keyword match (same approach as routing.js)
// ---------------------------------------------------------------------------
function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

// GET /api/public/extension/lookup/:query
// Public endpoint - no auth required - used by Chrome Extension
// Staff can type a code, a place name, or any substring of the saved "Location" text.
// Matches partially (contains), case-insensitive, across all customers' lookup tables.
router.get("/extension/lookup/:query", async (req, res) => {
  const rawQuery = String(req.params.query || "").trim();
  if (!rawQuery) return res.json({ found: false, message: "Store Code / Area is required" });

  const queryNorm = normalize(rawQuery);

  try {
    // Pull all lookup tables and search in-memory for partial matches.
    // (Lookup tables are small reference data, not shipment volumes, so this is fine.)
    const lookups = await ExtensionLookup.find().select("entries");

    for (const lookup of lookups) {
      for (const entry of lookup.entries) {
        const entryNorm = normalize(entry.searchText);
        if (entryNorm.includes(queryNorm) || queryNorm.includes(entryNorm)) {
          return res.json({
            found: true,
            matchedText: entry.searchText,
            routeName: entry.routeName,
          });
        }
      }
    }

    return res.json({ found: false, message: "Store Code / Area not found" });
  } catch (err) {
    console.error("Extension lookup error:", err.message);
    res.status(500).json({ found: false, message: "Server error" });
  }
});

module.exports = router;
