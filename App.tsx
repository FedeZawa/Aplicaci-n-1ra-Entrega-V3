import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from './types';
import LoginView from './views/LoginView';
import AdminDashboard from './views/AdminDashboard';
import StudentDashboard from './views/StudentDashboard';
import { ToastProvider } from './context/ToastContext';
import { supabase } from './services/supabaseClient';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const AppContent = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [initStarted, setInitStarted] = useState(false);

  const fetchAndSetProfile = async (userId: string, mounted: boolean) => {
    if (user?.id === userId) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (data && mounted) {
        setUser(data as UserProfile);
      }
    } catch (e) {
      console.error('App: fetchAndSetProfile caught error:', e);
      if (mounted) setUser(null);
    }
  };

  useEffect(() => {
    if (initStarted) return;
    setInitStarted(true);

    let mounted = true;
    const bootstrap = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user && mounted) {
          await fetchAndSetProfile(session.user.id, mounted);
        }
      } catch (e) {
        console.error('App: Bootstrap error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user && mounted) {
          await fetchAndSetProfile(session.user.id, mounted);
          if (mounted) setLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = (u: UserProfile) => {
    setUser(u);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleUpdateUser = (updatedUser: UserProfile) => {
    setUser(updatedUser);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 font-medium animate-pulse">Initializing OpenPerk...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={!user ? <LoginView onLogin={handleLogin} /> : <Navigate to={user.role === UserRole.ADMIN ? "/admin" : "/student"} />}
      />
      <Route
        path="/admin"
        element={user?.role === UserRole.ADMIN ? <AdminDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/" />}
      />
      <Route
        path="/student"
        element={user?.role === UserRole.STUDENT ? <StudentDashboard user={user} onLogout={handleLogout} onUpdateUser={handleUpdateUser} /> : <Navigate to="/" />}
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

const App = () => {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ToastProvider>
  );
};

export default App;
