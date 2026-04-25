'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getMonthName, ATTENDANCE_STATUS } from '@/lib/shift-utils';

interface ReportWorker {
  workerId: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  gradeNumber: number;
  gradeName: string;
  hourlyRate: number;
  shiftNumber: number;
  professions: string[];
  totalHours: number;
  nightHours: number;
  holidayHours: number;
  presentDays: number;
  absentDays: number;
  sickDays: number;
  vacationDays: number;
  stateDutyDays: number;
  collectiveAgreementDays: number;
  substitutionDays: number;
  transferDays: number;
  dayOffDays: number;
}

interface DailyWorker {
  workerId: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  gradeNumber: number;
  gradeName: string;
  shiftNumber: number | null;
  shiftName: string;
  position: string;
  equipmentName: string;
  status: string;
  hoursWorked: number;
  nightHours: number;
  shiftType: string | null;
  professions: string[];
}

interface DailySummary {
  total: number;
  present: number;
  absent: number;
  sick: number;
  vacation: number;
  dayOff: number;
  transfer: number;
  stateDuty: number;
  collectiveAgreement: number;
  substitution: number;
  noData: number;
}

const POSITION_MAP: Record<string, string> = {
  worker: 'Работник',
  master: 'Мастер',
  master_pu: 'Мастер ПУ',
  section_head: 'Начальник участка',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  present:              { label: 'Явка',            color: 'bg-green-100 text-green-800' },
  absent:               { label: 'Неявка',          color: 'bg-red-100 text-red-800' },
  sick:                 { label: 'Больничный',      color: 'bg-yellow-100 text-yellow-800' },
  vacation:             { label: 'Отпуск',          color: 'bg-cyan-100 text-cyan-800' },
  day_off:              { label: 'Отгул',           color: 'bg-orange-100 text-orange-800' },
  transfer:             { label: 'Перевод',         color: 'bg-purple-100 text-purple-800' },
  state_duty:           { label: 'Гос. обязанности', color: 'bg-indigo-100 text-indigo-800' },
  collective_agreement: { label: 'Колдоговор',      color: 'bg-pink-100 text-pink-800' },
  substitution:         { label: 'Подмена',         color: 'bg-teal-100 text-teal-800' },
  no_data:              { label: 'Нет данных',      color: 'bg-gray-100 text-gray-500' },
};

