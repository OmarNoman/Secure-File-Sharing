const DEFAULT_JWT_EXPIRY_SECONDS = 86400;
const MAX_JWT_EXPIRY_SECONDS = 604800;

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

function getJwtSecret() {
  return readRequiredEnv("JWT_SECRET");
}

function getJwtExpirySeconds() {
  const value = process.env.JWT_EXPIRY_SECONDS;

  if (!value || !value.trim()) {
    return DEFAULT_JWT_EXPIRY_SECONDS;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createConfigError("JWT_EXPIRY_SECONDS must be a positive integer");
  }

  if (parsed > MAX_JWT_EXPIRY_SECONDS) {
    throw createConfigError(`JWT_EXPIRY_SECONDS must be ${MAX_JWT_EXPIRY_SECONDS} seconds or less`);
  }

  return parsed;
}

module.exports = {
  getJwtSecret,
  getJwtExpirySeconds,
};
