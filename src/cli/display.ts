import type { RedFinding, BlueFix } from "../types.js";


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

export function printBlueFindings(fix: BlueFix): void {
  console.log(`\n${"\x1b[34m"}${B}[Blue Agent]${RESET} ${DIM}${fix.file}${RESET}`);
  console.log(`${DIM}chunk: ${fix.chunk_id}${RESET}\n`);

  if (fix.fixes.length === 0) {
    console.log(`  ${DIM}No fixes generated for this chunk.${RESET}\n`);
    return;
  }

  for (const f of fix.fixes) {
    console.log(`  ${G}✔${RESET} ${B}${f.title}${RESET}`);
    console.log(`    ${DIM}affected: ${f.affected}${RESET}`);
    console.log(`    ${f.explanation}`);
    console.log(`\n    ${Y}Fix:${RESET}`);
    console.log(`    ${f.fix}\n`);
  }
}