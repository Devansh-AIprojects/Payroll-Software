import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Spinner } from '../../components/Loader';
import { useToast } from '../../context/ToastContext';

const TABS = ['Shifts', 'Categories', 'Departments', 'Salary Components', 'Tier Rates'];

export default function ConfigPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('Shifts');
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState({});

  async function loadSection(section) {
    if (config[section]) return; // already loaded
    setLoading((l) => ({ ...l, [section]: true }));
    try {
      const endpoints = {
        Shifts: '/config/shifts',
        Categories: '/config/categories',
        Departments: '/config/departments',
        'Salary Components': '/config/salary-components',
        'Tier Rates': '/config/labour-tier-rates',
      };
      const res = await api.get(endpoints[section]);
      setConfig((c) => ({ ...c, [section]: res.data || [] }));
    } catch (err) {
      addToast(err.message || `Failed to load ${section}`, 'error');
    } finally {
      setLoading((l) => ({ ...l, [section]: false }));
    }
  }

  useEffect(() => {
    loadSection(activeTab);
  }, [activeTab]);

  const isLoading = loading[activeTab];
  const data = config[activeTab] || [];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Configuration</h1>
          <p className="page-subtitle">Read-only view of shifts, departments, salary rules, and tier rates</p>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-6)',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none',
              border: 'none',
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 'var(--text-sm)',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          {activeTab === 'Shifts' && <ShiftsTable data={data} />}
          {activeTab === 'Categories' && <CategoriesTable data={data} />}
          {activeTab === 'Departments' && <DepartmentsTable data={data} />}
          {activeTab === 'Salary Components' && <SalaryComponentsTable data={data} />}
          {activeTab === 'Tier Rates' && <TierRatesTable data={data} />}
        </>
      )}
    </div>
  );
}

function ConfigTable({ columns, data, emptyMessage }) {
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyMessage || 'No data found.'}</p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === 'right' ? 'col-right' : ''}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.id || i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? 'col-right' : ''}>
                    {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShiftsTable({ data }) {
  return (
    <ConfigTable
      data={data}
      emptyMessage="No shifts configured."
      columns={[
        { key: 'name', label: 'Name', render: (v) => <strong>{v}</strong> },
        { key: 'start_time', label: 'Start Time' },
        { key: 'end_time', label: 'End Time' },
        { key: 'duration_hours', label: 'Duration (hrs)', align: 'right' },
        { key: 'weekly_offs', label: 'Weekly Offs', render: (v) => Array.isArray(v) ? v.join(', ') : (v || '—') },
        {
          key: 'is_active',
          label: 'Status',
          render: (v) => (
            <span className={`badge ${v ? 'badge-approved' : 'badge-draft'}`}>
              {v ? 'Active' : 'Inactive'}
            </span>
          ),
        },
      ]}
    />
  );
}

function CategoriesTable({ data }) {
  // data is a list of categories, each with sub_categories
  return (
    <div className="flex flex-col gap-4">
      {data.length === 0 ? (
        <div className="empty-state"><p>No categories configured.</p></div>
      ) : (
        data.map((cat) => (
          <div key={cat.id} className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: cat.sub_categories?.length > 0 ? 'var(--space-4)' : 0,
              }}
            >
              <div>
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                  {cat.name}
                </h3>
                {cat.description && (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{cat.description}</p>
                )}
              </div>
              <span className={`badge ${cat.is_active ? 'badge-approved' : 'badge-draft'}`}>
                {cat.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            {cat.sub_categories?.length > 0 && (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sub-Category</th>
                      <th>Salary Type</th>
                      <th className="col-right">Monthly Salary</th>
                      <th className="col-right">Daily Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.sub_categories.map((sub) => (
                      <tr key={sub.id}>
                        <td><strong>{sub.name}</strong></td>
                        <td><span className="badge badge-processing">{sub.salary_type}</span></td>
                        <td className="col-right">
                          {sub.monthly_salary != null
                            ? `₹ ${Number(sub.monthly_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="col-right">
                          {sub.daily_rate != null
                            ? `₹ ${Number(sub.daily_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function DepartmentsTable({ data }) {
  return (
    <ConfigTable
      data={data}
      emptyMessage="No departments configured."
      columns={[
        { key: 'name', label: 'Department', render: (v) => <strong>{v}</strong> },
        { key: 'category_name', label: 'Category' },
        {
          key: 'is_active',
          label: 'Status',
          render: (v) => (
            <span className={`badge ${v ? 'badge-approved' : 'badge-draft'}`}>
              {v ? 'Active' : 'Inactive'}
            </span>
          ),
        },
      ]}
    />
  );
}

function SalaryComponentsTable({ data }) {
  return (
    <ConfigTable
      data={data}
      emptyMessage="No salary components configured."
      columns={[
        { key: 'name', label: 'Component', render: (v) => <strong>{v}</strong> },
        {
          key: 'component_type',
          label: 'Type',
          render: (v) => (
            <span className={`badge ${v === 'earning' ? 'badge-approved' : 'badge-error'}`}>
              {v}
            </span>
          ),
        },
        { key: 'formula_type', label: 'Formula Type', render: (v) => <span className="text-sm text-secondary">{v || '—'}</span> },
        { key: 'rate', label: 'Rate / Amount', align: 'right', render: (v) => v != null ? v : '—' },
        {
          key: 'is_displayed',
          label: 'Show on Payslip',
          render: (v) => (
            <span className={`badge ${v ? 'badge-approved' : 'badge-draft'}`}>
              {v ? 'Yes' : 'No'}
            </span>
          ),
        },
        {
          key: 'is_active',
          label: 'Status',
          render: (v) => (
            <span className={`badge ${v ? 'badge-approved' : 'badge-draft'}`}>
              {v ? 'Active' : 'Inactive'}
            </span>
          ),
        },
      ]}
    />
  );
}

function TierRatesTable({ data }) {
  return (
    <ConfigTable
      data={data}
      emptyMessage="No tier rates configured."
      columns={[
        { key: 'department_name', label: 'Department', render: (v) => <strong>{v || '—'}</strong> },
        { key: 'tier', label: 'Tier', render: (v) => <span className="badge badge-processing">Tier {v}</span> },
        { key: 'min_days', label: 'Min Days', align: 'right' },
        { key: 'max_days', label: 'Max Days', align: 'right' },
        {
          key: 'daily_rate',
          label: 'Daily Rate',
          align: 'right',
          render: (v) => v != null
            ? <strong style={{ color: 'var(--success)' }}>₹ {Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            : '—',
        },
      ]}
    />
  );
}
