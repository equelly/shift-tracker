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
import { useToast } from '@/hooks/use-toast';

// --- Типы ---
interface TransferOrderItem {
  id: string;
  workerId: string;
  worker: { id: string; lastName: string; firstName: string; patronymic: string; shiftNumber: number; equipmentId?: number | null; gradeNumber?: number; grade?: { number: number; name: string } };
  fromEquipmentId: number | null;
  fromEquipment: { id: number; name: string } | null;
  toEquipmentId: number | null;
  toEquipment: { id: number; name: string } | null;
  fromShiftNumber: number | null;
  toShiftNumber: number | null;
  fromGradeNumber: number | null;
  toGradeNumber: number | null;
  executed: boolean;
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
  shiftNumber: number;
  equipmentId: number | null;
  gradeNumber: number;
  grade: { number: number; name: string; hourlyRate: number };
  equipment: { id: number; name: string; area: string } | null;
}

interface Equipment {
  id: number;
  name: string;
  workshop: string;
  area: string;
}

// --- Статусы ---
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Черновик',   color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  approved:  { label: 'Утверждено',  color: 'bg-green-100 text-green-800 border-green-300' },
  cancelled: { label: 'Отменено',    color: 'bg-red-100 text-red-800 border-red-300' },
};

const ORDER_TYPE_MAP: Record<string, string> = {
  equipment: 'Перевод на другое оборудование',
  shift:     'Перевод в другую смену',
  grade:     'Изменение разряда',
  both:      'Перевод (смена + оборудование)',
  combined:  'Комплексный перевод',
};

