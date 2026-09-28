import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../features/auth/authSlice';
import { LogOut, CheckCircle } from 'lucide-react';

export const WorkerLayout: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b px-4 py-3 flex justify-between items-center">
        <div className="text-lg font-bold text-orange-600">EventOps Worker</div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">{user?.name}</span>
          <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-gray-900">
            <LogOut size={20} />
          </button>
        </div>
      </header>
      <nav className="bg-white border-b px-4 py-2 flex gap-4 overflow-x-auto">
        <a href="/worker" className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full text-sm font-medium whitespace-nowrap">
          <CheckCircle size={16} /> My Jobs
        </a>
      </nav>
      <main className="flex-1 overflow-auto p-4 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
};
