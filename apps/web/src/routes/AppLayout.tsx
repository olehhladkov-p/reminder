import { Bell, CreditCard, Mail, Settings } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils.js'

const navItems = [
  { to: '/', label: 'Subscriptions', icon: CreditCard, end: true },
  { to: '/reminders', label: 'Reminders', icon: Bell },
  { to: '/channels', label: 'Channels', icon: Mail },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-6 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex max-w-lg">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium text-muted-foreground transition-colors',
                  isActive && 'text-primary',
                )
              }
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
