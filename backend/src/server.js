const path = require("path");

const express = require("express");
require("dotenv").config({ quiet: true });

const authRouter = require("./routes/auth");
const filesRouter = require("./routes/files");
const requireAuth = require("./middleware/requireAuth");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "secure-file-sharing-api",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/files", requireAuth, filesRouter);

app.use(express.static(FRONTEND_DIR));

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: "Route not found",
    },
  });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || error.status || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    console.error("Server error:", error);
  } else {
    console.warn("Request error:", error.message);
  }

  res.status(statusCode).json({
    error: {
      message: isServerError ? "Internal server error" : error.message,
    },
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
