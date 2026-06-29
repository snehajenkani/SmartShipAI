const mongoose = require("mongoose");

const routingResultSchema = new mongoose.Schema(
  {
    awb:            { type: String, trim: true },
    customerName:   { type: String, trim: true },
    customerNumber: { type: String, trim: true },
    address:        { type: String, trim: true },
    routeName:      { type: String, trim: true, default: "CHECK THIS" },
    matchMethod:    { type: String, enum: ["address", "pincode", "unmatched"], default: "unmatched" },
  },
  { _id: false }
);

const routingJobSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Column mappings chosen by admin for the master file
    masterMapping: {
      routeNameColumn: { type: String, trim: true },
      addressColumn:   { type: String, trim: true },
      pincodeColumn:   { type: String, trim: true },
    },

    // Column mappings chosen by admin for the routing excel
    routingMapping: {
      awbColumn:            { type: String, trim: true },
      customerNameColumn:   { type: String, trim: true },
      customerNumberColumn: { type: String, trim: true },
      addressColumn:        { type: String, trim: true },
    },

    // Parsed master data (keyword→route + pincode→route)
    masterEntries: [
      {
        routeName: { type: String, trim: true },
        address:   { type: String, trim: true },  // short keyword
        pincode:   { type: String, trim: true },
        _id: false,
      },
    ],

    // Final matched results
    results: [routingResultSchema],

    masterFileName:  { type: String },
    routingFileName: { type: String },

    totalRows:     { type: Number, default: 0 },
    matchedCount:  { type: Number, default: 0 },
    unmatchedCount:{ type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RoutingJob", routingJobSchema);