# Infrastructure

Provisions the private S3 bucket and DynamoDB tables the backend needs. Nothing here runs automatically; you run it yourself with your own AWS credentials, as this creates real resources in your AWS account.

## Prerequisites

- AWS CLI v2, configured (`aws sts get-caller-identity` should succeed)
- No AWS keys are read from this repo. The CLI's normal credential provider chain is used.

## What `create-bucket.sh` does

```bash
export AWS_REGION=us-east-1
export S3_BUCKET_NAME=your-globally-unique-bucket-name
# Optional, defaults shown:
export ALLOWED_ORIGIN=http://localhost:5000
export UPLOAD_EXPIRATION_DAYS=7

./create-bucket.sh
```

1. Creates the bucket if it doesn't already exist (idempotent).
2. Blocks all public access (`BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`). Objects are reachable only through presigned URLs.
3. Enables default server-side encryption (`AES256`) at the bucket level, in addition to the encryption header the backend already sets per upload.
4. Applies a CORS rule allowing `PUT` from `ALLOWED_ORIGIN` with the `Content-Type` and `x-amz-server-side-encryption` headers. Required because the browser uploads directly to the S3 domain, which is a different origin than the app.
5. Applies a lifecycle rule that expires everything under `uploads/` after `UPLOAD_EXPIRATION_DAYS` days, so test uploads don't quietly accumulate storage cost.

   S3 Standard free tier: 5 GB storage, 20,000 GET and 2,000 PUT requests per month, for the first 12 months of the AWS account. The expiration rule keeps this project well under that.

6. Fills in the `s3:PutObject`/`s3:GetObject` statement of `iam-policy.generated.json` (created from `iam-policy.example.json` if it doesn't exist yet) with your real bucket ARN. This file is gitignored.

## What `create-table.sh` and `create-users-table.sh` do

```bash
export AWS_REGION=us-east-1
export FILES_TABLE_NAME=your-files-table-name
export USERS_TABLE_NAME=your-users-table-name

./create-table.sh
./create-users-table.sh
```

1. Each creates its DynamoDB table if it doesn't already exist (idempotent). `create-table.sh` uses `fileKey` (string) as the partition key, matching `backend/src/services/metadataService.js`. `create-users-table.sh` uses `username` (string), matching `backend/src/services/authService.js`.
2. Both use `PROVISIONED` billing mode at 5 read/5 write capacity units, well inside the DynamoDB free tier (25 GB storage plus 25 RCU/25 WCU, permanently — not just the first 12 months like most other free tier offers).
3. Each fills in its own statement of `iam-policy.generated.json` with the real table ARN.

Run all three scripts (`create-bucket.sh`, `create-table.sh`, `create-users-table.sh`, any order) before starting the backend, since it needs the bucket and both tables to exist.

## IAM (manual step, on purpose)

None of the scripts create an IAM user or role. Creating identities and attaching permissions is left to you:

1. Review `iam-policy.generated.json` after running all three scripts above. It should grant only `s3:PutObject`/`s3:GetObject` scoped to `arn:aws:s3:::<your-bucket>/uploads/*`; `dynamodb:PutItem`/`dynamodb:GetItem`/`dynamodb:Scan` scoped to the files table ARN; and `dynamodb:PutItem`/`dynamodb:GetItem` scoped to the users table ARN. No wildcard actions, no wildcard resources.
2. Create an IAM user (or role, if running the backend on AWS) and attach that policy.
3. Configure the backend to use those credentials via the AWS SDK's standard credential provider chain (e.g. `~/.aws/credentials`, or environment variables), matching `backend/.env.example`. Never put access keys in `.env` files that get committed.
4. Separately, set `JWT_SECRET` in `backend/.env` to a long random value (e.g. `openssl rand -hex 32`). It signs and verifies login sessions and must never be committed or shared.

## Virus scanning (scaffold, not deployed)

`lambda/` contains a skeleton for an S3-triggered ClamAV scan Lambda that the backend's download gate already expects (uploads stay `pending`, and are not downloadable, until something marks them `clean` in DynamoDB). It has not been deployed or tested from this environment — see `lambda/README.md` before relying on it. Until it's deployed, uploaded files simply stay pending forever, which is the correct fail-closed behavior rather than a bug.

## Cleanup

```bash
aws s3 rm "s3://${S3_BUCKET_NAME}" --recursive
aws s3api delete-bucket --bucket "${S3_BUCKET_NAME}" --region "${AWS_REGION}"
aws dynamodb delete-table --table-name "${FILES_TABLE_NAME}" --region "${AWS_REGION}"
aws dynamodb delete-table --table-name "${USERS_TABLE_NAME}" --region "${AWS_REGION}"
```

Also detach the IAM policy and delete the IAM user/role you created above if you're tearing the project down.
