const mongoose = require("mongoose");

// Stores the admin's saved answer to:
//   "Which column in the loader's daily Excel is the Tracking ID?"
//   "Which column in the loader's daily Excel is the Route ID?"
//
// This mapping is applied automatically to every future loader upload,
// so loaders never have to answer these questions themselves.
// Only one mapping is kept at a time - the most recent one set by admin.
const loaderExcelMappingSchema = new mongoose.Schema(
  {
    trackingIdColumn: {
      type: String,
      required: true,
      trim: true,
    },
    routeIdColumn: {
      type: String,
      required: true,
      trim: true,
    },
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    sampleFileName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("LoaderExcelMapping", loaderExcelMappingSchema);
