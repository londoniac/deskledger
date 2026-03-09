import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "./middleware/auth.js";
import profileRoutes from "./routes/profile.js";
import transactionRoutes from "./routes/transactions.js";
import invoiceRoutes from "./routes/invoices.js";
import expenseRoutes from "./routes/expenses.js";
import importRoutes from "./routes/import.js";
import exportRoutes from "./routes/export.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Security ───
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// ─── Rate Limiting ───
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Health Check ───
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Authenticated Routes ───
app.use("/api", authMiddleware);
app.use("/api/profile", profileRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/import", importRoutes);
app.use("/api/export", exportRoutes);

// ─── Error Handler ───
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`DeskLedger API running on port ${PORT}`);
});
