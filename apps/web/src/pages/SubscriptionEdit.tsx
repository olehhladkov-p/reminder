import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { remindersCache, subscriptionsCache } from '../api/resources.js'
import {
  formValuesToInput,
  SubscriptionForm,
  subscriptionToFormValues,
} from '../components/SubscriptionForm.js'
import { FormSkeleton } from '../components/skeletons.js'
import { Card, CardContent } from '../components/ui/card.js'
import { useApiData } from '../hooks/useApiData.js'

export function SubscriptionEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const getSubscription = useCallback(() => {
    if (!id) throw new Error('missing subscription id')
    return api.subscriptions.get(id)
  }, [id])
  const { data: subscription, loading, error } = useApiData(getSubscription, [id])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit subscription</h1>
      <Card>
        <CardContent>
          {loading && <FormSkeleton fields={7} />}
          {error && <p className="text-base text-destructive">{error}</p>}
          {subscription && id && (
            <SubscriptionForm
              initialValues={subscriptionToFormValues(subscription)}
              submitLabel="Save"
              onCancel={() => navigate('/')}
              onSubmit={async (values) => {
                await api.subscriptions.update(id, formValuesToInput(values))
                await Promise.all([subscriptionsCache.refresh(), remindersCache.refresh()])
                toast.success('Saved.')
                navigate('/')
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
