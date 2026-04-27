import React, { createContext, useState, useEffect } from 'react';
import { normalizeRole, normalizeUser } from '../utils/auth.js';
import {
  AUTH_LOGOUT_EVENT,
  clearStoredAuth,
  getStoredToken,
  getStoredUser,
  setStoredToken,
  setStoredUser
} from '../utils/authStorage.js';

export const AuthContext = createContext();

const decodeTokenPayload = (token) => {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = JSON.parse(window.atob(padded));
    return {
      ...decoded,
      role: normalizeRole(decoded?.role)
    };
  } catch (error) {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(() => normalizeUser(getStoredUser()));
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const handleForcedLogout = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);

    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
    };
  }, []);

  useEffect(() => {
    if (token) {
      const payload = decodeTokenPayload(token);
      const isExpired = payload?.exp && payload.exp * 1000 <= Date.now();
      const normalizedUser = normalizeUser(user);
      const hasUserMismatch = normalizedUser && payload && (
        payload.email !== normalizedUser.email || payload.role !== normalizedUser.role
      );

      if (!payload || isExpired || hasUserMismatch) {
        clearStoredAuth();
        setToken(null);
        setUser(null);
      } else {
        if (!normalizedUser) {
          const storedUser = getStoredUser();

          if (storedUser) {
            setUser(normalizeUser(storedUser));
          }
        } else if (normalizedUser.role !== user.role) {
          setStoredUser(normalizedUser);
          setUser(normalizedUser);
        }
      }
    } else {
      setUser(null);
    }

    setIsAuthReady(true);
  }, [token, user]);

  const login = (userData, authToken) => {
    const normalizedUser = normalizeUser(userData);
    setStoredToken(authToken);
    setStoredUser(normalizedUser);
    setToken(authToken);
    setUser(normalizedUser);
  };

  const logout = () => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
