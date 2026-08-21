#!/bin/bash
set -euo pipefail

# Required
: "${AWS_REGION:?Set AWS_REGION (e.g. export AWS_REGION=us-east-1)}"
: "${USERS_TABLE_NAME:?Set USERS_TABLE_NAME to match backend/.env}"

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
TABLE_ARN="arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${USERS_TABLE_NAME}"

if aws dynamodb describe-table --table-name "${USERS_TABLE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "Table ${USERS_TABLE_NAME} already exists, skipping creation."
else
  # Same free tier headroom as create-table.sh: well under the permanent 25 RCU/25 WCU allowance.
  aws dynamodb create-table \
    --table-name "${USERS_TABLE_NAME}" \
    --region "${AWS_REGION}" \
    --attribute-definitions AttributeName=username,AttributeType=S \
    --key-schema AttributeName=username,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5

  aws dynamodb wait table-exists --table-name "${USERS_TABLE_NAME}" --region "${AWS_REGION}"
  echo "Created table: ${USERS_TABLE_NAME}"
fi

SCRIPT_DIR="$(dirname "$0")"
GENERATED_POLICY="${SCRIPT_DIR}/iam-policy.generated.json"

if [ ! -f "${GENERATED_POLICY}" ]; then
  cp "${SCRIPT_DIR}/iam-policy.example.json" "${GENERATED_POLICY}"
fi
sed -i "s#REPLACE_WITH_DYNAMODB_USERS_TABLE_ARN#${TABLE_ARN}#g" "${GENERATED_POLICY}"

echo ""
echo "Table ${USERS_TABLE_NAME} is ready (5/5 provisioned capacity)."
echo "Run create-bucket.sh and create-table.sh too if you haven't, to finish iam-policy.generated.json."
