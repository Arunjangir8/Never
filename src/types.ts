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

export interface AgentResponse {
  answer: string;
  sources: string[];
  model: string;
}

export interface CodeUpdate {
  filePath: string;
  newContent: string;
  description: string;
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

// Blue Agent 

export interface Fix {
  title: string;
  explanation: string;
  fix: string;        
  affected: string;  
}

export interface BlueFix {
  chunk_id: string; 
  file: string;
  fixes: Fix[];
}

//  Graph State 

export type PipelineMode = "debug" | "watch";

export interface AgentState {
  chunks: FileChunk[];
  mode: PipelineMode;
  redFindings: RedFinding[];
  userApprovedFix: boolean;
  blueFixes: BlueFix[];
}
