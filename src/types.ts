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
