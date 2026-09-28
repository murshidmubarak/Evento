import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../features/auth/authSlice';
import { LogOut, Home } from 'lucide-react';

export const ClientLayout: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
        <div className="text-xl font-bold text-blue-600">EventOps Portal</div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Welcome, {user?.name}</span>
          <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 bg-white border-r flex flex-col p-4 space-y-2">
           <a href="/client" className="flex items-center gap-3 p-2 bg-blue-50 text-blue-700 rounded-md">
            <Home size={20} /> Dashboard
          </a>
        </aside>
        <main className="flex-1 overflow-auto p-8 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
