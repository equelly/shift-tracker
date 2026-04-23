'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string | null;
  oldValues: string | null;
  newValues: string | null;
  createdAt: string;
}

export function AuditLogView() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const params = entityFilter !== 'all' ? `?entityType=${entityFilter}&limit=200` : '?limit=200';
    fetch(`/api/audit-logs${params}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) { setLogs(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityFilter]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create': return <Badge className="bg-green-600">Создание</Badge>;
      case 'update': return <Badge className="bg-blue-600">Изменение</Badge>;
      case 'delete': return <Badge className="bg-red-600">Удаление</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
    }
  };

  const getEntityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      worker: 'Работник',
      attendance: 'Посещаемость',
      equipment: 'Оборудование',
      grade: 'Разряд',
      substitution: 'Подмена',
      transfer: 'Перевод',
      holiday: 'Праздник',
    };
    return labels[type] || type;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-base md:text-lg font-semibold sm:mr-auto">Журнал действий</h2>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="worker">Работники</SelectItem>
                <SelectItem value="attendance">Посещаемость</SelectItem>
                <SelectItem value="equipment">Оборудование</SelectItem>
                <SelectItem value="grade">Разряды</SelectItem>
                <SelectItem value="substitution">Подмены</SelectItem>
                <SelectItem value="transfer">Переводы</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading ? (
        <Card>
          <CardContent className="p-4">
            <div className="text-center py-8 text-gray-500">Загрузка...</div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile: card layout (visible below md) */}
          <div className="flex flex-col gap-3 md:hidden">
            {logs.length === 0 ? (
              <Card>
                <CardContent className="p-4">
                  <div className="text-center py-8 text-gray-500">Нет записей в журнале</div>
                </CardContent>
              </Card>
            ) : (
              logs.map((log) => (
                <Card key={log.id}>
                  <CardContent className="p-3 space-y-2">
                    {/* Top row: action badge + entity badge */}
                    <div className="flex items-center gap-2">
                      {getActionBadge(log.action)}
                      <Badge variant="outline">{getEntityTypeLabel(log.entityType)}</Badge>
                    </div>
                    {/* User name */}
                    <div className="font-medium text-sm">{log.userName}</div>
                    {/* Description */}
                    {log.description && (
                      <p className="text-xs text-gray-600 break-words">{log.description}</p>
                    )}
                    {/* Date */}
                    <div className="text-xs text-gray-400">{formatDate(log.createdAt)}</div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Desktop: table layout (visible at md+) */}
          <Card className="hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="px-4 py-2 text-left font-medium">Дата/Время</th>
                    <th className="px-4 py-2 text-left font-medium">Пользователь</th>
                    <th className="px-4 py-2 text-center font-medium">Действие</th>
                    <th className="px-4 py-2 text-center font-medium">Объект</th>
                    <th className="px-4 py-2 text-left font-medium">Описание</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={log.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                      <td className="px-4 py-2 font-medium">{log.userName}</td>
                      <td className="px-4 py-2 text-center">{getActionBadge(log.action)}</td>
                      <td className="px-4 py-2 text-center"><Badge variant="outline">{getEntityTypeLabel(log.entityType)}</Badge></td>
                      <td className="px-4 py-2 text-gray-600 max-w-md truncate">{log.description}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-500">Нет записей в журнале</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
