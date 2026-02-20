/**
 * Dark Pattern Hunter Error Classes
 * Custom error types for specific error scenarios
 */

/**
 * Error codes for Dark Pattern Hunter
 */
export enum DPHErrorCode {
  // Connection errors
  LOCAL_MODEL_CONNECTION_FAILED = 'LOCAL_MODEL_CONNECTION_FAILED',
  OPENAI_CONNECTION_FAILED = 'OPENAI_CONNECTION_FAILED',
  BRIDGE_CONNECTION_FAILED = 'BRIDGE_CONNECTION_FAILED',

  // Timeout errors
  DOM_CAPTURE_TIMEOUT = 'DOM_CAPTURE_TIMEOUT',
  SCREENSHOT_TIMEOUT = 'SCREENSHOT_TIMEOUT',
  AI_RESPONSE_TIMEOUT = 'AI_RESPONSE_TIMEOUT',

  // Configuration errors
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  MISSING_API_KEY = 'MISSING_API_KEY',
  INVALID_MODEL_NAME = 'INVALID_MODEL_NAME',

  // Analysis errors
  DARK_PATTERN_DETECTION_FAILED = 'DARK_PATTERN_DETECTION_FAILED',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  COORDINATE_OUT_OF_BOUNDS = 'COORDINATE_OUT_OF_BOUNDS',

  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

/**
 * Base error class for Dark Pattern Hunter
 */
export class DarkPatternHunterError extends Error {
  public readonly code: DPHErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: DPHErrorCode = DPHErrorCode.UNKNOWN_ERROR,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DarkPatternHunterError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DarkPatternHunterError);
    }
  }

  /**
   * Create a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Check if this error is recoverable
   */
  isRecoverable(): boolean {
    const recoverableCodes = [
      DPHErrorCode.LOCAL_MODEL_CONNECTION_FAILED,
      DPHErrorCode.AI_RESPONSE_TIMEOUT,
      DPHErrorCode.ELEMENT_NOT_FOUND,
    ];
    return recoverableCodes.includes(this.code);
  }
}

/**
 * Error for local model connection failures
 */
export class LocalModelConnectionError extends DarkPatternHunterError {
  constructor(
    public readonly host: string,
    public readonly originalError?: Error,
  ) {
    super(
      `Failed to connect to local AI model server at ${host}. Please ensure LM Studio or your local model server is running.`,
      DPHErrorCode.LOCAL_MODEL_CONNECTION_FAILED,
      { host, originalError: originalError?.message },
    );
    this.name = 'LocalModelConnectionError';
  }
}

/**
 * Error for DOM capture timeout
 */
export class DOMCaptureTimeoutError extends DarkPatternHunterError {
  constructor(
    public readonly timeoutMs: number,
    public readonly url?: string,
  ) {
    super(
      `DOM capture timed out after ${timeoutMs}ms${url ? ` for URL: ${url}` : ''}`,
      DPHErrorCode.DOM_CAPTURE_TIMEOUT,
      { timeoutMs, url },
    );
    this.name = 'DOMCaptureTimeoutError';
  }
}

/**
 * Error for missing API key
 */
export class MissingAPIKeyError extends DarkPatternHunterError {
  constructor(public readonly provider: string) {
    super(
      `API key is required for ${provider}. Please configure your API key in Settings.`,
      DPHErrorCode.MISSING_API_KEY,
      { provider },
    );
    this.name = 'MissingAPIKeyError';
  }
}

/**
 * Error for coordinate out of bounds
 */
export class CoordinateOutOfBoundsError extends DarkPatternHunterError {
  constructor(
    public readonly coord: { x: number; y: number },
    public readonly bounds: { width: number; height: number },
  ) {
    super(
      `Coordinate (${coord.x}, ${coord.y}) is out of bounds (0-${bounds.width}, 0-${bounds.height})`,
      DPHErrorCode.COORDINATE_OUT_OF_BOUNDS,
      { coord, bounds },
    );
    this.name = 'CoordinateOutOfBoundsError';
  }
}

/**
 * Error for dark pattern detection failures
 */
export class DarkPatternDetectionError extends DarkPatternHunterError {
  constructor(
    message: string,
    public readonly pageUrl?: string,
    details?: Record<string, unknown>,
  ) {
    super(message, DPHErrorCode.DARK_PATTERN_DETECTION_FAILED, {
      pageUrl,
      ...details,
    });
    this.name = 'DarkPatternDetectionError';
  }
}

/**
 * Helper function to check if an error is a DarkPatternHunterError
 */
export function isDPHError(error: unknown): error is DarkPatternHunterError {
  return error instanceof DarkPatternHunterError;
}

/**
 * Helper function to get error code from any error
 */
export function getErrorCode(error: unknown): DPHErrorCode {
  if (isDPHError(error)) {
    return error.code;
  }
  return DPHErrorCode.UNKNOWN_ERROR;
}

/**
 * Helper function to format error for display
 */
export function formatError(error: unknown): string {
  if (isDPHError(error)) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
