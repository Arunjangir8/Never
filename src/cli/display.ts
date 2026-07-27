import type { RedFinding, FileUpdate, SubTask } from "../types.js";


const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const B = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const BANNER = `${C}${B}
  ██████╗ ██████╗ ████████╗██╗███╗   ███╗██╗   ██╗███████╗
 ██╔═══██╗██╔══██╗╚══██╔══╝██║████╗ ████║██║   ██║██╔════╝
 ██║   ██║██████╔╝   ██║   ██║██╔████╔██║██║   ██║███████╗
 ██║   ██║██╔═══╝    ██║   ██║██║╚██╔╝██║██║   ██║╚════██║
 ╚██████╔╝██║        ██║   ██║██║ ╚═╝ ██║╚██████╔╝███████║
  ╚═════╝ ╚═╝        ╚═╝   ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝
${RESET}${DIM}  Local RAG Coding Assistant · Powered by Ollama + ChromaDB${RESET}
`;

export function printBanner(): void {
  console.log(BANNER);
}

export function printSources(sources: string[]): void {
  console.log(`${DIM}Context from: ${sources.join(", ")}${RESET}`);
}

export function printModel(model: string): void {
  console.log(`${DIM}Model: ${model}${RESET}`);
}

export function printSeparator(): void {
  console.log(`${DIM}${"─".repeat(60)}${RESET}`);
}

export function printError(msg: string): void {
  console.error(`${R}✖ ${msg}${RESET}`);
}

export function printSuccess(msg: string): void {
  console.log(`${G}✔ ${msg}${RESET}`);
}

