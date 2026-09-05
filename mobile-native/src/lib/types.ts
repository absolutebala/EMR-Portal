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
  expense_approval: string | null;
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
  // Utility/Industry/OEM classification — "End User Type" in the UI.
  customer_type: string | null;
  // Per-transformer detail — additive alongside the flat `serial_numbers` above.
  transformers: { serialNumber: string; dispatchDate: string | null; warrantyYears: number | null }[];
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

export interface CheckinDriftNotice {
  workOrderId: string;
  projectLabel: string;
  distanceKm: number;
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
  // Gates the "View form entries filled by X" button — whether the PREVIOUS
  // (handover) engineer has their own submission, independent of whether the
  // viewing engineer has theirs.
  handoverEngineerHasFormSubmission: boolean;
  previousVisits: { wo_number: string; job_type: string; scheduled_date: string | null; status: string }[];
  // Which serials this engineer is scoped to when the notification covers 2+
  // transformers and they're an additional (non-primary) assignee — null when
  // not applicable (primary engineer, or a single-transformer job).
  myAssignedSerials: string[] | null;
}

// ── Endpoint response shapes ────────────────────────────────────────────────────

export interface AuthMeResponse {
  mustChangePassword: boolean;
  engineer: { name: string; avatarUrl: string | null } | null;
  role: string | null;
  error: string | null;
}

export interface EngineerStreak {
  count: number;
  days: boolean[];
}

export interface PendingProductItem {
  id: string;
  productName: string;
  quantity: number;
  status: 'approved' | 'dispatched';
  woNumber: string;
  workOrderId: string;
  deliveryEstimate: string | null;
}

// Mirrors lib/mobile/core/attendance.ts's AttendanceEffectiveStatus on the backend.
// Both 'present' and 'leave' (= Absent) share the same day shape — a caused day is
// Absent (late in / short hours / single punch) unless an amendment is approved, at
// which point it becomes Present with the cause noted. earlyOut carries the Short Hours
// cause (< 6h gross); endDayEnableAt is always null now (Punch Out has no time gate).
export interface AttendanceDay {
  reason: string | null;
  pendingApproval: boolean;
  rejected: boolean;
  amended: boolean;
  lateIn: boolean;
  earlyOut: boolean;
  singlePunch: boolean;
  noShow: boolean;
  approvedByName: string | null;
  approvedAt: string | null;
  markedAt: string | null;
  placeName: string | null;
  endDayAt: string | null;
  endDayPlaceName: string | null;
  endDayEnableAt: string | null;
}
export type AttendanceEffectiveStatus =
  | { kind: 'holiday'; name: string }
  | { kind: 'not_applicable' }
  | { kind: 'pending' }
  | ({ kind: 'leave' } & AttendanceDay)
  | ({ kind: 'present' } & AttendanceDay);

export interface AttendanceCalendarDay {
  date: string;
  status: AttendanceEffectiveStatus;
  markedAt: string | null;
  // End-of-day sign-off — separate from the app's own Sign Out. Null until "End Day"
  // is tapped (only available once Present is marked, today only).
  endDayAt: string | null;
  endDayPlaceName: string | null;
}

export interface AttendanceCalendarResponse {
  days: AttendanceCalendarDay[];
  error: string | null;
}

export interface AttendanceStatusResponse {
  status: AttendanceEffectiveStatus | null;
  error: string | null;
}

export interface MarkAttendanceVariables {
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  reason?: string | null;
  attendanceDate?: string;
}

export interface MarkEndDayVariables {
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  reason?: string | null;
}

export interface MarkEndDayResponse {
  error: string | null;
  needsApproval: boolean;
}

export interface MarkAttendanceResponse {
  error: string | null;
  needsApproval: boolean;
}

export interface RequestAmendmentVariables {
  attendanceDate: string;
  reason: string;
}

export interface RequestAmendmentResponse {
  error: string | null;
}

// Create-notification (Field Engineer, mobile-only) + quick-add customer.
export interface MobileCustomerOption { id: string; name: string }
export interface MobileTransformerOption { id: string; serialNumber: string }
export interface CustomersResponse { customers: MobileCustomerOption[]; error: string | null }
export interface TransformersResponse { transformers: MobileTransformerOption[]; error: string | null }
export interface CreateCustomerVariables {
  name: string;
  contactPerson: string;
  phone: string;
  type: 'sold' | 'shipped' | 'both';
  pincode: string;
  siteName?: string | null;
  serialNumber?: string | null;
}
export interface CreateNotificationVariables {
  jobType: string;
  customerId: string | null;
  transformerIds: string[];
  notes: string | null;
}
export interface CreateEntityResponse { error: string | null; id?: string }

