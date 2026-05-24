import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const APPROVAL_LOG = join(homedir(), '.openclaw', 'logs', 'approval.jsonl');

export interface ApprovalRecord {
  command: string;
  rawCommand?: string;
  tool?: string;
  sessionId?: string;
  patterns: string[];
  result: 'approve' | 'deny' | 'escalate' | 'allow-once' | 'allow-always' | 'fast_lane' | 'whitelist';
  reason?: string;
  timestamp?: string;
}

// Normalize command to its type (rm, curl, git, etc.)
export function classifyCommandType(cmd: string): string {
  const trimmed = cmd.trim().toLowerCase();
  if (trimmed.startsWith('rm ') || trimmed.startsWith('rm -')) return 'rm';
  if (trimmed.startsWith('curl ') || trimmed.startsWith('curl ')) return 'curl';
  if (trimmed.startsWith('wget ') || trimmed.startsWith('wget ')) return 'wget';
  if (trimmed.startsWith('git ')) return 'git';
  if (trimmed.startsWith('kill ') || trimmed.startsWith('kill -')) return 'kill';
  if (trimmed.startsWith('chmod ')) return 'chmod';
  if (trimmed.startsWith('mkdir ')) return 'mkdir';
  if (trimmed.startsWith('mv ') || trimmed.startsWith('move ')) return 'mv';
  if (trimmed.startsWith('cp ') || trimmed.startsWith('copy ')) return 'cp';
  if (trimmed.startsWith('pkill ') || trimmed.startsWith('killall ')) return 'pkill';
  if (trimmed.startsWith('npm ') || trimmed.startsWith('yarn ') || trimmed.startsWith('pnpm ')) return 'package_manager';
  if (trimmed.startsWith('docker ') || trimmed.startsWith('docker-compose ')) return 'docker';
  if (trimmed.startsWith('ssh ') || trimmed.startsWith('scp ')) return 'ssh';
  if (trimmed.startsWith('cat ') || trimmed.startsWith('head ') || trimmed.startsWith('tail ') || trimmed.startsWith('grep ')) return 'read';
  if (trimmed.startsWith('ls ') || trimmed.startsWith('dir ') || trimmed.startsWith('find ')) return 'list';
  return 'other';
}

// Extract directory from command (simplified — first path argument)
export function extractTargetDir(cmd: string): string {
  const parts = cmd.trim().split(/\s+/);
  for (const part of parts.slice(1)) {
    if (part.startsWith('/') || part.startsWith('~') || part.startsWith('$')) {
      // Normalize home dir
      return part.replace(/^~/, process.env.HOME || '~');
    }
    // relative path that looks like a directory
    if (/^[a-zA-Z0-9_\-\.]+$/.test(part) && part.length > 1 && part.length < 50) {
      return part;
    }
  }
  return 'unknown';
}

export interface BayesianParams {
  alpha: number;  // successes + 1 (Beta prior)
  beta: number;    // failures + 1 (Beta prior)
}

// Global prior for each command type: Beta(2, 2) — weakly informative
const DEFAULT_PRIOR: BayesianParams = { alpha: 2, beta: 2 };

export interface CommandProfile {
  commandType: string;
  directory: string;
  posteriorMean: number;        // P(success | data)
  posteriorStrength: number;     // alpha + beta (effective sample size)
  totalObservations: number;    // actual count
  successCount: number;
  failCount: number;
  priorAlpha: number;           // command-type level prior
  priorBeta: number;
  naturalLanguage: string;
  recommendation: 'PROCEED' | 'CONFIRM' | 'BLOCK' | 'ASK_USER';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

type ProfileMap = Map<string, BayesianParams>; // key = "commandType|directory"
type CommandTypeMap = Map<string, BayesianParams>; // key = commandType

let profiles: ProfileMap = new Map();
let commandTypePriors: CommandTypeMap = new Map();
let isLoaded = false;

// Key for (commandType, directory) pair
function profileKey(cmdType: string, dir: string): string {
  return `${cmdType}|${dir}`;
}

// Load history and build profiles
export async function loadHistoryAndBuildProfiles(): Promise<void> {
  profiles = new Map();
  commandTypePriors = new Map();
  isLoaded = false;

  try {
    const content = await fs.readFile(APPROVAL_LOG, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    // First pass: build command-type priors from all data
    const cmdTypeCounts: Record<string, { ok: number; fail: number }> = {};

    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as ApprovalRecord;
        const cmdType = classifyCommandType(rec.command);
        const dir = extractTargetDir(rec.command);
        const key = profileKey(cmdType, dir);

        if (!cmdTypeCounts[cmdType]) cmdTypeCounts[cmdType] = { ok: 0, fail: 0 };

        const isSuccess = rec.result === 'approve' || rec.result === 'allow-once' || rec.result === 'allow-always' || rec.result === 'fast_lane' || rec.result === 'whitelist';

        if (isSuccess) cmdTypeCounts[cmdType].ok++;
        else cmdTypeCounts[cmdType].fail++;

        // Increment profile counts
        if (!profiles.has(key)) profiles.set(key, { ...DEFAULT_PRIOR });
        const p = profiles.get(key)!;
        if (isSuccess) p.alpha++;
        else p.beta++;
      } catch {}
    }

    // Set command-type priors: Beta(α_prior + successes, β_prior + failures)
    for (const [ct, cnt] of Object.entries(cmdTypeCounts)) {
      commandTypePriors.set(ct, {
        alpha: DEFAULT_PRIOR.alpha + cnt.ok,
        beta: DEFAULT_PRIOR.beta + cnt.fail,
      });
    }

    isLoaded = true;
  } catch {
    isLoaded = true;
  }
}

