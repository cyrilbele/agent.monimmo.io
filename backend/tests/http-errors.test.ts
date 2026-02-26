import { describe, expect, it } from "bun:test";
import { HttpError, toApiError } from "../src/http/errors";

describe("toApiError", () => {
  it("mappe correctement les erreurs HTTP explicites", () => {
    const result = toApiError(
      new HttpError(400, "VALIDATION_ERROR", "Payload invalide", {
        field: "email",
      }),
    );

    expect(result).toEqual({
      status: 400,
      payload: {
        code: "VALIDATION_ERROR",
        message: "Payload invalide",
        details: { field: "email" },
      },
    });
  });

  it("mappe les erreurs inattendues en INTERNAL_SERVER_ERROR", () => {
    const result = toApiError(new Error("boom"));

    expect(result).toEqual({
      status: 500,
      payload: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Une erreur interne est survenue",
      },
    });
  });
});

