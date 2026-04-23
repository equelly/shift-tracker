'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useSession } from 'next-auth/react';
import { Trash2 } from 'lucide-react';

interface Worker {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  gradeNumber: number;
  shiftNumber: number;
  equipmentId: number | null;
  position: string;
  isActive: boolean;
  grade: { number: number; name: string; hourlyRate: number };
  shift: { number: number; name: string };
  equipment: { id: number; name: string; area: string } | null;
  professions: { id: string; professionName: string }[];
  benefits: { id: string; benefitType: string; description: string | null }[];
}

export function WorkersView() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'worker';

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterShift, setFilterShift] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [showDetail, setShowDetail] = useState<Worker | null>(null);

  // Form state
  const [form, setForm] = useState({ lastName: '', firstName: '', patronymic: '', gradeNumber: 1, shiftNumber: 1, equipmentId: '', position: 'worker' });
  const [professions, setProfessions] = useState<string[]>([]);
  const [benefits, setBenefits] = useState<{ type: string; description: string }[]>([]);

  const [equipment, setEquipment] = useState<any[]>([]);

  const fetchWorkers = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterShift !== 'all') params.set('shiftNumber', filterShift);
    if (filterGrade !== 'all') params.set('gradeNumber', filterGrade);
    
    const res = await fetch(`/api/workers?${params}`);
    const data = await res.json();
    setWorkers(data);
    setLoading(false);
  }, [search, filterShift, filterGrade]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterShift !== 'all') params.set('shiftNumber', filterShift);
    if (filterGrade !== 'all') params.set('gradeNumber', filterGrade);
    fetch(`/api/workers?${params}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) { setWorkers(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, filterShift, filterGrade]);

  useEffect(() => {
    fetch('/api/equipment').then(r => r.json()).then(setEquipment).catch(() => {});
  }, []);

  const resetForm = () => {
    setForm({ lastName: '', firstName: '', patronymic: '', gradeNumber: 1, shiftNumber: 1, equipmentId: '', position: 'worker' });
    setProfessions([]);
    setBenefits([]);
  };

  const handleSave = async () => {
    const body = {
      ...form,
      equipmentId: form.equipmentId && form.equipmentId !== '__none__' ? parseInt(form.equipmentId) : null,
      position: form.position,
      professionNames: professions,
      benefitTypes: benefits,
      markedBy: (session?.user as any)?.id,
      markedByName: session?.user?.name,
    };

    if (editWorker) {
      await fetch(`/api/workers/${editWorker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    setShowAdd(false);
    setEditWorker(null);
    resetForm();
    fetchWorkers();
  };

  const handleEdit = (w: Worker) => {
    setForm({
      lastName: w.lastName,
      firstName: w.firstName,
      patronymic: w.patronymic,
      gradeNumber: w.gradeNumber,
      shiftNumber: w.shiftNumber,
      equipmentId: w.equipmentId ? String(w.equipmentId) : '',
      position: w.position || 'worker',
    });
    setProfessions(w.professions.map(p => p.professionName));
    setBenefits(w.benefits.map(b => ({ type: b.benefitType, description: b.description || '' })));
    setEditWorker(w);
    setShowAdd(true);
  };

  const handleDeactivate = async (id: string) => {
    await fetch(`/api/workers/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markedBy: (session?.user as any)?.id,
        markedByName: session?.user?.name,
      }),
    });
    fetchWorkers();
  };

  const canEdit = userRole === 'admin' || userRole === 'master';

  const shiftBadgeColor = (n: number) =>
    n === 1 ? 'bg-green-600' : n === 2 ? 'bg-blue-600' : n === 3 ? 'bg-purple-600' : 'bg-orange-600';

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              placeholder="Поиск по ФИО..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:max-w-xs"
            />
            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все смены</SelectItem>
                <SelectItem value="1">Смена 1</SelectItem>
                <SelectItem value="2">Смена 2</SelectItem>
                <SelectItem value="3">Смена 3</SelectItem>
                <SelectItem value="4">Смена 4</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterGrade} onValueChange={setFilterGrade}>
              <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все разряды</SelectItem>
                {[1,2,3,4,5,6,7,8].map(g => <SelectItem key={g} value={String(g)}>{g} разряд</SelectItem>)}
              </SelectContent>
            </Select>
            {canEdit && (
              <Button onClick={() => { resetForm(); setShowAdd(true); }} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto sm:ml-auto">
                + Добавить работника
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Workers table — desktop only */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="px-4 py-3 text-left font-medium">ФИО</th>
                <th className="px-4 py-3 text-center font-medium">Разряд</th>
                <th className="px-4 py-3 text-center font-medium">Смена</th>
                <th className="px-4 py-3 text-left font-medium">Оборудование</th>
                <th className="px-4 py-3 text-left font-medium">Доп. профессии</th>
                <th className="px-4 py-3 text-center font-medium">Статус</th>
                {canEdit && <th className="px-4 py-3 text-center font-medium">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {workers.map((w, idx) => (
                <tr key={w.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} onClick={() => setShowDetail(w)} style={{ cursor: 'pointer' }}>
                  <td className="px-4 py-2 font-medium">
                    {w.lastName} {w.firstName} {w.patronymic}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {w.position && w.position !== 'worker' ? (
                      <Badge className={w.position === 'master' ? 'bg-amber-600' : w.position === 'master_pu' ? 'bg-blue-600' : 'bg-indigo-600'}>
                        {w.position === 'master' ? 'Мастер' : w.position === 'master_pu' ? 'М.ПУ' : 'НУ'}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{w.gradeNumber} разр.</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Badge className={shiftBadgeColor(w.shiftNumber)}>
                      Смена {w.shiftNumber}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{w.equipment?.name || '—'}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {w.professions.map(p => p.professionName).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Badge variant={w.isActive ? 'default' : 'secondary'} className={w.isActive ? 'bg-emerald-600' : 'bg-gray-400'}>
                      {w.isActive ? 'Работает' : 'Уволен'}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(w); }}>✏️</Button>
                        {w.isActive && (
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDeactivate(w.id); }} className="text-red-600"><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {workers.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">Работники не найдены</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Workers card list — mobile only */}
      <div className="md:hidden space-y-3">
        {workers.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">Работники не найдены</CardContent>
          </Card>
        )}
        {workers.map(w => (
          <Card
            key={w.id}
            onClick={() => setShowDetail(w)}
            className="cursor-pointer active:bg-slate-50 transition-colors"
          >
            <CardContent className="p-4 space-y-3">
              {/* Header: ФИО + Статус */}
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-base leading-tight">
                  {w.lastName} {w.firstName} {w.patronymic}
                </div>
                <Badge variant={w.isActive ? 'default' : 'secondary'} className={w.isActive ? 'bg-emerald-600' : 'bg-gray-400'}>
                  {w.isActive ? 'Работает' : 'Уволен'}
                </Badge>
              </div>

              {/* Info chips */}
              <div className="flex flex-wrap gap-2">
                {w.position && w.position !== 'worker' ? (
                  <Badge className={w.position === 'master' ? 'bg-amber-600' : w.position === 'master_pu' ? 'bg-blue-600' : 'bg-indigo-600'}>
                    {w.position === 'master' ? 'Мастер' : w.position === 'master_pu' ? 'М.ПУ' : 'НУ'}
                  </Badge>
                ) : (
                  <Badge variant="outline">{w.gradeNumber} разр.</Badge>
                )}
                <Badge className={shiftBadgeColor(w.shiftNumber)}>
                  Смена {w.shiftNumber}
                </Badge>
              </div>

              {/* Equipment */}
              <div className="text-sm text-gray-600">
                <span className="text-gray-400">Оборудование: </span>
                {w.equipment?.name || '—'}
              </div>

              {/* Professions */}
              {w.professions.length > 0 && (
                <div className="text-sm text-gray-500">
                  <span className="text-gray-400">Доп. профессии: </span>
                  {w.professions.map(p => p.professionName).join(', ')}
                </div>
              )}

              {/* Actions */}
              {canEdit && (
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(w); }}>✏️ Редактировать</Button>
                  {w.isActive && (
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDeactivate(w.id); }} className="text-red-600"><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={() => { setShowAdd(false); setEditWorker(null); resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editWorker ? 'Редактировать работника' : 'Новый работник'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Фамилия</label>
                <Input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Имя</label>
                <Input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Отчество</label>
                <Input value={form.patronymic} onChange={e => setForm({...form, patronymic: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Разряд</label>
                <Select value={String(form.gradeNumber)} onValueChange={v => setForm({...form, gradeNumber: parseInt(v)})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6,7,8].map(g => <SelectItem key={g} value={String(g)}>{g} разряд</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Смена</label>
                <Select value={String(form.shiftNumber)} onValueChange={v => setForm({...form, shiftNumber: parseInt(v)})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4].map(s => <SelectItem key={s} value={String(s)}>Смена {s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Оборудование</label>
                <Select value={form.equipmentId} onValueChange={v => setForm({...form, equipmentId: v})}>
                  <SelectTrigger><SelectValue placeholder="Не выбрано" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Не выбрано</SelectItem>
                    {equipment.map((eq: any) => <SelectItem key={eq.id} value={String(eq.id)}>{eq.name} ({eq.area})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Должность</label>
                <Select value={form.position} onValueChange={v => setForm({...form, position: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Работник</SelectItem>
                    <SelectItem value="master">Мастер</SelectItem>
                    <SelectItem value="master_pu">Мастер ПУ</SelectItem>
                    <SelectItem value="section_head">Начальник участка</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Professions */}
            <div>
              <label className="text-xs font-medium mb-1 block">Дополнительные профессии</label>
              {professions.map((p, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-1 mb-1">
                  <Input value={p} onChange={e => { const np = [...professions]; np[i] = e.target.value; setProfessions(np); }} className="flex-1" />
                  <Button variant="outline" size="sm" onClick={() => setProfessions(professions.filter((_, j) => j !== i))} className="shrink-0 self-end sm:self-auto">✕</Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setProfessions([...professions, ''])} className="mt-1">+ Добавить профессию</Button>
            </div>

            {/* Benefits */}
            <div>
              <label className="text-xs font-medium mb-1 block">Льготы</label>
              {benefits.map((b, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-1 mb-1">
                  <Input value={b.type} onChange={e => { const nb = [...benefits]; nb[i] = {...nb[i], type: e.target.value}; setBenefits(nb); }} placeholder="Тип льготы" className="flex-1" />
                  <Input value={b.description} onChange={e => { const nb = [...benefits]; nb[i] = {...nb[i], description: e.target.value}; setBenefits(nb); }} placeholder="Описание" className="flex-1" />
                  <Button variant="outline" size="sm" onClick={() => setBenefits(benefits.filter((_, j) => j !== i))} className="shrink-0 self-end sm:self-auto">✕</Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setBenefits([...benefits, { type: '', description: '' }])} className="mt-1">+ Добавить льготу</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditWorker(null); resetForm(); }}>Отмена</Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700" disabled={!form.lastName || !form.firstName}>
              {editWorker ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{showDetail?.lastName} {showDetail?.firstName} {showDetail?.patronymic}</DialogTitle>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><span className="text-gray-500">Разряд:</span> <strong>{showDetail.gradeNumber} ({showDetail.grade?.name})</strong></div>
                <div><span className="text-gray-500">Должность:</span> <strong>{showDetail.position === 'master' ? 'Мастер' : showDetail.position === 'master_pu' ? 'Мастер ПУ' : showDetail.position === 'section_head' ? 'Начальник участка' : 'Работник'}</strong></div>
                <div><span className="text-gray-500">Ставка:</span> <strong>{showDetail.grade?.hourlyRate} руб/ч</strong></div>
                <div><span className="text-gray-500">Смена:</span> <strong>Смена {showDetail.shiftNumber}</strong></div>
                <div><span className="text-gray-500">Оборудование:</span> <strong>{showDetail.equipment?.name || '—'}</strong></div>
              </div>
              {showDetail.professions.length > 0 && (
                <div>
                  <span className="text-gray-500">Доп. профессии:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {showDetail.professions.map(p => <Badge key={p.id} variant="secondary">{p.professionName}</Badge>)}
                  </div>
                </div>
              )}
              {showDetail.benefits.length > 0 && (
                <div>
                  <span className="text-gray-500">Льготы:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {showDetail.benefits.map(b => <Badge key={b.id} variant="outline">{b.benefitType}{b.description ? `: ${b.description}` : ''}</Badge>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}