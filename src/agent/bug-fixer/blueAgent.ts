import { generateResponse } from "../../llm/ollamaClient.js";
import { getModel } from "../../llm/modelRouter.js";
import type { RedFinding, BlueFix } from "../../types.js";
import { buildBlueSystemPrompt, buildBlueUserPrompt } from "../../llm/promptBuilder.js";


function parseBlueFix(raw: string, finding: RedFinding): BlueFix | null {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as BlueFix;
    if (!Array.isArray(parsed.fixes)) {
      throw new Error("Missing required 'fixes' array in Blue Agent response");
    }

    for (const fix of parsed.fixes) {
      if (!fix.title || !fix.explanation || !fix.fix || !fix.affected) {
        throw new Error(`Incomplete fix entry: ${JSON.stringify(fix)}`);
      }
    }
    parsed.chunk_id = finding.chunk_id;
    parsed.file = finding.file;

    return parsed;
  } catch (err) {
    console.error(
      `\x1b[31m✖ Failed to parse Blue Agent output for ${finding.chunk_id}:\x1b[0m`,
      err instanceof Error ? err.message : String(err)
    );
    console.error(`\x1b[2mRaw output:\x1b[0m\n${raw}\n`);
    return null;
  }
}


export async function runBlueAgent(finding: RedFinding): Promise<BlueFix | null> {
  const totalIssues =
    finding.bugs.length + finding.edge_cases.length + finding.risks.length;
  if (totalIssues === 0) return null;

  const raw = await generateResponse(
    buildBlueSystemPrompt(),
    buildBlueUserPrompt(finding),
    getModel("code"),
  );

  return parseBlueFix(raw, finding);
}