import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { Spinner } from '../../components/Loader';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt = (num) => {
  if (num == null) return '—';
  return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function PeriodDetail() {
  const { periodId } = useParams();
  const navigate = useNavigate();

  const [period, setPeriod] = useState(null);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadAll();
  }, [periodId, page]);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [periodRes, recordsRes] = await Promise.all([
        api.get(`/payroll/periods/${periodId}`),
        api.get(`/payroll/periods/${periodId}/records?page=${page}&page_size=50`),
      ]);
      setPeriod(periodRes.data);
      setRecords(recordsRes.data || []);
      setTotal(recordsRes.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunPayroll() {
    setActionLoading('run');
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post(`/payroll/periods/${periodId}/run`);
      const data = res.data;
      setSuccessMsg(
        `Payroll complete: ${data.records_written} records written` +
        (data.errors?.length > 0 ? `, ${data.errors.length} error(s)` : '')
      );
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  }

  async function handleStatusChange(newStatus) {
    setActionLoading(newStatus);
    setError('');
    setSuccessMsg('');
    try {
      await api.patch(`/payroll/periods/${periodId}/status`, { status: newStatus });
      setSuccessMsg(`Period status updated to "${newStatus}"`);
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  }

  const columns = [
    { key: 'employee_code', label: 'Code' },
    { key: 'employee_name', label: 'Employee' },
    {
      key: 'days_present',
      label: 'Days',
      align: 'right',
      render: (val) => val,
    },
    {
      key: 'daily_rate_applied',
      label: 'Rate',
      align: 'right',
      render: (val) => val ? fmt(val) : '—',
    },
    {
      key: 'ot_hours',
      label: 'OT Hrs',
      align: 'right',
      render: (val) => val > 0 ? val : '—',
    },
    {
      key: 'gross',
      label: 'Gross',
      align: 'right',
      render: (val) => fmt(val),
    },
    {
      key: 'total_deductions',
      label: 'Deductions',
      align: 'right',
      render: (val) => fmt(val),
    },
    {
      key: 'net_pay',
      label: 'Net Pay',
      align: 'right',
      render: (val) => <strong style={{ color: 'var(--success)' }}>{fmt(val)}</strong>,
    },
    {
      key: 'payment_mode',
      label: 'Mode',
      render: (val) => (
        <span className={`badge ${val === 'bank' ? 'badge-approved' : 'badge-warning'}`}>
          {val}
        </span>
      ),
    },
  ];

  if (loading) return <Spinner />;

  const periodLabel = period
    ? `${MONTH_NAMES[(period.month - 1) % 12]} ${period.year}`
    : 'Period';

  const canRun = period && (period.status === 'draft' || period.status === 'processing');
  const canApprove = period && period.status === 'processing';
  const canPay = period && period.status === 'approved';

  // Compute totals
  const totalGross = records.reduce((sum, r) => sum + (r.gross || 0), 0);
  const totalDeductions = records.reduce((sum, r) => sum + (r.total_deductions || 0), 0);
  const totalNet = records.reduce((sum, r) => sum + (r.net_pay || 0), 0);

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-4">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/payroll/periods')}>
              &larr; Back
            </button>
            <h1 className="page-title">{periodLabel}</h1>
            {period && <StatusBadge status={period.status} />}
          </div>
          <p className="page-subtitle" style={{ marginLeft: '72px' }}>{total} employee record(s)</p>
        </div>
        <div className="page-actions">
          {canRun && (
            <button
              className="btn btn-primary"
              onClick={handleRunPayroll}
              disabled={!!actionLoading}
            >
              {actionLoading === 'run' ? 'Running...' : 'Run Payroll'}
            </button>
          )}
          {canApprove && (
            <button
              className="btn btn-success"
              onClick={() => handleStatusChange('approved')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'approved' ? 'Approving...' : 'Approve'}
            </button>
          )}
          {canPay && (
            <button
              className="btn btn-primary"
              onClick={() => handleStatusChange('paid')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'paid' ? 'Processing...' : 'Mark Paid'}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}
      {successMsg && <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>{successMsg}</div>}

      {/* Summary Cards */}
      {records.length > 0 && (
        <div className="grid grid-3 gap-6" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="stat-card">
            <div className="stat-label">Total Gross</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-2xl)' }}>{fmt(totalGross)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Deductions</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-2xl)', color: 'var(--error)' }}>{fmt(totalDeductions)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Net Pay</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-2xl)', color: 'var(--success)' }}>{fmt(totalNet)}</div>
          </div>
        </div>
      )}

      {/* Records Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          data={records}
          onRowClick={(row) => navigate(`/payroll/periods/${periodId}/records/${row.employee_id}`)}
          emptyMessage="No payroll records. Run the payroll engine to generate records."
        />
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center gap-3" style={{ marginTop: 'var(--space-6)' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-secondary text-sm flex items-center">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
