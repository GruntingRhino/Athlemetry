# Neon Setup Guide

This project uses Prisma with Neon Postgres.

## 1) Create Neon database
1. Create a Neon project in the Neon Console.
2. Open **Connect** and copy:
- Pooled connection string (host includes `-pooler`)
- Direct connection string (host without `-pooler`)

## 2) Configure env vars
Set:
- `DATABASE_URL` to pooled string
- `DIRECT_URL` to direct string

Example:
```env
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/dbname?sslmode=require&connect_timeout=15"
DIRECT_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"
```

## 3) Configure storage provider
Use one mode:

### Mode A: Local storage
```env
STORAGE_PROVIDER="local"
VIDEO_RETENTION_HOURS="24"
KEEP_FAILED_VIDEOS_FOR_DEBUG="false"
```

### Mode B: S3-compatible storage (R2/S3/MinIO)
```env
STORAGE_PROVIDER="s3"
S3_BUCKET="your-bucket"
S3_REGION="auto"
S3_ENDPOINT="https://<endpoint>"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_FORCE_PATH_STYLE="false"
VIDEO_RETENTION_HOURS="24"
KEEP_FAILED_VIDEOS_FOR_DEBUG="false"
```

## 4) Apply schema and seed
```bash
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
```

## 5) Deploy to Vercel
Set the same values (`DATABASE_URL`, `DIRECT_URL`, `STORAGE_PROVIDER`, optional `S3_*`, and retention vars) in Vercel project env vars.

## Why two DB URLs?
- `DATABASE_URL` (pooled): app runtime connections
- `DIRECT_URL` (direct): Prisma migration/introspection commands
