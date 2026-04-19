export interface QueryResult {
  filePath: string;
  content: string;
  score: number;
}

export interface AgentResponse {
  answer: string;
  sources: string[];
  model: string;
}

export interface FileChunk {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
}
