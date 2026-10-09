import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import webpush from "web-push";
const command = resolve("scripts/setup-push.mjs");
function fixture(content: string, check: (path: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "afaire-push-test-")); const path = join(directory, ".env");
  try { writeFileSync(path, content); check(path); } finally { rmSync(directory, { recursive: true, force: true }); }
}
function run(path: string, ...args: string[]) { return spawnSync(process.execPath, [command, "--env", path, ...args], { encoding: "utf8" }); }
test("Push setup saves a matching key pair without printing secrets and is idempotent", () => {
  fixture("# keep comments\nDATABASE_URL=secret-test-db\nNEXTAUTH_URL=https://planner.example\n", path => {
    const first = run(path); assert.equal(first.status, 0, first.stderr);
    const saved = readFileSync(path, "utf8"), values = dotenv.parse(saved);
    assert.equal(values.DATABASE_URL, "secret-test-db"); assert.ok(saved.startsWith("# keep comments\n"));
    assert.equal(values.VAPID_SUBJECT, "https://planner.example");
    assert.equal(Buffer.from(values.VAPID_PUBLIC_KEY, "base64url").length, 65);
    assert.equal(Buffer.from(values.VAPID_PRIVATE_KEY, "base64url").length, 32);
    assert.ok(!first.stdout.includes(values.VAPID_PRIVATE_KEY)); assert.ok(!first.stdout.includes("secret-test-db"));
    const second = run(path); assert.equal(second.status, 0, second.stderr); assert.equal(readFileSync(path, "utf8"), saved);
    assert.equal(existsSync(path + ".push-setup.lock"), false);
  });
});
test("Push setup fills empty variables and keeps Windows line endings", () => {
  fixture("DATABASE_URL=keep\r\nVAPID_PUBLIC_KEY=\r\nVAPID_PRIVATE_KEY=\r\nVAPID_SUBJECT=\r\n", path => {
    const result = run(path, "--subject", "mailto:contact@example.com"); assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(path, "utf8"); assert.equal(dotenv.parse(saved).VAPID_SUBJECT, "mailto:contact@example.com");
    assert.equal(saved.replaceAll("\r\n", "").includes("\n"), false); assert.equal((saved.match(/VAPID_PUBLIC_KEY=/g) ?? []).length, 1);
  });
});
test("Push setup keeps existing keys when adding a missing contact", () => {
  const keys = webpush.generateVAPIDKeys();
  fixture(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`, path => {
    assert.equal(run(path, "--subject", "https://planner.example").status, 0);
    const values = dotenv.parse(readFileSync(path, "utf8")); assert.equal(values.VAPID_PUBLIC_KEY, keys.publicKey); assert.equal(values.VAPID_PRIVATE_KEY, keys.privateKey);
  });
});
test("Push setup refuses partial or mismatched keys without modifying the file", () => {
  const first = webpush.generateVAPIDKeys(), second = webpush.generateVAPIDKeys();
  for (const original of [`VAPID_PUBLIC_KEY=${first.publicKey}\n`, `VAPID_PUBLIC_KEY=${first.publicKey}\nVAPID_PRIVATE_KEY=${second.privateKey}\n`]) {
    fixture(original, path => { const result = run(path, "--subject", "https://planner.example"); assert.equal(result.status, 1); assert.equal(readFileSync(path, "utf8"), original); assert.equal(existsSync(path + ".push-setup.lock"), false); assert.ok(!result.stderr.includes(first.publicKey)); });
  }
});
test("Push setup refuses missing or unsafe contact without writing keys", () => {
  for (const subject of [undefined, "http://planner.example", "https://localhost", "https://127.0.0.1", "https://planner.example\nINJECTED=true"]) {
    fixture("NEXTAUTH_URL=http://127.0.0.1:3000\n", path => {
      const before = readFileSync(path, "utf8"); const result = run(path, ...(subject ? ["--subject", subject] : []));
      assert.equal(result.status, 1); assert.equal(readFileSync(path, "utf8"), before);
    });
  }
});
test("Push setup refuses concurrent writers and missing env files", () => {
  fixture("NEXTAUTH_URL=https://planner.example\n", path => {
    writeFileSync(path + ".push-setup.lock", "existing"); assert.equal(run(path).status, 1); assert.equal(readFileSync(path + ".push-setup.lock", "utf8"), "existing");
    assert.equal(run(path + ".missing").status, 1);
  });
});
