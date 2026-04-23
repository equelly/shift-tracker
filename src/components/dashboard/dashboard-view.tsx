'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface LeaderInfo {
  id: string;
  position: string;
  positionLabel: string;
  isWorkingToday: boolean;
}

interface DashboardData {
  today: string;
  dayOfMonth: number;
  dayShift: number;
  nightShift: number;
  shifts: { number: number; name: string; masterName: string; workerCount: number }[];
  activeWorkers: number;
  presentToday: number;
  unreadNotifications: number;
  recentLogs: any[];
  notificationMessage: string;
  leaders: LeaderInfo[];
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!data) return <div className="text-center text-red-600">Ошибка загрузки данных</div>;

  return (
    <div className="space-y-6 px-3 sm:px-0">
      {/* Notification banner */}
      {data.notificationMessage && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 flex flex-wrap items-center gap-3">
          <span className="text-xl sm:text-2xl shrink-0">⚠️</span>
          <p className="text-amber-800 font-medium text-sm sm:text-base min-w-0 break-words">{data.notificationMessage}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📅</span>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-emerald-700">{data.today}</p>
                <p className="text-xs text-gray-500">Сегодня</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">👷</span>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-blue-700">{data.activeWorkers}</p>
                <p className="text-xs text-gray-500">Всего работников</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-green-700">{data.presentToday}</p>
                <p className="text-xs text-gray-500">Явилось сегодня</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🔔</span>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-orange-700">{data.unreadNotifications}</p>
                <p className="text-xs text-gray-500">Уведомлений</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's shifts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              Дневная смена (7:30 – 19:30)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge className="bg-green-600 text-white text-base sm:text-lg px-2 sm:px-3 py-1">Смена {data.dayShift}</Badge>
              <span className="text-gray-600 text-sm sm:text-base">Мастер: {data.shifts.find(s => s.number === data.dayShift)?.masterName}</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Работников: {data.shifts.find(s => s.number === data.dayShift)?.workerCount || 0}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              Ночная смена (19:30 – 7:30)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge className="bg-blue-600 text-white text-base sm:text-lg px-2 sm:px-3 py-1">Смена {data.nightShift}</Badge>
              <span className="text-gray-600 text-sm sm:text-base">Мастер: {data.shifts.find(s => s.number === data.nightShift)?.masterName}</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Работников: {data.shifts.find(s => s.number === data.nightShift)?.workerCount || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* All shifts status */}
      <Card>
        <CardHeader>
          <CardTitle>Статус всех смен сегодня</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.shifts.map(shift => {
              let phase = '';
              let color = '';
              if (shift.number === data.dayShift) { phase = 'День'; color = 'bg-green-100 border-green-300'; }
              else if (shift.number === data.nightShift) { phase = 'Ночь'; color = 'bg-blue-100 border-blue-300'; }
              else { phase = 'Выходной'; color = 'bg-gray-50 border-gray-200'; }

              return (
                <div key={shift.number} className={`p-3 rounded-lg border ${color} text-center`}>
                  <p className="font-bold text-base sm:text-lg">Смена {shift.number}</p>
                  <Badge variant={phase === 'День' ? 'default' : phase === 'Ночь' ? 'secondary' : 'outline'}
                    className={phase === 'День' ? 'bg-green-600' : phase === 'Ночь' ? 'bg-blue-600' : ''}>
                    {phase}
                  </Badge>
                  <p className="text-xs text-gray-500 mt-1">{shift.masterName}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Non-shift leaders status */}
      {data.leaders && data.leaders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Руководители сегодня</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.leaders.map((leader, idx) => (
                <div key={leader.id || idx} className={`p-3 rounded-lg border ${leader.isWorkingToday ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'} flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <Badge className={leader.position === 'master_pu' ? 'bg-blue-600' : 'bg-indigo-600'}>
                      {leader.positionLabel}
                    </Badge>
                    <span className="text-sm text-gray-700">{leader.position === 'master_pu' ? '8ч, выходные Пт+Сб' : '8ч, выходные Вс+Пн'}</span>
                  </div>
                  <Badge variant={leader.isWorkingToday ? 'default' : 'outline'}
                    className={leader.isWorkingToday ? 'bg-emerald-600' : ''}>
                    {leader.isWorkingToday ? 'На работе' : 'Выходной'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      {data.recentLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Последние действия</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentLogs.map((log: any) => (
                <div key={log.id} className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm py-2 border-b last:border-0">
                  <Badge variant="outline" className="text-xs shrink-0">{log.action === 'create' ? 'Создание' : log.action === 'update' ? 'Изменение' : 'Удаление'}</Badge>
                  <span className="text-gray-600 min-w-0 break-words flex-1">{log.description}</span>
                  <span className="text-gray-400 text-xs ml-auto shrink-0">{log.userName}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