export interface AppUpdatePrompt {
  message: string;
  playStoreUrl: string | null;
  promptAt: string;
}

export interface DashboardResponse {
  stats: MobileDashboardStats;
  recentJobs: MobileWorkOrder[];
  engineer: { name: string; avatarUrl: string | null } | null;
  streak: EngineerStreak;
  pendingProducts: PendingProductItem[];
  attendanceStatus: AttendanceEffectiveStatus;
  updatePrompt: AppUpdatePrompt | null;
  error: string | null;
}

export interface DepartmentOpenCount {
  departmentId: string;
  department: string;
  count: number;
}

export interface DepartmentCountsResponse {
  counts: DepartmentOpenCount[];
  error: string | null;
}

export interface DepartmentOpenJob {
  id: string;
  woNumber: string;
  customerName: string;
  siteName: string | null;
  serialNumbers: string[];
  status: string;
  scheduledDate: string | null;
  engineerName: string;
}

export interface DepartmentJobsResponse {
  jobs: DepartmentOpenJob[];
  error: string | null;
}

export interface EngineerAnalyticsSummary {
  assigned: number;
  resolved: number;
  reassigned: number;
  expenseTotal: number;
  present: number;
  leave: number;
}

export interface MyAnalyticsResponse {
  summary: EngineerAnalyticsSummary;
  error: string | null;
}

export type AnalyticsMetric = 'assigned' | 'resolved' | 'reassigned' | 'expenses' | 'present' | 'leave';

export interface AnalyticsDrilldownRow {
  id: string;
  woNumber: string | null;
  customerName: string | null;
  status: string | null;
  date: string | null;
  amount: number | null;
}

export interface MyAnalyticsDrilldownResponse {
  rows: AnalyticsDrilldownRow[];
  error: string | null;
}

export interface MyProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface ProfileResponse {
  profile: MyProfile | null;
  error: string | null;
}

export interface UpdateProfileVariables {
  firstName: string;
  lastName: string;
  phone: string | null;
}

export interface AvatarUploadVariables {
  base64: string;
  mimeType: string;
  ext: string;
}

export interface AvatarUploadResponse {
  url: string | null;
  error: string | null;
}

export interface ChangePasswordVariables {
  currentPassword: string;
  newPassword: string;
}

export interface NearbyEngineer {
  id: string;
  name: string;
  avatarUrl: string | null;
  distanceKm: number;
  lastSeenAt: string;
}

export interface NearbyEngineersResponse {
  engineers: NearbyEngineer[];
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
  checkinDrift: CheckinDriftNotice | null;
  error: string | null;
}

export interface ErrorResponse {
  error: string | null;
}

// Variables for the offline-queueable mutations (see queryClient.ts's
// setMutationDefaults) — workOrderId travels as part of the variables, not baked into
// the mutation key, so one registered default covers every work order.
export interface CheckInVariables {
  workOrderId: string;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  photoBase64: string;
  mimeType: string;
  ext: string;
}

export interface ClosureVariables {
  workOrderId: string;
  outcome: 'completed' | 'pending';
  summary: string;
  pendingReason: string | null;
  materialsRequired: string | null;
  revisitDate: string | null;
  needsReassignment: boolean;
  engineerSignature: string;
  clientName: string;
  clientSignature: string;
  offSite?: boolean;
}

// ── Dynamic job form ────────────────────────────────────────────────────────────

export interface MobileFormRow {
  id: string;
  table_id: string;
  parent_row_id: string | null;
  row_label: string;
  sno_label: string | null;
  order_index: number;
}

export interface MobileFormTable {
  id: string;
  section_id: string;
  status_type: string;
  has_subrows: boolean;
  col1_label: string | null;
  col2_label: string | null;
  order_index: number;
  rows: MobileFormRow[];
}

export interface MobileFormField {
  id: string;
  section_id: string;
  label: string;
  field_type: string;
  is_required: boolean;
  prefill_from_job: boolean;
  read_only_on_mobile: boolean;
  placeholder: string | null;
  help_text: string | null;
  order_index: number;
}

export interface MobileFormSection {
  id: string;
  title: string;
  order_index: number;
  fields: MobileFormField[];
  tables: MobileFormTable[];
}

