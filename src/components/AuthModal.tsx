import React, { useEffect, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { toast } from 'sonner';
import { Lock, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { auth, googleAuthProvider } from '@/src/lib/firebase';
import { apiFetch, setSessionToken } from '@/src/lib/api';
import { UserProfile } from '@/src/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: 'login' | 'register';
  onAuthenticated: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onOpenChange,
  initialMode = 'login',
  onAuthenticated,
}) => {
  const [view, setView] = useState<'login' | 'register' | 'verify' | 'forgot' | 'reset'>(
    initialMode
  );
  const [loading, setLoading] = useState(false);

  // Login / Register fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OTP / Reset
  const [otp, setOtp] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'verify_email' | 'login_otp'>('verify_email');
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (open) {
      setView(initialMode);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      setSessionToken(null);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google sign-in sync failed');
      toast.success(`Welcome, ${data.user.fullName}`);
      onAuthenticated(data.user);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiFetch<{
        token?: string;
        user?: UserProfile;
        requiresOtp?: boolean;
        purpose?: 'verify_email' | 'login_otp';
        previewOtp?: string;
        message?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data.requiresOtp) {
        setOtp('');
        setOtpPurpose(data.purpose || 'login_otp');
        setPreviewOtp(data.previewOtp || null);
        setCooldown(25);
        setView('verify');
        toast.success(data.message || 'A 6-digit OTP has been sent to your email.');
        return;
      }

      if (data.token && data.user) {
        setSessionToken(data.token);
        toast.success(`Welcome back, ${data.user.fullName}`);
        onAuthenticated(data.user);
        onOpenChange(false);
      }
    } catch (err: any) {
      if (err?.data?.requiresVerification) {
        setOtp('');
        setOtpPurpose('verify_email');
        setPreviewOtp(err.data.previewOtp || null);
        setView('verify');
        toast.info('Please verify your email with the 6-digit OTP.');
      } else {
        toast.error(err?.message || 'Invalid login credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiFetch<{
        email: string;
        previewOtp?: string;
        message: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          phone,
          password,
          confirmPassword,
        }),
      });
      setOtp('');
      setOtpPurpose('verify_email');
      setPreviewOtp(data.previewOtp || null);
      setCooldown(25);
      setView('verify');
      toast.success(data.message || 'Account created! Check your email for the 6-digit OTP.');
    } catch (err: any) {
      toast.error(err?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
      });
      setSessionToken(data.token);
      toast.success(
        otpPurpose === 'login_otp'
          ? `Welcome back, ${data.user.fullName}`
          : 'Email verified! Your account is ready.'
      );
      onAuthenticated(data.user);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async (purpose: 'verify_email' | 'login_otp' | 'reset_password') => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ previewOtp?: string; message: string }>(
        '/api/auth/resend-otp',
        {
          method: 'POST',
          body: JSON.stringify({ email, purpose }),
        }
      );
      setPreviewOtp(data.previewOtp || null);
      setCooldown(25);
      toast.success(data.message);
    } catch (err: any) {
      toast.error(err?.message || 'Could not resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiFetch<{ previewOtp?: string; message: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );
      setPreviewOtp(data.previewOtp || null);
      setCooldown(25);
      setView('reset');
      toast.success('Reset OTP generated. Enter the code and your new password.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not find account.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email,
          otp,
          newPassword: password,
          confirmPassword,
        }),
      });
      toast.success('Password reset complete. Please sign in.');
      setPassword('');
      setConfirmPassword('');
      setOtp('');
      setView('login');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {view === 'login' && 'Sign in to MAGNOM PHONES HUB'}
            {view === 'register' && 'Create your Ghana customer account'}
            {view === 'verify' &&
              (otpPurpose === 'login_otp' ? 'Enter Login OTP' : 'Verify your email address')}
            {view === 'forgot' && 'Reset forgotten password'}
            {view === 'reset' && 'Set a new password'}
          </DialogTitle>
          <DialogDescription>
            {view === 'login' &&
              'Access your orders, saved addresses, wishlist, and Paystack checkout.'}
            {view === 'register' &&
              'Register with a valid Ghana phone number and verify your email via OTP.'}
            {view === 'verify' &&
              `Enter the 6-digit security code sent to ${email || 'your email'}.`}
            {view === 'forgot' && 'We will generate a 6-digit reset OTP for your email.'}
            {view === 'reset' && 'Enter your 6-digit OTP and choose a strong new password.'}
          </DialogDescription>
        </DialogHeader>

        {(view === 'login' || view === 'register') && (
          <div className="mb-4">
            <Button
              type="button"
              variant="outline"
              className="w-full h-10 font-semibold border-slate-300"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <svg className="h-4 w-4 mr-1" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2.5 text-slate-400">or with email &amp; password</span>
              </div>
            </div>
          </div>
        )}

        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email Address</Label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kwame@example.com"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Password</Label>
                <button
                  type="button"
                  onClick={() => setView('forgot')}
                  className="text-xs font-medium text-[#DC0000] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                />
              </div>
            </div>

            <Button type="submit" variant="accent" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>New to MAGNOM PHONES HUB?</span>
              <button
                type="button"
                onClick={() => setView('register')}
                className="font-semibold text-[#001B5E] hover:text-[#DC0000] cursor-pointer"
              >
                Create Account
              </button>
            </div>
          </form>
        )}

        {view === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Full Name</Label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  id="reg-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Kwame Boateng"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email Address</Label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kwame@example.com"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-phone">Ghana Phone Number</Label>
              <div className="relative">
                <Phone className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  id="reg-phone"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0241234567 or +233241234567"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-pass">Password (8+ chars)</Label>
                <Input
                  id="reg-pass"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-confirm">Confirm Password</Label>
                <Input
                  id="reg-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <Button type="submit" variant="accent" className="w-full mt-1" disabled={loading}>
              {loading ? 'Creating Account...' : 'Register & Send Email OTP'}
            </Button>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Already have an account?</span>
              <button
                type="button"
                onClick={() => setView('login')}
                className="font-semibold text-[#001B5E] hover:text-[#DC0000] cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {view === 'verify' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            {previewOtp && (
              <div className="rounded-lg border border-red-200 bg-[#FFF1F1] p-3 text-xs text-slate-700">
                <div className="flex items-center gap-2 font-semibold text-[#001B5E] mb-1">
                  <ShieldCheck className="h-4 w-4 text-[#DC0000]" />
                  <span>Verification Code Preview</span>
                </div>
                <p>
                  Enter OTP code{' '}
                  <span className="font-mono-nums font-bold text-[#DC0000] text-sm">
                    {previewOtp}
                  </span>{' '}
                  to verify <span className="font-medium">{email}</span>.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="otp-code">6-Digit Email OTP</Label>
              <Input
                id="otp-code"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="font-mono-nums text-center text-lg tracking-widest"
              />
            </div>

            <Button type="submit" variant="accent" className="w-full" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify Email & Continue'}
            </Button>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => handleResendOtp(otpPurpose)}
                disabled={cooldown > 0 || loading}
                className="font-semibold text-[#DC0000] hover:underline disabled:text-slate-400 cursor-pointer"
              >
                {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
              </button>
              <button
                type="button"
                onClick={() => setView('login')}
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Account Email</Label>
              <Input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kwame@example.com"
              />
            </div>
            <Button type="submit" variant="accent" className="w-full" disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send Reset OTP'}
            </Button>
            <button
              type="button"
              onClick={() => setView('login')}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Back to Sign In
            </button>
          </form>
        )}

        {view === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-3.5">
            {previewOtp && (
              <div className="rounded-lg border border-red-200 bg-[#FFF1F1] p-3 text-xs text-slate-700">
                Reset OTP:{' '}
                <span className="font-mono-nums font-bold text-[#DC0000] text-sm">
                  {previewOtp}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="reset-otp">6-Digit Reset OTP</Label>
              <Input
                id="reset-otp"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="font-mono-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-pass">New Password</Label>
              <Input
                id="reset-pass"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-confirm">Confirm New Password</Label>
              <Input
                id="reset-confirm"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" variant="accent" className="w-full" disabled={loading}>
              {loading ? 'Updating Password...' : 'Update Password'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
