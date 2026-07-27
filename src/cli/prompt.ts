import readline from "readline";

let replInterface: readline.Interface | null = null;

export function setReplInterface(rl: readline.Interface | null): void {
  replInterface = rl;
}

const isYes = (answer: string): boolean => answer.trim().toLowerCase() === "y";

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
