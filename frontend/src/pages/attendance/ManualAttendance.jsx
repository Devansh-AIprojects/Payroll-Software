import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { Spinner } from '../../components/Loader';

/* ── Constants ─────────────────────────────────────────────────────────────── */

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const STATUS_CONFIG = {
  present:    { label: 'P',   color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   title: 'Present' },
  absent:     { label: 'A',   color: '#f43f5e', bg: 'rgba(244,63,94,0.15)',   title: 'Absent' },
  half_day:   { label: 'HD',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  title: 'Half Day' },
  late:       { label: 'L',   color: '#eab308', bg: 'rgba(234,179,8,0.15)',   title: 'Late (Undertime)' },
  overtime:   { label: 'OT',  color: '#14b8a6', bg: 'rgba(20,184,166,0.15)',  title: 'Overtime' },
  weekly_off: { label: 'WO',  color: '#64748b', bg: 'rgba(100,116,139,0.15)','title': 'Weekly Off' },
};

const STATUSES = Object.keys(STATUS_CONFIG);

function getDaysInMonth(year, month) {
  // month is 1-indexed (1=Jan … 12=Dec)
  // Feb hardcoded to 28; leap years not needed for HR attendance use
  if (month === 2) return 28;
  const thirtyOne = [1, 3, 5, 7, 8, 10, 12]; // Jan Mar May Jul Aug Oct Dec
  return thirtyOne.includes(month) ? 31 : 30;
}

