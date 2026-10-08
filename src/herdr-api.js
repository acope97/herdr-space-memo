import { spawnSync } from "node:child_process";
import { formatPreviewTokens } from "./storage.js";

/**
 * Returns path to the Herdr executable.
 */
export function getHerdrBin() {
  return process.env.HERDR_BIN_PATH || "herdr";
}

/**
 * Executes a Herdr CLI command and returns parsed JSON or null.
 * @param {string[]} args
 * @returns {any}
 */
export function callHerdr(args) {
  const bin = getHerdrBin();
  try {
    const res = spawnSync(bin, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    if (res.status === 0 && res.stdout) {
      try {
        return JSON.parse(res.stdout);
      } catch {
        return res.stdout.trim();
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Resolves current workspace (id and label) from environment or Herdr CLI.
 * @returns {{ id: string, label: string }}
 */
export function getCurrentWorkspace() {
  const envWsId = process.env.HERDR_WORKSPACE_ID;

  // Check HERDR_PLUGIN_CONTEXT_JSON first if available
  let contextWsId = null;
  let contextWsLabel = null;
  if (process.env.HERDR_PLUGIN_CONTEXT_JSON) {
    try {
      const ctx = JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON);
      contextWsId = ctx.workspace_id || ctx.workspace?.workspace_id || null;
      contextWsLabel = ctx.workspace_label || ctx.workspace?.label || null;
    } catch {
      // ignore
    }
  }

  // Query Herdr CLI for live workspace list
  const list = callHerdr(["workspace", "list"]);
  const workspaces = list?.result?.workspaces || list?.workspaces || [];

  if (Array.isArray(workspaces) && workspaces.length > 0) {
    const targetId = envWsId || contextWsId;
    if (targetId) {
      const match = workspaces.find(w => w.workspace_id === targetId || w.id === targetId);
      if (match) {
        return {
          id: match.workspace_id || match.id,
          label: match.label || match.workspace_id || match.id
        };
      }
    }

    // Find currently focused workspace
    const focused = workspaces.find(w => w.focused);
    if (focused) {
      return {
        id: focused.workspace_id || focused.id,
        label: focused.label || focused.workspace_id || focused.id
      };
    }

    return {
      id: workspaces[0].workspace_id || workspaces[0].id,
      label: workspaces[0].label || workspaces[0].workspace_id || workspaces[0].id
    };
  }

  const fallbackId = envWsId || contextWsId || "w1";
  return {
    id: fallbackId,
    label: contextWsLabel || fallbackId
  };
}

/**
 * Resolves current workspace ID string.
 * @returns {string}
 */
export function getCurrentWorkspaceId() {
  return getCurrentWorkspace().id;
}

/**
 * Reports memo tokens to Herdr workspace metadata so they render in the sidebar.
 * @param {string} workspaceId
 * @param {Record<string, string>} tokens
 */
export function reportWorkspaceMetadata(workspaceId, tokens) {
  const bin = getHerdrBin();
  const args = [
    "workspace",
    "report-metadata",
    "--source",
    "space-memo",
    workspaceId
  ];

  for (const [key, value] of Object.entries(tokens)) {
    if (value && value.trim()) {
      args.push("--token", `${key}=${value}`);
    } else {
      args.push("--clear-token", key);
    }
  }

  try {
    spawnSync(bin, args, {
      stdio: "ignore",
      windowsHide: true
    });
  } catch (err) {
    console.error("Failed to report metadata to Herdr:", err);
  }
}

/**
 * Syncs a single workspace's memo to the Herdr sidebar.
 * @param {string} workspaceId
 * @param {string} content
 */
export function syncWorkspace(workspaceId, content) {
  const tokens = formatPreviewTokens(content);
  reportWorkspaceMetadata(workspaceId, tokens);
}
