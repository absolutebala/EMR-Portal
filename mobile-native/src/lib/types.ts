// Mirrors the response shapes of app/api/mobile/v1/* in the emr-portal backend repo
// (lib/mobile/core/shared.ts's exported interfaces). Kept as a hand-written contract
// here rather than a cross-repo import — the two are separate npm projects (Next.js
// vs Expo) with no shared build step. If the backend's shapes change, update both
// sides; this file is the single place on the RN side that needs the update.

export interface MobileWorkOrder {
  id: string;
  wo_number: string;
  job_type: string;
  status: string;
  scheduled_date: string | null;
  notes: string | null;
  customer_name: string;
  serial_numbers: string[];
  site_name: string | null;
  distanceKm: number | null;
}

export interface MobileWorkOrderWithCustomer extends MobileWorkOrder {
  customer_id: string;
  customer_contact: string | null;
  customer_phone: string | null;
  site_address: string | null;
  rating: string | null;
  manufacturer: string | null;
  engineer_name?: string | null;
}

export interface MobileDashboardStats {
  assigned: number;
  inProgress: number;
  needsReassignment: number;
  completed: number;
}

export type OverdueFollowUpKind = 'pending' | 'stale_in_progress' | 'open_checkin';

export interface OverdueFollowUp {
  workOrderId: string;
  woNumber: string;
  customerName: string;
  dueDate: string;
  kind: OverdueFollowUpKind;
}

export type EngineerStatusValue = 'available' | 'on_leave' | 'on_the_way' | 'travelling' | 'reached' | 'completed';

export interface AssignableSite {
  workOrderId: string;
  woNumber: string;
  siteName: string;
}

export interface EngineerStatusPrompt {
  needsPrompt: boolean;
  currentStatus: EngineerStatusValue;
  assignableSites: AssignableSite[];
}

export interface NotStartedNotice {
  projectLabel: string;
}

export interface MobileWorkOrderDetail {
  workOrder: MobileWorkOrderWithCustomer;
  hasCheckedIn: boolean;
  lastCheckinAt: string | null;
  hasFormSubmission: boolean;
  latestClosure: {
    outcome: string;
    created_at: string;
    revisitDate: string | null;
    needsReassignment: boolean;
    engineerId: string | null;
    engineerName: string;
    summary: string;
    pendingReason: string | null;
    materialsRequired: string | null;
  } | null;
  handoverFromOtherEngineer: boolean;
  previousVisits: { wo_number: string; job_type: string; scheduled_date: string | null; status: string }[];
}

// ── Endpoint response shapes ────────────────────────────────────────────────────

export interface AuthMeResponse {
  mustChangePassword: boolean;
  engineer: { name: string } | null;
  error: string | null;
}

export interface DashboardResponse {
  stats: MobileDashboardStats;
  recentJobs: MobileWorkOrder[];
  engineer: { name: string } | null;
  error: string | null;
}

export interface JobsResponse {
  workOrders: MobileWorkOrder[];
  engineer: { name: string } | null;
  error: string | null;
}

export interface WorkOrderDetailResponse {
  detail: MobileWorkOrderDetail | null;
  error: string | null;
}

export interface FollowUpsResponse {
  followUps: OverdueFollowUp[];
  openCheckin: OverdueFollowUp | null;
  notStarted: NotStartedNotice | null;
  error: string | null;
}
