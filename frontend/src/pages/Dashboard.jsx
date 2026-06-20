import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { raw } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    employeeCount: null,
    currentPeriod: null,
    exceptions: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const now = new Date();
      const [periodsRes, employeesRes, excRes] = await Promise.allSettled([
        api.get('/payroll/periods?page=1&page_size=1'),
        api.get('/employees?page=1&page_size=1&is_active=true'),
        raw.get(`/attendance/exceptions?year=${now.getFullYear()}&month=${now.getMonth() + 1}`),
      ]);

      const periods = periodsRes.status === 'fulfilled' ? (periodsRes.value.data || []) : [];
      const empTotal = employeesRes.status === 'fulfilled' ? (employeesRes.value.total || 0) : null;
      const excCount = excRes.status === 'fulfilled' ? (excRes.value.data?.flagged_count ?? 0) : null;

      setStats({
        currentPeriod: periods.length > 0 ? periods[0] : null,
        employeeCount: empTotal,
        exceptions: excCount,
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  const Skeleton = () => (
    <div className="skeleton skeleton-line" style={{ width: '60%', height: '28px' }} />
  );

  return (
    <div className="animate-in">
      {/* Welcome Banner */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <h1 className="text-3xl font-bold">{greeting}</h1>
        <p className="text-secondary" style={{ marginTop: 'var(--space-1)' }}>{dateStr}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-4 gap-6" style={{ marginBottom: 'var(--space-8)' }}>
        {/* Active Employees */}
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/employees')}>
          <div className="stat-label">Active Employees</div>
          {loading ? <Skeleton /> : (
            <>
              <div className="stat-value">{stats.employeeCount ?? '—'}</div>
              <div className="stat-sub">Click to view all</div>
            </>
          )}
        </div>

        {/* Current Period */}
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/payroll/periods')}>
          <div className="stat-label">Current Period</div>
          {loading ? <Skeleton /> : stats.currentPeriod ? (
            <>
              <div className="stat-value">
                {MONTH_NAMES[stats.currentPeriod.month - 1]} {stats.currentPeriod.year}
              </div>
              <div className="stat-sub" style={{ marginTop: 'var(--space-2)' }}>
                <StatusBadge status={stats.currentPeriod.status} />
              </div>
            </>
          ) : (
            <>
              <div className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>No Period</div>
              <div className="stat-sub">Create one to get started</div>
            </>
          )}
        </div>

        {/* Exceptions */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/attendance/exceptions')}
        >
          <div className="stat-label">Attendance Exceptions</div>
          {loading ? <Skeleton /> : (
            <>
              <div className="stat-value" style={{
                color: stats.exceptions > 0 ? 'var(--warning)' : 'var(--success)',
              }}>
                {stats.exceptions ?? '—'}
              </div>
              <div className="stat-sub">
                {stats.exceptions === 0
                  ? 'All clear'
                  : stats.exceptions > 0
                    ? 'Needs attention'
                    : ''}
              </div>
            </>
          )}
        </div>

        {/* Mill */}
        <div className="stat-card">
          <div className="stat-label">Mill</div>
          <div className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>STC Cotyarn</div>
          <div className="stat-sub">Akola, Maharashtra</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Quick Actions</h2>
        </div>
        <div className="flex gap-4 flex-wrap">
          <button className="btn btn-primary" onClick={() => navigate('/payroll/periods')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Payroll Periods
          </button>

          <button className="btn btn-secondary" onClick={() => navigate('/attendance/process')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Process Attendance
          </button>

          {stats.exceptions > 0 && (
            <button className="btn btn-danger" onClick={() => navigate('/attendance/exceptions')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {stats.exceptions} Exception{stats.exceptions !== 1 ? 's' : ''} — Resolve Now
            </button>
          )}

          <button className="btn btn-secondary" onClick={() => navigate('/employees')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            </svg>
            View Employees
          </button>

          {stats.currentPeriod?.status === 'draft' && (
            <button
              className="btn btn-success"
              onClick={() => navigate(`/payroll/periods/${stats.currentPeriod.id}`)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Run Payroll
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
