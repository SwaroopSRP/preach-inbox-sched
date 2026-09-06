import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import type { User } from '../types/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  devLogin: (email?: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      // 1. Check if token was passed in URL query (?token=...) or hash (#token=...) from OAuth redirect
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        let urlToken = urlParams.get('token');
        if (!urlToken && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          urlToken = hashParams.get('token');
        }

        if (urlToken) {
          localStorage.setItem('preach_token', urlToken);
          // Strip ?token=... from address bar cleanly without page reload
          const url = new URL(window.location.href);
          url.searchParams.delete('token');
          window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
        }
      }

      const currentUser = await api.auth.getMe();
      setUser(currentUser);
    } catch {
      localStorage.removeItem('preach_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    if (res.token) {
      localStorage.setItem('preach_token', res.token);
    }
    setUser(res.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await api.auth.register(email, password, name);
    if (res.token) {
      localStorage.setItem('preach_token', res.token);
    }
    setUser(res.user);
  };

  const devLogin = async (email?: string, name?: string) => {
    const res = await api.auth.devLogin(email, name);
    if (res.token) {
      localStorage.setItem('preach_token', res.token);
    }
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('preach_token');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        devLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
