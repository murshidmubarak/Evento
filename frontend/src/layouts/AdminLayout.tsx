import React from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../features/auth/authSlice';
import { LogOut, LayoutDashboard, CalendarX2 } from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-slate-800">
          EventOps Admin
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/admin" className="flex items-center gap-3 p-2 bg-slate-800 rounded text-slate-200 hover:bg-slate-700 transition-colors">
            <LayoutDashboard size={20} /> Dashboard
          </Link>
          <Link to="/admin/events" className="flex items-center gap-3 p-2 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <CalendarX2 size={20} /> Requested Events
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="text-sm truncate">
            {user?.name}
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white" title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
};
