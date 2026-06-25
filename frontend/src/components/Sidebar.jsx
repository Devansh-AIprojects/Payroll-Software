import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/roles';

export default function Sidebar({ isOpen, onClose }) {
  const { logout, user } = useAuth();
  const location = useLocation();

  const isActive = (prefix) =>
    location.pathname === prefix || location.pathname.startsWith(prefix + '/');

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar${isOpen ? ' sidebar-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <h1>STC Cotyarn</h1>
          <span>Payroll System</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {/* Dashboard */}
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            Dashboard
          </NavLink>

          {/* Employees */}
          <div className="nav-section">
            <span className="nav-section-label">Workforce</span>
          </div>

          <NavLink
            to="/employees"
            className={() => `nav-link ${isActive('/employees') ? 'active' : ''}`}
            onClick={onClose}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Employees
          </NavLink>

          {/* Attendance */}
          <div className="nav-section">
            <span className="nav-section-label">Attendance</span>
          </div>

          <NavLink
            to="/attendance/process"
            className={() => `nav-link ${isActive('/attendance/process') ? 'active' : ''}`}
            onClick={onClose}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Processing
          </NavLink>

          <NavLink
            to="/attendance/exceptions"
            className={() => `nav-link ${isActive('/attendance/exceptions') ? 'active' : ''}`}
            onClick={onClose}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Exceptions
          </NavLink>

          <NavLink
            to="/attendance/leave"
            className={() => `nav-link ${isActive('/attendance/leave') ? 'active' : ''}`}
            onClick={onClose}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="14" x2="8" y2="14" /><line x1="12" y1="14" x2="12" y2="14" /><line x1="16" y1="14" x2="16" y2="14" />
            </svg>
            Leaves
          </NavLink>

          <NavLink
            to="/attendance/manual"
            className={() => `nav-link ${isActive('/attendance/manual') ? 'active' : ''}`}
            onClick={onClose}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            Manual Entry
          </NavLink>

          {/* Payroll */}
          <div className="nav-section">
            <span className="nav-section-label">Payroll</span>
          </div>

          <NavLink
            to="/payroll/periods"
            className={() => `nav-link ${isActive('/payroll') ? 'active' : ''}`}
            onClick={onClose}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Periods
          </NavLink>

          {/* Config */}
          <div className="nav-section">
            <span className="nav-section-label">System</span>
          </div>

          <NavLink
            to="/config"
            className={() => `nav-link ${isActive('/config') ? 'active' : ''}`}
            onClick={onClose}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
            </svg>
            Config
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 700, fontSize: 'var(--text-xs)', flexShrink: 0 }}>
              {(user?.name?.[0] || user?.role?.[0] || 'U').toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || roleLabel(user?.role)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{roleLabel(user?.role)}</div>
            </div>
          </div>
          <button className="btn btn-ghost w-full" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
