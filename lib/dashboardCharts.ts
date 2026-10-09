// Shared (non-server) types for the dashboard charts. The server action
// app/actions/get-dashboard-charts.ts computes these; the client component
// components/dashboard/DashboardChartsSection.tsx renders them.

export interface SeriesItem { label: string; data: number[] }

export interface ChartWindow {
  labels: string[]
  // Full "DD Mon – DD Mon" week span for each bucket, shown in hover tooltips.
  ranges: string[]
  ccc: { created: number[]; completed: number[]; closed: number[] }
  pt: { total: number[]; paid: number[] }
  job: SeriesItem[]
  dept: SeriesItem[]
  spare: { requested: number[]; approved: number[]; dispatched: number[] }
}

export interface DashboardChartsData {
  // Point-in-time snapshots (not windowed — unaffected by the 8-weeks/month toggle).
  status: { unassigned: number; assigned: number; in_progress: number; needs_reassignment: number; completed: number; closed: number }
  // Open notifications (status ∉ completed/closed) by the warranty bucket of their transformer(s).
  warranty: { underWarranty: number; expiring: number; noWarranty: number }
  weeks: ChartWindow
  month: ChartWindow
}
