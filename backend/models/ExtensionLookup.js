const mongoose = require("mongoose");

const lookupEntrySchema = new mongoose.Schema(
  {
    searchText: {
      // The raw "Location" cell, e.g. "S0918 - MGC - NERADIGONDA"
      // Staff can type the code, the place name, or any substring of this.
      type: String,
      trim: true,
      required: true,
    },
    routeName: {
      // The "Branch Area" value to return, e.g. "Bhainsa"
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
      searchColumn: String,    // e.g. "Location"
      routeNameColumn: String, // e.g. "Branch Area"
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
