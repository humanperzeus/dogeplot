
// Custom ts-node loader for ESM
import { resolve as resolveTs } from 'ts-node/esm';
import * as tsConfigPaths from 'tsconfig-paths';
import { pathToFileURL } from 'url';

// Initialize tsconfig-paths to resolve imports
const { absoluteBaseUrl, paths } = tsConfigPaths.loadConfig();
let matcher;
if (absoluteBaseUrl && paths) {
  matcher = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths);
}

export function resolve(specifier, context, nextResolve) {
  // Try to resolve path aliases using tsconfig-paths
  if (matcher && specifier.startsWith('.')) {
    const resolved = matcher(specifier);
    if (resolved) {
      specifier = pathToFileURL(resolved).href;
    }
  }
  return resolveTs(specifier, context, nextResolve);
}

// Use ts-node's loader for loading TypeScript files
export { load, getFormat, transformSource } from 'ts-node/esm';