export interface MobileForm {
  id: string;
  name: string;
  job_type: string;
  sections: MobileFormSection[];
}

export interface WorkOrderFormResponse {
  workOrder: MobileWorkOrderWithCustomer | null;
  form: MobileForm | null;
  existingSubmission: { id: string; form_data: { fields: Record<string, string>; table_rows: Record<string, { status: string; remarks: string }> } } | null;
  // Set when fetched with ?view=<engineerId> — viewing a handover engineer's own
  // submission read-only, not the current viewer's own (possibly still-editable) one.
  readOnly: boolean;
  viewedEngineerName: string | null;
  error: string | null;
}

export type FieldValues = Record<string, string>;
export type RowValues = Record<string, { status: string; remarks: string }>;

export interface SubmitFormVariables {
  workOrderId: string;
  formId: string;
  formData: { fields: FieldValues; table_rows: RowValues };
}

export interface SubmitFormResult {
  success?: boolean;
  completed: boolean;
  error: string | null;
}

// ── Product requests ────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  sap_code: string | null;
}

export type ProductRequestItemStatus = 'pending' | 'approved' | 'rejected' | 'dispatched' | 'delivered';

export interface ProductRequestItemView {
  id: string;
  productName: string;
  sapCode: string | null;
  quantity: number;
  status: ProductRequestItemStatus;
  approverName: string | null;
  approvedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  deliveryEstimate: string | null;
  adminNotes: string | null;
}

export interface ProductRequestView {
  id: string;
  workOrderId: string;
  woNumber: string;
  createdAt: string;
  damagePhotoUrls: string[];
  items: ProductRequestItemView[];
  engineerName?: string;
}

export interface ProductSearchResponse {
  products: Product[];
  error: string | null;
}

export interface ProductRequestsResponse {
  requests: ProductRequestView[];
  error: string | null;
}

export interface SubmitProductRequestVariables {
  workOrderId: string;
  items: { productId: string; quantity: number }[];
  damagePhotos: { base64: string; mimeType: string; ext: string }[];
}

// ── Expenses ─────────────────────────────────────────────────────────────────────

export type CityTier = 'metro' | 'pondicherry' | 'other';
export type ClaimType = 'flat' | 'actual';

export const CITY_TIER_LABEL: Record<CityTier, string> = {
  metro: 'Metro (Delhi/Mumbai/Chennai/Kolkata)',
  pondicherry: 'Pondicherry (Unit II)',
  other: 'All Other Places',
};

export interface ExpenseType {
  id: string;
  name: string;
}

export interface BLEligibility {
  grade: string | null;
  cityTier: CityTier;
  flatLimit: number | null;
  actualLimit: number | null;
  flatAvailable: boolean;
}

export type ExpenseLogStatus = 'pending' | 'manager_approved' | 'approved' | 'rejected';

export interface ExpenseLogView {
  id: string;
  workOrderId: string;
  woNumber: string;
  projectLabel: string;
  customerName: string;
  expenseTypeId: string;
  expenseTypeName: string;
  expenseDate: string;
  amount: number;
  photoUrl: string | null;
  status: ExpenseLogStatus;
  engineerId: string | null;
  engineerName: string | null;
  engineerGrade: string | null;
  managerApprovedByName: string | null;
  managerApprovedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  claimType: ClaimType | null;
  eligibleLimit: number | null;
  cityTier: CityTier | null;
  overLimit: boolean;
}

export interface ExpenseEligibilityResponse {
  eligibility: BLEligibility | null;
  locked: boolean;
  lockReason: string | null;
  error: string | null;
}

export interface ExpenseTypesResponse {
  types: ExpenseType[];
  error: string | null;
}

export interface ExpenseTypeResponse {
  type: ExpenseType | null;
  error: string | null;
}

export interface ExpenseLogsResponse {
  logs: ExpenseLogView[];
  reminderSentAt: string | null;
  error: string | null;
}

export interface ExpenseReminderResponse {
  error: string | null;
  sentAt: string | null;
}

export interface SubmitExpenseLogVariables {
  workOrderId: string;
  expenseTypeId: string;
  expenseDate: string;
  amount: number;
  claimType?: ClaimType;
  photo?: { base64: string; mimeType: string; ext: string };
}

// ── Alerts ───────────────────────────────────────────────────────────────────────

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  read: boolean;
  createdAt: string;
}

export interface AlertsResponse {
  notifications: NotificationView[];
  unreadCount: number;
  error: string | null;
}
