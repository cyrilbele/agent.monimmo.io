export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const toApiError = (
  error: unknown,
): { status: number; payload: ApiErrorPayload } => {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      payload: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }

  return {
    status: 500,
    payload: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Une erreur interne est survenue",
    },
  };
};

