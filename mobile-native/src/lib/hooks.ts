import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './api';
import { CHECKIN_MUTATION_KEY, CLOSURE_MUTATION_KEY } from './queryClient';
import type {
  AuthMeResponse, DashboardResponse, JobsResponse, WorkOrderDetailResponse, FollowUpsResponse,
  CheckInVariables, ClosureVariables, ErrorResponse,
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
