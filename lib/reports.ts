// Shared, non-server types + helpers for the Reports (complaints) page. Kept out of the
// 'use server' action file (app/actions/get-reports.ts) because such files may only
// export async functions — this holds the row shape, the status grouping, and the
// badge config used by the page, the download route, and the client alike.

// A "complaint" is a work order (user-facing Notification). Complaint No. (ticket_number)
// is carried for search but not shown as a column for now.
export interface ComplaintReportRow {
  id: string
  woNumber: string
  ticketNumber: string
  customerName: string
  siteName: string
  engineerName: string
  customerIssue: string
  status: string
  complaintDate: string | null
}

export type ReportStatusGroup = 'open' | 'in_progress' | 'closed'

// Open / In Progress / Closed grouping of the raw work_orders.status values.
export function reportStatusGroup(status: string): ReportStatusGroup {
  if (status === 'in_progress' || status === 'pending') return 'in_progress'
  if (status === 'completed' || status === 'closed') return 'closed'
  return 'open' // unassigned, assigned, needs_reassignment
}

export const STATUS_GROUP_META: Record<ReportStatusGroup, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#991B1B', bg: '#FEE2E2' },
  in_progress: { label: 'In Progress', color: '#1D4ED8', bg: '#DBEAFE' },
  closed: { label: 'Closed', color: '#065F46', bg: '#D1FAE5' },
}
