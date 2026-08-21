const { HeadObjectCommand } = require("@aws-sdk/client-s3");
const { PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const { getS3Client, getS3Config } = require("../config/s3");
const { getDynamoClient, getFilesTableName } = require("../config/dynamo");
const { validateDownloadKey } = require("./fileService");

const LIST_LIMIT = 50;

function createInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.isUserInputError = true;
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

module.exports = {
  recordUpload,
  listUploads,
};
