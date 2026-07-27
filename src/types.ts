export type PatchEntry = {
  find: string;
  replace: string;
};

export type FileUpdate =
  | { type: "fullfile"; relativePath: string; content: string; summary: string }
  | { type: "patchs"; relativePath: string; patches: PatchEntry[]; summary: string }
  | { type: "createNew"; relativePath: string; content: string; summary: string };

export interface SubTask {
  file: string;
  action: "edit" | "create";
  goal: string;
}

export interface QueryResult {
  filePath: string;
  content: string;
  score: number;
  startLine: number;
  endLine: number;
}

export interface DirectFile {
  filePath: string;
  content: string;
}

export interface FileChunk {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
}

// Red Agent

export interface Issue {
  title: string;
  explanation: string;
  affected: string;
}

export interface RedFinding {
  chunk_id: string;
  file: string;
  bugs: Issue[];
  edge_cases: Issue[];
  risks: Issue[];
}

//  Graph State
//  Blue Agent returns FileUpdate[], see agent/bug-fixer/blueAgent.ts

export type PipelineMode = "debug" | "watch";
