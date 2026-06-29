const express = require("express");
const router = express.Router();
const ShipmentBatch = require("../models/ShipmentBatch");

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

module.exports = router;
