import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthCallback } from './pages/AuthCallback.js'
import { Channels } from './pages/Channels.js'
import { ReminderNew } from './pages/ReminderNew.js'
import { Reminders } from './pages/Reminders.js'
import { Settings } from './pages/Settings.js'
import { SignIn } from './pages/SignIn.js'
import { SubscriptionEdit } from './pages/SubscriptionEdit.js'
import { SubscriptionNew } from './pages/SubscriptionNew.js'
import { Subscriptions } from './pages/Subscriptions.js'
import { AppLayout } from './routes/AppLayout.js'
import { ProtectedRoute } from './routes/ProtectedRoute.js'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Subscriptions />} />
          <Route path="/subscriptions/new" element={<SubscriptionNew />} />
          <Route path="/subscriptions/:id" element={<SubscriptionEdit />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/reminders/new" element={<ReminderNew />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
