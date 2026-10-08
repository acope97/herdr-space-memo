import assert from "node:assert";
import fs from "node:fs";
import { saveMemo, getMemo, loadAllMemos, formatPreviewTokens, getDbPath } from "./storage.js";

console.log("=== RUNNING SPACE-MEMO TESTS ===");

// 1. Test token formatting
console.log("1. Testing formatPreviewTokens...");
const emptyTokens = formatPreviewTokens("");
assert.strictEqual(emptyTokens.memo_1, "");
assert.strictEqual(emptyTokens.memo_2, "");
assert.strictEqual(emptyTokens.memo_more, "");

const singleLine = formatPreviewTokens("First line memo");
assert.strictEqual(singleLine.memo_1, "📝 First line memo");
assert.strictEqual(singleLine.memo_2, "");
assert.strictEqual(singleLine.memo_more, "");

const multiLine = formatPreviewTokens("Line 1\nLine 2\nLine 3\nLine 4");
assert.strictEqual(multiLine.memo_1, "📝 Line 1");
assert.strictEqual(multiLine.memo_2, "   Line 2");
assert.strictEqual(multiLine.memo_more, "   (▼ +2 more)");
console.log("✓ formatPreviewTokens passed.");

// 2. Test memo storage CRUD
console.log("2. Testing saveMemo & getMemo...");
const testWsId = "test_space_123";
const testContent = "Test Memo Header\nSecond Task\nThird Details";

saveMemo(testWsId, testContent);
const retrieved = getMemo(testWsId);
assert.strictEqual(retrieved, testContent);

const all = loadAllMemos();
assert.ok(all[testWsId]);
assert.strictEqual(all[testWsId].content, testContent);
assert.ok(all[testWsId].updatedAt);
console.log("✓ saveMemo & getMemo passed.");

// 3. Verify database file exists and is valid JSON
const dbPath = getDbPath();
console.log(`Database path: ${dbPath}`);
assert.ok(fs.existsSync(dbPath));
const raw = JSON.parse(fs.readFileSync(dbPath, "utf8"));
assert.strictEqual(raw[testWsId].content, testContent);
console.log("✓ Database file persistence passed.");

console.log("=== ALL TESTS PASSED! ===");
