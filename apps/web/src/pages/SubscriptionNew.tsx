import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { remindersCache, subscriptionsCache } from '../api/resources.js'
import { formValuesToInput, SubscriptionForm } from '../components/SubscriptionForm.js'
import { Card, CardContent } from '../components/ui/card.js'

export function SubscriptionNew() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">New subscription</h1>
      <Card>
        <CardContent>
          <SubscriptionForm
            submitLabel="Create"
            onCancel={() => navigate('/')}
            onSubmit={async (values) => {
              const sub = await api.subscriptions.create(formValuesToInput(values))
              await Promise.all([subscriptionsCache.refresh(), remindersCache.refresh()])
              toast.success(`Created "${sub.name}".`)
              navigate('/')
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
