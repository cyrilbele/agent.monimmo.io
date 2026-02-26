import {
  isEmailValid,
  normalizeApiBaseUrl,
  validateRegisterForm,
  validateResetForm,
} from "./auth-helpers";

describe("normalizeApiBaseUrl", () => {
  it("retourne l'URL par défaut quand vide", () => {
    expect(normalizeApiBaseUrl(undefined)).toBe("http://localhost:3000");
    expect(normalizeApiBaseUrl("   ")).toBe("http://localhost:3000");
  });

  it("supprime les slashs finaux", () => {
    expect(normalizeApiBaseUrl("https://api.monimmo.fr///")).toBe("https://api.monimmo.fr");
  });
});

describe("isEmailValid", () => {
  it("accepte un email valide", () => {
    expect(isEmailValid("agent@monimmo.fr")).toBe(true);
  });

  it("rejette un email invalide", () => {
    expect(isEmailValid("agent#monimmo.fr")).toBe(false);
  });
});

describe("validateRegisterForm", () => {
  it("valide un payload complet", () => {
    const error = validateRegisterForm({
      firstName: "Camille",
      lastName: "Martin",
      email: "agent@monimmo.fr",
      password: "motdepasse1",
      confirmPassword: "motdepasse1",
    });

    expect(error).toBeNull();
  });

  it("rejette un email invalide", () => {
    const error = validateRegisterForm({
      firstName: "Camille",
      lastName: "Martin",
      email: "invalid",
      password: "motdepasse1",
      confirmPassword: "motdepasse1",
    });

    expect(error).toBe("Veuillez renseigner un email valide.");
  });

  it("rejette une confirmation différente", () => {
    const error = validateRegisterForm({
      firstName: "Camille",
      lastName: "Martin",
      email: "agent@monimmo.fr",
      password: "motdepasse1",
      confirmPassword: "motdepasse2",
    });

    expect(error).toBe("La confirmation du mot de passe ne correspond pas.");
  });
});

describe("validateResetForm", () => {
  it("valide un payload reset correct", () => {
    const error = validateResetForm({
      token: "abc",
      newPassword: "nouveaupass1",
      confirmPassword: "nouveaupass1",
    });

    expect(error).toBeNull();
  });

  it("rejette un token absent", () => {
    const error = validateResetForm({
      token: "",
      newPassword: "nouveaupass1",
      confirmPassword: "nouveaupass1",
    });

    expect(error).toBe("Le token de réinitialisation est obligatoire.");
  });
});
