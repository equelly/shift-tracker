'use client'

import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogOut, Bell, Clock } from 'lucide-react'

const roleLabels: Record<string, string> = {
  admin: 'Администратор',
  master: 'Мастер',
  brigadier: 'Бригадир',
  worker: 'Работник',
}

export function Navbar() {
  const { data: session } = useSession()

  const now = new Date()
  const dateStr = now.toLocaleDateString('ru-RU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <Clock className="h-6 w-6 text-emerald-600" />
        <h1 className="text-lg font-bold text-gray-900 hidden sm:block">Учёт рабочего времени</h1>
        <h1 className="text-lg font-bold text-gray-900 sm:hidden">УРВ</h1>
      </div>
      <div className="text-sm text-gray-500 hidden md:block capitalize">
        {dateStr}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-gray-900">{session?.user?.name}</p>
          <Badge variant="secondary" className="text-xs">
            {roleLabels[(session?.user as any)?.role] || 'Неизвестно'}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: '/' })}
          title="Выйти"
        >
          <LogOut className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Выйти</span>
        </Button>
      </div>
    </header>
  )
}