export function ReportsView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [shiftNumber, setShiftNumber] = useState('0');
  const [workers, setWorkers] = useState<ReportWorker[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState<'monthly' | 'daily' | 'substitutions' | 'professions'>('monthly');

  // Daily report state
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [dailyDate, setDailyDate] = useState(todayStr);
  const [dailyShiftNumber, setDailyShiftNumber] = useState('0');
  const [dailyWorkers, setDailyWorkers] = useState<DailyWorker[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyStatusFilter, setDailyStatusFilter] = useState('all');

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (shiftNumber !== '0') params.set('shiftNumber', shiftNumber);

      const res = await fetch(`/api/reports/monthly?${params}`);
      const data = await res.json();
      setWorkers(data.workers || []);
    } catch (err) {
      console.error('Error fetching report:', err);
    }
    setLoading(false);
  };

  const fetchDailyReport = async () => {
    if (!dailyDate) return;
    setDailyLoading(true);
    try {
      const params = new URLSearchParams({ date: dailyDate });
      if (dailyShiftNumber !== '0') params.set('shiftNumber', dailyShiftNumber);

      const res = await fetch(`/api/reports/daily?${params}`);
      const data = await res.json();
      setDailyWorkers(data.workers || []);
      setDailySummary(data.summary || null);
    } catch (err) {
      console.error('Error fetching daily report:', err);
    }
    setDailyLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    fetch(`/api/reports/monthly?${params}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setWorkers(data.workers || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const totals = workers.reduce((acc, w) => ({
    totalHours: acc.totalHours + w.totalHours,
    nightHours: acc.nightHours + w.nightHours,
    holidayHours: acc.holidayHours + w.holidayHours,
    presentDays: acc.presentDays + w.presentDays,
    absentDays: acc.absentDays + w.absentDays,
    sickDays: acc.sickDays + w.sickDays,
    vacationDays: acc.vacationDays + w.vacationDays,
  }), { totalHours: 0, nightHours: 0, holidayHours: 0, presentDays: 0, absentDays: 0, sickDays: 0, vacationDays: 0 });

  // Filtered daily workers by status
  const filteredDailyWorkers = dailyStatusFilter === 'all'
    ? dailyWorkers
    : dailyWorkers.filter(w => w.status === dailyStatusFilter);

  // Format date for display
  const formatDailyDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return `${d} ${getMonthName(m).toLowerCase()} ${y}, ${dayNames[date.getDay()]}`;
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col md:flex-row flex-wrap gap-2 md:gap-3 items-stretch md:items-center">
            <Select value={activeReport} onValueChange={v => setActiveReport(v as any)}>
              <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Помесячный отчёт</SelectItem>
                <SelectItem value="daily">Статус на дату</SelectItem>
                <SelectItem value="substitutions">Подмены</SelectItem>
                <SelectItem value="professions">Совмещение профессий</SelectItem>
              </SelectContent>
            </Select>

            {activeReport === 'monthly' && (
              <>
                <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
                  <SelectTrigger className="w-full md:w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2027">2027</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <SelectItem key={m} value={String(m)}>{getMonthName(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={shiftNumber} onValueChange={setShiftNumber}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Все смены</SelectItem>
                    <SelectItem value="1">Смена 1</SelectItem>
                    <SelectItem value="2">Смена 2</SelectItem>
                    <SelectItem value="3">Смена 3</SelectItem>
                    <SelectItem value="4">Смена 4</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={fetchReport} className="bg-emerald-600 hover:bg-emerald-700 w-full md:w-auto">Показать</Button>
              </>
            )}

            {activeReport === 'daily' && (
              <>
                <Input
                  type="date"
                  value={dailyDate}
                  onChange={e => setDailyDate(e.target.value)}
                  className="w-full md:w-40 h-9 text-sm"
                />
                <Select value={dailyShiftNumber} onValueChange={setDailyShiftNumber}>
                  <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Все смены</SelectItem>
                    <SelectItem value="1">Смена 1</SelectItem>
                    <SelectItem value="2">Смена 2</SelectItem>
                    <SelectItem value="3">Смена 3</SelectItem>
                    <SelectItem value="4">Смена 4</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={fetchDailyReport} className="bg-emerald-600 hover:bg-emerald-700 w-full md:w-auto">Показать</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Monthly report */}
      {activeReport === 'monthly' && (
        <Card>
          <CardHeader>
            <CardTitle>Отчёт за {getMonthName(month)} {year}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-0 md:overflow-x-auto">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Загрузка...</div>
            ) : (
              <>
                {/* Mobile card layout */}
                <div className="md:hidden space-y-3">
                  {/* Totals summary card */}
                  <div className="bg-slate-100 rounded-lg p-3 space-y-2">
                    <div className="font-bold text-sm">ИТОГО ({workers.length} чел.)</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <div className="text-gray-500">Отраб. часов</div>
                        <div className="font-semibold text-emerald-700">{totals.totalHours}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Ночных</div>
                        <div className="font-semibold text-blue-700">{totals.nightHours}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Праздничных</div>
                        <div className="font-semibold text-red-700">{totals.holidayHours}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Явка</div>
                        <div className="font-semibold">{totals.presentDays}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Неявка</div>
                        <div className="font-semibold text-red-600">{totals.absentDays}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Больничный</div>
                        <div className="font-semibold text-yellow-600">{totals.sickDays}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500">Отпуск</div>
                        <div className="font-semibold text-cyan-600">{totals.vacationDays}</div>
                      </div>
                    </div>
                  </div>

                  {/* Worker cards */}
                  {workers.map((w) => (
                    <div key={w.workerId} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{w.lastName} {w.firstName[0]}. {w.patronymic[0]}.</span>
                        <Badge variant="outline">{w.gradeNumber}</Badge>
                      </div>
                      <div className="text-xs text-gray-500">Смена {w.shiftNumber}</div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="text-gray-500">Отраб. часов</div>
                          <div className="font-semibold text-emerald-700">{w.totalHours}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Ночных</div>
                          <div className="text-blue-700">{w.nightHours}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Праздничных</div>
                          <div className="text-red-700">{w.holidayHours}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="text-gray-500">Явка</div>
                          <div>{w.presentDays}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Неявка</div>
                          <div className="text-red-600">{w.absentDays}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Больничный</div>
                          <div className="text-yellow-600">{w.sickDays}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="text-gray-500">Отпуск</div>
                          <div className="text-cyan-600">{w.vacationDays}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Гос.об.</div>
                          <div>{w.stateDutyDays}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Колдоговор</div>
                          <div>{w.collectiveAgreementDays}</div>
                        </div>
                      </div>
                      {w.substitutionDays > 0 && (
                        <div className="text-xs text-gray-500">
                          Подмена: <span className="font-medium">{w.substitutionDays}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop table layout */}
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="px-3 py-2 text-left font-medium">ФИО</th>
                        <th className="px-3 py-2 text-center font-medium">Разряд</th>
                        <th className="px-3 py-2 text-center font-medium">Смена</th>
                        <th className="px-3 py-2 text-center font-medium">Отраб. часов</th>
                        <th className="px-3 py-2 text-center font-medium">Ночных</th>
                        <th className="px-3 py-2 text-center font-medium">Праздничных</th>
                        <th className="px-3 py-2 text-center font-medium">Явка</th>
                        <th className="px-3 py-2 text-center font-medium">Неявка</th>
                        <th className="px-3 py-2 text-center font-medium">Больничный</th>
                        <th className="px-3 py-2 text-center font-medium">Отпуск</th>
                        <th className="px-3 py-2 text-center font-medium">Гос.об.</th>
                        <th className="px-3 py-2 text-center font-medium">Колдоговор</th>
                        <th className="px-3 py-2 text-center font-medium">Подмена</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map((w, idx) => (
                        <tr key={w.workerId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-2 font-medium">{w.lastName} {w.firstName[0]}. {w.patronymic[0]}.</td>
                          <td className="px-3 py-2 text-center"><Badge variant="outline">{w.gradeNumber}</Badge></td>
                          <td className="px-3 py-2 text-center">Смена {w.shiftNumber}</td>
                          <td className="px-3 py-2 text-center font-semibold text-emerald-700">{w.totalHours}</td>
                          <td className="px-3 py-2 text-center text-blue-700">{w.nightHours}</td>
                          <td className="px-3 py-2 text-center text-red-700">{w.holidayHours}</td>
                          <td className="px-3 py-2 text-center">{w.presentDays}</td>
                          <td className="px-3 py-2 text-center text-red-600">{w.absentDays}</td>
                          <td className="px-3 py-2 text-center text-yellow-600">{w.sickDays}</td>
                          <td className="px-3 py-2 text-center text-cyan-600">{w.vacationDays}</td>
                          <td className="px-3 py-2 text-center">{w.stateDutyDays}</td>
                          <td className="px-3 py-2 text-center">{w.collectiveAgreementDays}</td>
                          <td className="px-3 py-2 text-center">{w.substitutionDays}</td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-slate-200 font-bold">
                        <td className="px-3 py-2" colSpan={3}>ИТОГО ({workers.length} чел.)</td>
                        <td className="px-3 py-2 text-center text-emerald-700">{totals.totalHours}</td>
                        <td className="px-3 py-2 text-center text-blue-700">{totals.nightHours}</td>
                        <td className="px-3 py-2 text-center text-red-700">{totals.holidayHours}</td>
                        <td className="px-3 py-2 text-center">{totals.presentDays}</td>
                        <td className="px-3 py-2 text-center text-red-600">{totals.absentDays}</td>
                        <td className="px-3 py-2 text-center text-yellow-600">{totals.sickDays}</td>
                        <td className="px-3 py-2 text-center text-cyan-600">{totals.vacationDays}</td>
                        <td className="px-3 py-2 text-center">—</td>
                        <td className="px-3 py-2 text-center">—</td>
                        <td className="px-3 py-2 text-center">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Daily status report */}
      {activeReport === 'daily' && (
        <Card>
          <CardHeader>
            <CardTitle>Статус на {formatDailyDate(dailyDate)}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-0">
            {dailyLoading ? (
              <div className="text-center py-8 text-gray-500">Загрузка...</div>
            ) : dailyWorkers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Нажмите «Показать» для загрузки данных</div>
            ) : (
              <>
                {/* Summary cards */}
                {dailySummary && (
                  <div className="px-3 md:px-0 mb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-green-700">{dailySummary.present}</div>
                        <div className="text-xs text-green-600">Явка</div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-red-700">{dailySummary.absent}</div>
                        <div className="text-xs text-red-600">Неявка</div>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-yellow-700">{dailySummary.sick}</div>
                        <div className="text-xs text-yellow-600">Больничный</div>
                      </div>
                      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-cyan-700">{dailySummary.vacation}</div>
                        <div className="text-xs text-cyan-600">Отпуск</div>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-orange-700">{dailySummary.dayOff}</div>
                        <div className="text-xs text-orange-600">Отгул</div>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-purple-700">{dailySummary.transfer}</div>
                        <div className="text-xs text-purple-600">Перевод</div>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-indigo-700">{dailySummary.stateDuty}</div>
                        <div className="text-xs text-indigo-600">Гос.об.</div>
                      </div>
                      <div className="bg-pink-50 border border-pink-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-pink-700">{dailySummary.collectiveAgreement}</div>
                        <div className="text-xs text-pink-600">Колдоговор</div>
                      </div>
                      <div className="bg-teal-50 border border-teal-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-teal-700">{dailySummary.substitution}</div>
                        <div className="text-xs text-teal-600">Подмена</div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center">
                        <div className="text-2xl font-bold text-gray-500">{dailySummary.noData}</div>
                        <div className="text-xs text-gray-400">Нет данных</div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      Всего работников: <span className="font-semibold">{dailySummary.total}</span>
                    </div>
                  </div>
                )}

                {/* Status filter */}
                <div className="px-3 md:px-0 mb-3">
                  <Select value={dailyStatusFilter} onValueChange={setDailyStatusFilter}>
                    <SelectTrigger className="w-full md:w-52 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все статусы</SelectItem>
                      <SelectItem value="present">Явка</SelectItem>
                      <SelectItem value="absent">Неявка</SelectItem>
                      <SelectItem value="sick">Больничный</SelectItem>
                      <SelectItem value="vacation">Отпуск</SelectItem>
                      <SelectItem value="day_off">Отгул</SelectItem>
                      <SelectItem value="transfer">Перевод</SelectItem>
                      <SelectItem value="state_duty">Гос. обязанности</SelectItem>
                      <SelectItem value="collective_agreement">Колдоговор</SelectItem>
                      <SelectItem value="substitution">Подмена</SelectItem>
                      <SelectItem value="no_data">Нет данных</SelectItem>
                    </SelectContent>
                  </Select>
                  {dailyStatusFilter !== 'all' && (
                    <span className="ml-2 text-sm text-gray-500">
                      Найдено: {filteredDailyWorkers.length}
                    </span>
                  )}
                </div>

                {/* Mobile card layout */}
                <div className="md:hidden space-y-2 px-3">
                  {filteredDailyWorkers.map((w) => {
                    const statusInfo = STATUS_LABELS[w.status] || STATUS_LABELS.no_data;
                    return (
                      <div key={w.workerId} className="border rounded-lg p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {w.lastName} {w.firstName[0]}. {w.patronymic[0]}.
                          </div>
                          <div className="text-xs text-gray-500">
                            {w.shiftNumber != null ? `См.${w.shiftNumber}` : 'Рук.'} · {w.gradeNumber} разр. · {POSITION_MAP[w.position] || w.position}
                          </div>
                        </div>
                        <Badge className={`${statusInfo.color} whitespace-nowrap`}>{statusInfo.label}</Badge>
                      </div>
                    );
                  })}
                  {filteredDailyWorkers.length === 0 && (
                    <div className="text-center py-8 text-gray-500">Нет работников с выбранным статусом</div>
                  )}
                </div>

                {/* Desktop table layout */}
                <div className="hidden md:block md:overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="px-3 py-2 text-left font-medium">ФИО</th>
                        <th className="px-3 py-2 text-center font-medium">Смена</th>
                        <th className="px-3 py-2 text-center font-medium">Разряд</th>
                        <th className="px-3 py-2 text-left font-medium">Должность</th>
                        <th className="px-3 py-2 text-left font-medium">Оборудование</th>
                        <th className="px-3 py-2 text-center font-medium">Статус</th>
                        <th className="px-3 py-2 text-center font-medium">Часов</th>
                        <th className="px-3 py-2 text-center font-medium">Ночных</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDailyWorkers.map((w, idx) => {
                        const statusInfo = STATUS_LABELS[w.status] || STATUS_LABELS.no_data;
                        return (
                          <tr key={w.workerId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-3 py-2 font-medium">{w.lastName} {w.firstName[0]}. {w.patronymic[0]}.</td>
                            <td className="px-3 py-2 text-center">{w.shiftNumber != null ? `См.${w.shiftNumber}` : 'Рук.'}</td>
                            <td className="px-3 py-2 text-center">{w.gradeNumber}</td>
                            <td className="px-3 py-2 text-sm">{POSITION_MAP[w.position] || w.position}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{w.equipmentName}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                            </td>
                            <td className="px-3 py-2 text-center">{w.hoursWorked || '—'}</td>
                            <td className="px-3 py-2 text-center">{w.nightHours || '—'}</td>
                          </tr>
                        );
                      })}
                      {filteredDailyWorkers.length === 0 && (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-gray-500">Нет работников с выбранным статусом</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Substitutions report */}
      {activeReport === 'substitutions' && (
        <Card>
          <CardHeader>
            <CardTitle>Подмены за {getMonthName(month)} {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">Отчёт по подменам будет доступен после заполнения данных. Подмены доступны только для работников 7 и 8 разрядов.</p>
          </CardContent>
        </Card>
      )}

      {/* Profession combination report */}
      {activeReport === 'professions' && (
        <Card>
          <CardHeader>
            <CardTitle>Совмещение профессий за {getMonthName(month)} {year}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-0 md:overflow-x-auto">
            {/* Mobile card layout */}
            <div className="md:hidden space-y-3">
              {workers.filter(w => w.professions.length > 0).map((w) => (
                <div key={w.workerId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{w.lastName} {w.firstName[0]}.</span>
                    <Badge variant="outline">{w.gradeNumber}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {w.professions.map((p, i) => <Badge key={i} variant="secondary">{p}</Badge>)}
                  </div>
                  <div className="text-xs">
                    <span className="text-gray-500">Отраб. часов: </span>
                    <span className="font-semibold">{w.totalHours}</span>
                  </div>
                </div>
              ))}
              {workers.filter(w => w.professions.length > 0).length === 0 && (
                <div className="text-center py-8 text-gray-500">Нет работников с дополнительными профессиями</div>
              )}
            </div>

            {/* Desktop table layout */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="px-3 py-2 text-left font-medium">ФИО</th>
                    <th className="px-3 py-2 text-center font-medium">Основной разряд</th>
                    <th className="px-3 py-2 text-left font-medium">Доп. профессии</th>
                    <th className="px-3 py-2 text-center font-medium">Отраб. часов</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.filter(w => w.professions.length > 0).map((w, idx) => (
                    <tr key={w.workerId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-3 py-2 font-medium">{w.lastName} {w.firstName[0]}.</td>
                      <td className="px-3 py-2 text-center">{w.gradeNumber}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {w.professions.map((p, i) => <Badge key={i} variant="secondary">{p}</Badge>)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">{w.totalHours}</td>
                    </tr>
                  ))}
                  {workers.filter(w => w.professions.length > 0).length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-500">Нет работников с дополнительными профессиями</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
