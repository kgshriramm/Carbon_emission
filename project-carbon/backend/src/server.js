const express = require("express");
const cors = require("cors");
const emissionRoutes = require("./routes/emissionRoutes");
const companyRoutes = require("./routes/companyRoutes");
const reportRoutes = require("./routes/reportRoutes");
const authRoutes = require("./routes/authRoutes");
const emissionController = require("./controllers/emissionController");
const { requireAuth } = require("./middleware/authMiddleware");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (no Origin header) and configured web clients.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: false
  })
);

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/auth", authRoutes);

app.use("/api", requireAuth, companyRoutes);
app.post("/api/activity-data", requireAuth, emissionController.createActivityData);
app.use("/api/emissions", requireAuth, emissionRoutes);
app.use("/api/reports", requireAuth, reportRoutes);

app.use((err, req, res, next) => {
  const dbConnectCodes = new Set(["EACCES", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"]);
  if (dbConnectCodes.has(err?.code)) {
    return res.status(503).json({
      success: false,
      message: "Database connection failed. Check DB host/port/credentials and network access."
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error"
  });
});

const port = Number(process.env.PORT || 4000);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
}

module.exports = app;