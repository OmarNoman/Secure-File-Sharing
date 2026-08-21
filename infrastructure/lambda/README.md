# Virus Scan Lambda (scaffold only, not deployed, not tested)

This is not a finished feature. It's the shape of a virus-scanning pipeline that fits the rest of this project (S3 event triggers a Lambda, which writes a result back to the same DynamoDB files table the backend already reads), with the actual scanning left as an explicit `TODO` in `scan-handler/index.js`.

It was built and reviewed without ever being deployed to AWS or run against a real event, since that requires a Lambda deployment, packaging, and (for a real ClamAV integration) a container image or layer that couldn't be built and tested in the environment this was written in. Treat everything here as a starting point you verify yourself, not a working feature.

## How it fits the rest of the app

1. `backend/src/services/metadataService.js` already sets `scanStatus: "pending"` on every upload, and `assertDownloadAllowed` already refuses to generate a download URL for anything that isn't `scanStatus: "clean"`. That part is real, tested, and works today, independent of whether this Lambda ever gets deployed. Without it, every upload just stays `pending` forever and is never downloadable, which is the correct fail-closed behavior.
2. `scan-handler/index.js` is meant to be deployed as a Lambda, triggered by S3 `ObjectCreated` events on `uploads/*`. For each event it downloads the object and is supposed to scan it, then writes `scanStatus: "clean"` or `"infected"` directly to the files table via `dynamodb:UpdateItem`, using its own IAM role (not the backend's credentials, and not a callback over HTTP to the backend).
3. `scanFile()` in that handler currently just throws. That's intentional: it means no file can accidentally end up marked `"clean"` without a real scan ever having run. Until you replace it with a real scanner, files uploaded through this app will sit at `pending` and never become downloadable. That's a real limitation for using the app for anything beyond development testing of the upload flow.

## What's missing before this is real

`scanFile()` needs an actual antivirus engine. The two realistic options, per AWS's own guidance for this pattern:

- **A container-image Lambda** bundling the ClamAV engine and running `freshclam` to keep virus definitions current (either at build time, baked into the image, or via a scheduled update job). This is the more self-contained option.
- **A Lambda layer** providing the `clamscan` binary, with virus definitions stored somewhere the Lambda can read at invoke time (commonly EFS, since the definitions are too large to bundle directly and need periodic updates).

Either way, `scanFile()` should return `"clean"` or `"infected"`, and should let errors from the scan engine itself propagate (throw), not swallow them into a default clean/infected result. That's what makes the fail-closed gate actually mean something.

## Deploying (manual, not scripted)

Not automated here, deliberately, since packaging a container image and setting up EFS/layers correctly is easy to get subtly wrong in a way that would be hard to catch without deploying it. Roughly:

1. Finish `scanFile()` with a real ClamAV integration, and `npm install` in `scan-handler/` to vendor the pinned AWS SDK dependencies for whatever packaging method you use.
2. Create an IAM role for the Lambda's execution role, attaching both `iam-policy.example.json` in this directory (filled in with your real bucket/table ARNs, same pattern as `infrastructure/iam-policy.example.json`) and the AWS-managed `AWSLambdaBasicExecutionRole` policy for CloudWatch Logs.
3. Deploy the function (container image via ECR, or zip + layer), setting the `AWS_REGION` and `FILES_TABLE_NAME` environment variables to match `backend/.env`.
4. Run `../configure-scan-trigger.sh` (also untested) with `S3_BUCKET_NAME`, `AWS_REGION`, and `LAMBDA_FUNCTION_ARN` set, to wire the S3 event notification and grant S3 permission to invoke the function. Note this replaces the bucket's entire notification configuration rather than merging with it.
5. Upload a real (benign) test file through the app and confirm in DynamoDB that its `scanStatus` flips from `pending` to `clean`, and that the download link only becomes available after that happens.

## Cost note

Lambda's free tier (1M requests and 400,000 GB-seconds of compute per month, permanently) comfortably covers occasional personal use. A container-image Lambda scanning larger files with more memory will burn through that allowance faster than a small Node function; keep an eye on it if you deploy this for real.
