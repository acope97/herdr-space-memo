import { spawn } from "node:child_process";
import os from "node:os";

/**
 * Copies text to the system clipboard and emits OSC 52 terminal sequence.
 * @param {string} text
 */
export function copyToClipboard(text) {
  if (typeof text !== "string" || text.length === 0) {
    return false;
  }

  // 1. OSC 52 sequence (Universal terminal clipboard copy)
  // Works in Windows Terminal, Alacritty, iTerm2, Kitty, Ghostty, Herdr, tmux, etc.
  try {
    const base64 = Buffer.from(text, "utf8").toString("base64");
    process.stdout.write(`\x1b]52;c;${base64}\x07`);
  } catch {
    // ignore
  }

  // 2. Native OS clipboard command
  const platform = os.platform();
  try {
    if (platform === "win32") {
      const p = spawn("clip.exe", { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
      p.stdin.end(text, "utf8");
    } else if (platform === "darwin") {
      const p = spawn("pbcopy", { stdio: ["pipe", "ignore", "ignore"] });
      p.stdin.end(text, "utf8");
    } else {
      // Linux: try wl-copy, fallback to xclip
      try {
        const p = spawn("wl-copy", { stdio: ["pipe", "ignore", "ignore"] });
        p.stdin.end(text, "utf8");
        p.on("error", () => {
          const p2 = spawn("xclip", ["-selection", "clipboard"], { stdio: ["pipe", "ignore", "ignore"] });
          p2.stdin.end(text, "utf8");
        });
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.error("Native clipboard error:", err);
  }

  return true;
}
