import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation, Outlet } from 'react-router-dom';
import { getAdminSession, clearAdminSession } from '../../api/localStorageService';
import { getStoredToken } from '../../api/apiClient';
import {
  giftAppGetAdminSession,
  giftAppClearAdminSession,
  USE_BACKEND,
} from '../../api/giftAppService';

// TODO: Replace demo localStorage auth with backend-validated authentication before production.

const NAV_ITEMS = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/admin/campaigns', label: 'Campañas', icon: '📋' },
  { path: '/admin/employees', label: 'Empleados', icon: '👥' },
  { path: '/admin/beneficiaries', label: 'Beneficiarios', icon: '👶' },
  { path: '/admin/gifts', label: 'Regalos', icon: '🎁' },
  { path: '/admin/selections', label: 'Selecciones', icon: '✅' },
  { path: '/admin/support-requests', label: 'Soporte', icon: '🎫' },
];

const SUPER_ADMIN_NAV_ITEMS = [
  ...NAV_ITEMS,
  { path: '/admin/users', label: 'Usuarios', icon: '👤' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── Demo mode ──────────────────────────────────────────

  const localSession = USE_BACKEND ? null : getAdminSession();

  useEffect(() => {
    if (USE_BACKEND) return;
    if (!localSession || localSession.role !== 'ADMIN') {
      clearAdminSession();
      navigate('/admin/login', { replace: true });
    }
  }, [localSession, navigate]);

  // ── Backend mode ───────────────────────────────────────

  const [backendSession, setBackendSession] = useState(null);
  const [checking, setChecking] = useState(USE_BACKEND);
  const [sessionError, setSessionError] = useState(null);

  useEffect(() => {
    if (!USE_BACKEND) return;

    let cancelled = false;

    (async () => {
      try {
        const session = await giftAppGetAdminSession();
        if (cancelled) return;

        // No session returned — could be 401 or transient error.
        if (!session) {
          if (getStoredToken()) {
            // Non-401 error (400/500/network) — token is still valid.
            // Show retry state instead of clearing the token and logging out.
            setSessionError('No se pudo validar la sesión. Intenta recargar.');
          } else {
            // 401 or no token — apiClient already cleared it.
            navigate('/admin/login', { replace: true });
          }
          if (!cancelled) setChecking(false);
          return;
        }

        // Accept ADMIN, SUPER_ADMIN, and COMPANY_VIEWER roles
        const allowedRoles = ['ADMIN', 'SUPER_ADMIN', 'COMPANY_VIEWER'];
        if (!allowedRoles.includes(session.role)) {
          await giftAppClearAdminSession();
          navigate('/admin/login', { replace: true });
          return;
        }

        setBackendSession(session);
        setSessionError(null);
      } catch {
        if (!cancelled) {
          navigate('/admin/login', { replace: true });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  // ── Session resolution ─────────────────────────────────

  const session = USE_BACKEND ? backendSession : localSession;

  if (USE_BACKEND && checking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--gray-100)',
        }}
      >
        <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
          Verificando sesión...
        </p>
      </div>
    );
  }

  if (USE_BACKEND && sessionError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--gray-100)',
          padding: 16,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem', marginBottom: 16 }}>
            {sessionError}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Accept ADMIN, SUPER_ADMIN, and COMPANY_VIEWER roles
  const allowedRoles = ['ADMIN', 'SUPER_ADMIN', 'COMPANY_VIEWER'];
  if (!session || !allowedRoles.includes(session.role)) return null;

  // ── Role flags ─────────────────────────────────────────

  const isSuperAdmin = session.role === 'SUPER_ADMIN';
  const isCompanyViewer = session.role === 'COMPANY_VIEWER';
  const isReadOnly = isCompanyViewer;

  // Navigation items based on role
  const navItems = isSuperAdmin ? SUPER_ADMIN_NAV_ITEMS : NAV_ITEMS;

  // ── Logout ─────────────────────────────────────────────

  const handleLogout = async () => {
    if (USE_BACKEND) {
      await giftAppClearAdminSession();
    } else {
      clearAdminSession();
    }
    navigate('/admin/login');
  };

  return (
    <div className={`admin-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <button
            className="sidebar-toggle sidebar-toggle-inline"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label="Alternar menú lateral"
          >
            ☰
          </button>
          <div className="sidebar-header-info">
            <h2>GiftApp Admin</h2>
            <small>{session.name}</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={
                location.pathname === item.path ? 'active' : ''
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className="btn btn-outline btn-sm"
            style={{ width: '100%', color: 'var(--gray-300)', borderColor: 'var(--gray-600)' }}
            onClick={handleLogout}
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>
      {sidebarCollapsed && (
        <button
          className="sidebar-toggle sidebar-toggle-floating"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label="Alternar menú lateral"
        >
          ☰
        </button>
      )}
      <main className="admin-main">
        <div className="admin-mobile-header">
          <h2>GiftApp Admin</h2>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            Menú
          </button>
        </div>
        <nav className={`admin-mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={
                location.pathname === item.path ? 'active' : ''
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <button
            className="btn btn-outline btn-sm"
            style={{
              margin: '8px 16px',
              color: 'var(--gray-300)',
              borderColor: 'var(--gray-600)',
            }}
            onClick={handleLogout}
          >
            Cerrar Sesión
          </button>
        </nav>
        <Outlet context={{ isReadOnly, isSuperAdmin, isCompanyViewer, session }} />
      </main>
    </div>
  );
}
