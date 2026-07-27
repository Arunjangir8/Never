import readline from "readline";

let replInterface: readline.Interface | null = null;

export function setReplInterface(rl: readline.Interface | null): void {
  replInterface = rl;
}

const isYes = (answer: string): boolean => answer.trim().toLowerCase() === "y";

function ask(message: string): Promise<string> {
  const repl = replInterface;

  if (repl) {
    return new Promise((resolve) => repl.question(message, resolve));
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function askChoice<T extends string>(
  message: string,
  choices: readonly T[]
): Promise<T> {
  for (;;) {
    const answer = (await ask(message)).trim().toLowerCase();
    if (!answer) return choices[0]!;
    const match = choices.find((c) => c === answer);
    if (match) return match;
    console.log(`\x1b[2mPick one of: ${choices.join(" / ")}\x1b[0m`);
  }
}

export function askUserPermission(message: string): Promise<boolean> {
  const repl = replInterface;

  if (repl) {
    return new Promise((resolve) => {
      repl.question(message, (answer) => resolve(isYes(answer)));
    });
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(message, (answer) => {
      rl.close();
      resolve(isYes(answer));
    });
  });
}
