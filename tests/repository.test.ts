import assert from "node:assert/strict";
import test from "node:test";
import { ensurePersistentStorage } from "../lib/repository";

function storageManager(
  persisted: () => Promise<boolean>,
  persist: () => Promise<boolean>,
): StorageManager {
  return { persisted, persist } as StorageManager;
}

test("reports storage that is already persistent", async () => {
  const status = await ensurePersistentStorage(
    storageManager(
      async () => true,
      async () => {
        throw new Error("persist should not be called");
      },
    ),
  );
  assert.equal(status, "persistent");
});

test("requests persistence and reports whether it was granted", async () => {
  assert.equal(
    await ensurePersistentStorage(
      storageManager(async () => false, async () => true),
    ),
    "persistent",
  );
  assert.equal(
    await ensurePersistentStorage(
      storageManager(async () => false, async () => false),
    ),
    "best-effort",
  );
});

test("handles unsupported and rejected persistence APIs", async () => {
  assert.equal(await ensurePersistentStorage(undefined), "unsupported");
  assert.equal(
    await ensurePersistentStorage(
      storageManager(
        async () => {
          throw new Error("blocked");
        },
        async () => true,
      ),
    ),
    "best-effort",
  );
});
