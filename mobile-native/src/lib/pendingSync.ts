import { useMutationState } from '@tanstack/react-query';
import {
  CHECKIN_MUTATION_KEY, CLOSURE_MUTATION_KEY, SUBMIT_FORM_MUTATION_KEY,
  SUBMIT_PRODUCT_REQUEST_MUTATION_KEY, SUBMIT_EXPENSE_LOG_MUTATION_KEY,
} from './queryClient';

const TRACKED_KEYS = [
  CHECKIN_MUTATION_KEY, CLOSURE_MUTATION_KEY, SUBMIT_FORM_MUTATION_KEY,
  SUBMIT_PRODUCT_REQUEST_MUTATION_KEY, SUBMIT_EXPENSE_LOG_MUTATION_KEY,
].map(k => k.join('/'));

// Counts write mutations (checkin, closure, form submit, product requests, expenses)
// currently paused — i.e. captured offline and queued for reconnect — sourced
// directly from react-query's own (AsyncStorage-persisted) mutation cache via
// useMutationState rather than a separate hand-rolled tracker, so this is correct
// even right after an app restart mid-queue, before anything has had a chance to run.
export function usePendingSyncCount(): number {
  const pausedKeys = useMutationState({
    filters: { status: 'pending' },
    select: mutation => (mutation.state.isPaused ? mutation.options.mutationKey?.join('/') : null),
  });
  return pausedKeys.filter(k => k && TRACKED_KEYS.includes(k)).length;
}
