const mongoose = require("mongoose");

// Each entry is one package from the loader's daily Excel.
//
// In "route-lookup" mode: trackingId + routeId are populated; routeName is empty.
// In "direct" mode:       trackingId + routeName are populated; routeId is empty.
const shipmentEntrySchema = new mongoose.Schema(
  {
    trackingId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    // route-lookup mode only
    routeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    // direct mode only
    routeName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const shipmentBatchSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    // Which mode was active when this batch was uploaded (for reference)
    extractionMode: {
      type: String,
      enum: ["route-lookup", "direct"],
    },

    entries: [shipmentEntrySchema],

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    fileName: String,

    meta: {
      tripSheetId: String,
      vehicle: String,
      date: String,
      route: String,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShipmentBatch", shipmentBatchSchema);