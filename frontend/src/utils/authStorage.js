const TOKEN_KEY = 'token';
const USER_KEY = 'user';
export const AUTH_LOGOUT_EVENT = 'echo-auth-logout';

const getAuthStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage;
};

export const getStoredToken = () => getAuthStorage()?.getItem(TOKEN_KEY) ?? null;

export const getStoredUser = () => {
  const rawUser = getAuthStorage()?.getItem(USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser);
  } catch (error) {
    getAuthStorage()?.removeItem(USER_KEY);
    return null;
  }
};

export const setStoredToken = (token) => {
  if (!token) {
    getAuthStorage()?.removeItem(TOKEN_KEY);
    return;
  }

  getAuthStorage()?.setItem(TOKEN_KEY, token);
};

export const setStoredUser = (user) => {
  if (!user) {
    getAuthStorage()?.removeItem(USER_KEY);
    return;
  }

  getAuthStorage()?.setItem(USER_KEY, JSON.stringify(user));
};

export const clearStoredAuth = () => {
  const storage = getAuthStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(TOKEN_KEY);
  storage.removeItem(USER_KEY);
};

export const notifyAuthLogout = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
};
