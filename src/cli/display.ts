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
      process.stdout.write("\r\x1b[2K"); // clear line
    },
  };
}
