import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import DataTable from '../../components/DataTable';
import { Spinner } from '../../components/Loader';
import EmployeeCreateModal from './EmployeeCreateModal';

export default function Employees() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterActive, setFilterActive] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, [page, filterActive]);

  async function loadEmployees() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page,
        page_size: 50,
        is_active: filterActive,
      });
      const res = await api.get(`/employees?${params}`);
      setEmployees(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = search
    ? employees.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.employee_code.toLowerCase().includes(search.toLowerCase())
      )
    : employees;

  const columns = [
    { key: 'employee_code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'phone_number', label: 'Phone', render: (v) => v || '—' },
    { key: 'city', label: 'City', render: (v) => v || '—' },
    { key: 'pan_number', label: 'PAN', render: (v) => v ? v.toUpperCase() : '—' },
    { key: 'aadhar_number', label: 'Aadhar', render: (v) => v || '—' },
    {
      key: 'gender',
      label: 'Gender',
      render: (val) => val === 'M' ? 'Male' : val === 'F' ? 'Female' : 'Other',
    },
    {
      key: 'salary',
      label: 'Salary (Day/Mo)',
      align: 'right',
      render: (_, row) => {
        if (row.per_day_salary != null) {
          return <span style={{ color: 'var(--success)', fontWeight: 500 }}>₹{Number(row.per_day_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}/d</span>;
        }
        if (row.monthly_salary != null) {
          return `₹${Number(row.monthly_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}/m`;
        }
        return '—';
      },
    },
    {
      key: 'epf_enrolled',
      label: 'EPF',
      render: (val) => (
        <span className={`badge ${val ? 'badge-approved' : 'badge-draft'}`}>
          {val ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'payment_mode',
      label: 'Payment',
      render: (val) => (
        <span className={`badge ${val === 'bank' || val === 'bank_cash' ? 'badge-approved' : 'badge-warning'}`}>
          {val === 'bank_cash' ? 'Bank + Cash' : val === 'bank' ? 'Bank' : 'Cash'}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (val) => (
        <span className={`badge ${val ? 'badge-paid' : 'badge-draft'}`}>
          {val ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'joining_date',
      label: 'Joining',
      render: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '—',
    },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">{total} employee{total !== 1 ? 's' : ''} total</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Employee</button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center" style={{ marginBottom: 'var(--space-6)' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: '320px' }}
        />
        <div className="flex gap-2">
          <button
            className={`btn btn-sm ${filterActive ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFilterActive(true); setPage(1); }}
          >
            Active
          </button>
          <button
            className={`btn btn-sm ${!filterActive ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setFilterActive(false); setPage(1); }}
          >
            Inactive
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              data={filtered}
              onRowClick={(row) => navigate(`/employees/${row.id}`)}
              emptyMessage="No employees found."
            />
          </div>

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
        </>
      )}

      {showCreate && (
        <EmployeeCreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); loadEmployees(); }}
        />
      )}
    </div>
  );
}
