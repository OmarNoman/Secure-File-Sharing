# Secure File Sharing

A student portfolio project for secure browser-to-S3 file sharing. The backend creates temporary presigned URLs so files can be uploaded directly from the browser to a private Amazon S3 bucket without sending AWS credentials to the frontend.

## Current Architecture

```text
frontend/
  index.html
  style.css
  app.js

backend/
  src/
    config/
      dynamo.js
      s3.js
    routes/
      files.js
    services/
      fileService.js
      metadataService.js
    server.js
  .env.example
  package.json

infrastructure/
  create-bucket.sh
  create-table.sh
  iam-policy.example.json
  README.md
```

The backend is a Node.js, Express, CommonJS API. It also serves the plain HTML/CSS/JS frontend as static files, so the whole app runs from one process on one origin (no build step, no CORS).

`infrastructure/` provisions the S3 bucket (public access blocked, default encryption, CORS for browser uploads, lifecycle expiration) and the DynamoDB table for file metadata, and generates a least-privilege IAM policy for the backend's credentials. See `infrastructure/README.md`. This is a separate, manual step from running the app; it is not run automatically.

## Setup

```bash
cd backend
npm install
```

Create a local `.env` file from the example when running the project yourself:

```bash
cp .env.example .env
```

Do not commit `.env` or AWS credentials.

## Environment Variables

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `5000` | Local API port |
| `AWS_REGION` | Yes | `us-east-1` | AWS region for S3 signing |
| `S3_BUCKET_NAME` | Yes | `my-private-bucket` | Private S3 bucket name |
| `UPLOAD_URL_EXPIRY_SECONDS` | No | `300` | Presigned PUT URL lifetime |
| `DOWNLOAD_URL_EXPIRY_SECONDS` | No | `3600` | Presigned GET URL lifetime |
| `FILES_TABLE_NAME` | Yes | `secure-file-sharing-files` | DynamoDB table storing file metadata |

Expiry values must be positive whole seconds and cannot be greater than `604800`, which is the S3 presigned URL maximum.

The AWS SDK uses its normal credential provider chain. This project does not manually pass credentials in code and does not require AWS keys in `.env.example`.

## Running The API

```bash
npm start
```

For development with Node's watch mode:

```bash
npm run dev
```

Then open `http://localhost:5000/` in a browser to use the upload UI.

## Endpoints

### GET /health

Response:

```json
{
  "status": "ok",
  "service": "secure-file-sharing-api"
}
```

### POST /api/files/upload-url

Request:

```json
{
  "fileName": "example.pdf",
  "contentType": "application/pdf"
}
```

Response:

```json
{
  "key": "uploads/generated-id.pdf",
  "uploadUrl": "https://...",
  "method": "PUT",
  "requiredHeaders": {
    "Content-Type": "application/pdf",
    "x-amz-server-side-encryption": "AES256",
    "x-amz-meta-original-filename": "example.pdf"
  },
  "expiresInSeconds": 300
}
```

The frontend must include every returned `requiredHeaders` value when it uploads the file with `PUT`. The signed headers, including the `x-amz-meta-original-filename` metadata header, must match the values used to create the presigned URL or S3 will reject the signature. The original filename is percent-encoded to stay within S3's US-ASCII metadata requirement.

### POST /api/files/confirm

Called after the browser successfully `PUT`s the file to S3. Reads the object's actual size, content type, and original filename back from S3 (not from the request body) and records it.

Request:

```json
{
  "key": "uploads/generated-id.pdf"
}
```

Response:

```json
{
  "fileKey": "uploads/generated-id.pdf",
  "originalFileName": "example.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 48213,
  "uploadedAt": "2026-08-22T10:15:00.000Z"
}
```

Fails with 400 if the object doesn't actually exist in S3 yet (i.e. the upload never completed).

### GET /api/files

Returns up to the 50 most recently uploaded files, newest first, as an array of the same shape returned by `/confirm`.

### POST /api/files/download-url

Request:

```json
{
  "key": "uploads/generated-id.pdf"
}
```

Response:

```json
{
  "key": "uploads/generated-id.pdf",
  "downloadUrl": "https://...",
  "expiresInSeconds": 3600
}
```

## How Uploads Work

1. The browser asks the backend for an upload URL.
2. The backend validates the request, creates a random object key under `uploads/`, and signs a private S3 `PutObjectCommand` with the original filename attached as S3 object metadata.
3. The browser uploads the file directly to S3 using the returned URL and required headers.
4. The browser calls `/api/files/confirm`. The backend reads the object's real size/type/filename back from S3 via `HeadObject` and stores that in DynamoDB, keyed by the object key.
5. The bucket remains private.
6. The backend can later generate a temporary download URL for the stored object key, and list previously uploaded files via `GET /api/files`.

## Security Notes

- S3 objects are uploaded with server-side encryption using `AES256`.
- Object keys are generated with `crypto.randomUUID()` and do not trust the original filename.
- Only a safe lowercase file extension is preserved from the original filename.
- AWS credentials are never sent to the browser.
- The S3 bucket should remain private.
- Download access is temporary and controlled through presigned GET URLs.
- File metadata (size, content type, original filename) is read back from S3 itself via `HeadObject` when confirming an upload, not trusted from the client request body.

## Not Yet Implemented

- User authentication
- Virus scanning
