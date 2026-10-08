import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomInt } from "node:crypto";
import { allowClientAttempt } from "../../src/lib/access";
import { prisma } from "../../src/lib/prisma";

test("trusted proxy IP limits are persistent, atomic and fail closed", async () => {
  const address = `2001:db8:${randomInt(65536).toString(16)}:${randomInt(65536).toString(16)}::1`;
  const key = createHash("sha256").update(`client:login:${address}`).digest("hex");
  const previous = process.env.TRUST_PROXY;
  try {
    process.env.TRUST_PROXY = "false";
    assert.equal(await allowClientAttempt(undefined, "login"), true);
    process.env.TRUST_PROXY = "true";
    assert.equal(await allowClientAttempt(undefined, "login"), false);
    assert.equal(await allowClientAttempt("spoofed, 127.0.0.1", "login"), false);
    const results = await Promise.all(Array.from({ length: 45 }, () => allowClientAttempt(address, "login")));
    assert.equal(results.filter(Boolean).length, 40);
    assert.equal((await prisma.accessAttempt.findUniqueOrThrow({ where: { key } })).count, 45);
    assert.equal(await allowClientAttempt(address, "login"), false);
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = previous;
    await prisma.accessAttempt.deleteMany({ where: { key } });
    await prisma.$disconnect();
  }
});
