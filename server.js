import "dotenv/config";
import express from "express";
import cors from "cors";
import receiptRoutes from "./src/routes/receiptRoutes.js";
import { generalRateLimiter } from "./src/middleware/rateLimiter.js";

const app = express();

// Trust reverse proxy headers (essential for Render, Railway, Cloudflare, Nginx, AWS)
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(generalRateLimiter);

// Detailed Request / Response Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toLocaleTimeString();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusEmoji =
      res.statusCode >= 500
        ? "❌"
        : res.statusCode >= 400
        ? "⚠️"
        : res.statusCode >= 300
        ? "🔀"
        : "✅";

    console.log(
      `[${timestamp}] ${statusEmoji} ${req.method.padEnd(6)} ${req.originalUrl.padEnd(24)} ${res.statusCode} (${duration}ms)`
    );
  });

  next();
});

// Routes
app.use("/api/receipts", receiptRoutes);

// Health check endpoint (for deployment orchestrators and uptime monitors)
app.get("/health", (req, res) =>
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    security: {
      rateLimiting: "active (15 req/15min)",
      fileUploadCap: "5MB",
      deduplicationCache: "active",
      clientAuth: "active",
    },
    timestamp: new Date().toISOString(),
  })
);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.method} ${req.originalUrl} not found.`,
  });
});

// Global unhandled error handler
app.use((err, req, res, next) => {
  console.error("💥 [UNCAUGHT SERVER ERROR]:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error. Please try again later.",
  });
});

const PORT = process.env.PORT || 3000;
const modelName = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const apiKey = process.env.GEMINI_API_KEY;
const apiKeyStatus = apiKey
  ? `Configured (...${apiKey.slice(-4)})`
  : "MISSING (Set GEMINI_API_KEY in .env)";

app.listen(PORT, () => {
  console.log("\n=======================================================");
  console.log("🧾  RECEIPT SPLIT AI - PRODUCTION READY BACKEND");
  console.log("=======================================================");
  console.log(`🌐 Server Port:       ${PORT}`);
  console.log(`🤖 AI Vision Model:   ${modelName}`);
  console.log(`🔑 Gemini API Key:    ${apiKeyStatus}`);
  console.log(`🛡️  Rate Limiting:     Active (15 scans / 15 min per IP)`);
  console.log(`🔒 Client Auth:       Active (X-App-Secret required)`);
  console.log(`📦 Max Upload Size:   5 MB`);
  console.log(`⚡ Duplicate Cache:   Active (SHA-256 Memory Store)`);
  console.log(`🚀 Reverse Proxy:     trust proxy = 1 (Active)`);
  console.log("-------------------------------------------------------");
  console.log("📌 Endpoints:");
  console.log(`   • POST /api/receipts/parse (Protected receipt scan)`);
  console.log(`   • GET  /health             (Health check & uptime)`);
  console.log("=======================================================\n");
});
