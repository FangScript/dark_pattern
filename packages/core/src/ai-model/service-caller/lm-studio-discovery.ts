/**
 * LM Studio Model Discovery
 * Functions to discover and list available models from LM Studio local server
 */

import { getDebug } from '@darkpatternhunter/shared/logger';

const debug = getDebug('lm-studio:discovery');

// LM Studio default endpoints
const LM_STUDIO_DEFAULT_HOST = 'http://localhost:1234';
const LM_STUDIO_MODELS_ENDPOINT = '/v1/models';

/**
 * Interface for LM Studio model response
 */
export interface LMStudioModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/**
 * Interface for LM Studio models list response
 */
export interface LMStudioModelsResponse {
  object: string;
  data: LMStudioModel[];
}

/**
 * Interface for model discovery result
 */
export interface ModelDiscoveryResult {
  success: boolean;
  models: LMStudioModel[];
  error?: string;
}

/**
 * Discover available models from LM Studio server
 * @param host - The LM Studio server host (default: http://localhost:1234)
 * @returns Promise with discovery result containing models or error
 */
export async function discoverLMStudioModels(
  host: string = LM_STUDIO_DEFAULT_HOST,
): Promise<ModelDiscoveryResult> {
  try {
    const url = `${host}${LM_STUDIO_MODELS_ENDPOINT}`;
    debug(`Discovering models from: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: LMStudioModelsResponse = await response.json();
    debug(`Discovered ${data.data.length} models:`, data.data);

    return {
      success: true,
      models: data.data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debug(`Failed to discover models: ${errorMessage}`);
    return {
      success: false,
      models: [],
      error: errorMessage,
    };
  }
}

/**
 * Check if LM Studio server is running
 * @param host - The LM Studio server host (default: http://localhost:1234)
 * @returns Promise with boolean indicating if server is running
 */
export async function isLMStudioServerRunning(
  host: string = LM_STUDIO_DEFAULT_HOST,
): Promise<boolean> {
  try {
    const result = await discoverLMStudioModels(host);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Get the first available model from LM Studio
 * Useful for auto-detection when only one model is loaded
 * @param host - The LM Studio server host (default: http://localhost:1234)
 * @returns Promise with model ID or null if no models available
 */
export async function getFirstAvailableModel(
  host: string = LM_STUDIO_DEFAULT_HOST,
): Promise<string | null> {
  const result = await discoverLMStudioModels(host);
  if (result.success && result.models.length > 0) {
    return result.models[0].id;
  }
  return null;
}

/**
 * Get model IDs as an array of strings
 * @param host - The LM Studio server host (default: http://localhost:1234)
 * @returns Promise with array of model IDs
 */
export async function getModelIds(
  host: string = LM_STUDIO_DEFAULT_HOST,
): Promise<string[]> {
  const result = await discoverLMStudioModels(host);
  if (result.success) {
    return result.models.map((model) => model.id);
  }
  return [];
}
