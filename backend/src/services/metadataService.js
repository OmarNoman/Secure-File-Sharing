const { HeadObjectCommand } = require("@aws-sdk/client-s3");
const { PutCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const { getS3Client, getS3Config } = require("../config/s3");
const { getDynamoClient, getFilesTableName } = require("../config/dynamo");
const { validateDownloadKey } = require("./fileService");

const LIST_LIMIT = 50;

// Fail closed: a file is downloadable only once something has explicitly marked it "clean".
// New uploads start "pending" and stay that way until the (separately deployed) virus-scan
// Lambda writes the result directly to this table. See infrastructure/lambda/README.md.
const SCAN_STATUS_PENDING = "pending";
const SCAN_STATUS_CLEAN = "clean";

function createInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.isUserInputError = true;
  return error;
}

function createForbiddenError(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function decodeFileNameFromS3Metadata(encoded) {
  if (!encoded) {
    return "unknown";
  }

  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

async function recordUpload(input = {}) {
  const key = validateDownloadKey(input);
  const { bucketName } = getS3Config();

  let head;
  try {
    head = await getS3Client().send(
      new HeadObjectCommand({ Bucket: bucketName, Key: key }),
    );
  } catch {
    throw createInputError(
      "Object not found in S3. Upload it before confirming.",
    );
  }

  const item = {
    fileKey: key,
    originalFileName: decodeFileNameFromS3Metadata(
      head.Metadata && head.Metadata["original-filename"],
    ),
    contentType: head.ContentType || "application/octet-stream",
    sizeBytes: head.ContentLength || 0,
    uploadedAt: new Date().toISOString(),
    scanStatus: SCAN_STATUS_PENDING,
  };

  await getDynamoClient().send(
    new PutCommand({
      TableName: getFilesTableName(),
      Item: item,
    }),
  );

  return item;
}

async function listUploads() {
  const result = await getDynamoClient().send(
    new ScanCommand({ TableName: getFilesTableName() }),
  );

  const items = result.Items || [];

  // Small personal-project scale: sort in memory rather than maintaining a GSI for this.
  items.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

  return items.slice(0, LIST_LIMIT);
}

async function assertDownloadAllowed(input = {}) {
  const key = validateDownloadKey(input);

  const result = await getDynamoClient().send(
    new GetCommand({
      TableName: getFilesTableName(),
      Key: { fileKey: key },
    }),
  );

  if (!result.Item) {
    throw createInputError("Unknown file key");
  }

  if (result.Item.scanStatus !== SCAN_STATUS_CLEAN) {
    throw createForbiddenError(
      result.Item.scanStatus === "infected"
        ? "File failed virus scanning and is not available for download"
        : "File is still pending virus scanning",
    );
  }
}

module.exports = {
  recordUpload,
  listUploads,
  assertDownloadAllowed,
};
