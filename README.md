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
      auth.js
      dynamo.js
      s3.js
    middleware/
      requireAuth.js
    routes/
      auth.js
      files.js
    services/
      authService.js
      fileService.js
      metadataService.js
    server.js
  .env.example
  package.json

infrastructure/
  create-bucket.sh
  create-table.sh
  create-users-table.sh
  configure-scan-trigger.sh
  iam-policy.example.json
  README.md
  lambda/
    scan-handler/
      index.js
      package.json
    iam-policy.example.json
    README.md
```

The backend is a Node.js, Express, CommonJS API. It also serves the plain HTML/CSS/JS frontend as static files, so the whole app runs from one process on one origin (no build step, no CORS).

`infrastructure/` provisions the S3 bucket (public access blocked, default encryption, CORS for browser uploads, lifecycle expiration) and the DynamoDB tables for file metadata and users, and generates a least-privilege IAM policy for the backend's credentials. See `infrastructure/README.md`. This is a separate, manual step from running the app; it is not run automatically. `infrastructure/lambda/` is an unfinished, undeployed scaffold for real virus scanning — see its own README before relying on it.

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
| `USERS_TABLE_NAME` | Yes | `secure-file-sharing-users` | DynamoDB table storing user accounts |
| `JWT_SECRET` | Yes | (long random value) | Signs and verifies login session tokens. Generate with `openssl rand -hex 32`. Never commit this. |
| `JWT_EXPIRY_SECONDS` | No | `86400` | Login session lifetime |

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

### POST /api/auth/signup

Request:

```json
{
  "username": "alice",
  "password": "a long enough password"
}
```

Response (201):

```json
{
  "token": "eyJhbGciOi...",
  "username": "alice"
}
```

Username must be 3-50 characters (lowercase letters, numbers, `.`, `_`, `-`); password must be 8-128 characters. Fails with 400 if the username is already taken. Passwords are hashed with `scrypt` (Node's built-in, no extra dependency); nothing about the password is ever stored or logged.

### POST /api/auth/login

Same request/response shape as signup. Always returns the same generic "Invalid username or password" message (401) for both a wrong username and a wrong password, and always runs a dummy `scrypt` hash even when the username doesn't exist, so failed logins don't reveal which usernames are registered.

### All `/api/files/*` routes now require authentication

Every route below requires an `Authorization: Bearer <token>` header, using the token from signup or login. Requests without a valid, unexpired token get 401.

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
  "uploadedAt": "2026-08-22T10:15:00.000Z",
  "scanStatus": "pending"
}
```

Fails with 400 if the object doesn't actually exist in S3 yet (i.e. the upload never completed). Every newly confirmed file starts `scanStatus: "pending"` and stays that way — downloads blocked — until something external marks it `clean` in DynamoDB. See "Virus Scanning" below.

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

Fails with 403 if the file's `scanStatus` isn't `clean` (still `pending`, or `infected`), and 400 if the key is unknown.

## Virus Scanning

Every uploaded file is quarantined by default. `POST /api/files/confirm` writes `scanStatus: "pending"`, and `POST /api/files/download-url` refuses to generate a link for anything that isn't `scanStatus: "clean"` (`backend/src/services/metadataService.js`, `assertDownloadAllowed`). This part is real and enforced today.

What isn't real yet: something that actually scans files and flips that status. `infrastructure/lambda/` has a skeleton for an S3-triggered Lambda that would do this with ClamAV, but it has not been built, deployed, or tested — its scan function deliberately throws rather than pretending to scan, so a file can never be marked `clean` by accident. Until that's finished and deployed, uploaded files stay `pending` forever and are never downloadable. See `infrastructure/lambda/README.md` for what's missing and why.

## How Uploads Work

1. The browser logs in or signs up, and stores the returned session token.
2. The browser asks the backend for an upload URL, with that token attached.
3. The backend validates the request, creates a random object key under `uploads/`, and signs a private S3 `PutObjectCommand` with the original filename attached as S3 object metadata.
4. The browser uploads the file directly to S3 using the returned URL and required headers.
5. The browser calls `/api/files/confirm`. The backend reads the object's real size/type/filename back from S3 via `HeadObject` and stores that in DynamoDB, keyed by the object key, with `scanStatus: "pending"`.
6. The bucket remains private.
7. The backend can later generate a temporary download URL for the stored object key, but only once its `scanStatus` becomes `clean`, and can list previously uploaded files via `GET /api/files`.

## Security Notes

- S3 objects are uploaded with server-side encryption using `AES256`.
- Object keys are generated with `crypto.randomUUID()` and do not trust the original filename.
- Only a safe lowercase file extension is preserved from the original filename.
- AWS credentials are never sent to the browser.
- The S3 bucket should remain private.
- Download access is temporary and controlled through presigned GET URLs.
- File metadata (size, content type, original filename) is read back from S3 itself via `HeadObject` when confirming an upload, not trusted from the client request body.
- Every `/api/files/*` route requires a valid, unexpired JWT (`backend/src/middleware/requireAuth.js`), verified with an explicit algorithm allowlist (`HS256`) to avoid algorithm-confusion attacks.
- Passwords are hashed with Node's built-in `crypto.scrypt` plus a random salt per user, compared with `crypto.timingSafeEqual`. Login always performs a dummy hash for unknown usernames so the response timing doesn't reveal which usernames exist.
- Downloads are blocked by default (`scanStatus` starts `"pending"`) until something explicitly marks a file `"clean"`. See "Virus Scanning" above.

## Not Yet Implemented

- Deployed virus scanning (the app-level quarantine gate is enforced; the actual ClamAV Lambda scaffold in `infrastructure/lambda/` is unbuilt and undeployed)
