// Run this ONCE to create the initial accounts:
//   node seed.js
//
// This creates:
//   - 1 admin account
//   - 1 shared loader account (all loaders use the same login)
//
// You can change the usernames/passwords below before running.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const User = require("./models/User");

const ACCOUNTS = [
  {
    username: "admin",
    password: "admin123", // CHANGE THIS before deploying
    role: "admin",
  },
  {
    username: "loader",
    password: "loader123", // CHANGE THIS before deploying - shared by all loaders
    role: "loader",
  },
];

const seed = async () => {
  await connectDB();

  for (const acc of ACCOUNTS) {
    const existing = await User.findOne({ username: acc.username });
    if (existing) {
      console.log(`User "${acc.username}" already exists, skipping.`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(acc.password, 10);
    await User.create({
      username: acc.username,
      password: hashedPassword,
      role: acc.role,
    });
    console.log(`Created ${acc.role} account: ${acc.username} / ${acc.password}`);
  }

  console.log("Seeding complete.");
  await mongoose.connection.close();
  process.exit(0);
};

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
