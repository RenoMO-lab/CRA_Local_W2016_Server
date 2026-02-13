import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mapServerUser = (raw: any): User | null => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').trim();
  const email = String(raw.email ?? '').trim();
  const name = String(raw.name ?? '').trim();
  const role = String(raw.role ?? '').trim();
  if (!id || !email || !name) return null;
  if (role !== 'sales' && role !== 'design' && role !== 'costing' && role !== 'admin') return null;
  const createdAtRaw = String(raw.createdAt ?? '').trim();
  const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();
  return {
    id,
    email,
    name,
    role,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      setUser(null);
      return;
    }
    const data = await res.json().catch(() => null);
    const nextUser = mapServerUser(data?.user);
    setUser(nextUser);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(email ?? '').trim(),
          password: String(password ?? ''),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return false;
      const nextUser = mapServerUser(data?.user);
      if (!nextUser) return false;
      setUser(nextUser);
      return true;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          if (!cancelled) setUser(null);
          return;
        }
        const data = await res.json().catch(() => null);
        const nextUser = mapServerUser(data?.user);
        if (!cancelled) setUser(nextUser);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      login,
      logout,
      refreshMe,
      isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
