# Infrastructure

Provisions the private S3 bucket and DynamoDB table the backend needs. Nothing here runs automatically; you run it yourself with your own AWS credentials, as this creates real resources in your AWS account.

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

## What `create-table.sh` does

```bash
export AWS_REGION=us-east-1
export FILES_TABLE_NAME=your-table-name

./create-table.sh
```

1. Creates the DynamoDB table if it doesn't already exist (idempotent), with `fileKey` (string) as the sole partition key — matching what `backend/src/services/metadataService.js` writes.
2. Uses `PROVISIONED` billing mode at 5 read/5 write capacity units, well inside the DynamoDB free tier (25 GB storage plus 25 RCU/25 WCU, permanently — not just the first 12 months like most other free tier offers).
3. Fills in the `dynamodb:PutItem`/`dynamodb:Scan` statement of `iam-policy.generated.json` with your real table ARN.

Run both scripts (either order) before starting the backend, since it needs both the bucket and the table to exist.

## IAM (manual step, on purpose)

Neither script creates an IAM user or role. Creating identities and attaching permissions is left to you:

1. Review `iam-policy.generated.json` after running both scripts above. It should grant only `s3:PutObject`/`s3:GetObject` scoped to `arn:aws:s3:::<your-bucket>/uploads/*`, and `dynamodb:PutItem`/`dynamodb:Scan` scoped to your table's ARN. No wildcard actions, no wildcard resources.
2. Create an IAM user (or role, if running the backend on AWS) and attach that policy.
3. Configure the backend to use those credentials via the AWS SDK's standard credential provider chain (e.g. `~/.aws/credentials`, or environment variables), matching `backend/.env.example`. Never put access keys in `.env` files that get committed.

## Cleanup

```bash
aws s3 rm "s3://${S3_BUCKET_NAME}" --recursive
aws s3api delete-bucket --bucket "${S3_BUCKET_NAME}" --region "${AWS_REGION}"
aws dynamodb delete-table --table-name "${FILES_TABLE_NAME}" --region "${AWS_REGION}"
```

Also detach the IAM policy and delete the IAM user/role you created above if you're tearing the project down.
