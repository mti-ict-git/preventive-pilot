export const AUTH_TOKEN_STORAGE_KEY = "pm_access_token";
export const REFRESH_TOKEN_STORAGE_KEY = "pm_refresh_token";

export const getAccessToken = (): string | null => {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setAccessToken = (token: string) => {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
};

export const clearAccessToken = () => {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

export const getRefreshToken = (): string | null => {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setRefreshToken = (token: string) => {
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
};

export const clearRefreshToken = () => {
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
};

export type JwtClaims = {
  sub: string;
  username: string;
  roles: string[];
};

const decodeBase64Url = (input: string): string | null => {
  try {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLength);
    return atob(padded);
  } catch {
    return null;
  }
};

const isJwtClaims = (value: unknown): value is JwtClaims => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  const sub = v.sub;
  const username = v.username;
  const roles = v.roles;

  if (typeof sub !== "string") return false;
  if (typeof username !== "string") return false;
  if (!Array.isArray(roles)) return false;
  if (!roles.every((r) => typeof r === "string")) return false;

  return true;
};

export const getJwtClaims = (): JwtClaims | null => {
  const token = getAccessToken();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length < 2) return null;

  const payloadJson = decodeBase64Url(parts[1]);
  if (!payloadJson) return null;

  try {
    const parsed: unknown = JSON.parse(payloadJson);
    return isJwtClaims(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const hasRole = (roleName: string): boolean => {
  const claims = getJwtClaims();
  if (!claims) return false;
  return claims.roles.includes(roleName);
};

export const hasAnyRole = (roleNames: readonly string[]): boolean => {
  const claims = getJwtClaims();
  if (!claims) return false;
  return roleNames.some((r) => claims.roles.includes(r));
};

export const isSuperadmin = (): boolean => hasRole("Superadmin");

export const isManager = (): boolean => hasAnyRole(["Superadmin", "Admin", "Supervisor"]);
