import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "worker" | "manager";
  workerId: number | null;
  workerName: string | null;
  mustChangePassword: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
  }, []);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Login failed");
    }
    const me: AuthUser = await res.json();
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
