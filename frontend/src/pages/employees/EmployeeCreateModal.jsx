import { useState, useEffect } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

const INITIAL_FORM = {
  employee_code: '',
  name: '',
  gender: '',
  joining_date: '',
  category_id: '',
  sub_category_id: '',
  department_id: '',
  shift_id: '',
  monthly_salary: '',
  per_day_salary: '',
  epf_enrolled: false,
  uan_number: '',
  payment_mode: 'cash',
  bank_name: '',
  bank_account: '',
  bank_ifsc: '',
  pan_number: '',
  aadhar_number: '',
  phone_number: '',
  address: '',
  city: '',
  room_no: '',
  jobber_type: 'none',
  device_user_id: '',
};

export default function EmployeeCreateModal({ onClose, onSuccess }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [shifts, setShifts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Fetch shifts + categories on mount
  useEffect(() => {
    (async () => {
      try {
        const [shiftRes, catRes] = await Promise.all([
          api.get('/config/shifts'),
          api.get('/config/categories'),
        ]);
        setShifts(shiftRes.data || []);
        setCategories(catRes.data || []);
      } catch (err) {
        setError('Failed to load configuration: ' + err.message);
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, []);

  // Fetch sub-categories + departments when category changes
  useEffect(() => {
    if (!form.category_id) {
      setSubCategories([]);
      setDepartments([]);
      return;
    }
    (async () => {
      try {
        const [subRes, deptRes] = await Promise.all([
          api.get(`/config/sub-categories?category_id=${form.category_id}`),
          api.get(`/config/departments?category_id=${form.category_id}`),
        ]);
        setSubCategories(subRes.data || []);
        setDepartments(deptRes.data || []);
      } catch (err) {
        console.error('Failed to load sub-categories/departments', err);
      }
    })();
    // Reset dependent fields
    setForm((prev) => ({ ...prev, sub_category_id: '', department_id: '' }));
  }, [form.category_id]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear field-level error when user edits
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
    if (!form.employee_code.trim()) errs.employee_code = 'Required';
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.joining_date) errs.joining_date = 'Required';
    if (!form.category_id) errs.category_id = 'Select a category';
    if (!form.sub_category_id) errs.sub_category_id = 'Select a sub-category';
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
        employee_code: form.employee_code.trim(),
        name: form.name.trim(),
        joining_date: form.joining_date,
        category_id: form.category_id,
        sub_category_id: form.sub_category_id,
        shift_id: form.shift_id,
        epf_enrolled: form.epf_enrolled,
        payment_mode: form.payment_mode,
      };

      if (form.gender) payload.gender = form.gender;
      if (form.department_id) payload.department_id = form.department_id;
      if (form.monthly_salary) payload.monthly_salary = parseFloat(form.monthly_salary);
      if (form.per_day_salary) payload.per_day_salary = parseFloat(form.per_day_salary);
      if (form.epf_enrolled && form.uan_number.trim()) payload.uan_number = form.uan_number.trim();
      if (form.pan_number.trim()) payload.pan_number = form.pan_number.trim();
      if (form.aadhar_number.trim()) payload.aadhar_number = form.aadhar_number.trim();
      if (form.phone_number.trim()) payload.phone_number = form.phone_number.trim();
      if (form.address.trim()) payload.address = form.address.trim();
      if (form.city.trim()) payload.city = form.city.trim();
      if (form.room_no.trim()) payload.room_no = form.room_no.trim();
      if (form.jobber_type && form.jobber_type !== 'none') payload.jobber_type = form.jobber_type;

      if (form.payment_mode === 'bank' || form.payment_mode === 'bank_cash') {
        payload.bank_account = form.bank_account.trim() || null;
        payload.bank_ifsc = form.bank_ifsc.trim() || null;
        if (form.bank_name.trim()) payload.bank_name = form.bank_name.trim();
      }
      if (form.device_user_id) payload.device_user_id = parseInt(form.device_user_id, 10);

      await api.post('/employees', payload);
      onSuccess();
    } catch (err) {
      // Try to parse validation detail from backend
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
      setError(err.message || 'Failed to create employee');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Employee" onClose={onClose} wide>
      {loadingConfig ? (
        <div className="flex justify-center" style={{ padding: 'var(--space-8)' }}>
          <div className="spinner" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} id="employee-create-form">
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
              {error}
            </div>
          )}

          {/* ── Section: Personal Info ── */}
          <div className="form-section-label">Personal Information</div>
          <div className="grid grid-2 gap-4" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="employee_code">Employee Code *</label>
              <input
                id="employee_code"
                name="employee_code"
                className="form-input"
                placeholder="e.g. EMP-001"
                value={form.employee_code}
                onChange={handleChange}
              />
              {fieldErrors.employee_code && <span className="form-error">{fieldErrors.employee_code}</span>}
            </div>
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
              <label className="form-label" htmlFor="joining_date">Joining Date *</label>
              <input
                id="joining_date"
                name="joining_date"
                type="date"
                className="form-input"
                value={form.joining_date}
                onChange={handleChange}
              />
              {fieldErrors.joining_date && <span className="form-error">{fieldErrors.joining_date}</span>}
            </div>
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
          </div>
          
          <div className="grid grid-2 gap-4" style={{ marginBottom: 'var(--space-5)' }}>
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
            <div className="form-group">
              <label className="form-label" htmlFor="room_no">Room No.</label>
              <input
                id="room_no"
                name="room_no"
                className="form-input"
                placeholder="e.g. 12 or L-1"
                value={form.room_no}
                onChange={handleChange}
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

          {/* ── Section: Classification ── */}
          <div className="form-section-label">Work Details</div>
          <div className="grid grid-2 gap-4" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="category_id">Category *</label>
              <select
                id="category_id"
                name="category_id"
                className="form-select"
                value={form.category_id}
                onChange={handleChange}
              >
                <option value="">— Select Category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {fieldErrors.category_id && <span className="form-error">{fieldErrors.category_id}</span>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sub_category_id">Sub-Category *</label>
              <select
                id="sub_category_id"
                name="sub_category_id"
                className="form-select"
                value={form.sub_category_id}
                onChange={handleChange}
                disabled={!form.category_id}
              >
                <option value="">
                  {form.category_id ? '— Select Sub-Category —' : 'Select a category first'}
                </option>
                {subCategories.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name} ({sc.salary_type})
                  </option>
                ))}
              </select>
              {fieldErrors.sub_category_id && <span className="form-error">{fieldErrors.sub_category_id}</span>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="department_id">Department</label>
              <select
                id="department_id"
                name="department_id"
                className="form-select"
                value={form.department_id}
                onChange={handleChange}
                disabled={!form.category_id}
              >
                <option value="">
                  {form.category_id ? '— Select Department (optional) —' : 'Select a category first'}
                </option>
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
                {shifts.filter((s) => s.is_active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.includes('(') ? s.name : `${s.name} (${fmtTime(s.start_time)}–${fmtTime(s.end_time)})`}
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
            <div className="form-group">
              <label className="form-label" htmlFor="jobber_type">Jobber Allowance</label>
              <select
                id="jobber_type"
                name="jobber_type"
                className="form-select"
                value={form.jobber_type}
                onChange={handleChange}
              >
                <option value="none">None</option>
                <option value="lc">LC Jobber (+₹30/day)</option>
                <option value="pp">PP Jobber (+₹30/day)</option>
                <option value="rf">RF Jobber (+₹40/day)</option>
              </select>
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
              {submitting ? 'Creating…' : 'Create Employee'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
