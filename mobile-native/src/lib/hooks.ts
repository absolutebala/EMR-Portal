import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api';
import type { AuthMeResponse, DashboardResponse, JobsResponse, WorkOrderDetailResponse, FollowUpsResponse } from './types';

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
