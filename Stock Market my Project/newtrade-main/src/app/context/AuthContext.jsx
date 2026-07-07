/**
 * context/AuthContext.jsx
 * ========================
 * Handles ALL auth API calls:
 *   - login  (stores tokens)
 *   - logout (calls POST /authentication/logout then clears storage)
 *   - fetchMe (GET /authentication/me — loads user on app boot)
 *   - refreshToken (POST /authentication/refresh — auto-refresh before expiry)
 *   - changePassword (POST /authentication/change_password)
 *
 * Wires every API button that was missing from the original code.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const API_BASE = "http://127.0.0.1:5050/v1";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true); // true while fetchMe runs on boot

  // ── Helper: get stored access token ─────────────────────────────────────
  const getToken = () => localStorage.getItem("access_token");

  // ── Helper: authenticated fetch (auto-attaches Bearer) ──────────────────
  const authFetch = useCallback(async (url, options = {}) => {
    const token = getToken();
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  }, []);

  // 
  //  fetchMe — GET /authentication/me
  //  Called on every app boot to restore user from stored token.
  // 
  const fetchMe = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const res  = await fetch(`${API_BASE}/authentication/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.bool) {
        setUser(data.response);
      } else {
        // Token invalid — try refresh before giving up
        await refreshToken();
      }
    } catch (err) {
      console.error("[Auth] fetchMe error:", err);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  // 
  //  refreshToken — POST /authentication/refresh
  //  Called when access token is expired.
  //  Returns the new access_token string or null on failure.
  // 
  const refreshToken = useCallback(async () => {
    const refresh = localStorage.getItem("refresh_token");
    if (!refresh) {
      clearAuth();
      return null;
    }
    try {
      const res  = await fetch(`${API_BASE}/authentication/refresh`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${refresh}`,
        },
      });
      const data = await res.json();
      if (data.bool && data.response?.access_token) {
        localStorage.setItem("access_token", data.response.access_token);
        // Re-fetch user after refresh
        const meRes  = await fetch(`${API_BASE}/authentication/me`, {
          headers: { Authorization: `Bearer ${data.response.access_token}` },
        });
        const meData = await meRes.json();
        if (meData.bool) setUser(meData.response);
        return data.response.access_token;
      } else {
        // Refresh token itself was rejected (expired/invalid) — session is genuinely over.
        clearAuth();
        return null;
      }
    } catch (err) {
      // Network hiccup, not an auth rejection — keep the existing tokens and
      // retry later instead of silently signing the user out.
      console.error("[Auth] refreshToken network error (session kept):", err);
      return null;
    }
  }, []); // eslint-disable-line

  //
  //  On mount — restore session
  //
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  //
  //  Proactive silent refresh — keeps the session alive in the background
  //  so the access token never silently expires while the user is active.
  //  The user should only ever be signed out by clicking "Sign Out", not by
  //  a token quietly expiring mid-session.
  //
  useEffect(() => {
    const interval = setInterval(() => {
      if (localStorage.getItem("access_token")) refreshToken();
    }, 20 * 60 * 1000); // every 20 minutes — well under the 2h access token TTL
    return () => clearInterval(interval);
  }, [refreshToken]);

  // 
  //  login — called by SignInPage after successful login response
  //  Stores tokens and sets user state.
  // 
  const login = useCallback((email, password, role, userData) => {
    // Tokens already stored by SignInPage before calling login()
    if (userData) setUser(userData);
    else setUser({ email, role });
  }, []);

  // 
  //  logout — POST /authentication/logout then clear local storage
  // 
  const logout = useCallback(async () => {
    const token = getToken();
    if (token) {
      try {
        // ── Call the actual logout API ──────────────────────────────────
        await fetch(`${API_BASE}/authentication/logout`, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.warn("[Auth] Logout API call failed (continuing):", err);
      }
    }
    clearAuth();
  }, []);

  // 
  //  clearAuth — wipe local storage + state
  // 
  const clearAuth = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  // 
  //  changePassword — POST /authentication/change_password
  //  Returns { success: bool, message: string }
  // 
  const changePassword = useCallback(async (oldPassword, newPassword) => {
    try {
      const res  = await authFetch(`${API_BASE}/authentication/change_password`, {
        method: "POST",
        body:   JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const data = await res.json();
      return {
        success: data.bool,
        message: data.response?.message || (data.bool ? "Password changed." : "Failed."),
      };
    } catch (err) {
      return { success: false, message: "Network error." };
    }
  }, [authFetch]);

  // 
  //  isAdmin helper
  // 
  const isAdmin = user?.role?.toLowerCase() === "admin";

  const value = {
    user,
    loading,
    isAdmin,
    login,
    logout,
    fetchMe,
    refreshToken,
    changePassword,
    authFetch,
    getToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}














