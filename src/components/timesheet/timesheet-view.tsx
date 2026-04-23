'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ATTENDANCE_STATUS, getMonthName, ShiftPhase } from '@/lib/shift-utils';
import { useSession } from 'next-auth/react';

interface TimesheetDay {
  day: number;
  date: string;
  phase: ShiftPhase;
  shiftType: string | null;
  status: string;
  isHoliday: boolean;
  isCombination: boolean;
  attendanceRecord: any | null;
}

interface TimesheetWorker {
  workerId: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  gradeNumber: number;
  position: string;
  equipment: string;
  professions: string[];
  isCombination: boolean;
  days: TimesheetDay[];
  totalHours: number;
  totalNightHours: number;
  totalHolidayHours: number;
  totalCombinationHours: number;
}

interface CellEdit {
  workerId: string;
  date: string;
  shiftType: string;
  currentStatus: string;
  workerName: string;
  day: number;
}

export function TimesheetView() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'worker';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [shiftNumber, setShiftNumber] = useState('1');
  const [timesheet, setTimesheet] = useState<TimesheetWorker[]>([]);
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [loading, setLoading] = useState(true);
  const [editCell, setEditCell] = useState<CellEdit | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());

  const fetchTimesheet = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/timesheet?year=${year}&month=${month}&shiftNumber=${shiftNumber}`);
      const data = await res.json();
      setTimesheet(data.timesheet || []);
      setDaysInMonth(data.daysInMonth || 30);
    } catch (err) {
      console.error('Error fetching timesheet:', err);
    }
    setLoading(false);
  }, [year, month, shiftNumber]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/timesheet?year=${year}&month=${month}&shiftNumber=${shiftNumber}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setTimesheet(data.timesheet || []);
          setDaysInMonth(data.daysInMonth || 30);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, month, shiftNumber]);

  // Fetch holidays
  useEffect(() => {
    fetch(`/api/holidays?year=${year}`)
      .then(r => r.json())
      .then(hs => setHolidays(new Set(hs.map((h: any) => h.date))))
      .catch(() => {});
  }, [year]);

  const handleCellClick = (worker: TimesheetWorker, day: TimesheetDay) => {
    if (userRole !== 'admin' && userRole !== 'master') return;
    if (!day.shiftType) return;

    setEditCell({
      workerId: worker.workerId,
      date: day.date,
      shiftType: day.shiftType!,
      currentStatus: day.status,
      workerName: `${worker.lastName} ${worker.firstName}`,
      day: day.day,
    });
    setSelectedStatus(day.status === 'day' || day.status === 'night' || day.status === 'rest' || day.status === 'off' ? 'present' : day.status);
    setAbsenceReason('');
  };

  // Мгновенное сохранение — сразу в API
  const handleSaveCell = async () => {
    if (!editCell || !selectedStatus) return;
    setSaving(true);

    try {
      await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            workerId: editCell.workerId,
            date: editCell.date,
            shiftType: editCell.shiftType,
            status: selectedStatus,
            absenceReason: selectedStatus !== 'present' ? absenceReason : undefined,
          }],
          markedBy: (session?.user as any)?.id || 'system',
          markedByName: session?.user?.name || 'Система',
        }),
      });

      // Обновляем локальное состояние
      setTimesheet(prev => prev.map(w => {
        if (w.workerId !== editCell.workerId) return w;
        return {
          ...w,
          days: w.days.map(d => {
            if (d.date !== editCell.date) return d;
            return { ...d, status: selectedStatus };
          }),
        };
      }));

      setEditCell(null);
      // Перезагружаем табель чтобы пересчитать совмещение
      fetchTimesheet();
    } catch (err) {
      console.error('Error saving attendance:', err);
    }
    setSaving(false);
  };

  const getStatusDisplay = (status: string, phase: ShiftPhase) => {
    if (status === 'day') return { text: 'Д', color: 'bg-green-100 text-green-800', editable: true };
    if (status === 'night') return { text: 'Н', color: 'bg-blue-100 text-blue-800', editable: true };
    if (status === 'rest') return { text: 'О', color: 'bg-gray-100 text-gray-500', editable: false };
    if (status === 'off') return { text: 'В', color: 'bg-gray-50 text-gray-400', editable: false };

    const statusInfo = ATTENDANCE_STATUS[status];
    if (statusInfo) return { text: statusInfo.short, color: statusInfo.color, editable: true };

    return { text: '?', color: 'bg-gray-100', editable: false };
  };

  const positionLabel = (p: string) =>
    p === 'master' ? 'Мастер' : p === 'master_pu' ? 'М.ПУ' : p === 'section_head' ? 'НУ' : '';

  const positionColor = (p: string) =>
    p === 'master' ? 'bg-amber-600' : p === 'master_pu' ? 'bg-blue-600' : p === 'section_head' ? 'bg-indigo-600' : '';

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
      {/* Controls */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-3 sm:items-center">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Год:</label>
              <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
                <SelectTrigger className="w-full sm:w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Месяц:</label>
              <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <SelectItem key={m} value={String(m)}>{getMonthName(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Смена:</label>
              <Select value={shiftNumber} onValueChange={setShiftNumber}>
                <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Смена 1</SelectItem>
                  <SelectItem value="2">Смена 2</SelectItem>
                  <SelectItem value="3">Смена 3</SelectItem>
                  <SelectItem value="4">Смена 4</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="overflow-x-auto pb-1 -mx-1 px-1 md:overflow-visible md:mx-0 md:px-0">
        <div className="flex gap-1.5 sm:gap-2 text-[10px] sm:text-xs whitespace-nowrap md:whitespace-normal md:flex-wrap">
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-green-100 text-green-800 rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">Д</span><span className="hidden xs:inline">День</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-blue-100 text-blue-800 rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">Н</span><span className="hidden xs:inline">Ночь</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-100 text-gray-500 rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">О</span><span className="hidden xs:inline">Отсыпной</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-50 text-gray-400 rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">В</span><span className="hidden xs:inline">Выходной</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-green-500 text-white rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">П</span><span className="hidden xs:inline">Явка</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-red-500 text-white rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">НП</span><span className="hidden xs:inline">Неявка</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-yellow-400 rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">Б</span><span className="hidden xs:inline">Больничный</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-cyan-400 text-white rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">ОП</span><span className="hidden xs:inline">Отпуск</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-pink-400 text-white rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">КД</span><span className="hidden xs:inline">Колдоговор</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-indigo-400 text-white rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">Г</span><span className="hidden xs:inline">Гос. обяз.</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-orange-400 text-white rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">ОГ</span><span className="hidden xs:inline">Отгул</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-teal-400 text-white rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">ПМ</span><span className="hidden xs:inline">Подмена</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-purple-400 text-white rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5">ПР</span><span className="hidden xs:inline">Перевод</span></span>
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-rose-200 text-rose-800 rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5 border border-rose-400">С</span><span className="hidden xs:inline">Совмещение</span></span>
        </div>
      </div>

      {/* ===== MOBILE: Per-worker card view ===== */}
      <div className="md:hidden space-y-3">
        {timesheet.length === 0 && (
          <Card>
            <CardContent className="text-center py-8 text-gray-500">
              Нет данных для выбранной смены
            </CardContent>
          </Card>
        )}
        {timesheet.map((worker) => (
          <Card key={worker.workerId} className={`overflow-hidden ${worker.isCombination ? 'ring-2 ring-rose-300' : ''}`}>
            <CardHeader className="pb-2 pt-3 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  {worker.lastName} {worker.firstName[0]}.{worker.patronymic ? ` ${worker.patronymic[0]}.` : ''}
                  {worker.isCombination && <span className="ml-1 text-[10px] text-rose-600 font-normal">(совмещ.)</span>}
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  {worker.position !== 'worker' ? (
                    <Badge className={`text-[10px] px-1.5 py-0 ${positionColor(worker.position)}`}>
                      {positionLabel(worker.position)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {worker.gradeNumber} разр.
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {worker.equipment}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                  <div key={d} className="text-[9px] text-gray-400 text-center font-medium">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const firstDayDate = new Date(year, month - 1, 1);
                  let firstDayOffset = firstDayDate.getDay() - 1;
                  if (firstDayOffset < 0) firstDayOffset = 6;
                  const pads: JSX.Element[] = [];
                  for (let i = 0; i < firstDayOffset; i++) {
                    pads.push(<div key={`pad-${i}`} />);
                  }
                  return pads;
                })()}
                {worker.days.map(day => {
                  const display = getStatusDisplay(day.status, day.phase);
                  const dateObj = new Date(year, month - 1, day.day);
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
                  const isH = holidays.has(dateStr);
                  const isWknd = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  const isCombDay = day.isCombination && (day.status === 'day' || day.status === 'night' || day.status === 'present');
                  return (
                    <div
                      key={day.day}
                      className={`aspect-square flex flex-col items-center justify-center rounded text-[10px] leading-tight ${display.color} ${isCombDay ? 'ring-1 ring-rose-400' : ''} ${display.editable && canEdit ? 'cursor-pointer active:scale-95 transition-transform' : ''} ${isH ? 'ring-1 ring-red-300' : isWknd ? 'ring-1 ring-amber-200' : ''}`}
                      onClick={() => display.editable && canEdit && handleCellClick(worker, day)}
                    >
                      <span className="text-[8px] opacity-60">{day.day}</span>
                      <span className="font-semibold">{display.text}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-xs">
                <div className="flex gap-2 flex-wrap">
                  <span className="text-emerald-700 font-medium">
                    Часы: <span className="font-bold">{worker.totalHours}</span>
                  </span>
                  <span className="text-blue-700">
                    Ночн.: <span className="font-semibold">{worker.totalNightHours}</span>
                  </span>
                  <span className="text-red-700">
                    Праздн.: <span className="font-semibold">{worker.totalHolidayHours}</span>
                  </span>
                  {worker.totalCombinationHours > 0 && (
                    <span className="text-rose-700">
                      Совмещ.: <span className="font-semibold">{worker.totalCombinationHours}</span>
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ===== DESKTOP: Full timesheet table ===== */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-slate-100">
                <th className="sticky left-0 bg-slate-100 z-10 px-2 py-2 text-left font-medium text-gray-700 min-w-[180px] border-r">ФИО / Разряд</th>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = i + 1;
                  const date = new Date(year, month - 1, d);
                  const dow = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][date.getDay()];
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const isH = holidays.has(dateStr);
                  const isWknd = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <th key={d} className={`px-1 py-1 text-center font-medium min-w-[32px] ${isH ? 'bg-red-50 text-red-700' : isWknd ? 'bg-amber-50 text-amber-700' : 'text-gray-700'}`}>
                      <div>{d}</div>
                      <div className="text-[9px] font-normal">{dow}</div>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-center font-medium text-gray-700 border-l">Часы</th>
                <th className="px-2 py-2 text-center font-medium text-gray-700">Ночн.</th>
                <th className="px-2 py-2 text-center font-medium text-gray-700">Праздн.</th>
                <th className="px-2 py-2 text-center font-medium text-rose-700">Совмещ.</th>
              </tr>
            </thead>
            <tbody>
              {timesheet.map((worker, wIdx) => (
                <tr key={worker.workerId} className={`${wIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="sticky left-0 z-10 px-2 py-1 border-r bg-inherit">
                    <div className="font-medium text-gray-900">
                      {worker.lastName} {worker.firstName[0]}.
                      {worker.isCombination && <span className="ml-1 text-[9px] text-rose-600 font-normal">С</span>}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {worker.position !== 'worker' ? positionLabel(worker.position) : `${worker.gradeNumber} разр.`} | {worker.equipment}
                    </div>
                  </td>
                  {worker.days.map(day => {
                    const display = getStatusDisplay(day.status, day.phase);
                    const isCombDay = day.isCombination && (day.status === 'day' || day.status === 'night' || day.status === 'present');
                    return (
                      <td
                        key={day.day}
                        className={`px-0.5 py-0.5 text-center border border-gray-100 ${display.editable && canEdit ? 'cursor-pointer hover:ring-2 hover:ring-emerald-400' : ''} ${isCombDay ? 'bg-rose-50' : ''}`}
                        onClick={() => display.editable && canEdit && handleCellClick(worker, day)}
                      >
                        <div className={`w-7 h-7 flex items-center justify-center rounded text-[11px] font-medium ${display.color} ${isCombDay ? 'ring-1 ring-rose-400' : ''}`}>
                          {display.text}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center font-medium border-l text-emerald-700">{worker.totalHours}</td>
                  <td className="px-2 py-1 text-center text-blue-700">{worker.totalNightHours}</td>
                  <td className="px-2 py-1 text-center text-red-700">{worker.totalHolidayHours}</td>
                  <td className={`px-2 py-1 text-center font-medium ${worker.totalCombinationHours > 0 ? 'text-rose-700' : 'text-gray-400'}`}>
                    {worker.totalCombinationHours ?? 0}
                  </td>
                </tr>
              ))}
              {timesheet.length === 0 && (
                <tr>
                  <td colSpan={daysInMonth + 5} className="text-center py-8 text-gray-500">
                    Нет данных для выбранной смены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editCell} onOpenChange={() => setEditCell(null)}>
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Отметка: {editCell?.workerName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-gray-500">
              Дата: {editCell?.date} | Смена: {editCell?.shiftType === 'day' ? 'День (7:30-19:30)' : 'Ночь (19:30-7:30)'}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Статус:</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Явка</SelectItem>
                  <SelectItem value="absent">Неявка</SelectItem>
                  <SelectItem value="sick">Больничный</SelectItem>
                  <SelectItem value="vacation">Отпуск</SelectItem>
                  <SelectItem value="day_off">Отгул</SelectItem>
                  <SelectItem value="state_duty">Гос. обязанности</SelectItem>
                  <SelectItem value="collective_agreement">Колдоговор</SelectItem>
                  <SelectItem value="substitution">Подмена</SelectItem>
                  <SelectItem value="transfer">Перевод</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedStatus !== 'present' && (
              <div>
                <label className="text-sm font-medium mb-2 block">Причина:</label>
                <input
                  type="text"
                  value={absenceReason}
                  onChange={e => setAbsenceReason(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="Укажите причину..."
                />
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setEditCell(null)} className="w-full sm:w-auto">Отмена</Button>
            <Button onClick={handleSaveCell} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
              {saving ? 'Сохранение...' : 'Отметить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
