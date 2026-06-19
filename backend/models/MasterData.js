const mongoose = require("mongoose");

// Each entry maps one Route ID to its Route Name.
// This is the FIXED master dataset uploaded by the admin.
const masterDataEntrySchema = new mongoose.Schema(
  {
    routeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    routeName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const masterDataSchema = new mongoose.Schema(
  {
    entries: [masterDataEntrySchema],
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    fileName: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("MasterData", masterDataSchema);
