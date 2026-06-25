import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { Spinner } from '../../components/Loader';
import { useToast } from '../../context/ToastContext';

export default function LeaveManagement() {
  const { addToast } = useToast();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create modal state
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    employee_id: '',
    from_date: '',
    to_date: '',
    reason: '',
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/leave');
      setLeaves(res.data || []);
    } catch (err) {
      addToast(err.message || 'Failed to load leaves', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  async function openCreate() {
    // Fetch employees for dropdown
    if (employees.length === 0) {
      try {
        const res = await api.get('/employees?is_active=true&page_size=200');
        setEmployees(res.data || []);
      } catch {
        addToast('Could not load employee list', 'warning');
      }
    }
    setForm({ employee_id: '', from_date: '', to_date: '', reason: '' });
    setFormError('');
    setShowCreate(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.employee_id) { setFormError('Select an employee'); return; }
    if (!form.from_date) { setFormError('From date required'); return; }
    if (!form.to_date) { setFormError('To date required'); return; }
    if (form.to_date < form.from_date) { setFormError('To date cannot be before from date'); return; }

    setSubmitting(true);
    try {
      await api.post('/leave', {
        employee_id: form.employee_id,
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason.trim() || null,
      });
      addToast('Leave recorded successfully', 'success');
      setShowCreate(false);
      await loadLeaves();
    } catch (err) {
      setFormError(err.message || 'Failed to record leave');
    } finally {
      setSubmitting(false);
    }
  }

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  const leaveDays = (from, to) => {
    if (!from || !to) return '—';
    const d1 = new Date(from);
    const d2 = new Date(to);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    return diff === 1 ? '1 day' : `${diff} days`;
  };

  const columns = [
    { key: 'employee_code', label: 'Code', render: (v) => <span className="text-secondary text-sm font-mono">{v || '—'}</span> },
    { key: 'employee_name', label: 'Employee', render: (v) => <span className="font-semibold">{v || '—'}</span> },
    {
      key: 'from_date',
      label: 'From',
      render: (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
    {
      key: 'to_date',
      label: 'To',
      render: (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
    {
      key: 'id',
      label: 'Duration',
      render: (_, row) => (
        <span className="badge badge-processing">{leaveDays(row.from_date, row.to_date)}</span>
      ),
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (v) => <span className="text-secondary text-sm">{v || <em className="text-tertiary">—</em>}</span>,
    },
    {
      key: 'applied_at',
      label: 'Recorded On',
      render: (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Management</h1>
          <p className="page-subtitle">View and record employee leave applications</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={openCreate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Record Leave
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-label">Total Leaves</div>
          <div className="stat-value" style={{ fontSize: 'var(--text-3xl)' }}>{leaves.length}</div>
          <div className="stat-sub">All recorded applications</div>
        </div>
        <div className="stat-card" style={{ flex: 1 }}>
          <div className="stat-label">This Month</div>
          <div className="stat-value" style={{ fontSize: 'var(--text-3xl)', color: 'var(--accent)' }}>
            {leaves.filter((l) => {
              const now = new Date();
              const d = new Date(l.applied_at || l.created_at);
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).length}
          </div>
          <div className="stat-sub">Recorded this month</div>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <DataTable
            columns={columns}
            data={leaves}
            emptyMessage="No leave records found. Record a leave to get started."
          />
        </div>
      )}

      {/* Create Leave Modal */}
      {showCreate && (
        <Modal title="Record Leave" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label" htmlFor="leave_employee_id">Employee *</label>
                <select
                  id="leave_employee_id"
                  name="employee_id"
                  className="form-select"
                  value={form.employee_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select employee…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_code} — {emp.name}{emp.room_no ? ` (Room ${emp.room_no})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-2 gap-4">
                <div className="form-group">
                  <label className="form-label" htmlFor="leave_from_date">From Date *</label>
                  <input
                    id="leave_from_date"
                    name="from_date"
                    type="date"
                    className="form-input"
                    value={form.from_date}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="leave_to_date">To Date *</label>
                  <input
                    id="leave_to_date"
                    name="to_date"
                    type="date"
                    className="form-input"
                    value={form.to_date}
                    min={form.from_date}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              {form.from_date && form.to_date && form.to_date >= form.from_date && (
                <div className="alert" style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  color: 'var(--accent)',
                  fontSize: 'var(--text-sm)',
                }}>
                  Duration: <strong>{leaveDays(form.from_date, form.to_date)}</strong>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="leave_reason">Reason</label>
                <textarea
                  id="leave_reason"
                  name="reason"
                  className="form-input"
                  placeholder="e.g. Medical leave, Personal work…"
                  value={form.reason}
                  onChange={handleChange}
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            {formError && (
              <div className="alert alert-error" style={{ marginTop: 'var(--space-4)' }}>{formError}</div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Record Leave'}
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}
