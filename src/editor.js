import readline from "node:readline";
import { getMemo, saveMemo } from "./storage.js";
import { getCurrentWorkspace, syncWorkspace } from "./herdr-api.js";
import { copyToClipboard } from "./clipboard.js";

// Setup readline for keypress handling
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

// NOTE: We intentionally do NOT enable terminal mouse tracking escape sequences (\x1b[?1000h etc).
// This allows the terminal emulator (Windows Terminal, Herdr, Ghostty, etc.) to use its
// native mouse text drag-selection and right-click copy without injecting escape codes into stdin.

const currentWs = getCurrentWorkspace();
const workspaceId = currentWs.id;
const workspaceLabel = currentWs.label;

let initialContent = getMemo(workspaceId);
let content = initialContent;
let lines = content ? content.split("\n") : [""];
if (lines.length === 0) lines = [""];

let cursorX = 0;
let cursorY = 0;
let scrollTop = 0;
let statusMessage = "Ctrl+S: Save | ESC: Exit | Ctrl+C: Copy | Ctrl+A: Copy All";
let isDirty = false;

// Simple Undo Stack
const undoStack = [];

function pushUndo() {
  if (undoStack.length > 50) undoStack.shift();
  undoStack.push({
    lines: [...lines],
    cursorX,
    cursorY
  });
}

// Keyboard Selection state (Shift + Arrow keys)
let selectionStart = null; // { line: number, col: number }
let selectionEnd = null;   // { line: number, col: number }

function getTerminalSize() {
  return {
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24
  };
}

function hasSelection() {
  if (!selectionStart || !selectionEnd) return false;
  return selectionStart.line !== selectionEnd.line || selectionStart.col !== selectionEnd.col;
}

function getSortedSelection() {
  if (!hasSelection()) return null;
  const s = selectionStart;
  const e = selectionEnd;
  if (s.line < e.line || (s.line === e.line && s.col <= e.col)) {
    return { start: s, end: e };
  }
  return { start: e, end: s };
}

function getSelectedText() {
  const sel = getSortedSelection();
  if (!sel) return "";

  const { start, end } = sel;
  if (start.line === end.line) {
    const line = lines[start.line] || "";
    return line.slice(start.col, end.col);
  }

  const selectedParts = [];
  selectedParts.push((lines[start.line] || "").slice(start.col));
  for (let l = start.line + 1; l < end.line; l++) {
    selectedParts.push(lines[l] || "");
  }
  selectedParts.push((lines[end.line] || "").slice(0, end.col));

  return selectedParts.join("\n");
}

function clearSelection() {
  selectionStart = null;
  selectionEnd = null;
}

function clampCursor() {
  if (cursorY < 0) cursorY = 0;
  if (cursorY >= lines.length) cursorY = lines.length - 1;
  const currentLineLen = lines[cursorY] ? lines[cursorY].length : 0;
  if (cursorX < 0) cursorX = 0;
  if (cursorX > currentLineLen) cursorX = currentLineLen;
}

function updateScroll() {
  const { rows } = getTerminalSize();
  const visibleHeight = Math.max(1, rows - 4);

  if (cursorY < scrollTop) {
    scrollTop = cursorY;
  } else if (cursorY >= scrollTop + visibleHeight) {
    scrollTop = cursorY - visibleHeight + 1;
  }
}

