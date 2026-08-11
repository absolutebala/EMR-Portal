import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './api';
import {
  CHECKIN_MUTATION_KEY, CLOSURE_MUTATION_KEY, SUBMIT_FORM_MUTATION_KEY, WORK_ORDER_FORM_QUERY_KEY,
  SUBMIT_PRODUCT_REQUEST_MUTATION_KEY, SUBMIT_EXPENSE_LOG_MUTATION_KEY,
} from './queryClient';
import type {
  AuthMeResponse, DashboardResponse, JobsResponse, WorkOrderDetailResponse, FollowUpsResponse,
  CheckInVariables, ClosureVariables, ErrorResponse, WorkOrderFormResponse, SubmitFormVariables, SubmitFormResult,
  ProductSearchResponse, ProductRequestsResponse, SubmitProductRequestVariables,
  ExpenseTypesResponse, ExpenseTypeResponse, ExpenseEligibilityResponse, ExpenseLogsResponse, SubmitExpenseLogVariables,
} from './types';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardResponse>('/api/mobile/v1/dashboard'),
  });
}

// scope: 'all' mirrors getMobileJobsList (Jobs tab — every status), 'active' mirrors
// getMobileWorkOrders (only jobs still needing attention).
export function useJobs(scope: 'all' | 'active' = 'all') {
  return useQuery({
    queryKey: ['jobs', scope],
    queryFn: () => apiGet<JobsResponse>(`/api/mobile/v1/jobs${scope === 'active' ? '?scope=active' : ''}`),
  });
}

export function useWorkOrderDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['work-order', id],
    queryFn: () => apiGet<WorkOrderDetailResponse>(`/api/mobile/v1/work-orders/${id}`),
    enabled: !!id,
  });
}

export function useFollowUps() {
  return useQuery({
    queryKey: ['follow-ups'],
    queryFn: () => apiGet<FollowUpsResponse>('/api/mobile/v1/follow-ups'),
  });
}

export function useAuthMe() {
  return useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiGet<AuthMeResponse>('/api/mobile/v1/auth/me'),
  });
}

export function reverseGeocode(lat: number, lng: number) {
  return apiGet<{ label: string | null }>(`/api/mobile/v1/reverse-geocode?lat=${lat}&lng=${lng}`);
}

// Offline-queueable: react-query pauses this automatically if onlineManager reports
// offline (see queryClient.ts) and resumes it on reconnect — the mutationFn here is
// also registered as a default on the client so a mutation restored from the
// AsyncStorage persister after a full app restart still has something to call.
export function useSubmitCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CHECKIN_MUTATION_KEY,
    mutationFn: (variables: CheckInVariables) =>
      apiPost<ErrorResponse>(`/api/mobile/v1/work-orders/${variables.workOrderId}/checkin`, variables),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['work-order', variables.workOrderId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useSubmitClosure() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CLOSURE_MUTATION_KEY,
    mutationFn: (variables: ClosureVariables) =>
      apiPost<ErrorResponse>(`/api/mobile/v1/work-orders/${variables.workOrderId}/closure`, variables),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['work-order', variables.workOrderId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useJobForm(workOrderId: string | undefined) {
  return useQuery({
    queryKey: [WORK_ORDER_FORM_QUERY_KEY, workOrderId],
    queryFn: () => apiGet<WorkOrderFormResponse>(`/api/mobile/v1/work-orders/${workOrderId}/form`),
    enabled: !!workOrderId,
  });
}

export function useSubmitJobForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SUBMIT_FORM_MUTATION_KEY,
    mutationFn: (variables: SubmitFormVariables) => apiPost<SubmitFormResult>('/api/mobile/submit-form', variables),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['work-order', variables.workOrderId] });
      qc.invalidateQueries({ queryKey: [WORK_ORDER_FORM_QUERY_KEY, variables.workOrderId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

// ── Product requests ────────────────────────────────────────────────────────────

// Not a useQuery — called directly from a debounced search-box handler (see
// requests/new.tsx), same shape as reverseGeocode() above.
export function searchProducts(query: string) {
  return apiGet<ProductSearchResponse>(`/api/mobile/v1/products/search?q=${encodeURIComponent(query)}`);
}

export function useMyProductRequests() {
  return useQuery({
    queryKey: ['product-requests'],
    queryFn: () => apiGet<ProductRequestsResponse>('/api/mobile/v1/product-requests'),
  });
}

export function useSubmitProductRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SUBMIT_PRODUCT_REQUEST_MUTATION_KEY,
    mutationFn: (variables: SubmitProductRequestVariables) =>
      apiPost<ErrorResponse>(`/api/mobile/v1/work-orders/${variables.workOrderId}/product-requests`, variables),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-requests'] });
    },
  });
}

// ── Expenses ─────────────────────────────────────────────────────────────────────

export function useExpenseTypes() {
  return useQuery({
    queryKey: ['expense-types'],
    queryFn: () => apiGet<ExpenseTypesResponse>('/api/mobile/v1/expense-types'),
  });
}

// Not offline-queueable — the caller needs the created type's id back immediately to
// select it, unlike the fire-and-forget submit mutations below.
export function getOrCreateExpenseType(name: string) {
  return apiPost<ExpenseTypeResponse>('/api/mobile/v1/expense-types', { name });
}

export function useExpenseEligibility(workOrderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['expense-eligibility', workOrderId],
    queryFn: () => apiGet<ExpenseEligibilityResponse>(`/api/mobile/v1/work-orders/${workOrderId}/expense-eligibility`),
    enabled: !!workOrderId && enabled,
  });
}

export function useMyExpenseLogs() {
  return useQuery({
    queryKey: ['expense-logs'],
    queryFn: () => apiGet<ExpenseLogsResponse>('/api/mobile/v1/expense-logs'),
  });
}

export function useSubmitExpenseLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SUBMIT_EXPENSE_LOG_MUTATION_KEY,
    mutationFn: (variables: SubmitExpenseLogVariables) => apiPost<ErrorResponse>('/api/mobile/v1/expense-logs', variables),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-logs'] });
    },
  });
}
