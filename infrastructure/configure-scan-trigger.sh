#!/bin/bash
set -euo pipefail

# NOT TESTED. Wires an already-deployed scan Lambda (see infrastructure/lambda/) to fire on
# every new object under uploads/. Run this only after the Lambda function exists.

# Required
: "${S3_BUCKET_NAME:?Set S3_BUCKET_NAME}"
: "${AWS_REGION:?Set AWS_REGION}"
: "${LAMBDA_FUNCTION_ARN:?Set LAMBDA_FUNCTION_ARN to the deployed scan Lambda ARN}"

STATEMENT_ID="AllowS3InvokeScanLambda"

if ! aws lambda get-policy --function-name "${LAMBDA_FUNCTION_ARN}" --region "${AWS_REGION}" 2>/dev/null \
     | grep -q "\"${STATEMENT_ID}\""; then
  aws lambda add-permission \
    --function-name "${LAMBDA_FUNCTION_ARN}" \
    --region "${AWS_REGION}" \
    --statement-id "${STATEMENT_ID}" \
    --action "lambda:InvokeFunction" \
    --principal s3.amazonaws.com \
    --source-arn "arn:aws:s3:::${S3_BUCKET_NAME}"
  echo "Granted S3 permission to invoke the Lambda."
else
  echo "S3 invoke permission already present, skipping."
fi

cat > /tmp/notification.json << EOF
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "${LAMBDA_FUNCTION_ARN}",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            { "Name": "prefix", "Value": "uploads/" }
          ]
        }
      }
    }
  ]
}
EOF

aws s3api put-bucket-notification-configuration \
  --bucket "${S3_BUCKET_NAME}" \
  --region "${AWS_REGION}" \
  --notification-configuration file:///tmp/notification.json
rm -f /tmp/notification.json

echo "Bucket ${S3_BUCKET_NAME} now triggers the scan Lambda on new uploads/* objects."
