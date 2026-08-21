// NOT DEPLOYED, NOT TESTED. See infrastructure/lambda/README.md before using this.
//
// Triggered by an S3 ObjectCreated event on uploads/*. For each object, downloads it and
// is supposed to run a real virus scan, then writes the result to the files DynamoDB table
// so the backend's fail-closed download gate (metadataService.assertDownloadAllowed) can
// allow or refuse it. scanFile() below is an unimplemented placeholder: it throws on purpose
// so a file can never be marked "clean" by accident before real scanning is wired in. Objects
// simply stay "pending" (downloads stay blocked) until this is finished and deployed.

const fs = require("fs");
const os = require("os");
const path = require("path");

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION;
const FILES_TABLE_NAME = process.env.FILES_TABLE_NAME;

const s3Client = new S3Client({ region: REGION });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function downloadToTmp(bucket, key) {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const tmpPath = path.join(os.tmpdir(), path.basename(key));
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  fs.writeFileSync(tmpPath, Buffer.concat(chunks));
  return tmpPath;
}

// TODO: replace with a real scan. This is deliberately unimplemented so nothing is ever
// marked "clean" without an actual scan having run. Options documented in README.md:
// - A container-image Lambda bundling the ClamAV engine + freshclam-updated definitions.
// - A Lambda layer that provides the clamscan binary plus a definitions volume (e.g. via EFS).
// Whichever you pick, this function should return "clean" or "infected" and throw on any
// scan-engine error (so the object correctly stays "pending" rather than being waved through).
async function scanFile(filePath) {
  throw new Error(
    `scanFile() is not implemented. ${filePath} was downloaded but never actually scanned.`,
  );
}

async function markScanStatus(key, status) {
  await dynamoClient.send(
    new UpdateCommand({
      TableName: FILES_TABLE_NAME,
      Key: { fileKey: key },
      UpdateExpression: "SET scanStatus = :status, scannedAt = :scannedAt",
      ExpressionAttributeValues: {
        ":status": status,
        ":scannedAt": new Date().toISOString(),
      },
      ConditionExpression: "attribute_exists(fileKey)",
    }),
  );
}

exports.handler = async (event) => {
  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    let tmpPath;
    try {
      tmpPath = await downloadToTmp(bucket, key);
      const status = await scanFile(tmpPath);
      await markScanStatus(key, status);
    } finally {
      if (tmpPath && fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  }
};
