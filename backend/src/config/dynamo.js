const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

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

function getFilesTableName() {
  return readRequiredEnv("FILES_TABLE_NAME");
}

function getDynamoClient() {
  if (!cachedClient) {
    const region = readRequiredEnv("AWS_REGION");
    cachedClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  return cachedClient;
}

module.exports = {
  getDynamoClient,
  getFilesTableName,
};
