const TOKEN_KEY = 'eventops_auth_token';

const decodeBase64 = (str: string): string => {
  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return window.atob(str);
    }
    if (typeof atob === 'function') {
      return atob(str);
    }
  } catch {
    return '';
  }
  return '';
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeBase64(base64);
    if (!jsonStr) return false;
    const payload = JSON.parse(jsonStr);
    if (payload.exp && typeof payload.exp === 'number') {
      return payload.exp * 1000 <= Date.now();
    }
    return false;
  } catch {
    return false;
  }
};

export const getStoredToken = (): string | null => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && isTokenExpired(token)) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
};

export const setStoredToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeStoredToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};
