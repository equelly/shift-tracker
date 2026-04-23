'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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

interface ShiftPhaseInfo {
  shiftNumber: number;
  phase: string;
  label: string;
  shortLabel: string;
}

interface ScheduleConfig {
  startDate: string;
  today: string;
  phases: ShiftPhaseInfo[];
}

const PHASE_COLORS: Record<string, string> = {
  day: 'bg-green-100 text-green-800 border-green-300',
  night: 'bg-blue-100 text-blue-800 border-blue-300',
  rest: 'bg-gray-100 text-gray-600 border-gray-300',
  off: 'bg-gray-50 text-gray-400 border-gray-200',
};

export function ReferencesView() {
  const { data: session } = useSession();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [editingGrade, setEditingGrade] = useState<number | null>(null);
  const [editRate, setEditRate] = useState(0);
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });

  // Schedule config state
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);
  const [shifting, setShifting] = useState(false);

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

  const fetchScheduleConfig = useCallback(async () => {
    const res = await fetch('/api/schedule-config');
    const data = await res.json();
    setScheduleConfig(data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/grades')
      .then(r => { if (!r.ok) throw new Error(`grades ${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) setGrades(data); })
      .catch(e => { console.error('grades fetch error:', e); });

    fetch('/api/holidays?year=2026')
      .then(r => { if (!r.ok) throw new Error(`holidays ${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) setHolidays(data); })
      .catch(e => { console.error('holidays fetch error:', e); });

    fetch('/api/schedule-config')
      .then(r => { if (!r.ok) throw new Error(`schedule-config ${r.status}`); return r.json(); })
      .then(data => { if (!cancelled && data.phases) setScheduleConfig(data); })
      .catch(e => { console.error('schedule-config fetch error:', e); });

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

  // Shift the start date by offset days
  const handleShift = async (offset: number) => {
    if (!scheduleConfig || shifting) return;
    setShifting(true);
    try {
      const current = new Date(scheduleConfig.startDate + 'T00:00:00');
        current.setDate(current.getDate() + offset);
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        const newDate = `${y}-${m}-${d}`;

      const res = await fetch('/api/schedule-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: newDate }),
      });
      const data = await res.json();
      setScheduleConfig(data);
    } finally {
      setShifting(false);
    }
  };

  const formatRussianDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${d} ${months[m - 1]} ${y} (${days[date.getDay()]})`;
  };

  return (
    <div className="space-y-6">
      {/* Shift Phasing */}
      <Card>
        <CardHeader>
          <CardTitle>Фазировка смен</CardTitle>
        </CardHeader>
        <CardContent>
          {scheduleConfig && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Сегодня: <span className="font-semibold">{formatRussianDate(scheduleConfig.today)}</span>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {scheduleConfig.phases.map(p => (
                  <div
                    key={p.shiftNumber}
                    className={`rounded-lg border-2 p-4 text-center ${PHASE_COLORS[p.phase] || 'bg-gray-50'}`}
                  >
                    <div className="text-lg font-bold">Смена {p.shiftNumber}</div>
                    <div className="text-2xl font-black mt-1">{p.shortLabel}</div>
                    <div className="text-xs mt-1">{p.label}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShift(-1)}
                  disabled={shifting}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Сдвинуть назад
                </Button>

                <div className="text-xs text-gray-500 text-center">
                  Дата отсчёта: <span className="font-mono">{scheduleConfig.startDate}</span>
                  <br />
                  <span className="text-[10px]">Сдвигайте дату, пока фазы смен не совпадут с реальностью</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShift(1)}
                  disabled={shifting}
                >
                  Сдвинуть вперёд
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
          {!scheduleConfig && (
            <p className="text-gray-500 text-sm">Загрузка...</p>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
