require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const scannerRoutes = require("./routes/scanner");

const app = express();

// Middleware
app.use(cors({
  origin: [
    "https://smart-ship-ai-1xjq.vercel.app",
    "http://localhost:5173"
  ],
  credentials: true
}));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/scanner", scannerRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "SmartShip AI backend is running" });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});