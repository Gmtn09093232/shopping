/* ==========================================================================
   MATERIAL TESTING LABORATORY — PRODUCTION SERVER
   --------------------------------------------------------------------------
   Lightweight Express server that serves the single-page laboratory
   application. Designed for deployment on Render, Railway, Fly.io, etc.
   ========================================================================== */

"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

/* ---------- configuration ---------- */
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "");

/* ---------- middleware ---------- */

/* Parse JSON bodies (future API endpoints) */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* Trust the proxy on Render so req.protocol and req.ip are correct */
app.set("trust proxy", 1);

/* Request logging (simple, no dependency) */
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ` +
      `${res.statusCode} — ${ms}ms`
    );
  });
  next();
});

/* Basic security headers */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

/* ---------- static assets ---------- */
app.use(
  express.static(PUBLIC_DIR, {
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    etag: true,
    index: false, // we handle "/" manually so we can inject env info
  })
);

/* ---------- routes ---------- */

/* Health check — Render uses this to verify the service */
app.get("/healthz", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "material-testing-laboratory",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* Serve the single-page app on "/" */
app.get("/", (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, "index.html");

  if (!fs.existsSync(indexPath)) {
    return res.status(500).send(`
      <h1>Application not found</h1>
      <p>Could not find <code>public/index.html</code>.</p>
      <p>Make sure your single-file HTML app is placed at <code>public/index.html</code>.</p>
    `);
  }

  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(indexPath);
});

/* SPA fallback — any unknown path returns the app (deep-linking support) */
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found", path: req.path });
  }
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

/* ---------- error handling ---------- */
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "production" ? undefined : err.message,
  });
});

/* ---------- startup ---------- */

/* Verify the app file exists at startup */
const appFile = path.join(PUBLIC_DIR, "index.html");
if (!fs.existsSync(appFile)) {
  console.warn(
    "\n⚠️  WARNING: public/index.html not found.\n" +
    "   Place your single-file HTML app at: " + appFile + "\n"
  );
} else {
  const stats = fs.statSync(appFile);
  console.log(`✓ Found application file (${(stats.size / 1024).toFixed(1)} KB)`);
}

const server = app.listen(PORT, HOST, () => {
  console.log("");
  console.log("======================================================");
  console.log("  MATERIAL TESTING LABORATORY — SERVER RUNNING");
  console.log("======================================================");
  console.log(`  Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`  Listening   : http://${HOST}:${PORT}`);
  console.log(`  Public dir  : ${PUBLIC_DIR}`);
  console.log(`  Health      : http://${HOST}:${PORT}/healthz`);
  console.log("======================================================");
  console.log("");
});

/* ---------- graceful shutdown (Render sends SIGTERM on redeploy) ---------- */
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully…`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Forcing shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
