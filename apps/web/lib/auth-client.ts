import type { Preferences, Profile, TokenResponse, User } from "@travelassistant/shared";
import { createApiClient } from "./api-client";

export type RegisterPayload = Readonly<{
  email: string;
  password: string;
  display_name?: string;
}>;

export type LoginPayload = Readonly<{
  email: string;
  password: string;
}>;

export type AuthSession = Readonly<{
  accessToken: string;
  refreshToken: string;
  user: User;
}>;

export function createAuthClient(accessToken?: string) {
  const client = createApiClient({ accessToken });

  return {
    register(payload: RegisterPayload): Promise<TokenResponse> {
      return client.post<TokenResponse>("/auth/register", { ...payload });
    },
    login(payload: LoginPayload): Promise<TokenResponse> {
      return client.post<TokenResponse>("/auth/login", { ...payload });
    },
    refresh(refreshToken: string): Promise<TokenResponse> {
      return client.post<TokenResponse>("/auth/refresh", { refresh_token: refreshToken });
    },
    logout(refreshToken?: string): Promise<{ ok: boolean }> {
      return client.post<{ ok: boolean }>("/auth/logout", { refresh_token: refreshToken ?? null });
    },
    me(): Promise<User> {
      return client.get<User>("/auth/me");
    },
    updateProfile(payload: Partial<Profile>): Promise<Profile> {
      return client.put<Profile>("/account/profile", payload);
    },
    getPreferences(): Promise<Preferences> {
      return client.get<Preferences>("/account/preferences");
    },
    updatePreferences(payload: Preferences): Promise<Preferences> {
      return client.put<Preferences>("/account/preferences", payload);
    }
  };
}
