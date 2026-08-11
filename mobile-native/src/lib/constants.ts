// Ported verbatim from the PWA's components/mobile/constants.ts — keep both in sync
// if job types or statuses ever change on the backend.
export const JOB_TYPE_LABELS: Record<string, string> = {
  site_inspection: 'Site Inspection',
  amc: 'AMC',
  commissioning_activities: 'Commissioning',
  supervision: 'Supervision',
  overhauling: 'Overhauling',
  complaint: 'Complaint',
  installation: 'Installation',
  testing: 'Testing',
  business_opportunity: 'Business Opportunity',
};

export const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  assigned: { label: 'Assigned', bg: '#FEF3C7', color: '#92400E' },
  in_progress: { label: 'In Progress', bg: '#DBEAFE', color: '#1E40AF' },
  pending: { label: 'Pending', bg: '#FEE2E2', color: '#991B1B' },
  needs_reassignment: { label: 'Need Reassign', bg: '#FED7AA', color: '#9A3412' },
  unassigned: { label: 'Unassigned', bg: '#F3F4F6', color: '#6B7280' },
  completed: { label: 'Completed', bg: '#D1FAE5', color: '#065F46' },
};

export const BAR_COLOR: Record<string, string> = {
  assigned: '#2563EB',
  in_progress: '#D97706',
  pending: '#DC2626',
  unassigned: '#94A3B8',
  completed: '#059669',
};

// Ported verbatim from the PWA's app/mobile/requests/RequestsListClient.tsx.
export const PRODUCT_REQUEST_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending approval' },
  approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
  dispatched: { bg: '#E0E7FF', color: '#3730A3', label: 'Dispatched' },
  delivered: { bg: '#D1FAE5', color: '#065F46', label: 'Delivered' },
};

// Ported verbatim from the PWA's app/mobile/expenses/[workOrderId]/ExpenseProjectDetailClient.tsx.
export const EXPENSE_STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  manager_approved: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Awaiting final approval' },
  approved: { bg: '#D1FAE5', color: '#065F46', label: 'Approved' },
  rejected: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
};
