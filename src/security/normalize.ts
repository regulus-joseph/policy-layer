export function normalizeCommand(cmd: string): string {
  let result = cmd.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  result = result.replace(/\0/g, '');
  result = result.normalize('NFKC');
  result = result.trim();
  return result;
}
