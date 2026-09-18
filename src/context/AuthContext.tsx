import { createContext, useContext, useState, type ReactNode } from 'react';
import { clearToken, getToken, setToken } from '../api/client';
import { login as loginRequest } from '../api/auth';
import type { LoginRequest } from '../types/api';

interface AuthState {
  email: string | null;
  role: string | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STATE_KEY = 'careerops_auth_state';

function loadState(): AuthState {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return { email: null, role: null };
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return { email: null, role: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadState);

  const login = async (credentials: LoginRequest) => {
    const result = await loginRequest(credentials);
    setToken(result.access_token);
    const next: AuthState = { email: result.email, role: result.role };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    setState(next);
  };

  const logout = () => {
    // CONTRACT.md: no logout endpoint exists — logging out is purely
    // client-side (discard the token).
    clearToken();
    localStorage.removeItem(STATE_KEY);
    setState({ email: null, role: null });
  };

  const isAuthenticated = Boolean(getToken()) && Boolean(state.email);

  return (
    <AuthContext.Provider value={{ ...state, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
