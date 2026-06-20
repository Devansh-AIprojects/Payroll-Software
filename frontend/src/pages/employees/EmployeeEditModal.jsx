import { useState, useEffect } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';

export default function EmployeeEditModal({ employee, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: employee.name || '',
    gender: employee.gender || '',
    department_id: employee.department_id || '',
    shift_id: employee.shift_id || '',
    monthly_salary: employee.monthly_salary || '',
    per_day_salary: employee.per_day_salary || '',
    epf_enrolled: employee.epf_enrolled || false,
    uan_number: employee.uan_number || '',
    payment_mode: employee.payment_mode || 'cash',
    bank_name: employee.bank_name || '',
    bank_account: employee.bank_account || '',
    bank_ifsc: employee.bank_ifsc || '',
    pan_number: employee.pan_number || '',
    aadhar_number: employee.aadhar_number || '',
    phone_number: employee.phone_number || '',
    address: employee.address || '',
    city: employee.city || '',
    device_user_id: employee.device_user_id || '',
    is_active: employee.is_active,
  });

  const [shifts, setShifts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [shiftRes, deptRes] = await Promise.all([
          api.get('/config/shifts'),
          // Only fetch departments for this employee's specific category
          api.get(`/config/departments?category_id=${employee.category_id}`),
        ]);
        setShifts(shiftRes.data || []);
        setDepartments(deptRes.data || []);
      } catch (err) {
        setError('Failed to load configuration: ' + err.message);
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, [employee.category_id]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.shift_id) errs.shift_id = 'Select a shift';
    if (form.epf_enrolled && !form.uan_number.trim()) {
      errs.uan_number = 'UAN required when EPF is enrolled';
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const errs = validate();
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        gender: form.gender || null,
        department_id: form.department_id || null,
        shift_id: form.shift_id,
        monthly_salary: form.monthly_salary ? parseFloat(form.monthly_salary) : null,
        per_day_salary: form.per_day_salary ? parseFloat(form.per_day_salary) : null,
        epf_enrolled: form.epf_enrolled,
        payment_mode: form.payment_mode,
        is_active: form.is_active,
        device_user_id: form.device_user_id ? parseInt(form.device_user_id, 10) : null,
        pan_number: form.pan_number.trim() || null,
        aadhar_number: form.aadhar_number.trim() || null,
        phone_number: form.phone_number.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
      };

      if (form.epf_enrolled && form.uan_number.trim()) {
        payload.uan_number = form.uan_number.trim();
      } else {
        payload.uan_number = null;
      }

      if (form.payment_mode === 'bank' || form.payment_mode === 'bank_cash') {
        payload.bank_account = form.bank_account.trim() || null;
        payload.bank_ifsc = form.bank_ifsc.trim() || null;
        payload.bank_name = form.bank_name.trim() || null;
      } else {
        payload.bank_account = null;
        payload.bank_ifsc = null;
        payload.bank_name = null;
      }

      await api.patch(`/employees/${employee.id}`, payload);
      onSuccess();
    } catch (err) {
      if (err.detail && Array.isArray(err.detail)) {
        const mapped = {};
        err.detail.forEach((d) => {
          const field = d.loc?.[d.loc.length - 1];
          if (field) mapped[field] = d.msg;
        });
        if (Object.keys(mapped).length) {
          setFieldErrors(mapped);
          return;
        }
      }
      setError(err.message || 'Failed to update employee');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Edit Employee" onClose={onClose} wide>
      {loadingConfig ? (
        <div className="flex justify-center" style={{ padding: 'var(--space-8)' }}>
          <div className="spinner" />
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
              {error}
            </div>
          )}

          {/* ── Section: Read-Only Info ── */}
          <div className="form-section-label">Core Details (Non-Editable)</div>
          <div className="grid grid-2 gap-4" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label">Employee Code</label>
              <input className="form-input" value={employee.employee_code} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input className="form-input" value={employee.category_name} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">Sub-Category</label>
              <input className="form-input" value={employee.sub_category_name} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">Joining Date</label>
              <input className="form-input" value={new Date(employee.joining_date).toLocaleDateString('en-IN')} disabled />
            </div>
          </div>

          {/* ── Section: Personal Info ── */}
          <div className="form-section-label">Personal Information</div>
          <div className="grid grid-2 gap-4" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="name">Full Name *</label>
              <input
                id="name"
                name="name"
                className="form-input"
                placeholder="Employee full name"
                value={form.name}
                onChange={handleChange}
              />
              {fieldErrors.name && <span className="form-error">{fieldErrors.name}</span>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="gender">Gender</label>
              <select
                id="gender"
                name="gender"
                className="form-select"
                value={form.gender}
                onChange={handleChange}
              >
                <option value="">— Select —</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="O">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-checkbox" htmlFor="is_active" style={{ marginTop: 'var(--space-8)' }}>
                <input
                  id="is_active"
                  name="is_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={handleChange}
                />
                <span>Active Status</span>
              </label>
            </div>
          </div>
          
          <div className="grid grid-2 gap-4" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="phone_number">Phone Number</label>
              <input
                id="phone_number"
                name="phone_number"
                type="tel"
                className="form-input"
                placeholder="Phone number"
                value={form.phone_number}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="city">City</label>
              <input
                id="city"
                name="city"
                className="form-input"
                placeholder="City"
                value={form.city}
                onChange={handleChange}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label" htmlFor="address">Address</label>
              <textarea
                id="address"
                name="address"
                className="form-input"
                placeholder="Full address"
                value={form.address}
                onChange={handleChange}
                rows={2}
              />
            </div>
          </div>

          <div className="grid grid-2 gap-4" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="pan_number">PAN Number</label>
              <input
                id="pan_number"
                name="pan_number"
                className="form-input"
                placeholder="PAN Number"
                value={form.pan_number}
                onChange={handleChange}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="aadhar_number">Aadhar Number</label>
              <input
                id="aadhar_number"
                name="aadhar_number"
                className="form-input"
                placeholder="12-digit Aadhar"
                value={form.aadhar_number}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* ── Section: Work Details ── */}
          <div className="form-section-label">Work Details</div>
          <div className="grid grid-2 gap-4" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="department_id">Department</label>
              <select
                id="department_id"
                name="department_id"
                className="form-select"
                value={form.department_id}
                onChange={handleChange}
              >
                <option value="">— Select Department (optional) —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="shift_id">Shift *</label>
              <select
                id="shift_id"
                name="shift_id"
                className="form-select"
                value={form.shift_id}
                onChange={handleChange}
              >
                <option value="">— Select Shift —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start_time}–{s.end_time})
                  </option>
                ))}
              </select>
              {fieldErrors.shift_id && <span className="form-error">{fieldErrors.shift_id}</span>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="monthly_salary">
                Monthly Salary
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 'var(--space-2)' }}>
                  (display only)
                </span>
              </label>
              <input
                id="monthly_salary"
                name="monthly_salary"
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                placeholder="₹ 0.00"
                value={form.monthly_salary}
                onChange={handleChange}
              />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)', display: 'block' }}>
                For reference only — not used in payroll calculation
              </span>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="per_day_salary">
                Per Day Salary
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600, marginLeft: 'var(--space-2)' }}>
                  ✦ used for payroll
                </span>
              </label>
              <input
                id="per_day_salary"
                name="per_day_salary"
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                placeholder="₹ 0.00 (monthly ÷ 26)"
                value={form.per_day_salary}
                onChange={handleChange}
              />
              {form.monthly_salary && !form.per_day_salary && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginTop: 'var(--space-1)', display: 'block' }}>
                  Suggested: ₹ {(parseFloat(form.monthly_salary) / 26).toFixed(2)} / day (÷ 26 days)
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="device_user_id">Device User ID</label>
              <input
                id="device_user_id"
                name="device_user_id"
                type="number"
                min="1"
                max="32767"
                className="form-input"
                placeholder="BioMax UID (optional)"
                value={form.device_user_id}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* ── Section: Compliance ── */}
          <div className="form-section-label">Compliance</div>
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-checkbox" htmlFor="epf_enrolled">
              <input
                id="epf_enrolled"
                name="epf_enrolled"
                type="checkbox"
                checked={form.epf_enrolled}
                onChange={handleChange}
              />
              <span>EPF Enrolled</span>
            </label>
            {form.epf_enrolled && (
              <div className="form-group" style={{ marginTop: 'var(--space-3)', maxWidth: '320px' }}>
                <label className="form-label" htmlFor="uan_number">UAN Number *</label>
                <input
                  id="uan_number"
                  name="uan_number"
                  className="form-input"
                  placeholder="e.g. 100123456789"
                  value={form.uan_number}
                  onChange={handleChange}
                />
                {fieldErrors.uan_number && <span className="form-error">{fieldErrors.uan_number}</span>}
              </div>
            )}
          </div>

          {/* ── Section: Payment ── */}
          <div className="form-section-label">Payment Details</div>
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group" style={{ maxWidth: '200px', marginBottom: 'var(--space-4)' }}>
              <label className="form-label" htmlFor="payment_mode">Payment Mode</label>
              <select
                id="payment_mode"
                name="payment_mode"
                className="form-select"
                value={form.payment_mode}
                onChange={handleChange}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank Transfer</option>
                <option value="bank_cash">Bank + Cash</option>
              </select>
            </div>

            {(form.payment_mode === 'bank' || form.payment_mode === 'bank_cash') && (
              <div className="grid grid-2 gap-4" style={{ animation: 'slideUp var(--transition-fast) ease-out' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="bank_name">Bank Name</label>
                  <input
                    id="bank_name"
                    name="bank_name"
                    className="form-input"
                    placeholder="e.g. State Bank of India"
                    value={form.bank_name}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="bank_account">Account Number</label>
                  <input
                    id="bank_account"
                    name="bank_account"
                    className="form-input"
                    placeholder="Account number"
                    value={form.bank_account}
                    onChange={handleChange}
                  />
                  {fieldErrors.bank_account && <span className="form-error">{fieldErrors.bank_account}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="bank_ifsc">IFSC Code</label>
                  <input
                    id="bank_ifsc"
                    name="bank_ifsc"
                    className="form-input"
                    placeholder="e.g. SBIN0001234"
                    value={form.bank_ifsc}
                    onChange={handleChange}
                  />
                  {fieldErrors.bank_ifsc && <span className="form-error">{fieldErrors.bank_ifsc}</span>}
                </div>
              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
