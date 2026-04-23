'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { signOut } from 'next-auth/react';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mustChange?: boolean; // Принудительная смена пароля
}

export function ChangePasswordDialog({ open, onOpenChange, mustChange }: ChangePasswordDialogProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast({ title: 'Ошибка', description: 'Пароль должен быть не менее 6 символов', variant: 'destructive' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: 'Ошибка', description: 'Пароли не совпадают', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword: mustChange ? '__skip__' : oldPassword,
          newPassword,
          mustChange,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка');
      }

      toast({ title: 'Готово', description: 'Пароль успешно изменён' });

      // Очищаем форму
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (mustChange) {
        onOpenChange(false);
        toast({ title: 'Войдите заново', description: 'Пароль изменён. Войдите с новым паролем.' });
        setTimeout(() => signOut(), 1000);
      } else {
        onOpenChange(false);
      }
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={mustChange ? undefined : onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md" onPointerDownOutside={mustChange ? (e) => e.preventDefault() : undefined}>
        <DialogHeader>
          <DialogTitle>
            {mustChange ? '🔑 Установите новый пароль' : '🔑 Сменить пароль'}
          </DialogTitle>
          {mustChange && (
            <DialogDescription>
              Вы вошли с временным паролем. Пожалуйста, установите свой собственный пароль для продолжения работы.
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* При принудительной смене НЕ спрашиваем старый пароль */}
          {!mustChange && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Текущий пароль</label>
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••"
                required
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Новый пароль</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Подтвердите новый пароль</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••"
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={loading || (!mustChange && !oldPassword) || !newPassword || !confirmPassword}
            >
              {loading ? 'Сохранение...' : mustChange ? 'Установить пароль' : 'Сменить пароль'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}