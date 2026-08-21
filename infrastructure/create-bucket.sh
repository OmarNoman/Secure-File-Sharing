#!/bin/bash
set -euo pipefail

# Required
: "${AWS_REGION:?Set AWS_REGION (e.g. export AWS_REGION=us-east-1)}"
: "${S3_BUCKET_NAME:?Set S3_BUCKET_NAME to a globally unique bucket name}"

# Optional
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-http://localhost:5000}"
UPLOAD_EXPIRATION_DAYS="${UPLOAD_EXPIRATION_DAYS:-7}"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Using AWS account: ${AWS_ACCOUNT_ID}, region: ${AWS_REGION}"

if aws s3api head-bucket --bucket "${S3_BUCKET_NAME}" 2>/dev/null; then
  echo "Bucket ${S3_BUCKET_NAME} already exists, skipping creation."
else
  if [ "${AWS_REGION}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${S3_BUCKET_NAME}" --region "${AWS_REGION}"
  else
    aws s3api create-bucket --bucket "${S3_BUCKET_NAME}" --region "${AWS_REGION}" \
      --create-bucket-configuration LocationConstraint="${AWS_REGION}"
  fi
  echo "Created bucket: ${S3_BUCKET_NAME}"
fi

# Objects stay private; the app grants access only via short-lived presigned URLs.
aws s3api put-public-access-block \
  --bucket "${S3_BUCKET_NAME}" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption \
  --bucket "${S3_BUCKET_NAME}" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Browser uploads PUT directly to S3 from ALLOWED_ORIGIN, so the bucket must allow that cross-origin request.
cat > /tmp/bucket-cors.json << EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["${ALLOWED_ORIGIN}"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["Content-Type", "x-amz-server-side-encryption"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF
aws s3api put-bucket-cors --bucket "${S3_BUCKET_NAME}" --cors-configuration file:///tmp/bucket-cors.json
rm -f /tmp/bucket-cors.json

# Free tier covers 5GB of standard storage; auto-expire uploads so leftover test files don't accumulate cost.
cat > /tmp/lifecycle.json << EOF
{
  "Rules": [
    {
      "ID": "expire-uploads",
      "Filter": {"Prefix": "uploads/"},
      "Status": "Enabled",
      "Expiration": {"Days": ${UPLOAD_EXPIRATION_DAYS}}
    }
  ]
}
EOF
aws s3api put-bucket-lifecycle-configuration --bucket "${S3_BUCKET_NAME}" --lifecycle-configuration file:///tmp/lifecycle.json
rm -f /tmp/lifecycle.json

SCRIPT_DIR="$(dirname "$0")"
GENERATED_POLICY="${SCRIPT_DIR}/iam-policy.generated.json"

if [ ! -f "${GENERATED_POLICY}" ]; then
  cp "${SCRIPT_DIR}/iam-policy.example.json" "${GENERATED_POLICY}"
fi
sed -i "s/REPLACE_WITH_BUCKET_NAME/${S3_BUCKET_NAME}/g" "${GENERATED_POLICY}"

echo ""
echo "Bucket ${S3_BUCKET_NAME} is configured: public access blocked, default encryption on,"
echo "CORS allows PUT from ${ALLOWED_ORIGIN}, uploads/* expire after ${UPLOAD_EXPIRATION_DAYS} days."
echo ""
echo "Run create-table.sh next to provision the DynamoDB metadata table and finish"
echo "iam-policy.generated.json. Neither script creates an IAM user or role automatically;"
echo "review the generated policy and attach it yourself."
