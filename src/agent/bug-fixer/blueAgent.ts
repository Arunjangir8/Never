import { generateResponse } from "../../llm/ollamaClient.js";
import { getModel } from "../../llm/modelRouter.js";
import type { FileUpdate, RedFinding } from "../../types.js";
import { buildBlueSystemPrompt, buildBlueUserPrompt } from "../../llm/promptBuilder.js";
import { parseUpdates } from "../updateParser.js";

export async function runBlueAgent(
  finding: RedFinding
): Promise<FileUpdate[] | null> {

  const totalIssues =
    finding.bugs.length + finding.edge_cases.length + finding.risks.length;

  if (totalIssues === 0) return null;

  const raw = await generateResponse(
    buildBlueSystemPrompt(),
    buildBlueUserPrompt(finding),
    getModel("code"),
    true // constrained JSON decoding for local models
  );

  const updates = parseUpdates(raw);

  return updates.length > 0 ? updates : null;
}