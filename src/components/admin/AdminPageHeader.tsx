import Link from 'next/link'

type AdminPageHeaderProps = {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  showBack?: boolean
  actions?: React.ReactNode
  meta?: React.ReactNode
}

export default function AdminPageHeader({
  title,
  description,
  backHref = '/admin',
  backLabel = 'Back to overview',
  showBack = true,
  actions,
  meta,
}: AdminPageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {showBack ? <Link href={backHref} className="mb-2 inline-flex min-h-10 items-center text-sm font-semibold text-gray-600 hover:text-gray-900">
          <span aria-hidden="true" className="mr-2 text-base">←</span>
          {backLabel}
        </Link> : null}
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl" style={{ color: '#1a2744' }}>
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">{description}</p> : null}
      </div>
      {actions || meta ? <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">{meta}{actions}</div> : null}
    </div>
  )
}
