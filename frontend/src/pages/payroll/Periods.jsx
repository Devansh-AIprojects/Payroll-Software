import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Modal from '../../components/Modal';
import { Spinner } from '../../components/Loader';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Periods() {
  const navigate = useNavigate();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Create form state
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  useEffect(() => {
    loadPeriods();
  }, []);

  async function loadPeriods() {
    setLoading(true);
    try {
      const res = await api.get('/payroll/periods?page=1&page_size=100');
      setPeriods(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api.post('/payroll/periods', { month, year });
      setShowCreate(false);
      await loadPeriods();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const columns = [
    {
      key: 'month',
      label: 'Period',
      render: (_, row) => `${MONTH_NAMES[(row.month - 1) % 12]} ${row.year}`,
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <StatusBadge status={val} />,
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (val) => new Date(val).toLocaleDateString('en-IN'),
    },
    {
      key: 'approved_at',
      label: 'Approved',
      render: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '—',
    },
    {
      key: 'paid_at',
      label: 'Paid',
      render: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '—',
    },
  ];

  if (loading) return <Spinner />;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Periods</h1>
          <p className="page-subtitle">Manage monthly payroll cycles</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New Period
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          columns={columns}
          data={periods}
          onRowClick={(row) => navigate(`/payroll/periods/${row.id}`)}
          emptyMessage="No payroll periods yet. Create one to get started."
        />
      </div>

      {/* Create Period Modal */}
      {showCreate && (
        <Modal title="Create Payroll Period" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate}>
            <div className="flex gap-4" style={{ marginBottom: 'var(--space-4)' }}>
              <div className="form-group flex-1">
                <label className="form-label">Month</label>
                <select
                  className="form-select"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group flex-1">
                <label className="form-label">Year</label>
                <input
                  type="number"
                  className="form-input"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  min="2020"
                  max="2099"
                />
              </div>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create Period'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
