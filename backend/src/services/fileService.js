const crypto = require("crypto");
const path = require("path");

const { GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const { getS3Client, getS3Config } = require("../config/s3");

const MAX_FILE_NAME_LENGTH = 255;
const MAX_CONTENT_TYPE_LENGTH = 100;
const MAX_KEY_LENGTH = 512;
const UPLOAD_PREFIX = "uploads/";

function createInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.isUserInputError = true;
  return error;
}

function requireNonEmptyString(value, fieldName, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw createInputError(`${fieldName} must be a non-empty string`);
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    throw createInputError(`${fieldName} is too long`);
  }

  return trimmed;
}

function getSafeExtension(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  if (/^\.[a-z0-9]{1,16}$/.test(extension)) {
    return extension;
  }

  return "";
}

function validateContentType(contentType) {
  const normalized = requireNonEmptyString(
    contentType,
    "contentType",
    MAX_CONTENT_TYPE_LENGTH,
  );

  if (/[^\x20-\x7e]/.test(normalized) || !/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
    throw createInputError("contentType must be a valid MIME type");
  }

  return normalized;
}

function validateUploadInput(input = {}) {
  const fileName = requireNonEmptyString(
    input.fileName,
    "fileName",
    MAX_FILE_NAME_LENGTH,
  );
  const contentType = validateContentType(input.contentType);

  return { fileName, contentType };
}

function validateDownloadKey(input = {}) {
  const key = requireNonEmptyString(input.key, "key", MAX_KEY_LENGTH);

  if (!key.startsWith(UPLOAD_PREFIX)) {
    throw createInputError(`key must begin with ${UPLOAD_PREFIX}`);
  }

  if (
    key.includes("..") ||
    key.includes("\\") ||
    key.includes("//") ||
    /[\x00-\x1f\x7f]/.test(key) ||
    !/^uploads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key)
  ) {
    throw createInputError("key contains invalid or unsafe characters");
  }

  return key;
}

function createObjectKey(fileName) {
  return `${UPLOAD_PREFIX}${crypto.randomUUID()}${getSafeExtension(fileName)}`;
}

function encodeFileNameForS3Metadata(fileName) {
  // S3 user metadata values must be US-ASCII; this is reversed with decodeURIComponent when read back.
  return encodeURIComponent(fileName);
}

async function createUploadUrl(input) {
  const { fileName, contentType } = validateUploadInput(input);
  const key = createObjectKey(fileName);
  const { bucketName, uploadUrlExpirySeconds } = getS3Config();
  const encodedFileName = encodeFileNameForS3Metadata(fileName);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
    Metadata: {
      "original-filename": encodedFileName,
    },
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: uploadUrlExpirySeconds,
  });

  return {
    key,
    uploadUrl,
    method: "PUT",
    requiredHeaders: {
      "Content-Type": contentType,
      "x-amz-server-side-encryption": "AES256",
      "x-amz-meta-original-filename": encodedFileName,
    },
    expiresInSeconds: uploadUrlExpirySeconds,
  };
}

async function createDownloadUrl(input) {
  const key = validateDownloadKey(input);
  const { bucketName, downloadUrlExpirySeconds } = getS3Config();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const downloadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: downloadUrlExpirySeconds,
  });

  return {
    key,
    downloadUrl,
    expiresInSeconds: downloadUrlExpirySeconds,
  };
}

module.exports = {
  createDownloadUrl,
  createUploadUrl,
  validateDownloadKey,
};