function render() {
  const { cols, rows } = getTerminalSize();
  clampCursor();
  updateScroll();

  const visibleHeight = Math.max(1, rows - 4);
  let buffer = "\x1b[?25l\x1b[H"; // Hide cursor, move home

  // 1. Header
  const title = ` 📝 Space Memo: [${workspaceLabel} (${workspaceId})] ${isDirty ? "● (Unsaved changes)" : "✓ (Saved)"} `;
  const shortcuts = " [Ctrl+S: Save | ESC: Exit | Ctrl+C: Copy] ";
  const fillLen = Math.max(0, cols - title.length - shortcuts.length);
  const header = `\x1b[7m\x1b[1m${title}${" ".repeat(fillLen)}${shortcuts}\x1b[0m\r\n\x1b[90m${"─".repeat(cols)}\x1b[0m\r\n`;
  buffer += header;

  const sel = getSortedSelection();

  // 2. Body lines
  for (let i = 0; i < visibleHeight; i++) {
    const lineIndex = scrollTop + i;
    if (lineIndex < lines.length) {
      const lineNumStr = String(lineIndex + 1).padStart(3, " ") + " │ ";
      const text = lines[lineIndex];
      const maxTextLen = Math.max(0, cols - 6);

      let renderedText = "";
      if (sel && lineIndex >= sel.start.line && lineIndex <= sel.end.line) {
        // Highlight selection on this line
        let lineSelStart = 0;
        let lineSelEnd = text.length;

        if (lineIndex === sel.start.line) {
          lineSelStart = sel.start.col;
        }
        if (lineIndex === sel.end.line) {
          lineSelEnd = sel.end.col;
        }

        const partBefore = text.slice(0, Math.min(maxTextLen, lineSelStart));
        const partSel = text.slice(Math.min(maxTextLen, lineSelStart), Math.min(maxTextLen, lineSelEnd));
        const partAfter = text.slice(Math.min(maxTextLen, lineSelEnd), maxTextLen);

        renderedText = `${partBefore}\x1b[44m\x1b[37m${partSel}\x1b[0m${partAfter}`;
      } else {
        renderedText = text.slice(0, maxTextLen);
      }

      const visiblePlainLen = text.slice(0, maxTextLen).length;
      const padLen = Math.max(0, cols - lineNumStr.length - visiblePlainLen);
      buffer += `\x1b[90m${lineNumStr}\x1b[0m${renderedText}${" ".repeat(padLen)}\r\n`;
    } else {
      buffer += `\x1b[90m  ~ │\x1b[0m${" ".repeat(Math.max(0, cols - 5))}\r\n`;
    }
  }

  // 3. Footer / Status
  buffer += `\x1b[90m${"─".repeat(cols)}\x1b[0m\r\n`;
  const posStr = ` Ln ${cursorY + 1}/${lines.length}, Col ${cursorX + 1} `;
  const msgStr = ` ${statusMessage} `;
  const footerPad = Math.max(0, cols - msgStr.length - posStr.length);
  buffer += `\x1b[2m${msgStr}${" ".repeat(footerPad)}${posStr}\x1b[0m`;

  // 4. Move cursor to edit position and show
  const screenY = cursorY - scrollTop + 3;
  const screenX = cursorX + 6;
  buffer += `\x1b[${screenY};${screenX}H\x1b[?25h`;

  process.stdout.write(buffer);
}

function saveAndSync() {
  const newContent = lines.join("\n");
  saveMemo(workspaceId, newContent);
  syncWorkspace(workspaceId, newContent);
  isDirty = false;
  statusMessage = `✓ Saved & synced to sidebar! (${new Date().toLocaleTimeString()})`;
  render();
}

function exitEditor() {
  // Clear screen and exit without auto-overwriting unless explicitly saved
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25h");
  process.exit(0);
}

function copyText() {
  if (hasSelection()) {
    const textToCopy = getSelectedText();
    if (textToCopy) {
      copyToClipboard(textToCopy);
      statusMessage = `✓ Selection copied! (${textToCopy.length} chars)`;
    } else {
      statusMessage = "Nothing selected";
    }
  } else {
    // No selection: copy the entire line at current cursor position
    const currentLine = lines[cursorY] !== undefined ? lines[cursorY] : "";
    copyToClipboard(currentLine);
    const preview = currentLine.length > 25 ? currentLine.slice(0, 25) + "..." : currentLine;
    if (currentLine.length > 0) {
      statusMessage = `✓ Line ${cursorY + 1} copied: "${preview}"`;
    } else {
      statusMessage = `✓ Line ${cursorY + 1} (empty line) copied to clipboard`;
    }
  }
  render();
}

