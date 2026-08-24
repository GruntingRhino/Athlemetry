import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function script(name: string) {
  return readFileSync(path.join(root, "scripts", name), "utf8");
}

describe("encrypted database backup and isolated restore", () => {
  it("creates an encrypted, checksummed, owner-independent PostgreSQL backup", () => {
    const source = script("backup.sh");
    expect(source).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(source).toMatch(/pg_dump[\s\S]*--format=custom/);
    expect(source).toContain("--no-owner");
    expect(source).toContain("--no-acl");
    expect(source).toMatch(/openssl[\s\S]*-aes-256-cbc[\s\S]*-pbkdf2/);
    expect(source).toContain("sha256");
    expect(source).toContain("trap cleanup EXIT");
    expect(source).toContain("backup_complete=false");
    expect(source).toContain('if [[ "$backup_complete" != "true" ]]');
    expect(source).not.toMatch(/pg_dump\s+"\$DATABASE_URL"\s*>/);
  });

  it("restores only after an explicit isolated-target guard", () => {
    const source = script("restore-backup.sh");
    expect(source).toContain("RESTORE_CONFIRM_ISOLATED");
    expect(source).toContain("RESTORE_DATABASE_URL");
    expect(source).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(source).toContain("BACKUP_FILE");
    expect(source).toContain('RESTORE_DATABASE_URL" == "$DATABASE_URL');
    expect(source).toMatch(/openssl[\s\S]*-d[\s\S]*-aes-256-cbc[\s\S]*-pbkdf2/);
    expect(source).toMatch(/pg_restore[\s\S]*--exit-on-error/);
    expect(source).toContain("trap cleanup EXIT");
    expect(source).toContain("ERASURE_LEDGER_FILE");
    expect(source).toContain('DELETE FROM "User"');
  });

  it("exports a separately encrypted current erasure ledger", () => {
    const source = script("export-erasure-ledger.sh");
    expect(source).toContain("ERASURE_LEDGER_DATABASE_URL");
    expect(source).toContain("BACKUP_ENCRYPTION_KEY_FILE");
    expect(source).toContain('FROM "ErasureTombstone"');
    expect(source).toMatch(/openssl[\s\S]*-aes-256-cbc[\s\S]*-pbkdf2/);
    expect(source).toContain("sha256");
  });
});