function toYMD(date) {
  return date.toISOString().split('T')[0];
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function StatusCell({ status, isManual, isException, onClick }) {
  const cfg = STATUS_CONFIG[status] || null;
  return (
    <button
      className="att-cell"
      style={{
        background: cfg ? cfg.bg : 'transparent',
        color: cfg ? cfg.color : 'var(--text-muted)',
        borderColor: isException
          ? 'rgba(245,158,11,0.6)'
          : isManual
          ? 'rgba(56,189,248,0.4)'
          : 'transparent',
      }}
      onClick={onClick}
      title={cfg ? cfg.title : 'No record — click to add'}
    >
      {cfg ? cfg.label : '·'}
      {isManual && <span className="att-cell-dot att-cell-dot--manual" />}
      {isException && <span className="att-cell-dot att-cell-dot--exception" />}
    </button>
  );
}



/* ── Edit Modal ─────────────────────────────────────────────────────────────── */

function EditModal({ cell, onClose, onSaved }) {
  // cell: { employeeId, employeeName, date, existing: record|null }
  const [form, setForm] = useState({
    status: cell.existing?.status || 'present',
    hours_worked: cell.existing?.hours_worked ?? '',
    override_reason: cell.existing?.override_reason || 'Manual entry (HR correction)',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isNew = !cell.existing?.daily_id;
  const dateLabel = new Date(cell.date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
  });

  // Derived OT/undertime hint, based on the employee's actual shift hours
  // (8h Staff/Maintenance, 12h Labour). Shown for worked-day statuses.
  function getHoursHint() {
    if (!['present', 'late', 'overtime'].includes(form.status) || form.hours_worked === '') return null;
    const h = parseFloat(form.hours_worked);
    if (isNaN(h) || h <= 0) return null;
    const std = cell.standardHours;
    if (!std || std <= 0) return null;  // unknown shift — don't guess
    if (h > std) return { text: `+${(h - std).toFixed(1)}h OT (${std}h shift)`, color: 'var(--success)' };
    if (h < std) return { text: `${(std - h).toFixed(1)}h undertime (${std}h shift)`, color: 'var(--warning)' };
    return { text: `Full ${std}h shift — full day pay`, color: 'var(--text-muted)' };
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        status: form.status,
        hours_worked: form.hours_worked !== '' ? parseFloat(form.hours_worked) : null,
        override_reason: form.override_reason,
      };

      if (isNew) {
        await api.post('/attendance/manual', {
          ...payload,
          employee_id: cell.employeeId,
          date: cell.date,
        });
      } else {
        await api.patch(`/attendance/daily/${cell.existing.daily_id}`, payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const hoursHint = getHoursHint();

  return (
    <Modal
      title={`${isNew ? 'Add' : 'Edit'} Attendance — ${cell.employeeName}`}
      onClose={onClose}
    >
      <div style={{ marginBottom: 'var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
        {dateLabel}
        {cell.existing?.is_manual_override && (
          <span className="badge badge-info" style={{ marginLeft: 'var(--space-2)', background: 'rgba(56,189,248,0.1)', color: 'var(--info)' }}>
            Manual Override
          </span>
        )}
      </div>

      <form onSubmit={handleSave}>
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label" htmlFor="edit_status">Status *</label>
            <select
              id="edit_status"
              className="form-select"
              value={form.status}
              onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}
              required
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].title}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit_hours">Hours Worked (only for over/under time)</label>
            <input
              id="edit_hours"
              type="number" step="0.1" min="0" max="24"
              className="form-input"
              value={form.hours_worked}
              onChange={(e) => setForm(p => ({ ...p, hours_worked: e.target.value }))}
              placeholder="0.0"
            />
            {hoursHint && (
              <div style={{ fontSize: 'var(--text-xs)', color: hoursHint.color, marginTop: 'var(--space-1)' }}>
                {hoursHint.text}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit_reason">Reason *</label>
            <input
              id="edit_reason"
              className="form-input"
              value={form.override_reason}
              onChange={(e) => setForm(p => ({ ...p, override_reason: e.target.value }))}
              required
              minLength={3}
              maxLength={500}
            />
          </div>

          {cell.existing?.override_reason && !isNew && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              <strong>Previous reason:</strong> {cell.existing.override_reason}
              {cell.existing.updated_at && (
                <> &nbsp;·&nbsp; {new Date(cell.existing.updated_at).toLocaleString('en-IN')}</>
              )}
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (isNew ? 'Create Record' : 'Update Record')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Bulk Modal ─────────────────────────────────────────────────────────────── */

function BulkModal({ employees, date, onClose, onSaved }) {
  const [status, setStatus] = useState('present');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('Bulk entry by HR');
  const [selected, setSelected] = useState(() => new Set(employees.map(e => e.employee_id)));
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const toggleAll = () => {
    if (selected.size === employees.length) setSelected(new Set());
    else setSelected(new Set(employees.map(e => e.employee_id)));
  };

  async function handleBulkSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    setProgress(0);
    const ids = [...selected];
    let done = 0;
    for (const empId of ids) {
      try {
        await api.post('/attendance/manual', {
          employee_id: empId,
          date,
          status,
          hours_worked: hours ? parseFloat(hours) : null,
          override_reason: reason,
        });
      } catch {
        // best-effort — continue with others
      }
      done++;
      setProgress(Math.round((done / ids.length) * 100));
    }
    onSaved();
  }

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <Modal title="Bulk Mark Attendance" onClose={onClose}>
      <div style={{ marginBottom: 'var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
        {dateLabel}
      </div>
      <form onSubmit={handleBulkSave}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-2 gap-4">
            <div className="form-group">
              <label className="form-label">Status *</label>
              <select className="form-select" value={status} onChange={e => setStatus(e.target.value)} required>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Hours Worked (only for over/under time)</label>
              <input type="number" step="0.1" min="0" className="form-input" value={hours}
                onChange={e => setHours(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Reason *</label>
            <input className="form-input" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} />
          </div>

          {/* Employee selector */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="form-label">Select Employees ({selected.size}/{employees.length})</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}>
                {selected.size === employees.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="att-bulk-list">
              {employees.map(emp => (
                <label key={emp.employee_id} className="att-bulk-item">
                  <input
                    type="checkbox"
                    checked={selected.has(emp.employee_id)}
                    onChange={() => {
                      setSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(emp.employee_id)) next.delete(emp.employee_id);
                        else next.add(emp.employee_id);
                        return next;
                      });
                    }}
                  />
                  <span className="att-emp-code">{emp.employee_code}</span>
                  <span>{emp.employee_name}</span>
                </label>
              ))}
            </div>
          </div>

          {saving && (
            <div className="att-progress-bar">
              <div className="att-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || selected.size === 0}>
            {saving ? `Saving… ${progress}%` : `Mark ${selected.size} Employees`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Tab 1: Monthly Grid View ───────────────────────────────────────────────── */

function GridView({ year, month, onMonthChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editCell, setEditCell] = useState(null);
  const [bulkDate, setBulkDate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/attendance/monthly-grid?year=${year}&month=${month}`);
      setData(res.data || { employees: [], stats: {} });
    } catch (err) {
      setError(err.message || 'Failed to load attendance grid');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const filtered = data?.employees?.filter(emp =>
    !searchQuery ||
    emp.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.employee_code.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  // Build lookup: employeeId+date → record
  const recordMap = {};
  data?.employees?.forEach(emp => {
    emp.records.forEach(rec => {
      recordMap[`${emp.employee_id}|${rec.date}`] = rec;
    });
  });

  function openEdit(emp, day) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const existing = recordMap[`${emp.employee_id}|${dateStr}`] || null;
    setEditCell({ employeeId: emp.employee_id, employeeName: emp.employee_name, date: dateStr, existing, standardHours: emp.standard_hours });
  }

  return (
    <div>
      {/* Month navigator */}
      <div className="att-grid-controls">
        <div className="flex items-center gap-3">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onMonthChange(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)}
          >
            ‹ Prev
          </button>
          <span className="att-month-label">{MONTH_NAMES[month - 1]} {year}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onMonthChange(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)}
          >
            Next ›
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            className="form-input"
            style={{ width: 200 }}
            placeholder="Search employee…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="att-legend">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="att-legend-item">
            <span className="att-legend-dot" style={{ background: cfg.color }} />
            <span>{cfg.label} — {cfg.title}</span>
          </div>
        ))}
        <div className="att-legend-item">
          <span className="att-legend-dot" style={{ background: 'var(--info)', opacity: 0.7 }} />
          <span>Blue dot = Manual override</span>
        </div>
        <div className="att-legend-item">
          <span className="att-legend-dot" style={{ background: 'var(--accent)' }} />
          <span>Orange dot = Exception</span>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {loading ? (
        <Spinner />
      ) : (
        <div className="att-grid-wrapper">
          <table className="att-grid-table">
            <thead>
              <tr>
                <th className="att-grid-emp-col">Employee</th>
                {days.map(d => {
                  const dow = new Date(year, month - 1, d).getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th
                      key={d}
                      className={`att-grid-day-col ${isWeekend ? 'att-day-weekend' : ''}`}
                      title={`${DAY_SHORT[dow]}, ${d} ${MONTH_SHORT[month-1]}`}
                    >
                      <div className="att-day-label">{d}</div>
                      <div className="att-day-dow">{DAY_SHORT[dow]}</div>
                      <button
                        className="att-bulk-btn"
                        title={`Bulk mark all for ${d} ${MONTH_SHORT[month-1]}`}
                        onClick={() => setBulkDate(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`)}
                      >
                        ⊕
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 1} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                    {searchQuery ? 'No employees match your search.' : 'No employees found.'}
                  </td>
                </tr>
              ) : (
                filtered.map(emp => (
                  <tr key={emp.employee_id} className="att-grid-row">
                    <td className="att-grid-emp-cell">
                      <div className="att-emp-name">{emp.employee_name}</div>
                      <div className="att-emp-code">{emp.employee_code}</div>
                    </td>
                    {days.map(d => {
                      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                      const rec = recordMap[`${emp.employee_id}|${dateStr}`];
                      return (
                        <td key={d} className="att-grid-cell-td">
                          <StatusCell
                            status={rec?.status}
                            isManual={rec?.is_manual_override}
                            isException={rec?.review_status === 'flagged'}
                            onClick={() => openEdit(emp, d)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {editCell && (
        <EditModal
          cell={editCell}
          onClose={() => setEditCell(null)}
          onSaved={() => { setEditCell(null); load(); }}
        />
      )}

      {bulkDate && (
        <BulkModal
          employees={data?.employees || []}
          date={bulkDate}
          onClose={() => setBulkDate(null)}
          onSaved={() => { setBulkDate(null); load(); }}
        />
      )}
    </div>
  );
}

/* ── Tab 2: Single Employee View ────────────────────────────────────────────── */

function EmployeeView({ year, month, onMonthChange }) {
  const [employees, setEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [records, setRecords] = useState([]);
  const [empStdHours, setEmpStdHours] = useState(null);
  const [loading, setLoading] = useState(false);
  const [empLoading, setEmpLoading] = useState(true);
  const [empError, setEmpError] = useState('');
  const [error, setError] = useState('');
  const [editCell, setEditCell] = useState(null);

  useEffect(() => {
    setEmpError('');
    api.get('/employees?page=1&page_size=200&is_active=true')
      .then(res => {
        // PaginatedResponse: { data: [...], total, ... }
        const list = Array.isArray(res.data) ? res.data
          : Array.isArray(res) ? res
          : [];
        setEmployees(list);
      })
      .catch(err => setEmpError(err.message || 'Failed to load employees'))
      .finally(() => setEmpLoading(false));
  }, []);

  const loadRecords = useCallback(async () => {
    if (!selectedEmpId) return;
    setLoading(true);
    setError('');
    try {
      // Use the same monthly-grid endpoint as the Grid View — confirmed working.
      // Filter by the selected employee so data is always in sync with Grid tab.
      const res = await api.get(`/attendance/monthly-grid?year=${year}&month=${month}`);
      const empData = (res.data?.employees || []).find(e => e.employee_id === selectedEmpId);
      setRecords(empData?.records || []);
      setEmpStdHours(empData?.standard_hours ?? null);
    } catch (err) {
      setError(err.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [selectedEmpId, year, month]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const daysInMonth = getDaysInMonth(year, month);
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return dateStr;
  });

  const recMap = {};
  records.forEach(r => { recMap[r.date] = r; });

  // Stats for selected employee
  const presentCount = records.filter(r => r.status === 'present').length;
  const absentCount = records.filter(r => r.status === 'absent').length;
  const otTotal = records.reduce((sum, r) => sum + (r.ot_hours || 0), 0);
  const selectedEmp = employees.find(e => e.id === selectedEmpId);

  function openEdit(dateStr) {
    const existing = recMap[dateStr] || null;
    setEditCell({
      employeeId: selectedEmpId,
      employeeName: selectedEmp?.name || '',
      date: dateStr,
      existing,
      standardHours: empStdHours,
    });
  }

  return (
    <div>
      {/* Month navigator + employee picker */}
      <div className="att-grid-controls">
        <div className="flex items-center gap-3">
          <button className="btn btn-secondary btn-sm"
            onClick={() => onMonthChange(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)}>
            ‹ Prev
          </button>
          <span className="att-month-label">{MONTH_NAMES[month - 1]} {year}</span>
          <button className="btn btn-secondary btn-sm"
            onClick={() => onMonthChange(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)}>
            Next ›
          </button>
        </div>
        <div className="flex items-center gap-3">
          {empLoading ? (
            <span className="text-secondary text-sm">Loading employees…</span>
          ) : empError ? (
            <span className="text-error text-sm">{empError}</span>
          ) : (
            <select
              id="emp-view-selector"
              className="form-select"
              style={{ minWidth: 260 }}
              value={selectedEmpId}
              onChange={e => setSelectedEmpId(e.target.value)}
            >
              <option value="">
                {employees.length === 0 ? 'No employees found' : 'Select employee…'}
              </option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.name}
                </option>
              ))}
            </select>
          )}
          {selectedEmpId && (
            <button className="btn btn-secondary btn-sm" onClick={loadRecords}>Refresh</button>
          )}
        </div>
      </div>

      {!selectedEmpId ? (
        <div className="att-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p className="text-secondary">Select an employee to view and edit their monthly attendance</p>
        </div>
      ) : (
        <>
          {/* Employee stats bar */}
          <div className="att-stats-bar" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="att-stat">
              <span className="att-stat-value" style={{ color: 'var(--success)' }}>{presentCount}</span>
              <span className="att-stat-label">Present</span>
            </div>
            <div className="att-stat">
              <span className="att-stat-value" style={{ color: 'var(--error)' }}>{absentCount}</span>
              <span className="att-stat-label">Absent</span>
            </div>
            <div className="att-stat">
              <span className="att-stat-value" style={{ color: 'var(--info)' }}>{otTotal.toFixed(1)}h</span>
              <span className="att-stat-label">OT Hours</span>
            </div>
            <div className="att-stat">
              <span className="att-stat-value" style={{ color: 'var(--accent)' }}>
                {records.filter(r => r.is_manual_override).length}
              </span>
              <span className="att-stat-label">Manual Entries</span>
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

          {loading ? <Spinner /> : (
            <div className="att-calendar-grid">
              {allDays.map(dateStr => {
                const rec = recMap[dateStr];
                const d = parseInt(dateStr.split('-')[2]);
                const dow = new Date(dateStr + 'T00:00:00').getDay();
                const isWeekend = dow === 0 || dow === 6;
                const cfg = rec ? STATUS_CONFIG[rec.status] : null;
                return (
                  <button
                    key={dateStr}
                    className={`att-cal-day ${isWeekend ? 'att-cal-day--weekend' : ''} ${rec ? 'att-cal-day--has-record' : ''}`}
                    style={cfg ? { borderColor: cfg.color, background: cfg.bg } : {}}
                    onClick={() => openEdit(dateStr)}
                  >
                    <div className="att-cal-day-header">
                      <span className="att-cal-date">{d}</span>
                      <span className="att-cal-dow">{DAY_SHORT[dow]}</span>
                    </div>
                    {rec ? (
                      <>
                        <div
                          className="att-cal-badge"
                          style={{ color: cfg?.color || 'var(--text-muted)', fontWeight: 700 }}
                        >
                          {cfg?.title || rec.status}
                        </div>
                        {rec.hours_worked > 0 && (
                          <div className="att-cal-hours">{rec.hours_worked.toFixed(1)}h</div>
                        )}
                        {rec.ot_hours > 0 && (
                          <div className="att-cal-ot">OT +{rec.ot_hours.toFixed(1)}h</div>
                        )}
                        {rec.in_time && (
                          <div className="att-cal-time">
                            {fmt(rec.in_time)} → {fmt(rec.out_time)}
                          </div>
                        )}
                        <div className="att-cal-indicators">
                          {rec.is_manual_override && (
                            <span className="att-cal-tag att-cal-tag--manual">M</span>
                          )}
                          {rec.review_status === 'flagged' && (
                            <span className="att-cal-tag att-cal-tag--flag">!</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="att-cal-empty">+ Add</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {editCell && (
        <EditModal
          cell={editCell}
          onClose={() => setEditCell(null)}
          onSaved={() => { setEditCell(null); loadRecords(); }}
        />
      )}
    </div>
  );
}

/* ── Tab 3: Quick Entry (legacy one-off form) ───────────────────────────────── */

function QuickEntry() {
  const [employees, setEmployees] = useState([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [form, setForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    status: 'present',
    hours_worked: '',
    override_reason: 'Manual entry (device failure / correction)',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/employees?page=1&page_size=200&is_active=true')
      .then(res => {
        const list = Array.isArray(res.data) ? res.data
          : Array.isArray(res) ? res
          : [];
        setEmployees(list);
      })
      .catch(err => setError(err.message || 'Failed to load employees'))
      .finally(() => setEmpLoading(false));
  }, []);

  function getHoursHint() {
    if (!['present', 'late', 'overtime'].includes(form.status) || form.hours_worked === '') return null;
    const h = parseFloat(form.hours_worked);
    if (isNaN(h) || h <= 0) return null;
    // QuickEntry doesn't load shift hours; OT/undertime is computed server-side
    // against the employee's actual shift (8h Staff, 12h Labour).
    return {
      text: 'Hours over/under the employee’s shift are auto-counted as OT/undertime.',
      color: 'var(--text-muted)',
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    setSaving(true);
    try {
      await api.post('/attendance/manual', {
        ...form,
        hours_worked: form.hours_worked ? parseFloat(form.hours_worked) : null,
      });
      setSuccess('Attendance record saved successfully.');
      setForm(p => ({ ...p, employee_id: '', hours_worked: '' }));
    } catch (err) {
      setError(err.message || 'Failed to save record');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h2 className="card-title" style={{ marginBottom: 'var(--space-5)' }}>Quick Manual Entry</h2>
      <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-6)' }}>
        One-off correction for a single employee on a single date.
        For bulk or monthly edits, use the Grid or Calendar view.
      </p>

      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label" htmlFor="quick_emp">Employee *</label>
            <select
              id="quick_emp"
              className="form-select"
              value={form.employee_id}
              onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
              required
              disabled={empLoading}
            >
              <option value="">
                {empLoading ? 'Loading employees…' : employees.length === 0 ? 'No employees found' : 'Select employee…'}
              </option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-2 gap-4">
            <div className="form-group">
              <label className="form-label" htmlFor="quick_date">Date *</label>
              <input id="quick_date" type="date" className="form-input" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="quick_status">Status *</label>
              <select id="quick_status" className="form-select" value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))} required>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].title}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="quick_hours">Hours Worked (only for over/under time)</label>
            <input id="quick_hours" type="number" step="0.1" min="0" max="24" className="form-input"
              value={form.hours_worked} onChange={e => setForm(p => ({ ...p, hours_worked: e.target.value }))} placeholder="0.0" />
            {(() => {
              const hint = getHoursHint();
              return hint ? (
                <div style={{ fontSize: 'var(--text-xs)', color: hint.color, marginTop: 'var(--space-1)' }}>
                  {hint.text}
                </div>
              ) : null;
            })()}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="quick_reason">Reason *</label>
            <input id="quick_reason" className="form-input" value={form.override_reason}
              onChange={e => setForm(p => ({ ...p, override_reason: e.target.value }))} required minLength={3} maxLength={500} />
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-6)' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────────── */

const TABS = [
  { id: 'grid',     label: 'Monthly Grid',     icon: 'M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zM3 10h18M10 4v16M16 4v16' },
  { id: 'employee', label: 'Employee Calendar', icon: 'M8 7V3m8 4V3M3 11h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { id: 'quick',    label: 'Quick Entry',       icon: 'M12 4v16m8-8H4' },
];

export default function ManualAttendance() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState('grid');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  function handleMonthChange(newYear, newMonth) {
    setYear(newYear);
    setMonth(newMonth);
  }

  return (
    <div className="animate-in">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Manual Attendance</h1>
          <p className="page-subtitle">
            Industry-standard HR entry — monthly grid, employee calendar, and quick corrections
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="att-tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            className={`att-tab ${activeTab === tab.id ? 'att-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="att-tab-content">
        {activeTab === 'grid' && (
          <GridView year={year} month={month} onMonthChange={handleMonthChange} />
        )}
        {activeTab === 'employee' && (
          <EmployeeView year={year} month={month} onMonthChange={handleMonthChange} />
        )}
        {activeTab === 'quick' && <QuickEntry />}
      </div>
    </div>
  );
}
