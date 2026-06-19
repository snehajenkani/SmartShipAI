const mongoose = require("mongoose");

// Each Customer represents one company (e.g. "UC", "Medplus", "Amazon").
//
// extractionMode controls how scanning works for this customer:
//
//   "route-lookup" (default / Option 1):
//     Loader Excel has TrackingID + RouteID.
//     Scan flow: TrackingID → RouteID (from loader batch) → RouteName (from master data)
//     Admin must upload: master data (RouteID→RouteName) + set loader mapping
//
//   "direct" (Option 2):
//     Loader Excel has TrackingID + RouteName directly.
//     Scan flow: TrackingID → RouteName (straight from loader batch, no master data needed)
//     Admin must upload: set loader mapping only (no master data required)

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    displayName: {
      type: String,
      required: true,
      trim: true,
    },

    // "route-lookup" = TrackingID → RouteID → RouteName (Option 1)
    // "direct"       = TrackingID → RouteName            (Option 2)
    extractionMode: {
      type: String,
      enum: ["route-lookup", "direct"],
      default: null, // null means not yet configured — admin must choose
    },

    // Column mapping for this customer's LOADER daily Excel.
    // For "route-lookup": trackingIdColumn + routeIdColumn
    // For "direct":       trackingIdColumn + routeNameColumn
    loaderMapping: {
      trackingIdColumn: { type: String, trim: true },
      routeIdColumn:    { type: String, trim: true }, // used in route-lookup mode
      routeNameColumn:  { type: String, trim: true }, // used in direct mode
      sampleFileName:   { type: String },
      setAt:            { type: Date },
    },

    // Master data: RouteID → RouteName table.
    // Only required (and used) in "route-lookup" mode.
    masterData: {
      entries: [
        {
          routeId:   { type: String, trim: true, uppercase: true },
          routeName: { type: String, trim: true },
          _id: false,
        },
      ],
      fileName:   { type: String },
      uploadedAt: { type: Date },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);