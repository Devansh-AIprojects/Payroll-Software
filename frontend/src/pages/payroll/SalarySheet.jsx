import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../api/client';
import { Spinner } from '../../components/Loader';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt = (num) => {
  if (num == null) return '—';
  return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtSalary = (num) => {
  if (num == null) return '—';
  return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// 'monthly' = Maintenance/Staff; everything else (tier / daily_flat) = Labour.
const isStaff = (r) => r.salary_type === 'monthly';

const TABS = [
  { id: 'labour', label: 'Labour' },
  { id: 'staff', label: 'Maintenance & Staff' },
];

export default function SalarySheet() {
  const { periodId } = useParams();
  const navigate = useNavigate();

  const [period, setPeriod] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('labour');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [periodRes, sheetRes] = await Promise.all([
          api.get(`/payroll/periods/${periodId}`),
          api.get(`/payroll/periods/${periodId}/sheet`),
        ]);
        setPeriod(periodRes.data);
        setRows(sheetRes.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [periodId]);

  if (loading) return <Spinner />;

  const periodLabel = period
    ? `${MONTH_NAMES[(period.month - 1) % 12]} ${period.year}`
    : 'Period';
  const periodSlug = periodLabel.replace(' ', '_');

  const labourRows = rows.filter((r) => !isStaff(r));
  const staffRows = rows.filter((r) => isStaff(r));
  const activeRows = activeTab === 'labour' ? labourRows : staffRows;

  const femaleCount = activeRows.filter((r) => r.gender === 'F').length;
  const maleCount = activeRows.filter((r) => r.gender === 'M').length;

  // ── Labour totals (full component layout) ──────────────────────────────────
  const labourTotals = labourRows.reduce(
    (acc, r) => ({
      monthly_salary: acc.monthly_salary + (r.monthly_salary || 0),
      gross: acc.gross + (r.gross || 0),
      basic: acc.basic + (r.basic || 0),
      da: acc.da + (r.da || 0),
      t_basic: acc.t_basic + (r.t_basic || 0),
      allowances: acc.allowances + (r.allowances || 0),
      epf: acc.epf + (r.epf != null ? r.epf : (r.total_deductions || 0)),
      net_pay: acc.net_pay + (r.net_pay || 0),
    }),
    { monthly_salary: 0, gross: 0, basic: 0, da: 0, t_basic: 0, allowances: 0, epf: 0, net_pay: 0 }
  );
  const labourHasSalary = labourRows.some((r) => r.monthly_salary != null);

  // ── Staff totals (monthly layout) ──────────────────────────────────────────
  const staffTotals = staffRows.reduce(
    (acc, r) => ({
      monthly_salary: acc.monthly_salary + (r.monthly_salary || 0),
      gross: acc.gross + (r.gross || 0),
      deductions: acc.deductions + (r.total_deductions || 0),
      net_pay: acc.net_pay + (r.net_pay || 0),
    }),
    { monthly_salary: 0, gross: 0, deductions: 0, net_pay: 0 }
  );

  // ── Exports — each class to its own .xlsx file ─────────────────────────────
  function exportLabourExcel() {
    const headers = [
      'SR.', 'NAME', 'M/F', 'SALARY', 'PER DAY', 'PRESENT DAYS',
      'GROSS', 'BASIC', 'DA', 'T Basic', 'ALLOWANCES', 'EPF 12%', 'NET PAY',
    ];
    const dataRows = labourRows.map((row, i) => {
      const epfVal = row.epf != null ? row.epf : (row.total_deductions > 0 ? row.total_deductions : null);
      return [
        i + 1,
        row.employee_name,
        row.gender || '',
        row.monthly_salary != null ? row.monthly_salary : '',
        row.per_day != null ? row.per_day : '',
        row.days_present,
        row.gross,
        row.basic != null ? row.basic : '',
        row.da != null ? row.da : '',
        row.t_basic != null ? row.t_basic : '',
        row.allowances != null ? row.allowances : '',
        epfVal != null ? epfVal : '',
        row.net_pay,
      ];
    });
    const totalRow = [
      'TOTAL', '', '',
      labourHasSalary ? labourTotals.monthly_salary : '',
      '', '',
      labourTotals.gross, labourTotals.basic, labourTotals.da,
      labourTotals.t_basic, labourTotals.allowances, labourTotals.epf, labourTotals.net_pay,
    ];
    const ws = XLSX.utils.aoa_to_sheet([
      headers, ...dataRows, totalRow, [],
      ['FEMALE', labourRows.filter((r) => r.gender === 'F').length],
      ['MALE', labourRows.filter((r) => r.gender === 'M').length],
      ['TOTAL', labourRows.length],
    ]);
    ws['!cols'] = [
      { wch: 5 }, { wch: 28 }, { wch: 5 }, { wch: 10 }, { wch: 9 },
      { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Labour');
    XLSX.writeFile(wb, `Salary_Sheet_Labour_${periodSlug}.xlsx`);
  }

  function exportStaffExcel() {
    const headers = [
      'SR.', 'NAME', 'M/F', 'SALARY', 'PER DAY', 'PRESENT DAYS', 'OT HRS',
      'GROSS', 'DEDUCTIONS', 'NET PAY',
    ];
    const dataRows = staffRows.map((row, i) => [
      i + 1,
      row.employee_name,
      row.gender || '',
      row.monthly_salary != null ? row.monthly_salary : '',
      row.per_day != null ? row.per_day : '',
      row.days_present,
      row.ot_hours > 0 ? row.ot_hours : '',
      row.gross,
      row.total_deductions,
      row.net_pay,
    ]);
    const totalRow = [
      'TOTAL', '', '', staffTotals.monthly_salary, '', '', '',
      staffTotals.gross, staffTotals.deductions, staffTotals.net_pay,
    ];
    const ws = XLSX.utils.aoa_to_sheet([
      headers, ...dataRows, totalRow, [],
      ['FEMALE', staffRows.filter((r) => r.gender === 'F').length],
      ['MALE', staffRows.filter((r) => r.gender === 'M').length],
      ['TOTAL', staffRows.length],
    ]);
    ws['!cols'] = [
      { wch: 5 }, { wch: 28 }, { wch: 5 }, { wch: 11 }, { wch: 9 },
      { wch: 13 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Maintenance & Staff');
    XLSX.writeFile(wb, `Salary_Sheet_Staff_${periodSlug}.xlsx`);
  }

  function handleExport() {
    if (activeTab === 'labour') exportLabourExcel();
    else exportStaffExcel();
  }

  const thStyle = {
    padding: '8px 10px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
    fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em',
    whiteSpace: 'nowrap', borderBottom: '1px solid rgba(245,158,11,0.3)',
    position: 'sticky', top: 0, zIndex: 1,
  };
  const tdStyle = {
    padding: '6px 10px', fontSize: '13px',
    borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap',
  };
  const tdRight = { ...tdStyle, textAlign: 'right' };
  const totalRowStyle = {
    background: 'rgba(255,255,255,0.06)', fontWeight: 700,
    borderTop: '2px solid rgba(255,255,255,0.15)',
  };

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-4">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/payroll/periods/${periodId}`)}>
              &larr; Back
            </button>
            <h1 className="page-title">Salary Sheet — {periodLabel}</h1>
          </div>
          <p className="page-subtitle" style={{ marginLeft: '72px' }}>
            {activeRows.length} {activeTab === 'labour' ? 'Labour' : 'Maintenance & Staff'} employee{activeRows.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Read-only
          </p>
        </div>
        {activeRows.length > 0 && (
          <button className="btn btn-success" onClick={handleExport}>
            ↓ Export {activeTab === 'labour' ? 'Labour' : 'Staff'} Excel
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {/* Class tabs */}
      {rows.length > 0 && (
        <div className="att-tab-bar" style={{ marginBottom: 'var(--space-5)' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`att-tab ${activeTab === tab.id ? 'att-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span className="badge" style={{
                marginLeft: 'var(--space-2)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
              }}>
                {tab.id === 'labour' ? labourRows.length : staffRows.length}
              </span>
            </button>
          ))}
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="card">
          <p className="text-secondary">No payroll records found. Run the payroll engine first.</p>
        </div>
      )}

      {rows.length > 0 && activeRows.length === 0 && (
        <div className="card">
          <p className="text-secondary">
            No {activeTab === 'labour' ? 'Labour' : 'Maintenance & Staff'} employees in this period.
          </p>
        </div>
      )}

      {/* ── LABOUR sheet (full component layout) ── */}
      {activeTab === 'labour' && labourRows.length > 0 && (
        <>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>SR.</th>
                  <th style={thStyle}>NAME</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>M/F</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>SALARY</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>PER DAY</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>PRESENT DAYS</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>GROSS</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>BASIC</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>DA</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>T BASIC</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>ALLOWANCES</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>EPF 12%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>NET PAY</th>
                </tr>
              </thead>
              <tbody>
                {labourRows.map((row, i) => (
                  <tr key={row.employee_id} style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={tdStyle}>{row.employee_name}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{row.gender || '—'}</td>
                    <td style={tdRight}>{row.monthly_salary != null ? fmtSalary(row.monthly_salary) : '—'}</td>
                    <td style={tdRight}>{fmt(row.per_day)}</td>
                    <td style={tdRight}>{row.days_present}</td>
                    <td style={{ ...tdRight, color: '#f59e0b' }}>{fmt(row.gross)}</td>
                    <td style={tdRight}>{row.basic != null ? fmt(row.basic) : '—'}</td>
                    <td style={tdRight}>{row.da != null ? fmt(row.da) : '—'}</td>
                    <td style={tdRight}>{row.t_basic != null ? fmt(row.t_basic) : '—'}</td>
                    <td style={tdRight}>{row.allowances != null ? fmt(row.allowances) : '—'}</td>
                    <td style={{ ...tdRight, color: 'var(--error)' }}>
                      {row.epf != null ? fmt(row.epf) : (row.total_deductions > 0 ? fmt(row.total_deductions) : '—')}
                    </td>
                    <td style={{ ...tdRight, color: 'var(--success)', fontWeight: 600 }}>{fmt(row.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={totalRowStyle}>
                  <td style={tdStyle} colSpan={3}>TOTAL</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>{labourHasSalary ? fmtSalary(labourTotals.monthly_salary) : '—'}</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>—</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>—</td>
                  <td style={{ ...tdRight, ...totalRowStyle, color: '#f59e0b' }}>{fmt(labourTotals.gross)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>{fmt(labourTotals.basic)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>{fmt(labourTotals.da)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>{fmt(labourTotals.t_basic)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>{fmt(labourTotals.allowances)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle, color: 'var(--error)' }}>{fmt(labourTotals.epf)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle, color: 'var(--success)' }}>{fmt(labourTotals.net_pay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex gap-6" style={{ marginTop: 'var(--space-4)', paddingLeft: 'var(--space-2)' }}>
            <span className="text-secondary text-sm">Female: <strong style={{ color: 'var(--text-primary)' }}>{femaleCount}</strong></span>
            <span className="text-secondary text-sm">Male: <strong style={{ color: 'var(--text-primary)' }}>{maleCount}</strong></span>
            <span className="text-secondary text-sm">Total: <strong style={{ color: '#f59e0b' }}>{labourRows.length}</strong></span>
          </div>
        </>
      )}

      {/* ── MAINTENANCE & STAFF sheet (monthly layout) ── */}
      {activeTab === 'staff' && staffRows.length > 0 && (
        <>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>SR.</th>
                  <th style={thStyle}>NAME</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>M/F</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>SALARY</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>PER DAY</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>PRESENT DAYS</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>OT HRS</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>GROSS</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>DEDUCTIONS</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>NET PAY</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((row, i) => (
                  <tr key={row.employee_id} style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td style={tdStyle}>{row.employee_name}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>{row.gender || '—'}</td>
                    <td style={tdRight}>{row.monthly_salary != null ? fmtSalary(row.monthly_salary) : '—'}</td>
                    <td style={tdRight}>{fmt(row.per_day)}</td>
                    <td style={tdRight}>{row.days_present}</td>
                    <td style={tdRight}>{row.ot_hours > 0 ? row.ot_hours : '—'}</td>
                    <td style={{ ...tdRight, color: '#f59e0b' }}>{fmt(row.gross)}</td>
                    <td style={{ ...tdRight, color: 'var(--error)' }}>{row.total_deductions > 0 ? fmt(row.total_deductions) : '—'}</td>
                    <td style={{ ...tdRight, color: 'var(--success)', fontWeight: 600 }}>{fmt(row.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={totalRowStyle}>
                  <td style={tdStyle} colSpan={3}>TOTAL</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>{fmtSalary(staffTotals.monthly_salary)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>—</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>—</td>
                  <td style={{ ...tdRight, ...totalRowStyle }}>—</td>
                  <td style={{ ...tdRight, ...totalRowStyle, color: '#f59e0b' }}>{fmt(staffTotals.gross)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle, color: 'var(--error)' }}>{fmt(staffTotals.deductions)}</td>
                  <td style={{ ...tdRight, ...totalRowStyle, color: 'var(--success)' }}>{fmt(staffTotals.net_pay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex gap-6" style={{ marginTop: 'var(--space-4)', paddingLeft: 'var(--space-2)' }}>
            <span className="text-secondary text-sm">Female: <strong style={{ color: 'var(--text-primary)' }}>{femaleCount}</strong></span>
            <span className="text-secondary text-sm">Male: <strong style={{ color: 'var(--text-primary)' }}>{maleCount}</strong></span>
            <span className="text-secondary text-sm">Total: <strong style={{ color: '#f59e0b' }}>{staffRows.length}</strong></span>
          </div>
        </>
      )}
    </div>
  );
}