export function spinner(message: string): { stop: () => void } {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${C}${frames[i++ % frames.length]}${RESET} ${message}`);
  }, 80);
  return {
    stop: () => {
      clearInterval(id);
      process.stdout.write("\r\x1b[2K");
    },
  };
}


const GREY = "\x1b[90m";

export function printPlan(tasks: SubTask[]): void {
  console.log(`\n${C}${B}◆ Plan${RESET} ${DIM}${tasks.length} step(s)${RESET}\n`);
  tasks.forEach((t, i) => {
    const tag = t.action === "create" ? `${G}create${RESET}` : `${Y}edit  ${RESET}`;
    console.log(`  ${DIM}${String(i + 1).padStart(2)}.${RESET} ${tag}  ${B}${t.file || "(auto)"}${RESET}`);
    console.log(`      ${DIM}${t.goal}${RESET}`);
  });
  console.log("");
}

export type TaskState = "done" | "skipped" | "failed" | "pending";

const DOT: Record<TaskState, string> = {
  done: `${G}●${RESET}`,
  skipped: `${GREY}○${RESET}`,
  failed: `${R}●${RESET}`,
  pending: `${DIM}·${RESET}`,
};

export function printTaskHeader(
  index: number,
  total: number,
  task: SubTask,
  states: TaskState[]
): void {
  const bar = Array.from({ length: total }, (_, i) =>
    i === index ? `${C}◉${RESET}` : DOT[states[i] ?? "pending"]
  ).join(" ");

  console.log(`\n${DIM}${"─".repeat(60)}${RESET}`);
  console.log(
    `${C}${B}▸ Step ${index + 1}/${total}${RESET}  ${bar}   ${B}${task.file || "(auto)"}${RESET}`
  );
  console.log(`  ${DIM}${task.goal}${RESET}\n`);
}

export function printRunSummary(states: TaskState[]): void {
  const count = (s: TaskState) => states.filter((x) => x === s).length;
  printSeparator();
  console.log(
    `${B}Done.${RESET} ${G}${count("done")} applied${RESET}` +
      `${DIM} · ${count("skipped")} skipped · ${RESET}${R}${count("failed")} failed${RESET}\n`
  );
}

// DIFF
// ponytail: common prefix/suffix trim, not a real LCS. One contiguous hunk per
// file — fine for the localised edits an LLM makes. Swap in an LCS diff only if
// multi-region edits start rendering as one giant block.
export function diffHunk(
  oldText: string,
  newText: string
): { start: number; removed: string[]; added: string[] } {
  const a = oldText.split("\n");
  const b = newText.split("\n");

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let tail = 0;
  while (
    tail < a.length - start &&
    tail < b.length - start &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  return {
    start,
    removed: a.slice(start, a.length - tail),
    added: b.slice(start, b.length - tail),
  };
}

const MAX_DIFF_LINES = 24;

function printLines(lines: string[], sign: string, color: string, from: number): void {
  const shown = lines.slice(0, MAX_DIFF_LINES);
  shown.forEach((l, i) => {
    console.log(`   ${DIM}${String(from + i).padStart(4)}${RESET} ${color}${sign} ${l}${RESET}`);
  });
  if (lines.length > shown.length) {
    console.log(`   ${DIM}      … ${lines.length - shown.length} more ${sign === "-" ? "removed" : "added"} line(s)${RESET}`);
  }
}

export function printDiff(update: FileUpdate, oldContent: string | null): void {
  if (update.type === "patchs") {
    console.log(`  ${B}${update.relativePath}${RESET} ${DIM}· ${update.patches.length} patch(es)${RESET}\n`);
    for (const p of update.patches) {
      printLines(p.find.split("\n"), "-", R, 1);
      printLines(p.replace.split("\n"), "+", G, 1);
      console.log("");
    }
    return;
  }

  const next = update.content;

  if (oldContent === null) {
    const lines = next.split("\n");
    console.log(`  ${B}${update.relativePath}${RESET} ${G}new file · +${lines.length}${RESET}\n`);
    printLines(lines, "+", G, 1);
    console.log("");
    return;
  }

  const { start, removed, added } = diffHunk(oldContent, next);

  if (removed.length === 0 && added.length === 0) {
    console.log(`  ${B}${update.relativePath}${RESET} ${DIM}· no change${RESET}\n`);
    return;
  }

  console.log(
    `  ${B}${update.relativePath}${RESET} ${G}+${added.length}${RESET} ${R}-${removed.length}${RESET}` +
      `${DIM} · from line ${start + 1}${RESET}\n`
  );
  printLines(removed, "-", R, start + 1);
  printLines(added, "+", G, start + 1);
  console.log("");
}

export function printRedFindings(finding: RedFinding): void {
  console.log(`\n${R}${B}[Red Agent]${RESET} ${DIM}${finding.file}${RESET}`);
  console.log(`${DIM}chunk: ${finding.chunk_id}${RESET}\n`);

  if (finding.bugs.length > 0) {
    console.log(`${R}${B}  Bugs (${finding.bugs.length})${RESET}`);
    for (const bug of finding.bugs) {
      console.log(`  ${R}✖${RESET} ${B}${bug.title}${RESET}`);
      console.log(`    ${DIM}affected: ${bug.affected}${RESET}`);
      console.log(`    ${bug.explanation}\n`);
    }
  }

  if (finding.edge_cases.length > 0) {
    console.log(`${Y}${B}  Edge Cases (${finding.edge_cases.length})${RESET}`);
    for (const ec of finding.edge_cases) {
      console.log(`  ${Y}⚠${RESET} ${B}${ec.title}${RESET}`);
      console.log(`    ${DIM}affected: ${ec.affected}${RESET}`);
      console.log(`    ${ec.explanation}\n`);
    }
  }

  if (finding.risks.length > 0) {
    console.log(`${C}${B}  Risks (${finding.risks.length})${RESET}`);
    for (const risk of finding.risks) {
      console.log(`  ${C}◆${RESET} ${B}${risk.title}${RESET}`);
      console.log(`    ${DIM}affected: ${risk.affected}${RESET}`);
      console.log(`    ${risk.explanation}\n`);
    }
  }

  if (
    finding.bugs.length === 0 &&
    finding.edge_cases.length === 0 &&
    finding.risks.length === 0
  ) {
    console.log(`  ${G}✔ No issues found in this chunk${RESET}\n`);
  }
}

const PREVIEW_LINES = 30;

function preview(content: string): string {
  const lines = content.split("\n");
  const shown = lines.slice(0, PREVIEW_LINES).map((l) => `      ${l}`);
  if (lines.length > PREVIEW_LINES) {
    shown.push(`      ${DIM}… ${lines.length - PREVIEW_LINES} more lines${RESET}`);
  }
  return shown.join("\n");
}

export function printBlueFindings(updates: FileUpdate[]): void {
  console.log(`\n\x1b[34m[Blue Agent]\x1b[0m\n`);

  if (!updates || updates.length === 0) {
    console.log(`  ${DIM}No fixes generated.${RESET}\n`);
    return;
  }

  for (const update of updates) {
    console.log(`  ${G}✔${RESET} \x1b[34m${update.relativePath}${RESET}`);
    console.log(`    ${DIM}type: ${update.type}${RESET}`);
    console.log(`    ${update.summary}`);

    if (update.type === "fullfile" || update.type === "createNew") {
      const label = update.type === "fullfile" ? "Full File" : "New File";
      console.log(`\n    ${Y}${label}:${RESET}`);
      console.log(`${preview(update.content)}\n`);
    }

    if (update.type === "patchs") {
      console.log(`\n    ${Y}Patches:${RESET}`);
      for (const p of update.patches) {
        console.log(`      ${R}- find:${RESET} ${p.find}`);
        console.log(`      ${G}+ replace:${RESET} ${p.replace}\n`);
      }
    }

    console.log("");
  }
}