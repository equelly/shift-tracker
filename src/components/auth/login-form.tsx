'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Сброс пароля
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<{
    success: boolean;
    message: string;
    tempPassword?: string;
    email?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('Неверный email или пароль');
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetResult(null);
    setCopied(false);

    try {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setResetResult({
          success: true,
          message: 'Пароль сброшен',
          tempPassword: data.tempPassword,
          email: data.email,
        });
      } else {
        setResetResult({
          success: false,
          message: data.error || 'Не удалось сбросить пароль',
        });
      }
    } catch {
      setResetResult({
        success: false,
        message: 'Ошибка соединения с сервером',
      });
    } finally {
      setResetLoading(false);
    }
  };

  const copyTempPassword = async () => {
    if (resetResult?.tempPassword) {
      await navigator.clipboard.writeText(resetResult.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const useTempPassword = () => {
    // Подставляем email и временный пароль в форму входа
    if (resetResult?.email) setEmail(resetResult.email);
    if (resetResult?.tempPassword) setPassword(resetResult.tempPassword);
    closeResetDialog();
  };

  const closeResetDialog = () => {
    setShowReset(false);
    setResetEmail('');
    setResetResult(null);
    setCopied(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-emerald-600 rounded-xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold">Учёт рабочего времени</CardTitle>
          <CardDescription>Система сменного учёта</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@factory.ru"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Пароль</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
              />
            </div>
            {error && (
              <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded">{error}</div>
            )}
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </form>

          {/* Ссылка Забыли пароль */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowReset(true)}
              className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
            >
              Забыли пароль?
            </button>
          </div>

          <div className="mt-6 text-xs text-gray-400 space-y-1">
            <p className="font-medium text-gray-500">Тестовые аккаунты:</p>
            <p>Админ: admin@factory.ru / admin123</p>
            <p>Мастер: master1@factory.ru / master123</p>
            <p>Бригадир: brig1@factory.ru / brig123</p>
          </div>
        </CardContent>
      </Card>

      {/* === Диалог сброса пароля === */}
      <Dialog open={showReset} onOpenChange={closeResetDialog}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Сброс пароля</DialogTitle>
          </DialogHeader>

          {!resetResult ? (
            <>
              <div className="space-y-4 py-2">
                <p className="text-sm text-gray-600">
                  Введите ваш email. Если аккаунт найден, пароль будет сброшен и вам будет выдан временный пароль для входа.
                </p>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                  <Input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="your@email.ru"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleResetPassword();
                    }}
                  />
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={closeResetDialog} className="w-full sm:w-auto">
                  Отмена
                </Button>
                <Button
                  onClick={handleResetPassword}
                  className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                  disabled={!resetEmail.trim() || resetLoading}
                >
                  {resetLoading ? 'Сброс...' : 'Сбросить пароль'}
                </Button>
              </DialogFooter>
            </>
          ) : resetResult.success && resetResult.tempPassword ? (
            /* Успешный сброс — показываем временный пароль */
            <>
              <div className="py-4 space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="text-xl">✅</span>
                    <p className="font-medium text-green-800">Пароль сброшен</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                  <p className="text-sm font-medium text-blue-800">Ваш временный пароль:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white border border-blue-300 rounded text-lg font-mono text-blue-900 tracking-wider select-all">
                      {resetResult.tempPassword}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyTempPassword}
                      className="shrink-0"
                    >
                      {copied ? '✓' : 'Копировать'}
                    </Button>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                  <p className="font-medium">После входа система попросит установить новый пароль.</p>
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={closeResetDialog} className="w-full sm:w-auto">
                  Отмена
                </Button>
                <Button
                  onClick={useTempPassword}
                  className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                >
                  Войти с этим паролем
                </Button>
              </DialogFooter>
            </>
          ) : (
            /* Ошибка */
            <>
              <div className="py-4">
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="text-xl">❌</span>
                    <div>
                      <p className="font-medium text-red-800">Ошибка</p>
                      <p className="text-sm text-red-700 mt-1">{resetResult.message}</p>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={closeResetDialog} className="w-full sm:w-auto">
                  Понятно
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}