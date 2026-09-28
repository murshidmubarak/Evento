import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../features/auth/authSlice';
import { LogOut, Briefcase } from 'lucide-react';

export const ManagerLayout: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-emerald-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-emerald-800">
          EventOps Manager
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <a href="/manager" className="flex items-center gap-3 p-2 bg-emerald-800 rounded text-emerald-100">
            <Briefcase size={20} /> My Events
          </a>
        </nav>
        <div className="p-4 border-t border-emerald-800 flex items-center justify-between">
          <div className="text-sm truncate">
            {user?.name}
          </div>
          <button onClick={handleLogout} className="text-emerald-300 hover:text-white" title="Logout">
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
