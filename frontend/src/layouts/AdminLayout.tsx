import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../features/auth/authSlice';
import { LogOut, LayoutDashboard } from 'lucide-react';

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
          <a href="/admin" className="flex items-center gap-3 p-2 bg-slate-800 rounded text-slate-200">
            <LayoutDashboard size={20} /> Dashboard
          </a>
          {/* Add more nav items here later */}
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
