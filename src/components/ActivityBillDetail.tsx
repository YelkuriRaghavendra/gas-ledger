import type { ReactNode } from 'react'
import { DetailModal } from './DetailModal'
import { SaleSummary } from './SaleSummary'
import { useBillDetail } from '../hooks/useBillDetail'
import type { FeedItem } from '../hooks/useActivityFeed'
import { detailRows as feedRows, detailTitle } from '../utils/activityDetail'
import { detailRows as billRows, historyAmount } from '../utils/billHistory'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { formatCurrency, formatDate, formatUpdated } from '../utils/format'

/**
 * The popup for an activity-feed entry. Sales, returns and payments show the
 * same details as the customer page (rate per cylinder, received on the spot,
 * balance after, profit for owners); purchases keep their own rows.
 */
export function ActivityBillDetail({
  item,
  onClose,
  isOwner,
  profileNames,
  actions,
}: {
  item: FeedItem
  onClose: () => void
  isOwner: boolean
  profileNames: Map<string, string>
  actions?: ReactNode
}) {
  const { entry, profitLines, profitError } = useBillDetail(item, isOwner)
  const rich = item.type !== 'purchase' ? entry : null

  const rows = rich
    ? [...(item.bill_number ? [{ k: 'Bill number', v: item.bill_number }] : []), ...billRows(rich, profitLines, profitError)]
    : feedRows(item)

  return (
    <DetailModal
      open
      onClose={onClose}
      icon={getActivityIcon(item.type)}
      iconBg={getActivityTint(item.type).bg}
      iconColor={getActivityTint(item.type).color}
      title={detailTitle(item)}
      amount={rich ? historyAmount(rich) : formatCurrency(item.amount)}
      summary={rich && rich.type === 'sale' && rich.lines.length > 0 ? <SaleSummary t={rich} /> : undefined}
      rows={rows}
      created={formatDate(item.created_at)}
      createdBy={item.created_by ? profileNames.get(item.created_by) : undefined}
      updated={formatUpdated(item.updated_at, item.created_at)}
      updatedBy={item.updated_by ? profileNames.get(item.updated_by) : undefined}
      actions={actions}
    />
  )
}
