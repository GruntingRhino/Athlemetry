# Assumptions

1. Metric extraction is implemented as deterministic rule-based logic (frame metadata + drill heuristics) rather than full computer vision inference to keep MVP cost at $0.
2. The required “real metric extraction” is satisfied by frame-based 20m sprint timing using submitted `frameRate`, `startFrame`, and `finishFrame` markers.
3. Parent-athlete linkage for consent approval is performed by athlete email for MVP; no dedicated family relationship table is required yet.
4. Account deletion is implemented as soft deletion plus credential invalidation to preserve audit/compliance logs.
5. Encryption at rest is delegated to the managed PostgreSQL provider (Neon) and the configured storage provider (filesystem or S3-compatible object storage).
6. Encryption in transit is enforced operationally through HTTPS deployment on Vercel and Neon; local HTTP is allowed only for development.
7. Video compression handling is represented as a deterministic compression-status pipeline stage; actual transcoding is deferred to a later phase.
8. Processing queue execution is synchronous/sequential per batch for free-tier cost control and predictable resource usage.
9. Uploaded videos are temporary processing assets; the system persists metrics and metadata long-term and purges video assets by retention policy (`VIDEO_RETENTION_HOURS`, default 24h).
10. Benchmark anonymization exposes only anonymized benchmark payloads through `/api/v1/benchmarks`; raw peer identity is not returned.
11. Data backup is implemented via `scripts/backup.sh` (`pg_dump`) and assumes runtime/CI environment can access PostgreSQL CLI tools.
12. Seeded admin credentials are development defaults and must be rotated in any non-development environment.
