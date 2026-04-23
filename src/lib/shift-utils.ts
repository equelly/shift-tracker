// Shift rotation algorithm and utilities

export type ShiftPhase = 'day' | 'night' | 'rest' | 'off';

export interface ShiftInfo {
  shiftNumber: number;
  phase: ShiftPhase;
  label: string;
  shortLabel: string;
  color: string;
}

const PHASE_LABELS: Record<ShiftPhase, { label: string; short: string; color: string }> = {
  day:   { label: 'День',     short: 'Д',  color: 'bg-green-100 text-green-800' },
  night: { label: 'Ночь',     short: 'Н',  color: 'bg-blue-100 text-blue-800' },
  rest:  { label: 'Отсыпной', short: 'О',  color: 'bg-gray-100 text-gray-600' },
  off:   { label: 'Выходной', short: 'В',  color: 'bg-gray-50 text-gray-400' },
};

/**
 * Calculate the shift phase for a given shift on a given date.
 * The rotation cycle is 4 days:
 *   Day 0: День (7:30-19:30)
 *   Day 1: Ночь (19:30-7:30)
 *   Day 2: Отсыпной
 *   Day 3: Выходной
 *
 * Shifts are offset by 1 day: Shift 1 starts at offset 0, Shift 2 at offset 1, etc.
 */
export function getShiftPhase(shiftNumber: number, date: Date, startDate: Date): ShiftPhase {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceStart = Math.floor((date.getTime() - startDate.getTime()) / msPerDay);
  const phase = ((daysSinceStart - (shiftNumber - 1)) % 4 + 4) % 4;
  switch (phase) {
    case 0: return 'day';
    case 1: return 'night';
    case 2: return 'rest';
    case 3: return 'off';
    default: return 'off';
  }
}

export function getShiftInfo(shiftNumber: number, date: Date, startDate: Date): ShiftInfo {
  const phase = getShiftPhase(shiftNumber, date, startDate);
  const info = PHASE_LABELS[phase];
  return {
    shiftNumber,
    phase,
    label: info.label,
    shortLabel: info.short,
    color: info.color,
  };
}

/**
 * Get which shift is working day/night on a given date.
 */
export function getWorkingShifts(date: Date, startDate: Date): { dayShift: number; nightShift: number } {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceStart = Math.floor((date.getTime() - startDate.getTime()) / msPerDay);
  const dayShift = (daysSinceStart % 4) + 1;
  const nightShift = ((daysSinceStart + 3) % 4) + 1;
  return { dayShift, nightShift };
}

/**
 * Calculate night hours for a shift type.
 * Night shift (19:30-7:30): overlaps 22:00-06:00 = 8 hours
 * Day shift (7:30-19:30): no overlap with 22:00-06:00 = 0 hours
 */
export function calculateNightHours(shiftType: 'day' | 'night'): number {
  return shiftType === 'night' ? 8 : 0;
}

/**
 * Calculate hours for different schedule types.
 * 12-hour shift: 12 hours (day/night)
 * 8-hour schedule: 8 hours (master_pu, section_head)
 */
export function calculateHoursForSchedule(scheduleType: string, shiftType: string): number {
  if (scheduleType === '8h') return 8;
  return 12;
}

/**
 * Calculate night hours for 8-hour schedule.
 * Мастер ПУ and Начальник участка work daytime only = 0 night hours
 */
export function calculateNightHoursForSchedule(scheduleType: string): number {
  return 0;
}

/**
 * Get schedule type for a worker position.
 * '12h' — сменный персонал (12-часовые смены)
 * '8h' — дневной персонал (8-часовой рабочий день)
 */
export function getScheduleType(position: string): string {
  if (position === 'master_pu' || position === 'section_head') return '8h';
  return '12h';
}

/**
 * Check if a date is a working day for 8-hour schedule.
 * Мастер ПУ: Вс-Чт (выходные Пт, Сб)
 * Начальник участка: Вт-Сб (выходные Вс, Пн)
 */
export function is8hWorkingDay(position: string, date: Date): boolean {
  const dow = date.getDay(); // 0=Вс, 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб
  if (position === 'master_pu') {
    return dow !== 5 && dow !== 6; // не Пт и не Сб
  }
  if (position === 'section_head') {
    return dow !== 0 && dow !== 1; // не Вс и не Пн
  }
  return true;
}

