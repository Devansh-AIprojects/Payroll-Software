import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Spinner } from '../../components/Loader';
import EmployeeEditModal from './EmployeeEditModal';

const FINGER_NAMES = {
  1: 'Right Thumb', 2: 'Right Index', 3: 'Right Middle',
  4: 'Right Ring', 5: 'Right Little',
  6: 'Left Thumb', 7: 'Left Index', 8: 'Left Middle',
  9: 'Left Ring', 10: 'Left Little',
};

export default function EmployeeDetail() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [fingerprints, setFingerprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    loadEmployee();
  }, [employeeId]);

  async function loadEmployee() {
    setLoading(true);
    try {
      const [empRes, fpRes] = await Promise.all([
        api.get(`/employees/${employeeId}`),
        api.get(`/employees/${employeeId}/fingerprints`),
      ]);
      setEmployee(empRes.data);
      setFingerprints(fpRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    if (!confirm(`Deactivate ${employee.name}? This is a soft delete — data is preserved.`)) return;
    setDeactivating(true);
    try {
      await api.delete(`/employees/${employeeId}`);
      navigate('/employees');
    } catch (err) {
      setError(err.message);
      setDeactivating(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!employee) return null;

  const e = employee;

  return (
    <div className="animate-in">
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => navigate('/employees')}
        style={{ marginBottom: 'var(--space-6)' }}
      >
        &larr; Back to Employees
      </button>

      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--accent-subtle)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-2xl)', fontWeight: 700, flexShrink: 0,
            }}
          >
            {e.name[0]}
          </div>
          <div>
            <h1 className="page-title">{e.name}</h1>
            <p className="page-subtitle">Code: {e.employee_code}</p>
          </div>
          <span className={`badge ${e.is_active ? 'badge-paid' : 'badge-draft'}`}>
            {e.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex gap-3">
          <button
            className="btn btn-secondary"
            onClick={() => setShowEdit(true)}
          >
            Edit
          </button>
          {e.is_active && (
            <button
              className="btn btn-danger"
              onClick={handleDeactivate}
              disabled={deactivating}
            >
              {deactivating ? 'Deactivating...' : 'Deactivate'}
            </button>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-2 gap-6" style={{ marginBottom: 'var(--space-6)' }}>
        {/* Left Column */}
        <div className="flex flex-col gap-6">
          <div className="card flex flex-col gap-6">
            <div>
              <h2 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Personal Info</h2>
              <div className="flex flex-col gap-3">
                <Row label="Gender" value={e.gender === 'M' ? 'Male' : e.gender === 'F' ? 'Female' : e.gender === 'O' ? 'Other' : '—'} />
                <Row label="Joining Date" value={e.joining_date ? new Date(e.joining_date).toLocaleDateString('en-IN') : '—'} />
                <Row label="EPF Enrolled" value={e.epf_enrolled ? 'Yes' : 'No'} />
                <Row label="UAN Number" value={e.uan_number || '—'} />
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-4)' }}>
              <h2 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Contact &amp; Identity</h2>
              <div className="flex flex-col gap-3">
                <Row label="Phone" value={e.phone_number || '—'} />
                <Row label="Address" value={e.address || '—'} />
                <Row label="City" value={e.city || '—'} />
                <Row label="PAN" value={e.pan_number ? e.pan_number.toUpperCase() : '—'} />
                <Row label="Aadhar" value={e.aadhar_number || '—'} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          {/* Work Details */}
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>Work Details</h2>
            <div className="flex flex-col gap-4">
              <Row label="Category" value={e.category_name || '—'} />
              <Row label="Sub-Category" value={e.sub_category_name || '—'} />
              <Row label="Department" value={e.department_name || '—'} />
              <Row label="Shift" value={e.shift_name || '—'} />
            </div>
          </div>

          {/* Salary Info */}
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>Salary &amp; Payment</h2>
            <div className="flex flex-col gap-4">
              <Row
                label={
                  <span>
                    Monthly Salary
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 'var(--space-2)' }}>
                      (display only)
                    </span>
                  </span>
                }
                value={e.monthly_salary != null ? `₹ ${Number(e.monthly_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
              />
              <Row
                label={
                  <span>
                    Per Day Salary
                    {e.per_day_salary != null && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600, marginLeft: 'var(--space-2)' }}>
                        ✦ used for payroll
                      </span>
                    )}
                    {e.per_day_salary == null && e.monthly_salary != null && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 'var(--space-2)' }}>
                        (fallback)
                      </span>
                    )}
                  </span>
                }
                value={
                  e.per_day_salary != null ? (
                    <strong style={{ color: 'var(--success)' }}>
                      ₹ {Number(e.per_day_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / day
                    </strong>
                  ) : e.monthly_salary != null ? (
                    <span style={{ color: 'var(--warning)' }}>
                      ₹ {(Number(e.monthly_salary) / 26).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / day (monthly ÷ 26)
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <Row
                label="Payment Mode"
                value={e.payment_mode === 'bank_cash' ? 'Bank + Cash' : e.payment_mode === 'bank' ? 'Bank Transfer' : 'Cash'}
              />
              {(e.payment_mode === 'bank' || e.payment_mode === 'bank_cash') && (
                <>
                  <Row label="Bank" value={e.bank_name || '—'} />
                  <Row label="Account" value={e.bank_account || '—'} />
                  <Row label="IFSC" value={e.bank_ifsc || '—'} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fingerprints */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Fingerprints</h2>
          <span className="text-sm text-secondary">{fingerprints.length} enrolled</span>
        </div>
        {fingerprints.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <p className="text-sm">No fingerprints enrolled</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {fingerprints.map((fp) => (
              <div
                key={fp.id}
                className="card"
                style={{ padding: 'var(--space-3) var(--space-4)', flex: '0 0 auto' }}
              >
                <div className="font-medium text-sm">{FINGER_NAMES[fp.finger_index] || `Finger ${fp.finger_index}`}</div>
                <div className="text-xs text-tertiary" style={{ marginTop: 2 }}>
                  Enrolled {new Date(fp.enrolled_at).toLocaleDateString('en-IN')}
                </div>
                <span
                  className={`badge ${fp.is_active ? 'badge-approved' : 'badge-draft'}`}
                  style={{ marginTop: 'var(--space-2)' }}
                >
                  {fp.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEdit && (
        <EmployeeEditModal
          employee={e}
          onClose={() => setShowEdit(false)}
          onSuccess={() => { setShowEdit(false); loadEmployee(); }}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-tertiary">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
