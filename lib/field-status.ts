export function fieldStatusLabel(raw: string) {
  const s = raw.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.includes('no access')) {
    return { key: 'noaccess' as const, label: /complete|2nd|second/.test(s) ? 'No access - 2nd attempt' : /1|first/.test(s) ? 'No access - 1st attempt' : 'No access', color: '#ff9f0a' };
  }
  if (s.includes('refused')) return { key: 'refused' as const, label: 'Refused access', color: '#ff453a' };
  if (s.includes('partial')) return { key: 'open' as const, label: 'Partial work', color: '#ff9f0a' };
  if (s.includes('complet') && s.includes('other')) return { key: 'complete' as const, label: 'Completed by others', color: '#64d2ff' };
  if (s.includes('progress')) return { key: 'open' as const, label: 'Work in progress', color: '#30d158' };
  if (s.includes('appointment')) return { key: 'pending' as const, label: 'Appointment requested', color: '#ff9f0a' };
  return null;
}
