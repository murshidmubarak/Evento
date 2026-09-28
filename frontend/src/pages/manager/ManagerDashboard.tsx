import React from 'react';
import { useAppSelector } from '../../store/hooks';

export const ManagerDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h1 className="text-2xl font-bold mb-2">Welcome Event Manager</h1>
      <p className="text-gray-600">Manager: {user?.name}</p>
    </div>
  );
};
