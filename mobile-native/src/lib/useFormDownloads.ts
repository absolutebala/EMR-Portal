import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { apiGet } from './api';
import { WORK_ORDER_FORM_QUERY_KEY } from './queryClient';
import type { MobileWorkOrder, WorkOrderFormResponse } from './types';

async function downloadIfMissing(qc: ReturnType<typeof useQueryClient>, workOrderId: string) {
  const existing = qc.getQueryData<WorkOrderFormResponse>([WORK_ORDER_FORM_QUERY_KEY, workOrderId]);
  // Already resolved — either the form is cached, or we've already confirmed this job
  // type has no form at all. Either way there's nothing left to download.
  if (existing !== undefined) return;
  try {
    await qc.prefetchQuery({
      queryKey: [WORK_ORDER_FORM_QUERY_KEY, workOrderId],
      queryFn: () => apiGet<WorkOrderFormResponse>(`/api/mobile/v1/work-orders/${workOrderId}/form`),
    });
  } catch {
    // Best-effort — the next trigger (foreground, reconnect) retries automatically
    // since a failed prefetch never populates the cache, so `existing` stays undefined.
  }
}

// Silently pre-downloads every active job's form definition so it's already on the
// device before an engineer reaches a site with no signal — opening a job's form
// screen while offline previously had nothing to show, since it was a live fetch on
// open with no pre-caching. Runs on mount, whenever the app returns to the
// foreground, and whenever connectivity is regained; reuses the same react-query +
// AsyncStorage-persister infrastructure already wired up for offline mutations
// (queryClient.ts) rather than a separate storage mechanism, with a long gcTime
// override on this query key specifically so a downloaded-but-unopened form doesn't
// get evicted before it's needed (see queryClient.ts).
export function useAutoDownloadForms(jobs: MobileWorkOrder[] | undefined) {
  const qc = useQueryClient();
  const runningRef = useRef(false);
  const jobIdsKey = jobs?.map(j => j.id).join(',') ?? '';

  useEffect(() => {
    async function run() {
      if (runningRef.current || !jobs?.length) return;
      const state = await NetInfo.fetch();
      if (!state.isConnected || state.isInternetReachable === false) return;
      runningRef.current = true;
      try {
        for (const job of jobs) {
          await downloadIfMissing(qc, job.id);
        }
      } finally {
        runningRef.current = false;
      }
    }

    run();
    const appStateSub = AppState.addEventListener('change', s => { if (s === 'active') run(); });
    const unsubscribeNetInfo = NetInfo.addEventListener(state => { if (state.isConnected) run(); });
    return () => {
      appStateSub.remove();
      unsubscribeNetInfo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIdsKey]);
}

// Drives the dashboard's "N of M forms available offline" card. "Ready" means this
// job's offline-availability question has been resolved one way or another (a form is
// cached, or we've confirmed the job type has none) — not "has a form", since we can't
// know that without having already fetched it once.
export function useFormDownloadStatus(jobs: MobileWorkOrder[] | undefined): { total: number; ready: number } {
  const qc = useQueryClient();
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const unsubscribe = qc.getQueryCache().subscribe(() => forceUpdate(n => n + 1));
    return unsubscribe;
  }, [qc]);

  const total = jobs?.length ?? 0;
  let ready = 0;
  for (const job of jobs || []) {
    if (qc.getQueryData([WORK_ORDER_FORM_QUERY_KEY, job.id]) !== undefined) ready++;
  }
  return { total, ready };
}
