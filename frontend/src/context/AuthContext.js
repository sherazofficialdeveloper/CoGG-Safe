import React, {createContext, useContext, useEffect, useState} from 'react';
import {getCurrentUser, login as loginRequest} from '../api/auth';
import {clearToken, readToken, saveToken} from '../auth/storage';

const AuthContext = createContext(null);

export function AuthProvider({children}) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      setLoading(false);
      return undefined;
    }
    let mounted = true;

    async function restoreSession() {
      try {
        const storedToken = await readToken();
        if (!storedToken) return;
        const result = await getCurrentUser(storedToken);
        if (mounted) {
          setToken(storedToken);
          setUser({...result.user, collection: result.collection || result.user?.collection || null});
        }
      } catch (error) {
        await clearToken();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  async function signIn(identifier, password, selectedRole) {
    const result = await loginRequest(identifier, password, selectedRole);
    await saveToken(result.token);
    setToken(result.token);
    setUser({...result.user, collection: result.collection || result.user?.collection || null});
  }

  async function signOut() {
    await clearToken();
    setToken(null);
    setUser(null);
  }

  function updateUser(updatedUser) {
    setUser(current => ({...current, ...updatedUser}));
  }

  return (
    <AuthContext.Provider value={{token, user, loading, signIn, signOut, updateUser}}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}