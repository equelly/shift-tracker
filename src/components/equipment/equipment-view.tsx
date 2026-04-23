'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useSession } from 'next-auth/react';

interface EquipmentItem {
  id: number;
  name: string;
  workshop: string;
  area: string;
  workers: { id: string; lastName: string; firstName: string }[];
}

export function EquipmentView() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'worker';
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editEq, setEditEq] = useState<EquipmentItem | null>(null);
  const [form, setForm] = useState({ name: '', workshop: 'Цех №1', area: '' });

  const fetchEquipment = useCallback(async () => {
    const res = await fetch('/api/equipment');
    const data = await res.json();
    setEquipment(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/equipment')
      .then(r => r.json())
      .then(data => { if (!cancelled) { setEquipment(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    const body = {
      ...form,
      markedBy: (session?.user as any)?.id,
      markedByName: session?.user?.name,
    };

    if (editEq) {
      await fetch(`/api/equipment/${editEq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    setShowAdd(false);
    setEditEq(null);
    setForm({ name: '', workshop: 'Цех №1', area: '' });
    fetchEquipment();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить оборудование?')) return;
    await fetch(`/api/equipment/${id}`, { method: 'DELETE' });
    fetchEquipment();
  };

  const canEdit = userRole === 'admin' || userRole === 'master';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-base sm:text-lg font-semibold">Оборудование и рабочие места</h2>
            {canEdit && (
              <Button onClick={() => { setForm({ name: '', workshop: 'Цех №1', area: '' }); setEditEq(null); setShowAdd(true); }} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
                + Добавить
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {equipment.map(eq => (
          <Card key={eq.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-3 sm:p-4">
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{eq.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-500">{eq.workshop} / {eq.area}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => { setEditEq(eq); setForm({ name: eq.name, workshop: eq.workshop, area: eq.area }); setShowAdd(true); }} className="min-w-[36px] min-h-[36px]">✏️</Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(eq.id)} className="text-red-600 min-w-[36px] min-h-[36px]">✕</Button>
                  </div>
                )}
              </div>
              {eq.workers.length > 0 ? (
                <div className="mt-2">
                  <p className="text-[11px] sm:text-xs text-gray-500 mb-1">Привязанные работники:</p>
                  <div className="flex flex-wrap gap-1">
                    {eq.workers.map(w => (
                      <Badge key={w.id} variant="secondary" className="text-[11px] sm:text-xs">
                        {w.lastName} {w.firstName[0]}.
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] sm:text-xs text-gray-400 mt-2">Нет привязанных работников</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={() => { setShowAdd(false); setEditEq(null); }}>
        <DialogContent className="sm:max-w-md w-[calc(100%-1rem)] sm:w-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">{editEq ? 'Редактировать оборудование' : 'Новое оборудование'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-4">
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 block">Название</label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Станок токарный Т-3" className="min-h-[44px]" />
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 block">Цех</label>
              <Input value={form.workshop} onChange={e => setForm({...form, workshop: e.target.value})} className="min-h-[44px]" />
            </div>
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 block">Участок</label>
              <Input value={form.area} onChange={e => setForm({...form, area: e.target.value})} placeholder="Участок А" className="min-h-[44px]" />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAdd(false)} className="w-full sm:w-auto min-h-[44px]">Отмена</Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto min-h-[44px]" disabled={!form.name || !form.area}>
              {editEq ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
