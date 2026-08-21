#!/bin/bash
set -euo pipefail

# Required
: "${AWS_REGION:?Set AWS_REGION (e.g. export AWS_REGION=us-east-1)}"
: "${FILES_TABLE_NAME:?Set FILES_TABLE_NAME to match backend/.env}"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
TABLE_ARN="arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${FILES_TABLE_NAME}"

if aws dynamodb describe-table --table-name "${FILES_TABLE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "Table ${FILES_TABLE_NAME} already exists, skipping creation."
else
  # DynamoDB free tier: 25GB storage plus 25 RCU/25 WCU provisioned capacity, permanently (not just 12 months).
  # 5/5 leaves plenty of headroom for a personal project while staying well inside the free tier.
  aws dynamodb create-table \
    --table-name "${FILES_TABLE_NAME}" \
    --region "${AWS_REGION}" \
    --attribute-definitions AttributeName=fileKey,AttributeType=S \
    --key-schema AttributeName=fileKey,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5

  aws dynamodb wait table-exists --table-name "${FILES_TABLE_NAME}" --region "${AWS_REGION}"
  echo "Created table: ${FILES_TABLE_NAME}"
fi

SCRIPT_DIR="$(dirname "$0")"
GENERATED_POLICY="${SCRIPT_DIR}/iam-policy.generated.json"

if [ ! -f "${GENERATED_POLICY}" ]; then
  cp "${SCRIPT_DIR}/iam-policy.example.json" "${GENERATED_POLICY}"
fi
sed -i "s#REPLACE_WITH_DYNAMODB_TABLE_ARN#${TABLE_ARN}#g" "${GENERATED_POLICY}"

echo ""
echo "Table ${FILES_TABLE_NAME} is ready (5/5 provisioned capacity)."
echo "Run create-bucket.sh too if you haven't, to finish iam-policy.generated.json."