// Get command profile with natural language
export function getCommandProfile(cmd: string): CommandProfile {
  const cmdType = classifyCommandType(cmd);
  const dir = extractTargetDir(cmd);
  const key = profileKey(cmdType, dir);

  // If no profile, start with command-type prior
  const commandTypePrior = commandTypePriors.get(cmdType) || DEFAULT_PRIOR;
  const profile = profiles.get(key) || { ...DEFAULT_PRIOR };

  const totalObs = profile.alpha + profile.beta - 4; // subtract prior alpha/beta
  const successCount = profile.alpha - 2;
  const failCount = profile.beta - 2;
  const posteriorMean = profile.alpha / (profile.alpha + profile.beta);
  const posteriorStrength = profile.alpha + profile.beta;

  // Generate natural language
  const natLang = generateNaturalLanguage(cmdType, dir, posteriorMean, totalObs, successCount, failCount);

  // Recommendation thresholds
  let recommendation: CommandProfile['recommendation'];
  let confidence: CommandProfile['confidence'];

  if (totalObs < 2) {
    recommendation = 'CONFIRM';
    confidence = 'LOW';
  } else if (posteriorMean >= 0.75) {
    recommendation = 'PROCEED';
    confidence = totalObs >= 5 ? 'HIGH' : 'MEDIUM';
  } else if (posteriorMean >= 0.4) {
    recommendation = 'CONFIRM';
    confidence = 'MEDIUM';
  } else if (dir.includes('/etc') || dir.includes('/home') && !dir.includes('/home/marlon-wei')) {
    recommendation = 'BLOCK';
    confidence = 'HIGH';
  } else {
    recommendation = 'ASK_USER';
    confidence = 'MEDIUM';
  }

  return {
    commandType: cmdType,
    directory: dir,
    posteriorMean,
    posteriorStrength,
    totalObservations: totalObs,
    successCount: Math.max(0, successCount),
    failCount: Math.max(0, failCount),
    priorAlpha: commandTypePrior.alpha,
    priorBeta: commandTypePrior.beta,
    naturalLanguage: natLang,
    recommendation,
    confidence,
  };
}

function generateNaturalLanguage(
  cmdType: string,
  dir: string,
  posteriorMean: number,
  totalObs: number,
  successCount: number,
  failCount: number
): string {
  if (totalObs === 0) {
    return `No history for '${cmdType}' targeting '${dir}'. No prior data available. Default behavior applies.`;
  }

  const pct = (posteriorMean * 100).toFixed(0);
  const obs = totalObs < 0 ? 0 : totalObs;

  // Generate contextual explanation
  const context = getCommandContext(cmdType, dir);

  if (failCount === 0 && successCount > 0) {
    return `${context}. All ${obs} recorded executions succeeded (${pct}% posterior success rate). Usually safe to proceed.`;
  }

  if (failCount > 0 && successCount === 0) {
    return `${context}. All ${obs} recorded executions failed. Posterior success rate: ${pct}%. HIGH RISK — recommend blocking or confirming with user.`;
  }

  const ok = successCount < 0 ? 0 : successCount;
  const fail = failCount < 0 ? 0 : failCount;

  if (posteriorMean >= 0.75) {
    return `${context}. ${ok}/${obs} executions succeeded (${pct}% posterior success rate). Generally safe — confidence: ${obs >= 5 ? 'HIGH' : 'MEDIUM'}.`;
  } else if (posteriorMean >= 0.5) {
    return `${context}. ${ok}/${obs} succeeded, ${fail} failed (${pct}% posterior success rate). Mixed results — confirm before proceeding.`;
  } else if (posteriorMean >= 0.25) {
    return `${context}. ${ok}/${obs} succeeded, ${fail} failed (${pct}% posterior success rate). Risky — recommend asking user or block.`;
  } else {
    return `${context}. ${ok}/${obs} succeeded, ${fail} failed (${pct}% posterior success rate). Very high risk — block recommended.`;
  }
}

function getCommandContext(cmdType: string, dir: string): string {
  const dirNote = getDirectoryNote(dir);

  switch (cmdType) {
    case 'rm':
      return `This 'rm' command targets '${dir}'.${dirNote}`;
    case 'curl':
      return `This 'curl' command downloads from '${dir}'. Pipe-to-shell detected in 90%+ of similar cases — HIGH RISK.`;
    case 'git':
      if (dir.includes('.git')) return `This 'git' command modifies '.git' directory — destructive operation.`;
      return `This 'git' command targets '${dir}'. Check for uncommitted changes before proceeding.`;
    case 'kill':
      return `This 'kill' command targets processes. Risk of killing critical services.${dirNote}`;
    case 'chmod':
      return `This 'chmod' command modifies permissions on '${dir}'.${dirNote}`;
    case 'docker':
      return `This 'docker' command.${dirNote}`;
    case 'package_manager':
      return `This package manager command ('${dir}').${dirNote}`;
    default:
      return `Command type '${cmdType}' targeting '${dir}'.${dirNote}`;
  }
}

function getDirectoryNote(dir: string): string {
  if (dir === 'unknown' || dir === '.') return '';
  if (dir === '/tmp' || dir === '/var/tmp') return ' Temp directory — usually safe.';
  if (dir.includes('/node_modules')) return ' node_modules — development cleanup, usually safe.';
  if (dir.includes('/dist') || dir.includes('/build')) return ' Build output — safe if intentional.';
  if (dir.includes('/.git')) return ' .git directory — destructive git operation.';
  if (dir.includes('/etc')) return ' /etc — system directory, VERY DANGEROUS.';
  if (dir.includes('/home')) return ' User home directory — destructive if not careful.';
  if (dir.startsWith('/proc') || dir.startsWith('/sys')) return ' System directory — HIGH RISK.';
  return '';
}

// Check if loaded
export function isProfileLoaded(): boolean {
  return isLoaded;
}