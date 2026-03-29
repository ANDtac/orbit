export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api/v1";

export const ACCESS_TOKEN_COOKIE = "orbit.access_token";
export const REFRESH_TOKEN_COOKIE = "orbit.refresh_token";
export const THEME_COOKIE = "orbit.theme";

export const LIGHT_THEME_COLORS = {
  text: "#002A57",
  background: "#E5F1FF",
  primary: "#0071B8",
  secondary: "#C2995B",
  accent: "#3796CD",
};

export const DARK_THEME_COLORS = {
  text: "#A8D2FF",
  background: "#000C1A",
  primary: "#47B9FF",
  secondary: "#A47B3D",
  accent: "#3291C8",
};

export const THEME_FONT_HEADING = "'Sansation', sans-serif";
export const THEME_FONT_BODY = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const QUERY_KEYS = {
  devices: "devices",
  jobs: "jobs",
  compliancePolicies: "compliancePolicies",
  requestLogs: "requestLogs",
  errorLogs: "errorLogs",
};
