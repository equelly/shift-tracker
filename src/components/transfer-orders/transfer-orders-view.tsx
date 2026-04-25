'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// --- Типы ---
interface TransferOrderItem {
  id: string;
  workerId: string;
  worker: {
    id: string; lastName: string; firstName: string; patronymic: string;
    shiftNumber: number | null; equipmentId?: number | null;
    gradeNumber: number; position: string;
    professions: { professionName: string }[];
  };
  fromEquipmentId: number | null;
  fromEquipment: { id: number; name: string } | null;
  toEquipmentId: number | null;
  toEquipment: { id: number; name: string } | null;
  fromShiftNumber: number | null;
  toShiftNumber: number | null;
  fromGradeNumber: number | null;
  toGradeNumber: number | null;
  fromPosition: string | null;
  toPosition: string | null;
  fromProfession: string | null;
  toProfession: string | null;
  effectiveDate: string;
  duration: string;
  executed: boolean;
  executedAt: string | null;
  revertedAt: string | null;
}

interface TransferOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  orderType: string;
  status: string;
  shiftNumber: number | null;
  shift: { number: number; name: string } | null;
  reason: string | null;
  notes: string | null;
  createdBy: string;
  creator: { id: string; name: string };
  approvedBy: string | null;
  approver: { id: string; name: string } | null;
  approvedAt: string | null;
  items: TransferOrderItem[];
  createdAt: string;
}

interface Worker {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  shiftNumber: number | null;
  equipmentId: number | null;
  gradeNumber: number;
  position: string;
  grade: { number: number; name: string };
  professions: { professionName: string }[];
}

interface Equipment {
  id: number;
  name: string;
  workshop: string;
  area: string;
}

interface GradeOption {
  number: number;
  name: string;
}

// --- Статусы ---
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Черновик',   color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  approved:  { label: 'Утверждено',  color: 'bg-green-100 text-green-800 border-green-300' },
  cancelled: { label: 'Отменено',    color: 'bg-red-100 text-red-800 border-red-300' },
};

const DURATION_MAP: Record<string, string> = {
  until_next_order: 'До следующего распоряжения',
  one_shift: 'На одну смену',
};

const POSITION_MAP: Record<string, string> = {
  worker: 'Работник',
  master: 'Мастер',
  master_pu: 'Мастер ПУ',
  section_head: 'Начальник участка',
};

