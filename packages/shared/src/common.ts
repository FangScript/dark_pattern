import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// do not import getBasicEnvValue and DPH_RUN_DIR directly from ./env,
// because it will cause circular dependency
import { getBasicEnvValue } from './env/basic';
import { DPH_RUN_DIR } from './env/types';
import { ifInNode } from './utils';

export const defaultRunDirName = 'dph_run';
// Define locally for now to avoid import issues

export const getDPHRunDir = () => {
  if (!ifInNode) {
    return '';
  }

  return getBasicEnvValue(DPH_RUN_DIR) || defaultRunDirName;
};

export const getDPHRunBaseDir = () => {
  if (!ifInNode) {
    return '';
  }

  let basePath = path.resolve(process.cwd(), getDPHRunDir());

  // Create a base directory
  if (!existsSync(basePath)) {
    try {
      mkdirSync(basePath, { recursive: true });
    } catch (error) {
      // console.error(`Failed to create ${runDirName} directory: ${error}`);
      basePath = path.join(tmpdir(), defaultRunDirName);
      mkdirSync(basePath, { recursive: true });
    }
  }

  return basePath;
};

/**
 * Get the path to the dph_run directory or a subdirectory within it.
 * Creates the directory if it doesn't exist.
 *
 * @param subdir - Optional subdirectory name (e.g., 'log', 'report')
 * @returns The absolute path to the requested directory
 */
export const getDPHRunSubDir = (
  subdir: 'dump' | 'cache' | 'report' | 'tmp' | 'log' | 'output',
): string => {
  if (!ifInNode) {
    return '';
  }

  // Create a log directory
  const basePath = getDPHRunBaseDir();
  const logPath = path.join(basePath, subdir);
  if (!existsSync(logPath)) {
    mkdirSync(logPath, { recursive: true });
  }

  return logPath;
};

// Legacy aliases for backward compatibility
export const getMidsceneRunDir = getDPHRunDir;
export const getMidsceneRunBaseDir = getDPHRunBaseDir;
export const getMidsceneRunSubDir = getDPHRunSubDir;

export const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED =
  'NOT_IMPLEMENTED_AS_DESIGNED';