// --- Компонент формы добавления строки ---
function ItemRowForm({
  item,
  index,
  workers,
  equipment,
  onUpdate,
  onRemove,
}: {
  item: { workerId: string; toEquipmentId: string; toShiftNumber: string; toGradeNumber: string };
  index: number;
  workers: Worker[];
  equipment: Equipment[];
  onUpdate: (i: number, field: string, value: string) => void;
  onRemove: (i: number) => void;
}) {
  const selectedWorker = workers.find(w => w.id === item.workerId);

  // Определяем, есть ли хоть одно изменение
  const hasChanges = selectedWorker && (
    (item.toEquipmentId && item.toEquipmentId !== String(selectedWorker.equipmentId)) ||
    (item.toShiftNumber && item.toShiftNumber !== String(selectedWorker.shiftNumber)) ||
    (item.toGradeNumber && item.toGradeNumber !== String(selectedWorker.gradeNumber))
  );

  return (
    <div className="py-3 border-b last:border-0">
      {/* Заголовок строки */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 font-mono text-sm">Строка {index + 1}</span>
        <Button variant="ghost" size="sm" onClick={() => onRemove(index)} className="text-red-400 hover:text-red-600 h-7">
          ✕ Удалить
        </Button>
      </div>

      {/* Выбор работника */}
      <div className="mb-2">
        <label className="text-xs text-gray-500">Работник</label>
        <Select value={item.workerId} onValueChange={v => onUpdate(index, 'workerId', v)}>
          <SelectTrigger className="h-9 text-sm w-full">
            <SelectValue placeholder="Выбрать работника..." />
          </SelectTrigger>
          <SelectContent>
            {workers.map(w => (
              <SelectItem key={w.id} value={w.id}>
                {w.lastName} {w.firstName[0]}.{w.patronymic[0]}. — {w.gradeNumber} разр., См.{w.shiftNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Текущие данные работника (только чтение) */}
      {selectedWorker && (
        <div className="bg-slate-50 rounded-lg p-2 mb-3 text-xs space-y-1">
          <p className="font-medium text-slate-600 mb-1">Текущие данные:</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-gray-400">Разряд:</span>{' '}
              <span className="font-medium">{selectedWorker.gradeNumber} ({selectedWorker.grade?.name})</span>
            </div>
            <div>
              <span className="text-gray-400">Смена:</span>{' '}
              <span className="font-medium">Смена {selectedWorker.shiftNumber}</span>
            </div>
            <div>
              <span className="text-gray-400">Оборуд.:</span>{' '}
              <span className="font-medium">{selectedWorker.equipment?.name || '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Куда переводим */}
      {selectedWorker && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-gray-500">Новый разряд</label>
            <Select value={item.toGradeNumber} onValueChange={v => onUpdate(index, 'toGradeNumber', v)}>
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue placeholder="Не менять" />
              </SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5,6,7,8].filter(g => g !== selectedWorker.gradeNumber).map(g => (
                  <SelectItem key={g} value={String(g)}>{g} разряд</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500">В смену</label>
            <Select value={item.toShiftNumber} onValueChange={v => onUpdate(index, 'toShiftNumber', v)}>
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue placeholder="Не менять" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].filter(s => s !== selectedWorker.shiftNumber).map(n => (
                  <SelectItem key={n} value={String(n)}>Смена {n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500">На оборудование</label>
            <Select value={item.toEquipmentId} onValueChange={v => onUpdate(index, 'toEquipmentId', v)}>
              <SelectTrigger className="h-9 text-sm w-full">
                <SelectValue placeholder="Не менять" />
              </SelectTrigger>
              <SelectContent>
                {equipment.filter(e => e.id !== selectedWorker.equipmentId).map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Предупреждение о немедленном переводе */}
      {selectedWorker && hasChanges && (
        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">⚠️</span>
          <div>
            <p className="font-medium">Работник будет переведён немедленно</p>
            <p className="text-amber-600 mt-0.5">При создании черновика работник сразу перемещается на указанные смену, оборудование и разряд. Отмена распоряжения вернёт его обратно.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Основной компонент ---
export function TransferOrdersView({ onDraftCountChange }: { onDraftCountChange?: (count: number) => void }) {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'worker';
  const { toast } = useToast();

  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Данные для формы
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  // Диалог создания
  const [showCreate, setShowCreate] = useState(false);
  const [formOrderType, setFormOrderType] = useState<string>('combined');
  const [formShiftNumber, setFormShiftNumber] = useState<string>('');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<{ workerId: string; toEquipmentId: string; toShiftNumber: string; toGradeNumber: string }[]>([
    { workerId: '', toEquipmentId: '', toShiftNumber: '', toGradeNumber: '' },
  ]);
  const [creating, setCreating] = useState(false);

  // Диалог просмотра
  const [viewOrder, setViewOrder] = useState<TransferOrder | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Загрузка списков
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
      const res = await fetch(`/api/transfer-orders${params}`);
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      setOrders(data);

      // Обновляем счётчик черновиков для бейджа
      if (onDraftCountChange) {
        // Если фильтр не по черновикам — считаем из полученных или делаем отдельный запрос
        const draftCount = filterStatus === 'all'
          ? data.filter((o: TransferOrder) => o.status === 'draft').length
          : filterStatus === 'draft'
            ? data.length
            : null; // при других фильтрах делаем отдельный запрос
        if (draftCount !== null) {
          onDraftCountChange(draftCount);
        } else {
          // Отдельный запрос только для подсчёта черновиков
          fetch('/api/transfer-orders?count=draft')
            .then(r => r.json())
            .then(count => onDraftCountChange(typeof count === 'number' ? count : 0))
            .catch(() => {});
        }
      }
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filterStatus, toast, onDraftCountChange]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (showCreate) {
      fetch('/api/workers').then(r => r.json()).then(setWorkers).catch(() => {});
      fetch('/api/equipment').then(r => r.json()).then(setEquipment).catch(() => {});
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
    setFormItems(prev => [...prev, { workerId: '', toEquipmentId: '', toShiftNumber: '', toGradeNumber: '' }]);
  };

  const removeFormItem = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(prev => prev.filter((_, i) => i !== index));
  };

  // Создание распоряжения
  const handleCreate = async () => {
    const validItems = formItems.filter(i => i.workerId);
    if (validItems.length === 0) {
      toast({ title: 'Ошибка', description: 'Выберите хотя бы одного работника', variant: 'destructive' });
      return;
    }

    // Проверяем что хоть что-то меняется
    const hasChanges = validItems.some(i => i.toEquipmentId || i.toShiftNumber || i.toGradeNumber);
    if (!hasChanges) {
      toast({ title: 'Ошибка', description: 'Укажите хотя бы одно изменение для каждого работника', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/transfer-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: new Date().toISOString().split('T')[0],
          orderType: formOrderType,
          shiftNumber: formShiftNumber ? parseInt(formShiftNumber) : null,
          reason: formReason || null,
          notes: formNotes || null,
          items: validItems.map(i => ({
            workerId: i.workerId,
            toEquipmentId: i.toEquipmentId ? parseInt(i.toEquipmentId) : null,
            toShiftNumber: i.toShiftNumber ? parseInt(i.toShiftNumber) : null,
            toGradeNumber: i.toGradeNumber ? parseInt(i.toGradeNumber) : null,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Ошибка создания');
      }

      toast({ title: 'Готово', description: 'Распоряжение создано, работники переведены' });
      setShowCreate(false);
      resetForm();
      fetchOrders();
    } catch (e: any) {
      toast({ title: 'Ошибка создания', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setFormOrderType('combined');
    setFormShiftNumber('');
    setFormReason('');
    setFormNotes('');
    setFormItems([{ workerId: '', toEquipmentId: '', toShiftNumber: '', toGradeNumber: '' }]);
  };

  // Утверждение / отмена
  const handleAction = async (orderId: string, action: 'approve' | 'cancel') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/transfer-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Ошибка');
      }

      toast({
        title: 'Готово',
        description: action === 'approve'
          ? 'Распоряжение утверждено'
          : 'Распоряжение отменено, работники возвращены',
      });
      fetchOrders();
      setViewOrder(null);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  // Удаление черновика
  const handleDelete = async (orderId: string) => {
    if (!confirm('Удалить черновик распоряжения? Работники будут возвращены на прежние места.')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/transfer-orders/${orderId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Ошибка');
      }
      toast({ title: 'Удалено', description: 'Черновик удалён, работники возвращены' });
      fetchOrders();
      setViewOrder(null);
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const canCreate = userRole === 'admin' || userRole === 'master';
  const canApprove = userRole === 'admin';

  // Форматирование данных "откуда → куда" для строки
  const formatItemChange = (item: TransferOrderItem) => {
    const changes: string[] = [];
    if (item.toGradeNumber !== null && item.toGradeNumber !== undefined) {
      changes.push(`Разряд: ${item.fromGradeNumber || '?'} → ${item.toGradeNumber}`);
    }
    if (item.toShiftNumber !== null && item.toShiftNumber !== undefined) {
      changes.push(`Смена: ${item.fromShiftNumber || '?'} → ${item.toShiftNumber}`);
    }
    if (item.toEquipmentId !== null && item.toEquipmentId !== undefined) {
      changes.push(`Оборуд.: ${item.fromEquipment?.name || '?'} → ${item.toEquipment?.name || '?'}`);
    }
    return changes.join('; ');
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и фильтры */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Распоряжения о переводе</h2>
          <p className="text-sm text-gray-500">Управление переводами работников между сменами, оборудованием и разрядами</p>
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
            const isDraft = order.status === 'draft';
            return (
              <Card
                key={order.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  isDraft ? 'ring-2 ring-yellow-400 bg-yellow-50/30' : ''
                }`}
                onClick={() => setViewOrder(order)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <div>
                        <p className="font-bold text-lg">{order.orderNumber}</p>
                        <p className="text-sm text-gray-500">от {order.orderDate}</p>
                      </div>
                      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                      <span className="text-sm text-gray-600 hidden sm:inline">
                        {ORDER_TYPE_MAP[order.orderType] || order.orderType}
                      </span>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:text-right gap-2 sm:gap-0">
                      <p className="text-sm">
                        <span className="text-gray-500">Строк:</span>{' '}
                        <span className="font-semibold">{order.items.length}</span>
                      </p>
                      {order.shift && (
                        <p className="text-xs text-gray-500">Смена {order.shift.number}</p>
                      )}
                      {isDraft && (
                        <Badge className="bg-yellow-200 text-yellow-900 text-xs">Ожидает утверждения</Badge>
                      )}
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
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новое распоряжение о переводе</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Предупреждение о немедленном переводе */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
              <span className="text-lg leading-none mt-0.5">⚠️</span>
              <div>
                <p className="font-medium">Работники переводятся немедленно</p>
                <p className="text-amber-600 mt-1 text-xs">При создании распоряжения работники будут сразу перемещены на новые смену, оборудование и разряд. Распоряжение создаётся как черновик и ожидает утверждения администратором. При отмене или удалении черновика работники вернутся на прежние места.</p>
              </div>
            </div>

            {/* Тип распоряжения */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Тип распоряжения</label>
                <Select value={formOrderType} onValueChange={setFormOrderType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="combined">Комплексный перевод</SelectItem>
                    <SelectItem value="equipment">Только оборудование</SelectItem>
                    <SelectItem value="shift">Только смена</SelectItem>
                    <SelectItem value="grade">Только разряд</SelectItem>
                  </SelectContent>
                </Select>
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
            {/* Основание */}
            <div>
              <label className="text-sm font-medium mb-1 block">Основание</label>
              <Input value={formReason} onChange={e => setFormReason(e.target.value)} placeholder="Производственная необходимость" />
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
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }} className="w-full sm:w-auto" disabled={creating}>Отмена</Button>
            <Button
              onClick={handleCreate}
              className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
              disabled={!formItems.some(i => i.workerId) || creating}
            >
              {creating ? 'Создание...' : 'Создать и перевести'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Диалог просмотра распоряжения === */}
      <Dialog open={!!viewOrder} onOpenChange={() => setViewOrder(null)}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewOrder && (() => {
            const statusInfo = STATUS_MAP[viewOrder.status] || STATUS_MAP.draft;
            const isDraft = viewOrder.status === 'draft';
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2 sm:gap-3">
                    Распоряжение {viewOrder.orderNumber}
                    <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {/* Предупреждение для черновика */}
                  {isDraft && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
                      <span className="text-lg leading-none mt-0.5">⚠️</span>
                      <div>
                        <p className="font-medium">Работники уже переведены</p>
                        <p className="text-amber-600 mt-1 text-xs">Работники были перемещены при создании этого черновика. Утверждение лишь подтверждает перевод. При отмене или удалении работники вернутся на прежние места.</p>
                      </div>
                    </div>
                  )}

                  {/* Реквизиты */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Дата:</span>{' '}
                      <span className="font-medium">{viewOrder.orderDate}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Тип:</span>{' '}
                      <span className="font-medium">{ORDER_TYPE_MAP[viewOrder.orderType]}</span>
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

                  {/* Мобильные карточки */}
                  <div className="sm:hidden space-y-2">
                    {viewOrder.items.map((item, i) => (
                      <div key={item.id} className="border rounded-lg p-3 bg-gray-50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {i + 1}. {item.worker.lastName} {item.worker.firstName[0]}.{item.worker.patronymic[0]}.
                          </span>
                          {item.executed ? (
                            <Badge className="bg-green-100 text-green-800 text-xs">Выполнено</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Ожидает</Badge>
                          )}
                        </div>
                        <div className="text-xs space-y-1">
                          {formatItemChange(item) ? (
                            <p className="text-gray-700">{formatItemChange(item)}</p>
                          ) : (
                            <p className="text-gray-400">Нет изменений</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Десктопная таблица */}
                  <div className="hidden sm:block border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="px-3 py-2 text-center font-medium">№</th>
                          <th className="px-3 py-2 text-left font-medium">Работник</th>
                          <th className="px-3 py-2 text-left font-medium">Изменения</th>
                          <th className="px-3 py-2 text-center font-medium">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewOrder.items.map((item, i) => (
                          <tr key={item.id} className="border-t">
                            <td className="px-3 py-2 text-center text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2 font-medium">
                              {item.worker.lastName} {item.worker.firstName[0]}.{item.worker.patronymic[0]}.
                            </td>
                            <td className="px-3 py-2 text-sm">
                              {formatItemChange(item) || <span className="text-gray-400">Нет изменений</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {item.executed ? (
                                <Badge className="bg-green-100 text-green-800 text-xs">Выполнено</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">Ожидает</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Кнопки действий */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {viewOrder.status === 'draft' && canApprove && (
                      <Button onClick={() => handleAction(viewOrder.id, 'approve')} className="bg-green-600 hover:bg-green-700 w-full sm:w-auto" disabled={actionLoading}>
                        {actionLoading ? 'Выполнение...' : '✓ Утвердить'}
                      </Button>
                    )}
                    {(viewOrder.status === 'draft' || viewOrder.status === 'approved') && (
                      <Button variant="outline" onClick={() => handleAction(viewOrder.id, 'cancel')} className="text-red-600 hover:text-red-700 w-full sm:w-auto" disabled={actionLoading}>
                        ✕ Отменить (вернуть работников)
                      </Button>
                    )}
                    {viewOrder.status === 'draft' && canCreate && (
                      <Button variant="ghost" onClick={() => handleDelete(viewOrder.id)} className="text-red-400 hover:text-red-600 sm:ml-auto w-full sm:w-auto" disabled={actionLoading}>
                        🗑 Удалить
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