// Key handling
process.stdin.on("keypress", (str, key) => {
  if (!key) return;

  // 1. Exit handlers (ESC or Ctrl+Q) - Exits immediately, safe from unwanted auto-save!
  if (key.name === "escape" || (key.ctrl && key.name === "q")) {
    exitEditor();
    return;
  }

  // 2. Clipboard Copy (Ctrl+C) - Copies text and NEVER exits or saves!
  if (key.ctrl && key.name === "c") {
    copyText();
    return;
  }

  // 3. Copy All (Ctrl+A)
  if (key.ctrl && key.name === "a") {
    const fullText = lines.join("\n");
    copyToClipboard(fullText);
    statusMessage = `✓ All text copied to clipboard! (${fullText.length} chars)`;
    render();
    return;
  }

  // 4. Save handler (Ctrl+S) - Explicit save only!
  if (key.ctrl && key.name === "s") {
    saveAndSync();
    return;
  }

  // 5. Undo handler (Ctrl+Z)
  if (key.ctrl && key.name === "z") {
    if (undoStack.length > 0) {
      const prev = undoStack.pop();
      lines = prev.lines;
      cursorX = prev.cursorX;
      cursorY = prev.cursorY;
      isDirty = true;
      statusMessage = "Undo performed";
      render();
    } else {
      statusMessage = "Nothing to undo";
      render();
    }
    return;
  }

  // 6. Shift + Arrow navigation (Keyboard block selection)
  if (key.shift && (key.name === "left" || key.name === "right" || key.name === "up" || key.name === "down")) {
    if (!selectionStart) {
      selectionStart = { line: cursorY, col: cursorX };
    }
    if (key.name === "left") cursorX--;
    if (key.name === "right") cursorX++;
    if (key.name === "up") cursorY--;
    if (key.name === "down") cursorY++;
    clampCursor();
    selectionEnd = { line: cursorY, col: cursorX };
    statusMessage = "Selection active (Ctrl+C: Copy | Any arrow: Clear)";
    render();
    return;
  }

  // 7. Navigation (clears keyboard selection)
  if (key.name === "up") {
    clearSelection();
    cursorY--;
    render();
    return;
  }
  if (key.name === "down") {
    clearSelection();
    cursorY++;
    render();
    return;
  }
  if (key.name === "left") {
    clearSelection();
    cursorX--;
    render();
    return;
  }
  if (key.name === "right") {
    clearSelection();
    cursorX++;
    render();
    return;
  }
  if (key.name === "home") {
    clearSelection();
    cursorX = 0;
    render();
    return;
  }
  if (key.name === "end") {
    clearSelection();
    cursorX = lines[cursorY]?.length || 0;
    render();
    return;
  }
  if (key.name === "pageup") {
    clearSelection();
    const { rows } = getTerminalSize();
    cursorY = Math.max(0, cursorY - (rows - 4));
    render();
    return;
  }
  if (key.name === "pagedown") {
    clearSelection();
    const { rows } = getTerminalSize();
    cursorY = Math.min(lines.length - 1, cursorY + (rows - 4));
    render();
    return;
  }

  // 8. Editing handlers
  if (key.name === "return" || key.name === "enter") {
    pushUndo();
    clearSelection();
    const currentLine = lines[cursorY];
    const leftPart = currentLine.slice(0, cursorX);
    const rightPart = currentLine.slice(cursorX);
    lines[cursorY] = leftPart;
    lines.splice(cursorY + 1, 0, rightPart);
    cursorY++;
    cursorX = 0;
    isDirty = true;
    render();
    return;
  }

  if (key.name === "backspace") {
    pushUndo();
    clearSelection();
    if (cursorX > 0) {
      const line = lines[cursorY];
      lines[cursorY] = line.slice(0, cursorX - 1) + line.slice(cursorX);
      cursorX--;
      isDirty = true;
    } else if (cursorY > 0) {
      // Merge with previous line
      const prevLineLen = lines[cursorY - 1].length;
      lines[cursorY - 1] += lines[cursorY];
      lines.splice(cursorY, 1);
      cursorY--;
      cursorX = prevLineLen;
      isDirty = true;
    }
    render();
    return;
  }

  if (key.name === "delete") {
    pushUndo();
    clearSelection();
    const line = lines[cursorY];
    if (cursorX < line.length) {
      lines[cursorY] = line.slice(0, cursorX) + line.slice(cursorX + 1);
      isDirty = true;
    } else if (cursorY < lines.length - 1) {
      // Merge with next line
      lines[cursorY] += lines[cursorY + 1];
      lines.splice(cursorY + 1, 1);
      isDirty = true;
    }
    render();
    return;
  }

  // Printable character input
  if (!key.ctrl && !key.meta && str && str.length === 1 && str.charCodeAt(0) >= 32) {
    pushUndo();
    clearSelection();
    const line = lines[cursorY] || "";
    lines[cursorY] = line.slice(0, cursorX) + str + line.slice(cursorX);
    cursorX += str.length;
    isDirty = true;
    render();
    return;
  }
});

// Cleanup on signals
process.on("SIGINT", exitEditor);
process.on("SIGTERM", exitEditor);
process.on("exit", () => {
  process.stdout.write("\x1b[?25h");
});

// Resize handler
process.stdout.on("resize", () => {
  render();
});

// Initial render
render();
