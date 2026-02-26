import { describe, expect, it } from "bun:test";
import {
  extractResetToken,
  isEmailValid,
  normalizeApiBaseUrl,
  renderAuthContent,
  resolveAuthRoute,
  validateRegisterForm,
  validateResetForm,
} from "../src/auth";

describe("resolveAuthRoute", () => {
  it("retourne login par défaut", () => {
    expect(resolveAuthRoute("")).toBe("login");
    expect(resolveAuthRoute("#/inconnu")).toBe("login");
  });

  it("résout les routes prévues", () => {
    expect(resolveAuthRoute("#/login")).toBe("login");
    expect(resolveAuthRoute("#/inscription")).toBe("register");
    expect(resolveAuthRoute("#/mot-de-passe?token=abc")).toBe("password-forgot");
    expect(resolveAuthRoute("#/mot-de-passe/reset?token=abc")).toBe(
      "password-reset",
    );
  });
});

describe("extractResetToken", () => {
  it("retourne un token vide sans query string", () => {
    expect(extractResetToken("#/mot-de-passe")).toBe("");
  });

  it("retourne le token présent", () => {
    expect(extractResetToken("#/mot-de-passe?token=reset-123")).toBe(
      "reset-123",
    );
  });
});

describe("normalizeApiBaseUrl", () => {
  it("retourne l'URL par défaut si vide", () => {
    expect(normalizeApiBaseUrl(undefined)).toBe("http://localhost:3000");
    expect(normalizeApiBaseUrl("   ")).toBe("http://localhost:3000");
  });

  it("supprime les slashs finaux", () => {
    expect(normalizeApiBaseUrl("https://api.monimmo.fr///")).toBe(
      "https://api.monimmo.fr",
    );
  });
});

describe("isEmailValid", () => {
  it("accepte un email valide", () => {
    expect(isEmailValid("agent@monimmo.fr")).toBeTrue();
  });

  it("rejette un email invalide", () => {
    expect(isEmailValid("agent#monimmo.fr")).toBeFalse();
  });
});

describe("validateRegisterForm", () => {
  it("valide un payload complet", () => {
    expect(
      validateRegisterForm({
        email: "agent@monimmo.fr",
        password: "motdepasse1",
        confirmPassword: "motdepasse1",
        firstName: "Camille",
        lastName: "Martin",
      }),
    ).toBeNull();
  });

  it("refuse un email invalide", () => {
    expect(
      validateRegisterForm({
        email: "invalid",
        password: "motdepasse1",
        confirmPassword: "motdepasse1",
        firstName: "Camille",
        lastName: "Martin",
      }),
    ).toBe("Veuillez renseigner un email valide.");
  });

  it("refuse un mot de passe non confirmé", () => {
    expect(
      validateRegisterForm({
        email: "agent@monimmo.fr",
        password: "motdepasse1",
        confirmPassword: "motdepasse2",
        firstName: "Camille",
        lastName: "Martin",
      }),
    ).toBe("La confirmation du mot de passe ne correspond pas.");
  });
});

describe("validateResetForm", () => {
  it("valide un payload reset correct", () => {
    expect(
      validateResetForm({
        token: "abc",
        newPassword: "nouveaupass1",
        confirmPassword: "nouveaupass1",
      }),
    ).toBeNull();
  });

  it("refuse un token absent", () => {
    expect(
      validateResetForm({
        token: "  ",
        newPassword: "nouveaupass1",
        confirmPassword: "nouveaupass1",
      }),
    ).toBe("Le token de réinitialisation est obligatoire.");
  });
});

describe("renderAuthContent", () => {
  it("rend la page login", () => {
    const html = renderAuthContent("#/login");
    expect(html).toContain('id="login-form"');
    expect(html).toContain("Se connecter");
    expect(html).toContain("Créer un compte");
  });

  it("rend la page création de compte", () => {
    const html = renderAuthContent("#/inscription");
    expect(html).toContain('id="register-form"');
    expect(html).toContain("Créer un compte");
    expect(html).not.toContain("register-org-id");
  });

  it("rend la page mot de passe perdu (étape email)", () => {
    const html = renderAuthContent("#/mot-de-passe");
    expect(html).toContain('id="forgot-form"');
    expect(html).not.toContain('id="reset-form"');
  });

  it("rend la page reset avec token échappé", () => {
    const html = renderAuthContent(
      "#/mot-de-passe/reset?token=%3Cscript%3Ereset%3C%2Fscript%3E",
    );
    expect(html).toContain('id="reset-form"');
    expect(html).not.toContain('id="forgot-form"');
    expect(html).not.toContain("<script>reset</script>");
    expect(html).toContain("&lt;script&gt;reset&lt;/script&gt;");
  });
});
