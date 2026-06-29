require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const connectDB = require("./config/db");
const User = require("./models/User");

const authRoutes    = require("./routes/auth");
const adminRoutes   = require("./routes/admin");
const scannerRoutes = require("./routes/scanner");
const routingRoutes = require("./routes/routing");
const trackRoutes   = require("./routes/track"); // ✅ Public tracking route

const app = express();

// Middleware
app.use(cors({
  origin: [
    "https://smart-ship-ai-1xjq.vercel.app",
    "http://localhost:5173",
    "https://thesmartship.com/",       // ✅ Replace with actual company domain
    "https://www.thesmartship.com/"    // ✅ Replace with actual company domain
  ],
  credentials: true
}));
app.use(express.json());

// ✅ Serve widget.js as a static file (company pastes one <script> tag)
app.use(express.static(path.join(__dirname, "public")));

// ✅ Public routes - NO auth middleware (must be before protected routes)
app.use("/api/public", trackRoutes);

// Protected Routes
app.use("/api/auth",    authRoutes);
app.use("/api/admin",   adminRoutes);
app.use("/api/scanner", scannerRoutes);
app.use("/api/routing", routingRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "SmartShip AI backend is running" });
});

// Auto-seed default users if none exist
async function seedUsers() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const hash1 = await bcrypt.hash("admin123", 10);
      const hash2 = await bcrypt.hash("loader123", 10);
      await User.create([
        { username: "admin", password: hash1, role: "admin" },
        { username: "loader", password: hash2, role: "loader" },
      ]);
      console.log("✅ Default users created: admin / admin123 and loader / loader123");
    } else {
      console.log(`✅ Users already exist (${count} found), skipping seed`);
    }
  } catch (err) {
    console.error("❌ Error seeding users:", err.message);
  }
}

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await seedUsers();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
