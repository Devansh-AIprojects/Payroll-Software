import { useState } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';

export default function ManualAttendanceModal({ employees, onClose, onSuccess }) {
  const [form, setForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    status: 'present',
    hours_worked: '',
    ot_hours: '',
    undertime_hours: '',
    override_reason: 'Manual entry (device failure / correction)',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        hours_worked: form.hours_worked ? parseFloat(form.hours_worked) : null,
        ot_hours: form.ot_hours ? parseFloat(form.ot_hours) : null,
        undertime_hours: form.undertime_hours ? parseFloat(form.undertime_hours) : null,
      };
      await api.post('/attendance/manual', payload);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to record manual attendance');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Manual Attendance Entry" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            {error}
          </div>
        )}
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label" htmlFor="manual_emp_id">Employee *</label>
            <select
              id="manual_emp_id"
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
              <label className="form-label" htmlFor="manual_date">Date *</label>
              <input
                id="manual_date"
                name="date"
                type="date"
                className="form-input"
                value={form.date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="manual_status">Status *</label>
              <select
                id="manual_status"
                name="status"
                className="form-select"
                value={form.status}
                onChange={handleChange}
                required
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="half_day">Half Day</option>
                <option value="late">Late</option>
                <option value="holiday">Holiday</option>
                <option value="weekly_off">Weekly Off</option>
              </select>
            </div>
          </div>

          <div className="grid grid-3 gap-4">
            <div className="form-group">
              <label className="form-label" htmlFor="manual_hours">Hours Worked</label>
              <input
                id="manual_hours"
                name="hours_worked"
                type="number"
                step="0.1"
                min="0"
                className="form-input"
                value={form.hours_worked}
                onChange={handleChange}
                placeholder="0.0"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="manual_ot">OT Hours</label>
              <input
                id="manual_ot"
                name="ot_hours"
                type="number"
                step="0.1"
                min="0"
                className="form-input"
                value={form.ot_hours}
                onChange={handleChange}
                placeholder="0.0"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="manual_under">Undertime Hours</label>
              <input
                id="manual_under"
                name="undertime_hours"
                type="number"
                step="0.1"
                min="0"
                className="form-input"
                value={form.undertime_hours}
                onChange={handleChange}
                placeholder="0.0"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="manual_reason">Reason *</label>
            <input
              id="manual_reason"
              name="override_reason"
              className="form-input"
              value={form.override_reason}
              onChange={handleChange}
              required
              minLength={3}
              maxLength={500}
            />
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 'var(--space-6)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Manual Entry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
