# Secure File Sharing

A student portfolio project for secure browser-to-S3 file sharing. The backend creates temporary presigned URLs so files can be uploaded directly from the browser to a private Amazon S3 bucket without sending AWS credentials to the frontend.

## Current Architecture

```text
frontend/
  .gitkeep

backend/
  src/
    config/
      s3.js
    routes/
      files.js
    services/
      fileService.js
    server.js
  .env.example
  package.json
```

The current implementation is a Node.js, Express, CommonJS backend. The frontend is still a placeholder.

## Backend Setup

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
    "x-amz-server-side-encryption": "AES256"
  },
  "expiresInSeconds": 300
}
```

The frontend must include every returned `requiredHeaders` value when it uploads the file with `PUT`. The signed `Content-Type` and `x-amz-server-side-encryption` headers must match the values used to create the presigned URL.

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
2. The backend validates the request, creates a random object key under `uploads/`, and signs a private S3 `PutObjectCommand`.
3. The browser uploads the file directly to S3 using the returned URL and required headers.
4. The bucket remains private.
5. The backend can later generate a temporary download URL for the stored object key.

## Security Notes

- S3 objects are uploaded with server-side encryption using `AES256`.
- Object keys are generated with `crypto.randomUUID()` and do not trust the original filename.
- Only a safe lowercase file extension is preserved from the original filename.
- AWS credentials are never sent to the browser.
- The S3 bucket should remain private.
- Download access is temporary and controlled through presigned GET URLs.

## Not Yet Implemented

- Frontend upload UI
- User authentication
- File history or dashboard
- Database storage for file metadata
- Virus scanning
- Infrastructure automation
