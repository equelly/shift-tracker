'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  isOtherRow: boolean;          // день относится к другой строке (другой разряд/должность)
  isTransferredDay: boolean;    // работник уже переведён в другую смену (день после даты перевода)
  isBeforeTransferIn: boolean;  // работник ещё не был в этой смене (день до даты перевода)
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
  isSubRow: boolean;         // у работника несколько строк
  isTransferred: number | false;    // номер смены, куда переведён работник (или false)
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

const POSITION_MAP: Record<string, string> = {
  worker: 'Работник',
  master: 'Мастер',
  master_pu: 'Мастер ПУ',
  section_head: 'Начальник участка',
};

export function TimesheetView() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'worker';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [shiftNumber, setShiftNumber] = useState('1');
  const [timesheet, setTimesheet] = useState<TimesheetWorker[]>([]);
  const [workerTotals, setWorkerTotals] = useState<Record<string, { hours: number; night: number; holiday: number; combination: number }>>({});
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [loading, setLoading] = useState(true);
  const [editCell, setEditCell] = useState<CellEdit | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const fetchTimesheet = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/timesheet?year=${year}&month=${month}&shiftNumber=${shiftNumber}`);
      const data = await res.json();
      setTimesheet(data.timesheet || []);
      setWorkerTotals(data.workerTotals || {});
      setDaysInMonth(data.daysInMonth || 30);
    } catch (err) {
      console.error('Error fetching timesheet:', err);
    }
    setLoading(false);
  }, [year, month, shiftNumber]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/reports/timesheet?year=${year}&month=${month}&shiftNumber=${shiftNumber}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setTimesheet(data.timesheet || []);
          setWorkerTotals(data.workerTotals || {});
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
    // Не редактируем неактивные ячейки (другой разряд, после перевода, до перевода)
    if (day.isOtherRow || day.isTransferredDay || day.isBeforeTransferIn) return;

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

      setEditCell(null);
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

  // Группировка строк по работникам для итоговых строк
  const workerRowGroups: { workerId: string; rows: TimesheetWorker[]; total: { hours: number; night: number; holiday: number; combination: number } }[] = [];
  let currentGroup: { workerId: string; rows: TimesheetWorker[]; total: { hours: number; night: number; holiday: number; combination: number } } | null = null;
  for (const row of timesheet) {
    if (!currentGroup || currentGroup.workerId !== row.workerId) {
      currentGroup = { workerId: row.workerId, rows: [], total: workerTotals[row.workerId] || { hours: 0, night: 0, holiday: 0, combination: 0 } };
      workerRowGroups.push(currentGroup);
    }
    currentGroup.rows.push(row);
  }

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
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Смена 1</SelectItem>
                  <SelectItem value="2">Смена 2</SelectItem>
                  <SelectItem value="3">Смена 3</SelectItem>
                  <SelectItem value="4">Смена 4</SelectItem>
                  <SelectItem value="0">Руководители</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={async () => {
                setExporting(true);
                try {
                  const res = await fetch(`/api/reports/timesheet-export?year=${year}&month=${month}`);
                  if (!res.ok) throw new Error('Export failed');
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  const disposition = res.headers.get('Content-Disposition');
                  const match = disposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                  a.download = match ? decodeURIComponent(match[1].replace(/['"]/g, '')) : `Табель_${getMonthName(month)}_${year}.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (err) {
                  console.error('Export error:', err);
                }
                setExporting(false);
              }}
              disabled={exporting}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {exporting ? 'Экспорт...' : '📥 Excel (по оборуд.)'}
            </Button>
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
          <span className="flex items-center gap-0.5 sm:gap-1"><span className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-200 text-gray-400 rounded text-center text-[9px] sm:text-xs leading-4 sm:leading-5 border border-dashed border-gray-300">Д</span><span className="hidden xs:inline">Другой разряд / До перевода</span></span>
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
        {workerRowGroups.map(group => {
          const firstRow = group.rows[0];
          const hasMultiple = group.rows.length > 1;
          return (
            <Card key={group.workerId} className={`overflow-hidden ${firstRow.isCombination ? 'ring-2 ring-rose-300' : ''}`}>
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-900">
                    {firstRow.lastName} {firstRow.firstName[0]}.{firstRow.patronymic ? ` ${firstRow.patronymic[0]}.` : ''}
                    {firstRow.isCombination && <span className="ml-1 text-[10px] text-rose-600 font-normal">(совмещ.)</span>}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {firstRow.equipment}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {group.rows.map((worker, rowIdx) => (
                  <div key={`${worker.workerId}_${worker.gradeNumber}_${worker.position}`}>
                    {/* Метка разряда/должности для подстрок */}
                    {hasMultiple && (
                      <div className="text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                        {worker.position !== 'worker' ? POSITION_MAP[worker.position] || worker.position : `${worker.gradeNumber} разр.`}
                        {rowIdx === 0 && <span className="text-emerald-600">(текущий)</span>}
                      </div>
                    )}
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
                            className={`aspect-square flex flex-col items-center justify-center rounded text-[10px] leading-tight ${
                              day.isTransferredDay || day.isBeforeTransferIn
                                ? 'bg-gray-100 text-gray-300'
                                : day.isOtherRow
                                  ? 'bg-gray-200 text-gray-400 opacity-50'
                                  : display.color
                            } ${isCombDay && !day.isOtherRow && !day.isTransferredDay && !day.isBeforeTransferIn ? 'ring-1 ring-rose-400' : ''} ${!day.isOtherRow && !day.isTransferredDay && !day.isBeforeTransferIn && display.editable && canEdit ? 'cursor-pointer active:scale-95 transition-transform' : ''} ${isH && !day.isOtherRow && !day.isTransferredDay && !day.isBeforeTransferIn ? 'ring-1 ring-red-300' : isWknd && !day.isOtherRow && !day.isTransferredDay && !day.isBeforeTransferIn ? 'ring-1 ring-amber-200' : ''}`}
                            onClick={() => !day.isOtherRow && !day.isTransferredDay && !day.isBeforeTransferIn && display.editable && canEdit && handleCellClick(worker, day)}
                          >
                            <span className="text-[8px] opacity-60">{day.day}</span>
                            <span className="font-semibold">{day.isOtherRow || day.isTransferredDay || day.isBeforeTransferIn ? '' : display.text}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Итого по подстроке */}
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100 text-[10px]">
                      <div className="flex gap-2 flex-wrap">
                        <span className="text-emerald-700 font-medium">
                          Ч: <span className="font-bold">{worker.totalHours}</span>
                        </span>
                        <span className="text-blue-700">
                          Н: <span className="font-semibold">{worker.totalNightHours}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {/* Итого по работнику */}
                {hasMultiple && (
                  <div className="flex items-center justify-between mt-1 pt-2 border-t-2 border-gray-200 text-xs font-bold">
                    <span>ИТОГО:</span>
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-emerald-700">Часы: {group.total.hours}</span>
                      <span className="text-blue-700">Ночн.: {group.total.night}</span>
                      <span className="text-red-700">Праздн.: {group.total.holiday}</span>
                      {group.total.combination > 0 && (
                        <span className="text-rose-700">Совмещ.: {group.total.combination}</span>
                      )}
                    </div>
                  </div>
                )}
                {!hasMultiple && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 text-xs">
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-emerald-700 font-medium">
                        Часы: <span className="font-bold">{firstRow.totalHours}</span>
                      </span>
                      <span className="text-blue-700">
                        Ночн.: <span className="font-semibold">{firstRow.totalNightHours}</span>
                      </span>
                      <span className="text-red-700">
                        Праздн.: <span className="font-semibold">{firstRow.totalHolidayHours}</span>
                      </span>
                      {firstRow.totalCombinationHours > 0 && (
                        <span className="text-rose-700">
                          Совмещ.: <span className="font-semibold">{firstRow.totalCombinationHours}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
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
              {workerRowGroups.map(group => {
                const hasMultiple = group.rows.length > 1;
                return (
                  <React.Fragment key={group.workerId}>
                    {group.rows.map((worker, rowIdx) => (
                      <tr key={`${worker.workerId}_${worker.gradeNumber}_${worker.position}`} className={`${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} ${hasMultiple && rowIdx > 0 ? 'border-t-0' : ''}`}>
                        <td className={`sticky left-0 z-10 px-2 py-1 border-r bg-inherit ${hasMultiple && rowIdx > 0 ? 'border-t-0 pt-0' : ''}`}>
                          {rowIdx === 0 ? (
                            <div className="font-medium text-gray-900">
                              {worker.lastName} {worker.firstName[0]}.
                              {worker.isCombination && <span className="ml-1 text-[9px] text-rose-600 font-normal">С</span>}
                              {worker.isTransferred && <span className="ml-1 text-[9px] text-amber-600 font-normal">→См.{worker.isTransferred}</span>}
                            </div>
                          ) : (
                            <div className="text-[10px] text-gray-400 pl-2">↳</div>
                          )}
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
                              className={`px-0.5 py-0.5 text-center border border-gray-100 ${
                                day.isTransferredDay || day.isBeforeTransferIn
                                  ? 'bg-gray-100'
                                  : day.isOtherRow
                                    ? 'bg-gray-200'
                                    : isCombDay ? 'bg-rose-50' : ''
                              } ${!day.isOtherRow && !day.isTransferredDay && !day.isBeforeTransferIn && display.editable && canEdit ? 'cursor-pointer hover:ring-2 hover:ring-emerald-400' : ''}`}
                              onClick={() => !day.isOtherRow && !day.isTransferredDay && !day.isBeforeTransferIn && display.editable && canEdit && handleCellClick(worker, day)}
                            >
                              <div className={`w-7 h-7 flex items-center justify-center rounded text-[11px] font-medium ${
                                day.isTransferredDay || day.isBeforeTransferIn
                                  ? 'bg-gray-100 text-gray-300'
                                  : day.isOtherRow
                                    ? 'bg-gray-200 text-gray-300'
                                    : `${display.color} ${isCombDay ? 'ring-1 ring-rose-400' : ''}`
                              }`}>
                                {day.isOtherRow || day.isTransferredDay || day.isBeforeTransferIn ? '' : display.text}
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
                    {/* Итоговая строка по работнику (если несколько подстрок) */}
                    {hasMultiple && (
                      <tr className="bg-slate-100/80 font-bold text-xs">
                        <td className="sticky left-0 z-10 px-2 py-1 border-r bg-slate-100/80">
                          <div className="text-gray-700">ИТОГО</div>
                        </td>
                        {Array.from({ length: daysInMonth }, (_, i) => (
                          <td key={i + 1} className="px-0.5 py-0.5 border border-gray-100 bg-slate-100/50" />
                        ))}
                        <td className="px-2 py-1 text-center text-emerald-700 border-l">{group.total.hours}</td>
                        <td className="px-2 py-1 text-center text-blue-700">{group.total.night}</td>
                        <td className="px-2 py-1 text-center text-red-700">{group.total.holiday}</td>
                        <td className={`px-2 py-1 text-center ${group.total.combination > 0 ? 'text-rose-700' : 'text-gray-400'}`}>
                          {group.total.combination}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
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
