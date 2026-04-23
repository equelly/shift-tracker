'use client';

import { SessionProvider, useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { ChangePasswordDialog } from '@/components/auth/change-password-dialog';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { TimesheetView } from '@/components/timesheet/timesheet-view';
import { WorkersView } from '@/components/workers/workers-view';
import { EquipmentView } from '@/components/equipment/equipment-view';
import { TransferOrdersView } from '@/components/transfer-orders/transfer-orders-view';
import { ReportsView } from '@/components/reports/reports-view';
import { ReferencesView } from '@/components/references/references-view';
import { AuditLogView } from '@/components/audit-log/audit-log-view';
import { Button } from '@/components/ui/button';

type TabId = 'dashboard' | 'timesheet' | 'workers' | 'equipment' | 'transfer-orders' | 'reports' | 'references' | 'audit';

const TABS: { id: TabId; label: string; icon: string; roles: string[] }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊', roles: ['admin', 'master', 'brigadier', 'worker'] },
  { id: 'timesheet', label: 'Табель', icon: '📅', roles: ['admin', 'master', 'brigadier', 'worker'] },
  { id: 'workers', label: 'Работники', icon: '👷', roles: ['admin', 'master', 'brigadier'] },
  { id: 'equipment', label: 'Оборудование', icon: '🔧', roles: ['admin', 'master', 'brigadier'] },
  { id: 'transfer-orders', label: 'Распоряжения', icon: '📋', roles: ['admin', 'master'] },
  { id: 'reports', label: 'Отчёты', icon: '📈', roles: ['admin', 'master'] },
  { id: 'references', label: 'Справочники', icon: '📚', roles: ['admin'] },
  { id: 'audit', label: 'Журнал', icon: '📝', roles: ['admin', 'master'] },
];

function AppContent() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

  // Смена пароля
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [forcedChangeDone, setForcedChangeDone] = useState(false);

  // Определяем, нужен ли принудительный сброс пароля
  const needForceChange = session?.user && (session.user as any)?.mustChangePassword && !forcedChangeDone;

  const isChangePasswordOpen = showChangePassword || !!needForceChange;
  const isMustChange = needForceChange ? true : false;

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  const userRole = (session.user as any)?.role || 'worker';
  const visibleTabs = TABS.filter(tab => tab.roles.includes(userRole));

  const roleLabel = userRole === 'admin' ? 'Администратор' :
                    userRole === 'master' ? 'Мастер' :
                    userRole === 'brigadier' ? 'Бригадир' : 'Работник';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white shadow-lg">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold truncate">Учёт рабочего времени</h1>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden xs:block">Система сменного учёта</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-medium">{session.user?.name}</p>
              <p className="text-xs text-slate-400">{roleLabel}</p>
            </div>
            <span className="md:hidden text-xs bg-slate-700 px-2 py-1 rounded">{roleLabel}</span>

            {/* Кнопка смены пароля */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChangePassword(true)}
              className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600 text-xs sm:text-sm"
              title="Сменить пароль"
            >
              🔑
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut()}
              className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600 text-xs sm:text-sm"
            >
              <span className="hidden sm:inline">Выйти</span>
              <span className="sm:hidden">Выход</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Desktop Tab Navigation */}
      <nav className="bg-white border-b shadow-sm hidden md:block">
        <div className="max-w-[1600px] mx-auto px-4">
          <div className="flex overflow-x-auto gap-1 py-2">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
                {tab.id === 'transfer-orders' && draftCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
                    {draftCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile Tab Navigation */}
      <div className="md:hidden bg-white border-b shadow-sm">
        <div className="flex items-center justify-between px-3 py-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            {TABS.find(t => t.id === activeTab)?.icon} {TABS.find(t => t.id === activeTab)?.label}
            <svg className={`w-4 h-4 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t px-2 pb-2">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
                {tab.id === 'transfer-orders' && draftCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
                    {draftCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile horizontal tabs */}
      <div className="md:hidden bg-white border-b overflow-x-auto">
        <div className="flex gap-1 px-2 py-1 min-w-max">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {tab.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-3 sm:px-4 py-4 sm:py-6">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'timesheet' && <TimesheetView />}
        {activeTab === 'workers' && <WorkersView />}
        {activeTab === 'equipment' && <EquipmentView />}
        {activeTab === 'transfer-orders' && <TransferOrdersView onDraftCountChange={setDraftCount} />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'references' && <ReferencesView />}
        {activeTab === 'audit' && <AuditLogView />}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-center py-2 sm:py-3 text-[10px] sm:text-xs">
        Система учёта рабочего времени © 2026
      </footer>

      {/* Диалог смены пароля */}
      <ChangePasswordDialog
        open={isChangePasswordOpen}
        onOpenChange={(open) => {
          setShowChangePassword(open);
          if (!open) {
            setForcedChangeDone(true);
          }
        }}
        mustChange={isMustChange}
      />
    </div>
  );
}

export default function Home() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}