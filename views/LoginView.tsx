import React, { useState } from 'react';
import { Button, Input, Card } from '../components/UI';
import { useToast } from '../context/ToastContext';
import { UserProfile } from '../types';
import { supabase } from '../services/supabaseClient';
import { useNavigate } from 'react-router-dom';

interface LoginViewProps {
  onLogin: (user: UserProfile) => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error(error);
      setIsLoading(false);
      addToast('error', error.message);
      return;
    }

    if (data.session) {
      navigate("/student");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 bg-[url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"></div>

      <Card className="w-full max-w-md relative z-10 border-slate-700/50 bg-slate-900/90 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
            <i className="fas fa-dumbbell text-3xl text-white"></i>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">OpenPerk</h1>
          <p className="text-slate-400 mt-2 text-sm">Sign in with Supabase</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <Input
            label="Email"
            type="email"
            placeholder="admin@openperk.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" className="w-full py-3" isLoading={isLoading}>
            Sign In
          </Button>

          <div className="mt-6 p-4 bg-slate-800/50 rounded-lg text-xs text-slate-400">
            <p className="font-semibold text-slate-300 mb-1">Notes:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Users must be created in Supabase Auth first.</li>
              <li>Profiles are auto-created on signup via Triggers.</li>
            </ul>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default LoginView;
