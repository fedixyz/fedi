# Bug Report API

## Overview

The bug report flow consists of 2 APIs:

1. `POST /api/bug-report/generate-upload-url`
2. `POST /api/bug-report/submit`

Submitting a bug report does the following:

1. The app generates a tar.gz of log files, device info, and related media (screenshots, video)
2. The app generates a UUID for the bug report and hits `/generate-upload-url` to get a pre-signed S3 upload URL
3. The app uploads the tar.gz file to S3 which can be accessed at `[bucket]/[uuid].tar.gz`
4. The app submits a bug report using the same UUID to `/submit` with relevant metadata
5. The API appends a row to a Google Sheet with the report

## Setup

To use these endpoints, you need to provide the following environment variables:

-   `AWS_ACCESS_KEY_ID`
-   `AWS_SECRET_ACCESS_KEY`
-   `AWS_REGION`
-   `AWS_BUG_REPORT_BUCKET_NAME`

The easiest way to do this is to copy `ui/web/.env.development` to `ui/web/.env.local` and fill in the values.

### AWS Setup

1. [Create a new S3 bucket](https://s3.console.aws.amazon.com/s3/bucket/create?region=us-east-1) with default permissions
    - Note the bucket name and region, fill out `AWS_REGION` and `AWS_BUG_REPORT_BUCKET_NAME` accordingly
2. [Create a new IAM Policy](https://us-east-1.console.aws.amazon.com/iam/home?region=us-east-1#/policies/create) that provides write access to the bucket
    ```json
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "VisualEditor0",
                "Effect": "Allow",
                "Action": "s3:PutObject",
                "Resource": "arn:aws:s3:::bucket-name-here/*"
            }
        ]
    }
    ```
3. [Create a new IAM user](https://us-east-1.console.aws.amazon.com/iam/home?region=us-east-1#/users/create) with that IAM Policy attached to it
4. Create an access key for the IAM user
    - Select "Application running outside AWS"
    - Copy the access key and secret access key to `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` respectively

### Notion Setup

1. Create a test Notion Workspace, or use a Notion Workspace that you have owner permissions in
2. Copy the workspace ID and set it as `NOTION_WORKSPACE_ID`
    - The workspace ID is the first part of the path on notion, e.g. it's `fedi21` in `https://www.notion.so/fedi21`
3. Create a new [Notion Integration](https://www.notion.so/my-integrations)
4. Copy the secret key and set it as `NOTION_SECRET_KEY`
5. Copy the database format from the Fedi workspace's ["Bug report submissions" table](https://www.notion.so/fedi21/fcee02514ee44f2d86dcda14885569b9)
6. Copy the database ID from the URL of the page and set it as `NOTION_DATABASE_ID`
    - The ID is the second part of the path on notion, e.g. it's `abc123` in `https://www.notion.so/fedi21/abc123`

### Slack Setup

1. Create a [new Slack App](https://api.slack.com/apps?new_app=1)
2. Go to "Incoming Webhooks" and create a new webhook and set it as `SLACK_WEBHOOK_URL`

_Note: Slack is not necessary for the API endpoint to function_
