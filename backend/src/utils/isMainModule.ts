import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Returns true if the file corresponding to importMetaUrl was executed directly
 * as the Node.js entry point (e.g. node script.js or tsx script.ts).
 * Returns false when the module is being imported by another file or test suite.
 */
export function isMainModule(importMetaUrl: string): boolean {
  if (!process.argv || !process.argv[1]) {
    return false;
  }
  try {
    const scriptPath = path.resolve(fileURLToPath(importMetaUrl)).toLowerCase();
    const entryPath = path.resolve(process.argv[1]).toLowerCase();
    return scriptPath === entryPath;
  } catch {
    return false;
  }
}

