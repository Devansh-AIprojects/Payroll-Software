// Display labels for roles. The underlying role values (admin/hr/viewer) are
// unchanged and still drive all permissions — this only affects what the UI shows.
export const ROLE_LABELS = {
  admin: 'admin',
  hr: 'STC',
  viewer: 'Guest',
};

export const roleLabel = (role) => ROLE_LABELS[role] || role || '—';
