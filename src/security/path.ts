import { resolve, isAbsolute, relative } from 'path';

export function validatePath(path: string, root: string): string | null {
  const resolvedPath = resolve(path);
  const resolvedRoot = resolve(root);

  try {
    const rel = relative(resolvedRoot, resolvedPath);
    if (rel.startsWith('..')) {
      return null;
    }
    return resolvedPath;
  } catch {
    return null;
  }
}
