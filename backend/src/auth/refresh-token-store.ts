type StoredRefreshToken = {
  userId: string;
  expiresAt: number;
};

class RefreshTokenStore {
  private readonly entries = new Map<string, StoredRefreshToken>();

  save(jti: string, userId: string, expiresAt: Date): void {
    this.entries.set(jti, {
      userId,
      expiresAt: expiresAt.getTime(),
    });
  }

  revoke(jti: string): void {
    this.entries.delete(jti);
  }

  isValid(jti: string, userId: string): boolean {
    const entry = this.entries.get(jti);
    if (!entry) {
      return false;
    }

    if (entry.userId !== userId) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(jti);
      return false;
    }

    return true;
  }
}

export const refreshTokenStore = new RefreshTokenStore();

