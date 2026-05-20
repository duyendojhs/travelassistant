import type { TokenResponse, User } from "@travelassistant/shared";

import type { AuthSession } from "./auth-client";

const SESSION_KEY = "travelassistant.session";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function toSession(tokens: TokenResponse): AuthSession {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    user: tokens.user
  };
}

export function saveSession(tokens: TokenResponse): AuthSession | null {
  if (!canUseStorage()) {
    return null;
  }
  const session = toSession(tokens);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function readSession(): AuthSession | null {
  if (!canUseStorage()) {
    return null;
  }
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.accessToken === "string" &&
      typeof parsed.refreshToken === "string" &&
      typeof parsed.user === "object" &&
      parsed.user !== null
    ) {
      return parsed as AuthSession;
    }
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
  }
  return null;
}

export function clearSession(): void {
  if (canUseStorage()) {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

export function updateSessionUser(user: User): AuthSession | null {
  const existing = readSession();
  if (!existing || !canUseStorage()) {
    return null;
  }
  const updated = { ...existing, user };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  return updated;
}
