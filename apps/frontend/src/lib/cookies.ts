export interface CookieOptions {
  days?: number;
  path?: string;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
}

export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (typeof document === "undefined") {
    return;
  }

  const { days = 7, path = "/", secure = window.location.protocol === "https:", sameSite = "lax" } = options;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();

  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=${path}; SameSite=${sameSite}`;

  if (secure) {
    cookieString += "; Secure";
  }

  document.cookie = cookieString;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const nameEQ = `${encodeURIComponent(name)}=`;
  const cookies = document.cookie.split(";");

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(nameEQ)) {
      return decodeURIComponent(trimmed.substring(nameEQ.length));
    }
  }

  return null;
}

export function deleteCookie(name: string, options: CookieOptions = {}): void {
  if (typeof document === "undefined") {
    return;
  }

  setCookie(name, "", { ...options, days: -1 });
}
