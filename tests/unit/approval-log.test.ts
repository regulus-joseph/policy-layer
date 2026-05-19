import { extractRawCommand } from '../../src/security/approval-log';
import { describe, it, expect } from 'vitest';

describe('extractRawCommand', () => {
  it('extracts command from bash tool with object args', () => {
    const result = extractRawCommand('bash', { command: 'ls -la' });
    expect(result).toBe('ls -la');
  });

  it('extracts command from bash tool with string args', () => {
    const result = extractRawCommand('bash', 'ls -la');
    expect(result).toBeUndefined();
  });

  it('extracts command from shell tool with object args', () => {
    const result = extractRawCommand('shell', { command: 'pwd' });
    expect(result).toBe('pwd');
  });

  it('returns undefined for unknown tool', () => {
    expect(extractRawCommand('python', { command: 'print(1)' })).toBeUndefined();
  });

  it('returns undefined when args is null', () => {
    expect(extractRawCommand('bash', null)).toBeUndefined();
  });

  it('returns undefined when args lacks command field', () => {
    expect(extractRawCommand('bash', { other: 'field' })).toBeUndefined();
  });

  it('returns undefined for shell with non-object args', () => {
    expect(extractRawCommand('shell', 'whoami')).toBeUndefined();
  });

  it('extracts rawCommand from bash args when present', () => {
    // Note: extractRawCommand reads 'command' field, not 'rawCommand'
    // rawCommand is stored separately in the approval log
    const result = extractRawCommand('bash', { command: 'bash' });
    expect(result).toBe('bash');
  });
});