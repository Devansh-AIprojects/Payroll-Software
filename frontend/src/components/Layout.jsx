import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user } = useAuth();
  const initial = user?.role?.[0]?.toUpperCase() || 'U';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <header className="topbar">
          {/* Hamburger — visible only on mobile */}
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle navigation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="topbar-title" id="page-title" />
          <div className="topbar-actions">
            <div className="topbar-user">
              <span className="text-secondary text-sm">{user?.role}</span>
              <div className="topbar-avatar">{initial}</div>
            </div>
          </div>
        </header>
        <main className="page-content animate-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
