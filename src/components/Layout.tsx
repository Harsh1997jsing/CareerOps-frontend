import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Explore/Target/Job Scraping stay mounted in App.tsx (reachable by direct
// URL) but are off the sidebar — AI Search now covers all three of their
// sources itself, picking whichever the query calls for (see
// app/services/chat_search.py's extract_intent).
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/chat', label: 'AI Search' },
];

export function Layout() {
  const { email, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">CareerOps</div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">{email}</div>
          <button type="button" onClick={logout} className="link-button">
            Log out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
