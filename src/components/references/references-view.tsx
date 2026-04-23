'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';

interface Grade {
  number: number;
  name: string;
  hourlyRate: number;
  workerCount: number;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
}

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  workerId: string | null;
  mustChangePassword: boolean;
  worker: { id: string; lastName: string; firstName: string; patronymic: string } | null;
}

interface Worker {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
}

const ROLE_MAP: Record<string, { label: string; color: string }> = {
  admin:     { label: 'Администратор', color: 'bg-purple-100 text-purple-800' },
  master:    { label: 'Мастер',        color: 'bg-blue-100 text-blue-800' },
  brigadier: { label: 'Бригадир',      color: 'bg-amber-100 text-amber-800' },
  worker:    { label: 'Работник',       color: 'bg-gray-100 text-gray-800' },
};

export function ReferencesView() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [grades, setGrades] = useState<Grade[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [editingGrade, setEditingGrade] = useState<number | null>(null);
  const [editRate, setEditRate] = useState(0);
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });

  // Пользователи
  const [users, setUsers] = useState<UserItem[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [userForm, setUserForm] = useState({ email: '', name: '', role: 'worker', workerId: '' });
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  const fetchGrades = useCallback(async () => {
    const res = await fetch('/api/grades');
    const data = await res.json();
    setGrades(data);
  }, []);

  const fetchHolidays = useCallback(async () => {
    const res = await fetch('/api/holidays?year=2026');
    const data = await res.json();
    setHolidays(data);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) setUsers(await res.json());
    } catch {}
  }, []);

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch('/api/workers');
      if (res.ok) setWorkers(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/grades').then(r => r.json()),
      fetch('/api/holidays?year=2026').then(r => r.json()),
      fetch('/api/users').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([g, h, u]) => {
      if (!cancelled) {
        setGrades(g);
        setHolidays(h);
        setUsers(u);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleSaveGrade = async (number: number, hourlyRate: number) => {
    await fetch('/api/grades', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number,
        hourlyRate,
        name: `${number} разряд`,
        markedBy: (session?.user as any)?.id,
        markedByName: session?.user?.name,
      }),
    });
    setEditingGrade(null);
    fetchGrades();
  };

  const handleAddHoliday = async () => {
    await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...holidayForm,
        markedBy: (session?.user as any)?.id,
        markedByName: session?.user?.name,
      }),
    });
    setShowAddHoliday(false);
    setHolidayForm({ date: '', name: '' });
    fetchHolidays();
  };

  const handleDeleteHoliday = async (id: string) => {
    await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' });
    fetchHolidays();
  };

  // --- Пользователи ---
  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({ email: '', name: '', role: 'worker', workerId: '' });
    setTempPassword(null);
    fetchWorkers();
    setShowUserDialog(true);
  };

  const openEditUser = (user: UserItem) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      name: user.name,
      role: user.role,
      workerId: user.workerId || '',
    });
    setTempPassword(null);
    fetchWorkers();
    setShowUserDialog(true);
  };

  const handleSaveUser = async () => {
    setSavingUser(true);
    try {
      if (editingUser) {
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userForm),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Ошибка');
        }
        toast({ title: 'Готово', description: 'Пользователь обновлён' });
        setShowUserDialog(false);
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userForm),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Ошибка');
        }
        const data = await res.json();
        if (data.tempPassword) {
          setTempPassword(data.tempPassword);
        }
        toast({ title: 'Готово', description: 'Пользователь создан' });
      }
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Удалить этого пользователя?')) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка');
      }
      toast({ title: 'Удалено', description: 'Пользователь удалён' });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    }
  };

  const handleResetPassword = async (userId: string, userName: string) => {
    if (!confirm(`Сбросить пароль для ${userName}? Будет создан временный пароль.`)) return;
    try {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка');
      }
      const data = await res.json();
      toast({
        title: 'Пароль сброшен',
        description: `Временный пароль: ${data.tempPassword}`,
        duration: 15000,
      });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Grades */}
      <Card>
        <CardHeader>
          <CardTitle>Разряды и тарифные ставки</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="px-4 py-2 text-center font-medium">Разряд</th>
                <th className="px-4 py-2 text-center font-medium">Название</th>
                <th className="px-4 py-2 text-center font-medium">Ставка (руб/ч)</th>
                <th className="px-4 py-2 text-center font-medium">Работников</th>
                <th className="px-4 py-2 text-center font-medium">Действие</th>
              </tr>
            </thead>
            <tbody>
              {grades.map(g => (
                <tr key={g.number} className="border-b">
                  <td className="px-4 py-2 text-center font-bold">{g.number}</td>
                  <td className="px-4 py-2 text-center">{g.name}</td>
                  <td className="px-4 py-2 text-center">
                    {editingGrade === g.number ? (
                      <div className="flex items-center gap-2 justify-center flex-wrap">
                        <Input
                          type="number"
                          value={editRate}
                          onChange={e => setEditRate(parseFloat(e.target.value))}
                          className="w-24 text-center"
                        />
                        <Button size="sm" onClick={() => handleSaveGrade(g.number, editRate)} className="bg-emerald-600 hover:bg-emerald-700">✓</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingGrade(null)}>✕</Button>
                      </div>
                    ) : (
                      <span className="font-semibold text-emerald-700">{g.hourlyRate} руб.</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center"><Badge variant="secondary">{g.workerCount}</Badge></td>
                  <td className="px-4 py-2 text-center">
                    {editingGrade !== g.number && (
                      <Button variant="outline" size="sm" onClick={() => { setEditingGrade(g.number); setEditRate(g.hourlyRate); }}>
                        Изменить ставку
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Пользователи</CardTitle>
            <Button onClick={openCreateUser} className="bg-emerald-600 hover:bg-emerald-700">+ Добавить</Button>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Пользователей пока нет</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="px-3 py-2 text-left font-medium">ФИО</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-center font-medium">Роль</th>
                    <th className="px-3 py-2 text-left font-medium">Работник</th>
                    <th className="px-3 py-2 text-center font-medium">Статус</th>
                    <th className="px-3 py-2 text-center font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const roleInfo = ROLE_MAP[u.role] || ROLE_MAP.worker;
                    return (
                      <tr key={u.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{u.name}</td>
                        <td className="px-3 py-2 text-gray-600">{u.email}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge className={roleInfo.color}>{roleInfo.label}</Badge>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {u.worker ? `${u.worker.lastName} ${u.worker.firstName[0]}.${u.worker.patronymic[0]}.` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {u.mustChangePassword && (
                            <Badge className="bg-amber-100 text-amber-800 text-xs">Сменить пароль</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <Button variant="ghost" size="sm" onClick={() => openEditUser(u)} className="text-xs h-7">✏️</Button>
                            <Button variant="ghost" size="sm" onClick={() => handleResetPassword(u.id, u.name)} className="text-xs h-7" title="Сбросить пароль">🔑</Button>
                            {u.id !== (session?.user as any)?.id && (
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(u.id)} className="text-xs h-7 text-red-400 hover:text-red-600">🗑</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Holidays */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Праздничные дни 2026</CardTitle>
            <Button onClick={() => setShowAddHoliday(true)} className="bg-emerald-600 hover:bg-emerald-700">+ Добавить</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {holidays.map(h => (
              <div key={h.id} className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium text-xs sm:text-sm">{h.date}</span>
                  <span className="text-[10px] sm:text-xs text-gray-600 ml-1 sm:ml-2">{h.name}</span>
                </div>
                <button onClick={() => handleDeleteHoliday(h.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Holiday Dialog */}
      <Dialog open={showAddHoliday} onOpenChange={setShowAddHoliday}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить праздничный день</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-3 sm:p-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Дата</label>
              <Input type="date" value={holidayForm.date} onChange={e => setHolidayForm({...holidayForm, date: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Название</label>
              <Input value={holidayForm.name} onChange={e => setHolidayForm({...holidayForm, name: e.target.value})} placeholder="Праздник" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddHoliday(false)}>Отмена</Button>
            <Button onClick={handleAddHoliday} className="bg-emerald-600 hover:bg-emerald-700" disabled={!holidayForm.date || !holidayForm.name}>
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Create/Edit Dialog */}
      <Dialog open={showUserDialog} onOpenChange={(open) => { if (!tempPassword) setShowUserDialog(open); }}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}</DialogTitle>
          </DialogHeader>

          {tempPassword ? (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-medium text-green-800 mb-2">Пользователь создан!</p>
                <p className="text-sm text-green-700 mb-3">Передайте временный пароль пользователю. При первом входе система попросит его сменить.</p>
                <div className="p-3 bg-white border-2 border-dashed border-green-400 rounded-lg text-center">
                  <p className="text-xs text-gray-500 mb-1">Временный пароль:</p>
                  <p className="text-2xl font-mono font-bold text-green-800 tracking-wider">{tempPassword}</p>
                </div>
              </div>
              <Button onClick={() => { setShowUserDialog(false); setTempPassword(null); }} className="w-full bg-emerald-600 hover:bg-emerald-700">
                Понятно
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Email</label>
                  <Input
                    type="email"
                    value={userForm.email}
                    onChange={e => setUserForm({...userForm, email: e.target.value})}
                    placeholder="user@factory.ru"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">ФИО</label>
                  <Input
                    value={userForm.name}
                    onChange={e => setUserForm({...userForm, name: e.target.value})}
                    placeholder="Иванов Иван Иванович"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Роль</label>
                  <Select value={userForm.role} onValueChange={v => setUserForm({...userForm, role: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Администратор</SelectItem>
                      <SelectItem value="master">Мастер</SelectItem>
                      <SelectItem value="brigadier">Бригадир</SelectItem>
                      <SelectItem value="worker">Работник</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Привязанный работник (необязательно)</label>
                  <Select value={userForm.workerId} onValueChange={v => setUserForm({...userForm, workerId: v === '__none' ? '' : v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Не привязан" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Не привязан</SelectItem>
                      {workers.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.lastName} {w.firstName[0]}.{w.patronymic[0]}.
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!editingUser && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                    <p className="font-medium">ℹ️ Пароль будет сгенерирован автоматически</p>
                    <p className="mt-1">Временный пароль отобразится после создания. Пользователь должен будет сменить его при первом входе.</p>
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setShowUserDialog(false)} className="w-full sm:w-auto">Отмена</Button>
                <Button
                  onClick={handleSaveUser}
                  className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                  disabled={!userForm.email || !userForm.name || savingUser}
                >
                  {savingUser ? 'Сохранение...' : editingUser ? 'Сохранить' : 'Создать'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}