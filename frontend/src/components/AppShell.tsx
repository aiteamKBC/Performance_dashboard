import { useLocation, Link } from "react-router-dom";

interface AppShellProps {
  children: React.ReactNode;
  topbarLeft?: React.ReactNode;
  topbarRight?: React.ReactNode;
}

const NAV_ITEMS = [
  { label: "Coaches Performance", to: "/", icon: "ri-time-line" },
  { label: "Coaches Attendence", to: "/coach-summary", icon: "ri-bar-chart-grouped-line" },
];

export default function AppShell({ children, topbarLeft, topbarRight }: AppShellProps) {
  const location = useLocation();

  return (
    <div className="app-shell">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-header">
          <img
            src="https://tutordashboard.kentbusinesscollege.net/assets/Kent-Business-College-COzDF_vQ.webp"
            alt="Kent Business College"
            style={{ height: 48, width: "auto", maxWidth: "100%", objectFit: "contain", display: "block" }}
          />
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Menu</span>
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-item${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <i className={`${item.icon}`} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span>© 2025 Kent Business College</span>
        </div>
      </aside>

      {/* RIGHT PANEL */}
      <div className="main-panel">
        {/* TOP BAR */}
        <header className="topbar" role="banner">
          <div className="topbar-left">
            {topbarLeft}
          </div>
          <div className="topbar-right">
            {topbarRight}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="page-content themed-scrollbar" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
