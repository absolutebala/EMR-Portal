import type { MobileWorkOrderWithCustomer } from './types';

// Ported verbatim from components/mobile/FormFillView.tsx's getPrefillValue — best-
// effort label -> job-data mapping for fields the Form Builder marked "prefill from
// job". There's no formal schema linking a field to a specific job attribute, only
// the label text. Keep both copies in sync if this heuristic ever changes.
export function getPrefillValue(label: string, wo: MobileWorkOrderWithCustomer): string {
  const l = label.toLowerCase();
  if (l.includes('engineer') && l.includes('name')) return wo.engineer_name || '';
  if (l.includes('customer') && l.includes('name')) return wo.customer_name;
  if (l.includes('contact')) return wo.customer_contact || '';
  if (l.includes('installation location') || (l.includes('site') && l.includes('address'))) return wo.site_address || '';
  if (l.includes('serial')) return wo.serial_numbers.join(', ');
  if (l.includes('rating')) return wo.rating || '';
  if (l.includes('manufacturer')) return wo.manufacturer || '';
  return '';
}
