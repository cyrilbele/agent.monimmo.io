import { HttpError } from "../http/errors";

const allowedRoles = ["AGENT", "MANAGER", "ADMIN"] as const;

export type AppRole = (typeof allowedRoles)[number];

export function assertRoleAllowed(role: string): asserts role is AppRole {
  if (!allowedRoles.includes(role as AppRole)) {
    throw new HttpError(403, "FORBIDDEN_ROLE", "Rôle non autorisé", {
      role,
      allowedRoles,
    });
  }
}

export const assertOrgScope = (tokenOrgId: string, userOrgId: string): void => {
  if (tokenOrgId !== userOrgId) {
    throw new HttpError(
      403,
      "ORG_SCOPE_MISMATCH",
      "Le token ne correspond pas à l'organisation de l'utilisateur",
      {
        tokenOrgId,
        userOrgId,
      },
    );
  }
};
