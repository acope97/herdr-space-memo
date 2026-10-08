import { loadAllMemos } from "./storage.js";
import { syncWorkspace } from "./herdr-api.js";

/**
 * Startup synchronization hook.
 * Reads all persisted memos and reports them to Herdr so they display in the sidebar.
 */
function main() {
  const allMemos = loadAllMemos();
  const entries = Object.entries(allMemos);

  if (entries.length === 0) {
    console.log("[space-memo] No existing memos to restore.");
    process.exit(0);
  }

  console.log(`[space-memo] Restoring ${entries.length} workspace memo(s) to sidebar...`);

  for (const [workspaceId, memo] of entries) {
    if (memo && memo.content) {
      syncWorkspace(workspaceId, memo.content);
      console.log(`[space-memo] Restored memo for workspace: ${workspaceId}`);
    }
  }

  console.log("[space-memo] All memos restored successfully.");
  process.exit(0);
}

main();
