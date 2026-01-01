import { getAccessToken } from "@/lib/auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001").replace(
  /\/$/,
  "",
);

export type LoginProvider = "ldap" | "local";

export type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    email: string | null;
    roles: string[];
  };
};

export class ApiError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const apiLogin = async (input: {
  identifier: string;
  password: string;
  provider: LoginProvider;
}): Promise<LoginResponse> => {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const message = res.status === 401 ? "Invalid username or password" : "Login failed";
    throw new ApiError(message, res.status);
  }

  const data = (await res.json()) as unknown;
  return data as LoginResponse;
};

export const apiGetMe = async (): Promise<{
  user: { id: string; username: string; roles: string[] };
}> => {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new ApiError("Failed to load profile", res.status);
  }

  const data = (await res.json()) as unknown;
  return data as { user: { id: string; username: string; roles: string[] } };
};