/**
 * Get all shift phases for a month (12-hour shift workers).
 */
export function getMonthSchedule(shiftNumber: number, year: number, month: number, startDate: Date): Map<string, ShiftPhase> {
  const schedule = new Map<string, ShiftPhase>();
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = formatDate(date);
    const phase = getShiftPhase(shiftNumber, date, startDate);
    schedule.set(dateStr, phase);
  }

  return schedule;
}

/**
 * Get 8-hour schedule for a month.
 * Returns Map<dateStr, 'work' | 'off'>
 */
export function get8hMonthSchedule(position: string, year: number, month: number): Map<string, 'work' | 'off'> {
  const schedule = new Map<string, 'work' | 'off'>();
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = formatDate(date);
    schedule.set(dateStr, is8hWorkingDay(position, date) ? 'work' : 'off');
  }

  return schedule;
}

/**
 * Check if a day is a "night continuation" day.
 * The day AFTER a night shift (отсыпной) still shows the night continuation.
 * Returns true if the previous day was a night shift for this worker.
 */
export function isNightContinuation(shiftNumber: number, date: Date, startDate: Date): boolean {
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevPhase = getShiftPhase(shiftNumber, prevDate, startDate);
  return prevPhase === 'night';
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse YYYY-MM-DD to Date
 */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Get Russian month name
 */
export function getMonthName(month: number): string {
  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  return months[month - 1] || '';
}

/**
 * Get Russian day of week short name
 */
export function getDayOfWeekName(date: Date): string {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return days[date.getDay()];
}

/**
 * Position labels
 */
export const WORKER_POSITIONS: Record<string, { label: string; short: string; schedule: string }> = {
  worker:       { label: 'Работник',            short: '',      schedule: '12h' },
  master:       { label: 'Мастер',              short: 'Мастер', schedule: '12h' },
  master_pu:    { label: 'Мастер ПУ',           short: 'М. ПУ', schedule: '8h' },
  section_head: { label: 'Начальник участка',   short: 'НУ',    schedule: '8h' },
};

/**
 * Attendance status labels
 */
export const ATTENDANCE_STATUS: Record<string, { label: string; short: string; color: string }> = {
  present:              { label: 'Явка',                short: 'П',  color: 'bg-green-500 text-white' },
  absent:               { label: 'Неявка',              short: 'НП', color: 'bg-red-500 text-white' },
  sick:                 { label: 'Больничный',          short: 'Б',  color: 'bg-yellow-400 text-yellow-900' },
  vacation:             { label: 'Отпуск',              short: 'ОП', color: 'bg-cyan-400 text-white' },
  day_off:              { label: 'Отгул',               short: 'ОГ', color: 'bg-orange-400 text-white' },
  transfer:             { label: 'Перевод',             short: 'ПР', color: 'bg-purple-400 text-white' },
  state_duty:           { label: 'Гос. обязанности',    short: 'Г',  color: 'bg-indigo-400 text-white' },
  collective_agreement: { label: 'Колдоговор',          short: 'КД', color: 'bg-pink-400 text-white' },
  substitution:         { label: 'Подмена',             short: 'ПМ', color: 'bg-teal-400 text-white' },
};

export const SHIFT_TYPE_LABELS: Record<string, string> = {
  day: 'День (7:30–19:30)',
  night: 'Ночь (19:30–7:30)',
  day_8h: 'День (8:00–17:00)',
};
export type DaySchedule = 'working' | 'day_off';

export function getNonShiftSchedule(
  position: string,
  year: number,
  month: number,
): Map<string, DaySchedule> {
  const schedule = new Map<string, DaySchedule>();
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dateStr = formatDate(date);
    const dow = date.getDay();
    let isDayOff = false;
    if (position === 'master_pu') isDayOff = dow === 5 || dow === 6;
    else if (position === 'section_head') isDayOff = dow === 0 || dow === 1;
    schedule.set(dateStr, isDayOff ? 'day_off' : 'working');
  }
  return schedule;
}

export function isShiftPosition(position: string): boolean {
  return position === 'worker' || position === 'master';
}

export function isNonShiftPosition(position: string): boolean {
  return position === 'master_pu' || position === 'section_head';
}

export function getWorkingHours(position: string): number {
  return isNonShiftPosition(position) ? 8 : 12;
}