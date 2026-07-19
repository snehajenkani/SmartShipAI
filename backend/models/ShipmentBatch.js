const mongoose = require("mongoose");

const shipmentEntrySchema = new mongoose.Schema(
  {
    trackingId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    routeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    routeName: {
      type: String,
      trim: true,
      default: "",
    },
    customerName: {
      type: String,
      trim: true,
      default: "",
    },
    customerNumber: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    color: {
      type: String,
      trim: true,
      default: "",
    },
    noOfPacks: {
      type: Number,
      default: 1,
      min: 1,
    },
    scanCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isUndelivered: {
      type: Boolean,
      default: false,
    },
    undeliveredReason: {
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
    fileNames: [String],

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