import readline from "readline";

const TIMEOUT_MS = 30_000;

export function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      resolve(value);
    };

    const timer = setTimeout(() => {
      console.log("\n(Timed out — defaulting to no)");
      settle(false);
    }, TIMEOUT_MS);

    rl.question(`${question} [y/N] (30s): `, (answer) => {
      settle(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
