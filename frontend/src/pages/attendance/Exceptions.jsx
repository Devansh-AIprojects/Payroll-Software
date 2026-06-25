import { useState, useEffect } from 'react';
import api from '../../api/client';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import { Spinner } from '../../components/Loader';

const now = new Date();

export default function Exceptions() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Override modal
  const [overrideRecord, setOverrideRecord] = useState(null);
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [overrideOt, setOverrideOt] = useState('0');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    loadExceptions();
  }, [year, month]);

  async function loadExceptions() {
    setLoading(true);
    setError('');
    setActionMsg('');
    try {
      const res = await api.get(`/attendance/exceptions?year=${year}&month=${month}`);
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(dailyId) {
    try {
      await api.patch(`/attendance/daily/${dailyId}/resolve`);
      setActionMsg('Exception resolved');
      await loadExceptions();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleOverrideSubmit(e) {
    e.preventDefault();
    setOverrideLoading(true);
    setOverrideError('');
    try {
      await api.patch(`/attendance/daily/${overrideRecord.id}`, {
        status: overrideStatus,
        ot_hours: parseFloat(overrideOt) || 0,
        override_reason: overrideReason,
      });
      setOverrideRecord(null);
      setActionMsg('Record overridden');
      await loadExceptions();
    } catch (err) {
      setOverrideError(err.message);
    } finally {
      setOverrideLoading(false);
    }
  }

  const columns = [
    { key: 'employee_code', label: 'Code' },
    { key: 'employee_name', label: 'Employee' },
    {
      key: 'date',
      label: 'Date',
      render: (val) => new Date(val).toLocaleDateString('en-IN'),
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <StatusBadge status={val} />,
    },
    {
      key: 'exception_reason',
      label: 'Exception',
      render: (val) => (
        <span className="text-warning text-sm">{val || '—'}</span>
      ),
    },
    {
      key: 'ot_hours',
      label: 'OT Hrs',
      align: 'right',
      render: (val) => val > 0 ? val : '—',
    },
    {
      key: 'id',
      label: 'Actions',
      render: (val, row) => (
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-success"
            onClick={(e) => { e.stopPropagation(); handleResolve(val); }}
          >
            Resolve
          </button>
          <button
            className="btn btn-sm btn-secondary"
            onClick={(e) => {
              e.stopPropagation();
              setOverrideRecord(row);
              setOverrideStatus(row.status || 'present');
              setOverrideOt(row.ot_hours?.toString() || '0');
              setOverrideReason('');
              setOverrideError('');
            }}
          >
            Override
          </button>
        </div>
      ),
    },
  ];

  const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Exceptions</h1>
          <p className="page-subtitle">Resolve flagged records before running payroll</p>
        </div>
        {/* Month/Year selector */}
        <div className="flex gap-3 items-center">
          <select
            className="form-select"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            style={{ width: 120 }}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <input
            type="number"
            className="form-input"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min="2020"
            max="2099"
            style={{ width: 90 }}
          />
          <button className="btn btn-secondary" onClick={loadExceptions}>Refresh</button>
        </div>
      </div>

      {/* Summary bar */}
      {data && (
        <div className="flex gap-6" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="stat-card" style={{ flex: 1 }}>
            <div className="stat-label">Flagged Records</div>
            <div className="stat-value" style={{
              color: data.flagged_count > 0 ? 'var(--warning)' : 'var(--success)',
              fontSize: 'var(--text-3xl)',
            }}>
              {data.flagged_count}
            </div>
            <div className="stat-sub">
              {data.flagged_count === 0
                ? '✓ All clear — payroll can proceed'
                : 'Resolve all to enable payroll'}
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}
      {actionMsg && <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>{actionMsg}</div>}

      {loading ? (
        <Spinner />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <DataTable
            columns={columns}
            data={data?.exceptions || []}
            emptyMessage="No flagged exceptions for this month."
          />
        </div>
      )}

      {/* Override Modal */}
      {overrideRecord && (
        <Modal
          title={`Override — ${overrideRecord.employee_name} (${new Date(overrideRecord.date).toLocaleDateString('en-IN')})`}
          onClose={() => setOverrideRecord(null)}
        >
          <form onSubmit={handleOverrideSubmit}>
            <div className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value)}
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="half_day">Half Day</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">OT Hours</label>
                <input
                  type="number"
                  className="form-input"
                  value={overrideOt}
                  onChange={(e) => setOverrideOt(e.target.value)}
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Approved OT, Leave approved"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  required
                />
              </div>
            </div>
            {overrideError && (
              <div className="alert alert-error" style={{ marginTop: 'var(--space-3)' }}>{overrideError}</div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setOverrideRecord(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={overrideLoading}>
                {overrideLoading ? 'Saving...' : 'Save Override'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
