import { ChatOllama } from "@langchain/ollama";

const llm = new ChatOllama({
  model: "gemma:7b",
  baseUrl: "http://127.0.0.1:11434",
});

async function run() {
  const res = await llm.invoke("Hello Buddy");
  console.log(res.content);
}

run();
