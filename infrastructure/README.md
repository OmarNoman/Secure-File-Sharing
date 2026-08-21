# Infrastructure

Provisions the private S3 bucket the backend needs. Nothing here runs automatically; you run it yourself with your own AWS credentials, as this creates real resources in your AWS account.

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

6. Generates `iam-policy.generated.json` from `iam-policy.example.json` with your real bucket name filled in. This file is gitignored.

## IAM (manual step, on purpose)

The script does not create an IAM user or role. Creating identities and attaching permissions is left to you:

1. Review `iam-policy.generated.json`. It grants only `s3:PutObject` and `s3:GetObject`, scoped to `arn:aws:s3:::<your-bucket>/uploads/*`. No wildcard actions, no wildcard resources.
2. Create an IAM user (or role, if running the backend on AWS) and attach that policy.
3. Configure the backend to use those credentials via the AWS SDK's standard credential provider chain (e.g. `~/.aws/credentials`, or environment variables), matching `backend/.env.example`. Never put access keys in `.env` files that get committed.

## Cleanup

```bash
aws s3 rm "s3://${S3_BUCKET_NAME}" --recursive
aws s3api delete-bucket --bucket "${S3_BUCKET_NAME}" --region "${AWS_REGION}"
```

Also detach the IAM policy and delete the IAM user/role you created above if you're tearing the project down.
