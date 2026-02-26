import { MIN_PASSWORD_LENGTH } from "./constants";

const DEFAULT_API_BASE_URL = "http://localhost:3000";

export interface RegisterFormValidationInput {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
}

export interface ResetFormValidationInput {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export const normalizeApiBaseUrl = (apiBaseUrl: string | undefined): string => {
  if (!apiBaseUrl?.trim()) {
    return DEFAULT_API_BASE_URL;
  }

  return apiBaseUrl.trim().replace(/\/+$/g, "");
};

export const isEmailValid = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validateRegisterForm = (
  data: RegisterFormValidationInput,
): string | null => {
  if (!data.firstName.trim() || !data.lastName.trim()) {
    return "Le prénom et le nom sont obligatoires.";
  }

  if (!isEmailValid(data.email.trim())) {
    return "Veuillez renseigner un email valide.";
  }

  if (data.password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }

  if (data.password !== data.confirmPassword) {
    return "La confirmation du mot de passe ne correspond pas.";
  }

  return null;
};

export const validateResetForm = (data: ResetFormValidationInput): string | null => {
  if (!data.token.trim()) {
    return "Le token de réinitialisation est obligatoire.";
  }

  if (data.newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }

  if (data.newPassword !== data.confirmPassword) {
    return "La confirmation du nouveau mot de passe ne correspond pas.";
  }

  return null;
};
