const mongoose = require("mongoose");

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

    extractionMode: {
      type: String,
      enum: ["route-lookup", "direct"],
      default: null,
    },

    loaderMapping: {
      trackingIdColumn: { type: String, trim: true },
      routeIdColumn:    { type: String, trim: true },
      routeNameColumn:  { type: String, trim: true },
      addressColumn:    { type: String, trim: true }, // NEW
      sampleFileName:   { type: String },
      setAt:            { type: Date },
    },

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