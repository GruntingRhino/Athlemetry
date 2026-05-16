# Phase 2 Checklist

## Uploads
- [ ] Drill instruction video plays inline on drill detail page
- [ ] Video upload accepts MP4, MOV, and AVI; rejects all other formats with a user-facing error message
- [ ] File size validation rejects uploads exceeding the configured limit with a user-facing message
- [ ] Upload progress bar updates in real time during file transfer
- [ ] Drill submission tagged with date, location, and drill type at submission time
- [ ] Video compression applied server-side; stored file is smaller than original
- [ ] Submitted drill appears in drill history archive within 10 seconds of upload completing
- [ ] Processing queue receives job within 5 seconds of upload completion
- [ ] Submission status transitions correctly: pending → processing → completed or failed
- [ ] Failed submission displays error reason to the athlete on the history page

## Dashboards
- [ ] Drill history timeline displays all submissions sorted newest-first
- [ ] Drill frequency summary shows count of submissions per drill type

## Infrastructure
- [ ] Video files stored in cloud object storage with pre-signed URLs for authenticated retrieval
- [ ] Background worker consumes queue jobs and updates submission status on completion
- [ ] Upload system retries or resumes on network interruption without creating duplicate submissions
- [ ] Queue depth is observable in admin or ops tooling without manual database query