// --- Компонент формы строки ---
function ItemRowForm({
  item,
  index,
  workers,
  equipment,
  grades,
  onUpdate,
  onRemove,
}: {
  item: {
    workerId: string;
    toEquipmentId: string;
    toShiftNumber: string;
    toGradeNumber: string;
    toPosition: string;
    toProfession: string;
    effectiveDate: string;
    duration: string;
  };
  index: number;
  workers: Worker[];
  equipment: Equipment[];
  grades: GradeOption[];
  onUpdate: (i: number, field: string, value: string) => void;
  onRemove: (i: number) => void;
}) {
  const selectedWorker = workers.find(w => w.id === item.workerId);
  const currentProfession = selectedWorker?.professions?.[0]?.professionName || '';

  return (
    <div className="py-3 border-b last:border-0 space-y-2">
      {/* Строка 1: номер + работник + дата вступления */}
      <div className="flex items-start gap-2">
        <span className="text-gray-400 font-mono text-sm w-6 pt-2">{index + 1}.</span>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Работник</label>
            <Select value={item.workerId} onValueChange={v => onUpdate(index, 'workerId', v)}>
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue placeholder="Выбрать..." />
              </SelectTrigger>
              <SelectContent>
                {workers.map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.lastName} {w.firstName[0]}.{w.patronymic[0]}. (См.{w.shiftNumber ?? '—'}, {w.gradeNumber} разр.)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Дата вступления</label>
            <Input
              type="date"
              value={item.effectiveDate}
              onChange={e => onUpdate(index, 'effectiveDate', e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onRemove(index)} className="text-red-400 hover:text-red-600 mt-5">
          ✕
        </Button>
      </div>

      {/* Текущие данные работника */}
      {selectedWorker && (
        <div className="ml-8 text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
          <span>Сейчас: См.{selectedWorker.shiftNumber ?? '—'}</span>
          <span>{selectedWorker.gradeNumber} разр.</span>
          <span>{POSITION_MAP[selectedWorker.position] || selectedWorker.position}</span>
          {currentProfession && <span>{currentProfession}</span>
          }
        </div>
      )}

      {/* Строка 2: куда перевод */}
      <div className="ml-8 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500">В смену</label>
          <Select value={item.toShiftNumber} onValueChange={v => onUpdate(index, 'toShiftNumber', v)}>
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue placeholder="Без изменений" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Руководители</SelectItem>
              {[1, 2, 3, 4].map(n => (
                <SelectItem key={n} value={String(n)}>Смена {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-500">На оборудование</label>
          <Select value={item.toEquipmentId} onValueChange={v => onUpdate(index, 'toEquipmentId', v)}>
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue placeholder="Без изменений" />
            </SelectTrigger>
            <SelectContent>
              {equipment.map(e => (
                <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Разряд</label>
          <Select value={item.toGradeNumber} onValueChange={v => onUpdate(index, 'toGradeNumber', v)}>
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue placeholder="Без изменений" />
            </SelectTrigger>
            <SelectContent>
              {grades.map(g => (
                <SelectItem key={g.number} value={String(g.number)}>{g.number} разр.</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Должность</label>
          <Select value={item.toPosition} onValueChange={v => onUpdate(index, 'toPosition', v)}>
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue placeholder="Без изменений" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(POSITION_MAP).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Профессия</label>
          <Input
            value={item.toProfession}
            onChange={e => onUpdate(index, 'toProfession', e.target.value)}
            placeholder={currentProfession || 'Без изменений'}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Срок</label>
          <Select value={item.duration} onValueChange={v => onUpdate(index, 'duration', v)}>
            <SelectTrigger className="h-8 text-xs w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="until_next_order">До след. распоряжения</SelectItem>
              <SelectItem value="one_shift">На одну смену</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// --- Описание изменений в строке ---
function describeChanges(item: TransferOrderItem): string[] {
  const changes: string[] = [];
  if (item.toShiftNumber !== null && item.toShiftNumber !== item.fromShiftNumber) {
    changes.push(`См.${item.fromShiftNumber ?? '?'} → См.${item.toShiftNumber}`);
  }
  if (item.toEquipment?.name && item.toEquipmentId !== item.fromEquipmentId) {
    changes.push(`${item.fromEquipment?.name || '—'} → ${item.toEquipment.name}`);
  }
  if (item.toGradeNumber !== null && item.toGradeNumber !== item.fromGradeNumber) {
    changes.push(`${item.fromGradeNumber ?? '?'} разр. → ${item.toGradeNumber} разр.`);
  }
  if (item.toPosition && item.toPosition !== item.fromPosition) {
    changes.push(`${POSITION_MAP[item.fromPosition || ''] || item.fromPosition || '—'} → ${POSITION_MAP[item.toPosition] || item.toPosition}`);
  }
  if (item.toProfession && item.toProfession !== item.fromProfession) {
    changes.push(`${item.fromProfession || '—'} → ${item.toProfession}`);
  }
  return changes;
}

// --- Основной компонент ---
export function TransferOrdersView() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'worker';

  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Данные для формы
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [grades, setGrades] = useState<GradeOption[]>([]);

  // Диалог создания
  const [showCreate, setShowCreate] = useState(false);
  const [formOrderType, setFormOrderType] = useState<string>('complex');
  const [formShiftNumber, setFormShiftNumber] = useState<string>('');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [formItems, setFormItems] = useState<{
    workerId: string; toEquipmentId: string; toShiftNumber: string;
    toGradeNumber: string; toPosition: string; toProfession: string;
    effectiveDate: string; duration: string;
  }[]>([
    { workerId: '', toEquipmentId: '', toShiftNumber: '', toGradeNumber: '', toPosition: '', toProfession: '', effectiveDate: todayStr, duration: 'until_next_order' },
  ]);

  // Диалог просмотра
  const [viewOrder, setViewOrder] = useState<TransferOrder | null>(null);

  // Загрузка списков
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
      const res = await fetch(`/api/transfer-orders${params}`);
      const data = await res.json();
      setOrders(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (showCreate) {
      fetch('/api/workers?isActive=true').then(r => r.json()).then(setWorkers).catch(() => {});
      fetch('/api/equipment').then(r => r.json()).then(setEquipment).catch(() => {});
      fetch('/api/grades').then(r => r.json()).then(setGrades).catch(() => {});
    }
  }, [showCreate]);

  // Управление строками формы
  const updateFormItem = (index: number, field: string, value: string) => {
    setFormItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addFormItem = () => {
    setFormItems(prev => [...prev, { workerId: '', toEquipmentId: '', toShiftNumber: '', toGradeNumber: '', toPosition: '', toProfession: '', effectiveDate: todayStr, duration: 'until_next_order' }]);
  };

  const removeFormItem = (index: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== index));
  };

  // Создание распоряжения
  const handleCreate = async () => {
    const validItems = formItems.filter(i => i.workerId);
    if (validItems.length === 0) return;

    // Автоматически определяем тип распоряжения
    let hasShift = false, hasEquip = false, hasGrade = false, hasPos = false;
    for (const item of validItems) {
      if (item.toShiftNumber) hasShift = true;
      if (item.toEquipmentId) hasEquip = true;
      if (item.toGradeNumber) hasGrade = true;
      if (item.toPosition) hasPos = true;
    }
    let orderType = 'complex';
    const typeCount = [hasShift, hasEquip, hasGrade, hasPos].filter(Boolean).length;
    if (typeCount === 1) {
      if (hasEquip) orderType = 'equipment';
      else if (hasShift) orderType = 'shift';
      else if (hasGrade) orderType = 'grade';
      else if (hasPos) orderType = 'position';
    } else if (typeCount === 2 && hasShift && hasEquip) {
      orderType = 'both';
    }

    await fetch('/api/transfer-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderDate: todayStr,
        orderType,
        shiftNumber: formShiftNumber ? parseInt(formShiftNumber) : null,
        reason: formReason || null,
        notes: formNotes || null,
        items: validItems.map(i => ({
          workerId: i.workerId,
          toEquipmentId: i.toEquipmentId ? parseInt(i.toEquipmentId) : null,
          toShiftNumber: i.toShiftNumber ? parseInt(i.toShiftNumber) : null,
          toGradeNumber: i.toGradeNumber ? parseInt(i.toGradeNumber) : null,
          toPosition: i.toPosition || null,
          toProfession: i.toProfession || null,
          effectiveDate: i.effectiveDate || todayStr,
          duration: i.duration,
        })),
      }),
    });

    setShowCreate(false);
    resetForm();
    fetchOrders();
  };

  const resetForm = () => {
    setFormOrderType('complex');
    setFormShiftNumber('');
    setFormReason('');
    setFormNotes('');
    setFormItems([{ workerId: '', toEquipmentId: '', toShiftNumber: '', toGradeNumber: '', toPosition: '', toProfession: '', effectiveDate: todayStr, duration: 'until_next_order' }]);
  };

  // Утверждение / отмена
  const handleAction = async (orderId: string, action: 'approve' | 'cancel') => {
    await fetch(`/api/transfer-orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    fetchOrders();
    setViewOrder(null);
  };

  // Удаление черновика
  const handleDelete = async (orderId: string) => {
    await fetch(`/api/transfer-orders/${orderId}`, { method: 'DELETE' });
    fetchOrders();
    setViewOrder(null);
  };

  const canCreate = userRole === 'admin' || userRole === 'master';
  const canApprove = userRole === 'admin';

  // Статус строки
  const getItemStatus = (item: TransferOrderItem) => {
    if (item.revertedAt) return { label: 'Откат', color: 'bg-gray-100 text-gray-600' };
    if (item.executed) return { label: 'Исполнено', color: 'bg-green-100 text-green-800' };
    return { label: 'Ожидает даты', color: 'bg-yellow-50 text-yellow-700' };
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и фильтры */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Распоряжения о переводе</h2>
          <p className="text-sm text-gray-500">Управление переводами работников: смена, оборудование, разряд, должность</p>
        </div>
        <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="draft">Черновики</SelectItem>
              <SelectItem value="approved">Утверждённые</SelectItem>
              <SelectItem value="cancelled">Отменённые</SelectItem>
            </SelectContent>
          </Select>
          {canCreate && (
            <Button onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
              + Новое распоряжение
            </Button>
          )}
        </div>
      </div>

      {/* Список распоряжений */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent"></div>
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Распоряжений пока нет. Нажмите &quot;+ Новое распоряжение&quot; для создания.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.draft;
            const effectiveDates = [...new Set(order.items.map(i => i.effectiveDate))].sort();
            const hasOneShift = order.items.some(i => i.duration === 'one_shift');
            const pendingCount = order.items.filter(i => !i.executed).length;
            return (
              <Card
                key={order.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setViewOrder(order)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                        <div>
                          <p className="font-bold text-lg">{order.orderNumber}</p>
                          <p className="text-sm text-gray-500">от {order.orderDate}</p>
                        </div>
                        <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                        {pendingCount > 0 && order.status === 'approved' && (
                          <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                            {pendingCount} ожидает
                          </Badge>
                        )}
                        {hasOneShift && (
                          <Badge variant="outline" className="text-xs">1 смена</Badge>
                        )}
                      </div>
                      {/* Фамилии работников */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {order.items.map(item => (
                          <span
                            key={item.id}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              item.revertedAt
                                ? 'bg-gray-100 text-gray-500 line-through'
                                : item.executed
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {item.worker.lastName} {item.worker.firstName[0]}.{item.worker.patronymic[0]}.
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:text-right gap-2 sm:gap-0 flex-shrink-0">
                      <p className="text-sm">
                        <span className="text-gray-500">Строк:</span>{' '}
                        <span className="font-semibold">{order.items.length}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        С {effectiveDates[0]}{effectiveDates.length > 1 ? ' ...' : ''}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* === Диалог создания распоряжения === */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новое распоряжение о переводе</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Основание */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Основание</label>
                <Input value={formReason} onChange={e => setFormReason(e.target.value)} placeholder="Производственная необходимость" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Смена (необязательно)</label>
                <Select value={formShiftNumber} onValueChange={setFormShiftNumber}>
                  <SelectTrigger>
                    <SelectValue placeholder="Не указана" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map(n => (
                      <SelectItem key={n} value={String(n)}>Смена {n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Строки - работники */}
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                <label className="text-sm font-medium">Работники для перевода</label>
                <Button variant="outline" size="sm" onClick={addFormItem} className="w-full sm:w-auto">+ Добавить строку</Button>
              </div>
              <div className="border rounded-lg p-2 sm:p-3 space-y-1 bg-gray-50">
                {formItems.map((item, i) => (
                  <ItemRowForm
                    key={i}
                    item={item}
                    index={i}
                    workers={workers}
                    equipment={equipment}
                    grades={grades}
                    onUpdate={updateFormItem}
                    onRemove={removeFormItem}
                  />
                ))}
              </div>
            </div>
            {/* Примечания */}
            <div>
              <label className="text-sm font-medium mb-1 block">Примечания</label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Дополнительная информация..." rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }} className="w-full sm:w-auto">Отмена</Button>
            <Button
              onClick={handleCreate}
              className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
              disabled={!formItems.some(i => i.workerId)}
            >
              Создать черновик
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Диалог просмотра распоряжения === */}
      <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {viewOrder && (() => {
            const statusInfo = STATUS_MAP[viewOrder.status] || STATUS_MAP.draft;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2 sm:gap-3">
                    Распоряжение {viewOrder.orderNumber}
                    <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {/* Реквизиты */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Дата распоряжения:</span>{' '}
                      <span className="font-medium">{viewOrder.orderDate}</span>
                    </div>
                    {viewOrder.shift && (
                      <div>
                        <span className="text-gray-500">Смена:</span>{' '}
                        <span className="font-medium">Смена {viewOrder.shift.number}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Составил:</span>{' '}
                      <span className="font-medium">{viewOrder.creator.name}</span>
                    </div>
                    {viewOrder.approver && (
                      <div>
                        <span className="text-gray-500">Утвердил:</span>{' '}
                        <span className="font-medium">{viewOrder.approver.name}</span>
                      </div>
                    )}
                    {viewOrder.approvedAt && (
                      <div>
                        <span className="text-gray-500">Дата утверждения:</span>{' '}
                        <span className="font-medium">{new Date(viewOrder.approvedAt).toLocaleDateString('ru-RU')}</span>
                      </div>
                    )}
                  </div>
                  {viewOrder.reason && (
                    <div className="text-sm">
                      <span className="text-gray-500">Основание:</span>{' '}
                      <span>{viewOrder.reason}</span>
                    </div>
                  )}
                  {viewOrder.notes && (
                    <div className="text-sm">
                      <span className="text-gray-500">Примечания:</span>{' '}
                      <span>{viewOrder.notes}</span>
                    </div>
                  )}

                  {/* Строки — карточки (мобильные) */}
                  <div className="sm:hidden space-y-2">
                    {viewOrder.items.map((item, i) => {
                      const itemStatus = getItemStatus(item);
                      const changes = describeChanges(item);
                      return (
                        <div key={item.id} className="border rounded-lg p-3 bg-gray-50 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {item.worker.lastName} {item.worker.firstName[0]}.{item.worker.patronymic[0]}.
                            </span>
                            <Badge className={`${itemStatus.color} text-xs`}>{itemStatus.label}</Badge>
                          </div>
                          <div className="text-xs text-gray-500">
                            С {item.effectiveDate} · {DURATION_MAP[item.duration] || item.duration}
                          </div>
                          <div className="space-y-1">
                            {changes.map((c, ci) => (
                              <div key={ci} className="text-sm text-gray-700">{c}</div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Строки — таблица (десктоп) */}
                  <div className="hidden sm:block border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="px-2 py-2 text-center font-medium">№</th>
                          <th className="px-2 py-2 text-left font-medium">Работник</th>
                          <th className="px-2 py-2 text-left font-medium">Изменения</th>
                          <th className="px-2 py-2 text-center font-medium">С</th>
                          <th className="px-2 py-2 text-center font-medium">Срок</th>
                          <th className="px-2 py-2 text-center font-medium">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewOrder.items.map((item, i) => {
                          const itemStatus = getItemStatus(item);
                          const changes = describeChanges(item);
                          return (
                            <tr key={item.id} className="border-t">
                              <td className="px-2 py-2 text-center text-gray-400">{i + 1}</td>
                              <td className="px-2 py-2 font-medium">
                                {item.worker.lastName} {item.worker.firstName[0]}.{item.worker.patronymic[0]}.
                              </td>
                              <td className="px-2 py-2 text-sm">
                                {changes.length > 0 ? changes.map((c, ci) => (
                                  <div key={ci}>{c}</div>
                                )) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-2 py-2 text-center text-xs">{item.effectiveDate}</td>
                              <td className="px-2 py-2 text-center text-xs">
                                {item.duration === 'one_shift' ? '1 смена' : 'Постоянно'}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <Badge className={`${itemStatus.color} text-xs`}>{itemStatus.label}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Кнопки действий */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {viewOrder.status === 'draft' && canApprove && (
                      <Button onClick={() => handleAction(viewOrder.id, 'approve')} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto">
                        Утвердить
                      </Button>
                    )}
                    {(viewOrder.status === 'draft' || viewOrder.status === 'approved') && (
                      <Button variant="outline" onClick={() => handleAction(viewOrder.id, 'cancel')} className="text-red-600 hover:text-red-700 w-full sm:w-auto">
                        Отменить
                      </Button>
                    )}
                    {viewOrder.status === 'draft' && canCreate && (
                      <Button variant="ghost" onClick={() => handleDelete(viewOrder.id)} className="text-red-400 hover:text-red-600 sm:ml-auto w-full sm:w-auto">
                        Удалить
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}