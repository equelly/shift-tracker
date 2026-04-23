'use client'

import { LayoutDashboard, ClipboardList, Users, Wrench, FileBarChart, BookOpen, ScrollText } from 'lucide-react'

export type TabId = 'dashboard' | 'timesheet' | 'workers' | 'equipment' | 'reports' | 'references' | 'audit-log'

interface TabNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  role: string
}

const tabs: { id: TabId; label: string; icon: any; roles: string[] }[] = [
  { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard, roles: ['admin', 'master', 'brigadier', 'worker'] },
  { id: 'timesheet', label: 'Табель', icon: ClipboardList, roles: ['admin', 'master', 'brigadier', 'worker'] },
  { id: 'workers', label: 'Работники', icon: Users, roles: ['admin', 'master', 'brigadier'] },
  { id: 'equipment', label: 'Оборудование', icon: Wrench, roles: ['admin', 'master', 'brigadier'] },
  { id: 'reports', label: 'Отчёты', icon: FileBarChart, roles: ['admin', 'master', 'brigadier'] },
  { id: 'references', label: 'Справочники', icon: BookOpen, roles: ['admin'] },
  { id: 'audit-log', label: 'Журнал', icon: ScrollText, roles: ['admin', 'master'] },
]

export function TabNav({ activeTab, onTabChange, role }: TabNavProps) {
  const visibleTabs = tabs.filter(t => t.roles.includes(role))

  return (
    <nav className="bg-white border-b border-gray-200 overflow-x-auto">
      <div className="flex">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
