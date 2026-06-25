import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { Spinner } from '../../components/Loader';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt = (num) => {
  if (num == null) return '—';
  return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function Payslip() {
  const { periodId, employeeId } = useParams();
  const navigate = useNavigate();

  const [payslip, setPayslip] = useState(null);
  const [period, setPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Deduction modal
  const [showAddDed, setShowAddDed] = useState(false);
  const [dedType, setDedType] = useState('advance');
  const [dedLabel, setDedLabel] = useState('');
  const [dedAmount, setDedAmount] = useState('');
  const [dedLoading, setDedLoading] = useState(false);
  const [dedError, setDedError] = useState('');

  useEffect(() => {
    loadPayslip();
  }, [periodId, employeeId]);

  async function loadPayslip() {
    setLoading(true);
    setError('');
    try {
      const [payslipRes, periodRes] = await Promise.all([
        api.get(`/payroll/periods/${periodId}/records/${employeeId}`),
        api.get(`/payroll/periods/${periodId}`),
      ]);
      setPayslip(payslipRes.data);
      setPeriod(periodRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDeduction(e) {
    e.preventDefault();
    setDedLoading(true);
    setDedError('');
    try {
      await api.post(`/payroll/periods/${periodId}/records/${employeeId}/deductions`, {
        employee_id: employeeId,
        type: dedType,
        label: dedLabel,
        amount: parseFloat(dedAmount),
      });
      setShowAddDed(false);
      setDedLabel('');
      setDedAmount('');
      await loadPayslip();
    } catch (err) {
      setDedError(err.message);
    } finally {
      setDedLoading(false);
    }
  }

  async function handleDeleteDeduction(dedId) {
    if (!confirm('Remove this deduction?')) return;
    try {
      await api.delete(`/payroll/periods/${periodId}/deductions/${dedId}`);
      await loadPayslip();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!payslip) return <div className="empty-state"><p>Payslip not found</p></div>;

  const { record, components, deductions } = payslip;
  const earnings = components.filter((c) => c.component_type === 'earning' && c.is_displayed);
  const compDeductions = components.filter((c) => c.component_type === 'deduction');
  const canModify = period && (period.status === 'draft' || period.status === 'processing');
  const periodLabel = period
    ? `${MONTH_NAMES[(period.month - 1) % 12]} ${period.year}`
    : '';

  return (
    <div className="animate-in">
      {/* Actions bar */}
      <div className="flex gap-3 items-center print-hide" style={{ marginBottom: 'var(--space-6)' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate(`/payroll/periods/${periodId}`)}
        >
          &larr; Back to Records
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => window.print()}
          style={{ marginLeft: 'auto' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print Payslip
        </button>
      </div>

      <div className="card">
        {/* Print-only company letterhead */}
        <div className="print-only" style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '0.02em' }}>STC Cotyarn Exim Pvt. Ltd.</div>
          <div style={{ fontSize: '0.95rem', marginTop: '0.2rem', color: '#444' }}>Salary Slip — {periodLabel}</div>
        </div>

        {/* Header */}
        <div className="payslip-header">
          <div>
            <div className="payslip-emp-name">{record.employee_name}</div>
            <div className="payslip-emp-code">Code: {record.employee_code}</div>
            <div className="flex gap-3" style={{ marginTop: 'var(--space-2)' }}>
              {record.tier_applied && (
                <span className="badge badge-processing">Tier {record.tier_applied}</span>
              )}
              <span className={`badge ${record.payment_mode === 'bank' || record.payment_mode === 'bank_cash' ? 'badge-approved' : 'badge-warning'}`}>
                {record.payment_mode === 'bank_cash' ? 'Bank + Cash' : record.payment_mode === 'bank' ? 'Bank' : 'Cash'}
              </span>
            </div>
          </div>
          <div className="payslip-net">
            <div className="payslip-net-label">Net Pay</div>
            <div className="payslip-net-value">{fmt(record.net_pay)}</div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="payslip-summary">
          <div className="stat-card">
            <div className="stat-label">Days Present</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-2xl)' }}>{record.days_present}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Daily Rate</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-2xl)' }}>{fmt(record.daily_rate_applied)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Gross</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-2xl)' }}>{fmt(record.gross)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Deductions</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-2xl)', color: 'var(--error)' }}>
              {fmt(record.total_deductions)}
            </div>
          </div>
        </div>

        {/* Earnings Breakdown */}
        {earnings.length > 0 && (
          <>
            <h3 className="text-lg font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
              Earnings Breakdown
            </h3>
            <div className="table-container" style={{ marginBottom: 'var(--space-6)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="col-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.map((c) => (
                    <tr key={c.id}>
                      <td>{c.component_name}</td>
                      <td className="col-right">{fmt(c.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Component Deductions (EPF etc) */}
        {compDeductions.length > 0 && (
          <>
            <h3 className="text-lg font-semibold" style={{ marginBottom: 'var(--space-4)' }}>
              Statutory Deductions
            </h3>
            <div className="table-container" style={{ marginBottom: 'var(--space-6)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="col-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {compDeductions.map((c) => (
                    <tr key={c.id}>
                      <td>{c.component_name}</td>
                      <td className="col-right" style={{ color: 'var(--error)' }}>{fmt(c.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Manual Deductions */}
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 className="text-lg font-semibold">Manual Deductions</h3>
          {canModify && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDed(true)}>
              + Add Deduction
            </button>
          )}
        </div>

        {deductions.length > 0 ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Label</th>
                  <th className="col-right">Amount</th>
                  {canModify && <th className="col-center">Action</th>}
                </tr>
              </thead>
              <tbody>
                {deductions.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="badge badge-warning">{d.type}</span>
                    </td>
                    <td>{d.label}</td>
                    <td className="col-right" style={{ color: 'var(--error)' }}>{fmt(d.amount)}</td>
                    {canModify && (
                      <td className="col-center">
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteDeduction(d.id)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <p className="text-sm">No manual deductions</p>
          </div>
        )}

        {/* OT / Undertime (if applicable) */}
        {(record.ot_hours > 0 || record.undertime_hours > 0) && (
          <>
            <hr className="section-divider" />
            <div className="flex gap-8">
              {record.ot_hours > 0 && (
                <div>
                  <span className="text-sm text-tertiary">OT Hours: </span>
                  <span className="font-semibold text-success">{record.ot_hours}</span>
                </div>
              )}
              {record.undertime_hours > 0 && (
                <div>
                  <span className="text-sm text-tertiary">Undertime Hours: </span>
                  <span className="font-semibold text-error">{record.undertime_hours}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add Deduction Modal */}
      {showAddDed && (
        <Modal title="Add Manual Deduction" onClose={() => setShowAddDed(false)}>
          <form onSubmit={handleAddDeduction}>
            <div className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={dedType}
                  onChange={(e) => setDedType(e.target.value)}
                >
                  <option value="advance">Advance</option>
                  <option value="gift">Gift</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Label</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Festival advance Oct"
                  value={dedLabel}
                  onChange={(e) => setDedLabel(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Amount</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  value={dedAmount}
                  onChange={(e) => setDedAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            {dedError && (
              <div className="alert alert-error" style={{ marginTop: 'var(--space-4)' }}>{dedError}</div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddDed(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={dedLoading}>
                {dedLoading ? 'Adding...' : 'Add Deduction'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
