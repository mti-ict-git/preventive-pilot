export const AUTH_TOKEN_STORAGE_KEY = "pm_access_token";

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

