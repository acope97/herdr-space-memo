import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Returns the state directory path for space-memo plugin.
 */
export function getStateDir() {
  if (process.env.HERDR_PLUGIN_STATE_DIR) {
    return process.env.HERDR_PLUGIN_STATE_DIR;
  }
  const home = os.homedir();
  return path.join(home, ".herdr", "plugin-state", "acope.space-memo");
}

/**
 * Returns the path to the memos.json database file.
 */
export function getDbPath() {
  const dir = getStateDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "memos.json");
}

/**
 * Loads all memos from disk.
 * @returns {Record<string, { content: string, updatedAt: string }>}
 */
export function loadAllMemos() {
  const file = getDbPath();
  if (!fs.existsSync(file)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load memos.json, returning empty database:", err);
    return {};
  }
}

/**
 * Retrieves memo for a specific workspace.
 * @param {string} workspaceId
 * @returns {string}
 */
export function getMemo(workspaceId) {
  const all = loadAllMemos();
  return all[workspaceId]?.content || "";
}

/**
 * Saves memo for a specific workspace.
 * @param {string} workspaceId
 * @param {string} content
 */
export function saveMemo(workspaceId, content) {
  const file = getDbPath();
  const all = loadAllMemos();
  all[workspaceId] = {
    content,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf8");
}

/**
 * Converts multiline memo content into preview tokens suitable for Herdr sidebar.
 * Emits memo_1, memo_2, and memo_more.
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function formatPreviewTokens(content) {
  if (!content || !content.trim()) {
    return {
      memo_1: "",
      memo_2: "",
      memo_more: ""
    };
  }

  const lines = content
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return { memo_1: "", memo_2: "", memo_more: "" };
  }

  const memo_1 = lines[0] ? `📝 ${lines[0]}` : "";
  const memo_2 = lines[1] ? `   ${lines[1]}` : "";
  const memo_more = lines.length > 2 ? `   (▼ +${lines.length - 2} more)` : "";

  return {
    memo_1,
    memo_2,
    memo_more
  };
}
