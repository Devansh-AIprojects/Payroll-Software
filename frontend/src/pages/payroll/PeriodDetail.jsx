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
  if (num == null || num === '') return '—';
  return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// pay_type 'hours_based' = Maintenance + Staff (monthly). Everything else
// (tier_based: Skilled + Trainee) is Labour. This is the class split for the tabs.
const isStaff = (r) => r.pay_type === 'hours_based';

const modeCell = (val) => (
  <span className={`badge ${val === 'bank' ? 'badge-approved' : 'badge-warning'}`}>{val}</span>
);
const netCell = (val) => <strong style={{ color: 'var(--success)' }}>{fmt(val)}</strong>;

const TABS = [
  { id: 'labour', label: 'Labour' },
  { id: 'staff', label: 'Maintenance & Staff' },
  { id: 'all', label: 'All' },
];

export default function PeriodDetail() {
  const { periodId } = useParams();
  const navigate = useNavigate();

  const [period, setPeriod] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState('labour');

  useEffect(() => {
    loadAll();
  }, [periodId]);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [periodRes, recordsRes] = await Promise.all([
        api.get(`/payroll/periods/${periodId}`),
        // One mill's monthly payroll fits comfortably in a single page; fetch all
        // so the class tabs can group/total client-side without pagination seams.
        api.get(`/payroll/periods/${periodId}/records?page=1&page_size=200`),
      ]);
      setPeriod(periodRes.data);
      setRecords(recordsRes.data || []);
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

  // ── Column sets per class ──────────────────────────────────────────────────
  const labourColumns = [
    { key: 'employee_code', label: 'Code' },
    { key: 'employee_name', label: 'Employee' },
    { key: 'daily_rate_applied', label: 'Rate', align: 'right', render: (v) => (v ? fmt(v) : '—') },
    { key: 'days_present', label: 'Days', align: 'right' },
    { key: 'ot_hours', label: 'OT Hrs', align: 'right', render: (v) => (v > 0 ? v : '—') },
    { key: 'gross', label: 'Gross', align: 'right', render: fmt },
    { key: 'total_deductions', label: 'EPF', align: 'right', render: fmt },
    { key: 'net_pay', label: 'Net Pay', align: 'right', render: netCell },
    { key: 'payment_mode', label: 'Mode', render: modeCell },
  ];

  const staffColumns = [
    { key: 'employee_code', label: 'Code' },
    { key: 'employee_name', label: 'Employee' },
    { key: 'monthly_salary', label: 'Salary', align: 'right', render: (v) => (v ? fmt(v) : '—') },
    { key: 'per_day_salary', label: 'Per Day', align: 'right', render: (v) => (v ? fmt(v) : '—') },
    { key: 'days_present', label: 'Days', align: 'right' },
    { key: 'ot_hours', label: 'OT Hrs', align: 'right', render: (v) => (v > 0 ? v : '—') },
    { key: 'gross', label: 'Gross', align: 'right', render: fmt },
    { key: 'total_deductions', label: 'Deductions', align: 'right', render: fmt },
    { key: 'net_pay', label: 'Net Pay', align: 'right', render: netCell },
    { key: 'payment_mode', label: 'Mode', render: modeCell },
  ];

  const allColumns = [
    { key: 'employee_code', label: 'Code' },
    { key: 'employee_name', label: 'Employee' },
    { key: 'pay_type', label: 'Class', render: (v) => (v === 'hours_based' ? 'Maint & Staff' : 'Labour') },
    { key: 'gross', label: 'Gross', align: 'right', render: fmt },
    { key: 'total_deductions', label: 'Deductions', align: 'right', render: fmt },
    { key: 'net_pay', label: 'Net Pay', align: 'right', render: netCell },
    { key: 'payment_mode', label: 'Mode', render: modeCell },
  ];

  if (loading) return <Spinner />;

  const periodLabel = period
    ? `${MONTH_NAMES[(period.month - 1) % 12]} ${period.year}`
    : 'Period';

  const canRun = period && (period.status === 'draft' || period.status === 'processing');
  const canApprove = period && period.status === 'processing';
  const canPay = period && period.status === 'approved';

  // ── Class grouping ─────────────────────────────────────────────────────────
  const labourRecords = records.filter((r) => !isStaff(r));
  const staffRecords = records.filter((r) => isStaff(r));

  const activeRecords =
    activeTab === 'labour' ? labourRecords : activeTab === 'staff' ? staffRecords : records;
  const activeColumns =
    activeTab === 'labour' ? labourColumns : activeTab === 'staff' ? staffColumns : allColumns;

  const tabCount = (id) =>
    id === 'labour' ? labourRecords.length : id === 'staff' ? staffRecords.length : records.length;

  // ── Totals for the active tab ──────────────────────────────────────────────
  const totalGross = activeRecords.reduce((s, r) => s + (r.gross || 0), 0);
  const totalDeductions = activeRecords.reduce((s, r) => s + (r.total_deductions || 0), 0);
  const totalNet = activeRecords.reduce((s, r) => s + (r.net_pay || 0), 0);
  const totalDays = activeRecords.reduce((s, r) => s + (r.days_present || 0), 0);

  const deductionsLabel = activeTab === 'labour' ? 'Total EPF' : 'Total Deductions';

  // summaryRow values are shown raw (DataTable does not re-apply render), so pre-format.
  let summaryRow = null;
  if (activeRecords.length > 0) {
    const base = {
      employee_name: 'TOTAL',
      days_present: totalDays,
      gross: fmt(totalGross),
      total_deductions: fmt(totalDeductions),
      net_pay: fmt(totalNet),
    };
    summaryRow = base;
  }

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
          <p className="page-subtitle" style={{ marginLeft: '72px' }}>{records.length} employee record(s)</p>
        </div>
        <div className="page-actions">
          {period && (period.status === 'approved' || period.status === 'paid') && (
            <button
              className="btn btn-secondary"
              onClick={() => navigate(`/payroll/periods/${periodId}/sheet`)}
            >
              Salary Sheet
            </button>
          )}
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

      {/* Class tabs */}
      {records.length > 0 && (
        <div className="att-tab-bar" style={{ marginBottom: 'var(--space-5)' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`att-tab ${activeTab === tab.id ? 'att-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span className="badge" style={{
                marginLeft: 'var(--space-2)',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text-secondary)',
              }}>
                {tabCount(tab.id)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Summary Cards — scoped to the active tab */}
      {activeRecords.length > 0 && (
        <div className="grid grid-3 gap-6" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="stat-card">
            <div className="stat-label">Total Gross</div>
            <div className="stat-value" style={{ fontSize: 'var(--text-2xl)' }}>{fmt(totalGross)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{deductionsLabel}</div>
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
          columns={activeColumns}
          data={activeRecords}
          onRowClick={(row) => navigate(`/payroll/periods/${periodId}/records/${row.employee_id}`)}
          emptyMessage={
            records.length === 0
              ? 'No payroll records. Run the payroll engine to generate records.'
              : 'No employees in this class for this period.'
          }
          summaryRow={summaryRow}
        />
      </div>
    </div>
  );
}
