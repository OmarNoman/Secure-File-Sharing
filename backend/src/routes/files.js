const express = require("express");

const {
  createDownloadUrl,
  createUploadUrl,
} = require("../services/fileService");
const {
  recordUpload,
  listUploads,
  assertDownloadAllowed,
} = require("../services/metadataService");

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
    await assertDownloadAllowed(req.body);
    const result = await createDownloadUrl(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/confirm", async (req, res, next) => {
  try {
    const result = await recordUpload(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const result = await listUploads();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
