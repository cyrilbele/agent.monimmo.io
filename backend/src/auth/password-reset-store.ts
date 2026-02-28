type ResetTokenEntry = {
  email: string;
  userId: string;
  expiresAt: number;
};

class PasswordResetStore {
  private readonly byToken = new Map<string, ResetTokenEntry>();
  private readonly byEmail = new Map<string, string>();

  create(email: string, userId: string, ttlMs: number): string {
    const previousToken = this.byEmail.get(email);
    if (previousToken) {
      this.byToken.delete(previousToken);
    }

    const token = crypto.randomUUID();
    this.byToken.set(token, { email, userId, expiresAt: Date.now() + ttlMs });
    this.byEmail.set(email, token);
    return token;
  }

  consume(token: string): string | null {
    const entry = this.byToken.get(token);
    if (!entry) {
      return null;
    }

    this.byToken.delete(token);
    if (this.byEmail.get(entry.email) === token) {
      this.byEmail.delete(entry.email);
    }

    if (Date.now() > entry.expiresAt) {
      return null;
    }

    return entry.userId;
  }

  peekTokenForEmail(email: string): string | null {
    return this.byEmail.get(email) ?? null;
  }
}

export const passwordResetStore = new PasswordResetStore();
