import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../features/auth/authSlice';
import { 
  LogOut, 
  LayoutDashboard, 
  Menu, 
  X, 
  ShieldCheck, 
  Briefcase,
  MapPin
} from 'lucide-react';

export const WorkerLayout: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAppSelector((state) => state.auth);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/worker') {
      return location.pathname === '/worker';
    }
    return location.pathname === path || (path !== '/worker' && location.pathname.startsWith(path));
  };

  const navLinks = [
    { to: '/worker', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/worker/location', label: 'My Location', icon: MapPin },
  ];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-50 overflow-hidden">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0 z-30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 -ml-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center">
            <span className="text-base font-black text-gray-900 tracking-tight">EventOps</span>
            <span className="ml-1.5 text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider border border-amber-200/60">
              Worker
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() ?? 'W'}
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* Backdrop for Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: persistent on desktop, slide-over drawer on mobile */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ease-in-out shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="px-6 py-5 border-b border-gray-100 hidden md:flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-base font-black text-gray-900 tracking-tight">EventOps</span>
            <span className="ml-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 border border-amber-200/80">
              <ShieldCheck size={11} />
              Worker
            </span>
          </div>
        </div>

        {/* Mobile drawer header */}
        <div className="px-5 py-4 border-b border-gray-100 flex md:hidden items-center justify-between">
          <div className="flex items-center">
            <span className="text-base font-black text-gray-900 tracking-tight">EventOps</span>
            <span className="ml-1.5 text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
              Worker
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navLinks.map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon size={18} className={active ? 'text-amber-700' : 'text-gray-400'} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User Profile Pill at bottom of sidebar */}
        <div className="px-4 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() ?? 'W'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
              <p className="text-[11px] text-gray-400 truncate flex items-center gap-1">
                <Briefcase size={10} className="text-gray-400" />
                {user?.businessId ? `W-${user.businessId}` : user?.workerType || user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-1"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto min-w-0 p-4 sm:p-6 lg:p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
