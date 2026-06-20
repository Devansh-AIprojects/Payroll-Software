const STATUS_MAP = {
  draft: 'badge-draft',
  processing: 'badge-processing',
  approved: 'badge-approved',
  paid: 'badge-paid',
  // Attendance
  present: 'badge-success',
  absent: 'badge-error',
  half_day: 'badge-warning',
  // Generic
  success: 'badge-success',
  error: 'badge-error',
  warning: 'badge-warning',
};

export default function StatusBadge({ status }) {
  const cls = STATUS_MAP[status] || 'badge-draft';
  return <span className={`badge ${cls}`}>{status}</span>;
}
