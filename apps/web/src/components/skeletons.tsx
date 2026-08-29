import { Card, CardContent } from './ui/card.js'
import { Skeleton } from './ui/skeleton.js'

/** Mirrors the shape of a Subscriptions/Channels/Reminders list-item Card, so swapping in real content doesn't shift the page. */
export function ListItemSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
        <Skeleton className="h-8 w-20 shrink-0" />
      </CardContent>
    </Card>
  )
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reordered
        <ListItemSkeleton key={i} />
      ))}
    </div>
  )
}

/** Mirrors a Label+Input pair in a form. */
export function FormFieldSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-full" />
    </div>
  )
}

export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: fields }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reordered
        <FormFieldSkeleton key={i} />
      ))}
    </div>
  )
}
