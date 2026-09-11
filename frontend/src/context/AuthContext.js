import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import {getCurrentUser, login as loginRequest} from '../api/auth';
import {clearToken, readToken, saveToken, readCachedUser, saveCachedUser, clearCachedUser} from '../auth/storage';

const AuthContext = createContext(null);

function mergeUser(result) {
  return {...result.user, collection: result.collection || result.user?.collection || null};
}

export function AuthProvider({children}) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tracks whether the current session was restored from local storage
  // without a confirmed server round-trip yet (i.e. the app opened
  // offline). Exposed so screens can show a subtle "syncing" indicator if
  // desired; it never blocks navigation to the authenticated screens.
  const [sessionSyncPending, setSessionSyncPending] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      setLoading(false);
      return undefined;
    }
    mountedRef.current = true;

    async function restoreSession() {
      let storedToken = null;
      try {
        storedToken = await readToken();
      } catch (error) {
        storedToken = null;
      }

      if (!storedToken) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      // OFFLINE-FIRST: restore the locally persisted session immediately
      // from the cached profile. This must NOT depend on any network
      // request - a device that opens the app with no connectivity still
      // lands on the authenticated screen using the last-known profile.
      const cachedUser = await readCachedUser();
      if (mountedRef.current) {
        setToken(storedToken);
        if (cachedUser) {
          setUser(cachedUser);
          setSessionSyncPending(true);
        }
        // Only block on the network when there is no cached profile at
        // all (e.g. first restore after a fresh install/login that never
        // got a chance to cache). Otherwise stop the splash/loading state
        // right away so the user is never stuck waiting on the network
        // just to see a screen they're already authenticated for.
        if (cachedUser) setLoading(false);
      }

      // Best-effort background refresh/validation. A network failure here
      // must never sign the user out - only an explicit "unauthorized"
      // response (expired/invalid token) does that. ApiError uses
      // status === 0 for "could not reach the server" / timeouts.
      try {
        const result = await getCurrentUser(storedToken);
        if (mountedRef.current) {
          const freshUser = mergeUser(result);
          setToken(storedToken);
          setUser(freshUser);
          setSessionSyncPending(false);
        }
        await saveCachedUser(mergeUser(result));
      } catch (error) {
        const isNetworkFailure = !error?.status || error.status === 0;
        if (isNetworkFailure) {
          // Offline or server unreachable: keep the locally restored
          // session as-is. Do NOT clear the token/user and do NOT force
          // the login screen.
          if (mountedRef.current) setSessionSyncPending(Boolean(cachedUser));
        } else if (error.status === 401 || error.status === 403) {
          // The server has explicitly rejected this token - only now is
          // it correct to sign the user out.
          await clearToken();
          await clearCachedUser();
          if (mountedRef.current) {
            setToken(null);
            setUser(null);
            setSessionSyncPending(false);
          }
        }
        // Other server-side errors (5xx, etc.) are treated like a
        // network failure: keep the user logged in with their cached
        // session rather than bouncing them to Login for a transient
        // backend issue.
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function signIn(identifier, password, selectedRole) {
    const result = await loginRequest(identifier, password, selectedRole);
    await saveToken(result.token);
    const mergedUser = mergeUser(result);
    await saveCachedUser(mergedUser);
    setToken(result.token);
    setUser(mergedUser);
    setSessionSyncPending(false);
  }

  async function signOut() {
    await clearToken();
    await clearCachedUser();
    setToken(null);
    setUser(null);
    setSessionSyncPending(false);
  }

  function updateUser(updatedUser) {
    setUser(current => {
      const next = {...current, ...updatedUser};
      saveCachedUser(next);
      return next;
    });
  }

  return (
    <AuthContext.Provider value={{token, user, loading, sessionSyncPending, signIn, signOut, updateUser}}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}