import { PatternMatch } from './patterns';

export type SmartReviewResult = 'approve' | 'deny' | 'escalate';

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'qwen2.5:3b';
const TIMEOUT_MS = 10_000;

const FALSE_POSITIVE_GUIDANCE = `
FALSE POSITIVE CASES — approve these:
- "python -c print(...)" — harmless print statement, no side effects
- "rm -rf node_modules" — normal development cleanup
- "rm -rf dist" / "rm -rf build" — normal build artifact cleanup
- "rm -rf __pycache__" / "rm -rf .pytest_cache" — normal Python cache cleanup
- "rm -rf .git/objects" — normal git maintenance
- "kill -9 <specific_pid>" — normal process management with a specific PID
- "pkill -f <specific_name>" — normal process management for named processes
- "rm -rf tmp/*" / "rm -rf /tmp/*" — normal temp directory cleanup
- "npm cache clean" / "yarn cache clean" — normal package manager cleanup
- Commands targeting only user's own workspace files/directories
`;

function buildPrompt(command: string, matchedPatterns: PatternMatch[]): string {
  const patternDescriptions = matchedPatterns
    .map((p) => `  - [${p.severity}] ${p.label} (regex: ${p.pattern})`)
    .join('\n');

  return `You are a security analyst reviewing a command that triggered pattern-based detection.

Command attempted: "${command}"

Matched dangerous patterns:
${patternDescriptions}

${FALSE_POSITIVE_GUIDANCE}

Your task:
1. Analyze the command in context of the matched patterns
2. Determine if this is a genuine security threat or a false positive
3. Consider the full command — not just the pattern match in isolation

Respond with ONLY ONE of these exact words on its own line:
- APPROVE  — if this is a false positive or genuinely safe
- DENY     — if this is genuinely dangerous and should be blocked
- ESCALATE — if you are uncertain and a human should review

Do not add any explanation or text beyond the single word.`;
}

function parseResult(response: string): SmartReviewResult {
  const lines = response.split('\n').map((l) => l.trim().toUpperCase());
  for (const line of lines) {
    if (line === 'APPROVE') return 'approve';
    if (line === 'DENY') return 'deny';
    if (line === 'ESCALATE') return 'escalate';
  }
  return 'escalate';
}

export async function smartReview(
  command: string,
  patterns: PatternMatch[]
): Promise<SmartReviewResult> {
  if (patterns.length === 0) {
    return 'approve';
  }

  const prompt = buildPrompt(command, patterns);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        think: false,
        options: {
          temperature: 0.1,
          num_predict: 20,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return 'escalate';
    }

    const data = (await response.json()) as { response?: string };
    const text = data.response ?? '';

    return parseResult(text);
  } catch {
    clearTimeout(timeoutId);
    return 'escalate';
  }
}
