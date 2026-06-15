const { S3Client } = require("@aws-sdk/client-s3");

const DEFAULT_UPLOAD_URL_EXPIRY_SECONDS = 300;
const DEFAULT_DOWNLOAD_URL_EXPIRY_SECONDS = 3600;
const MAX_PRESIGNED_URL_EXPIRY_SECONDS = 604800;

let cachedClient;

function createConfigError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  error.isConfigurationError = true;
  return error;
}

function readRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw createConfigError(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function readPositiveIntegerEnv(name, fallback, max) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createConfigError(`${name} must be a positive integer`);
  }

  if (parsed > max) {
    throw createConfigError(`${name} must be ${max} seconds or less`);
  }

  return parsed;
}

function getS3Config() {
  return {
    region: readRequiredEnv("AWS_REGION"),
    bucketName: readRequiredEnv("S3_BUCKET_NAME"),
    uploadUrlExpirySeconds: readPositiveIntegerEnv(
      "UPLOAD_URL_EXPIRY_SECONDS",
      DEFAULT_UPLOAD_URL_EXPIRY_SECONDS,
      MAX_PRESIGNED_URL_EXPIRY_SECONDS,
    ),
    downloadUrlExpirySeconds: readPositiveIntegerEnv(
      "DOWNLOAD_URL_EXPIRY_SECONDS",
      DEFAULT_DOWNLOAD_URL_EXPIRY_SECONDS,
      MAX_PRESIGNED_URL_EXPIRY_SECONDS,
    ),
  };
}

function getS3Client() {
  if (!cachedClient) {
    const { region } = getS3Config();
    cachedClient = new S3Client({ region });
  }

  return cachedClient;
}

module.exports = {
  getS3Client,
  getS3Config,
};
