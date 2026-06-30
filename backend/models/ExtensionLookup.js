const mongoose = require("mongoose");

const lookupEntrySchema = new mongoose.Schema(
  {
    storeCode: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    routeName: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { _id: false }
);

const extensionLookupSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true,
    },
    entries: [lookupEntrySchema],

    mapping: {
      storeCodeColumn: String,
      routeNameColumn: String,
    },

    fileName: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    uploadedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExtensionLookup", extensionLookupSchema);
