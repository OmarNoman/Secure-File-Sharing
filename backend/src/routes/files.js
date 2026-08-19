const express = require("express");

const {
  createDownloadUrl,
  createUploadUrl,
} = require("../services/fileService");

const router = express.Router();

router.post("/upload-url", async (req, res, next) => {
  try {
    const result = await createUploadUrl(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/download-url", async (req, res, next) => {
  try {
    const result = await createDownloadUrl(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
