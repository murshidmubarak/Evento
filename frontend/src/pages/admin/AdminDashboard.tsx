import React from 'react';
import { useAppSelector } from '../../store/hooks';

export const AdminDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Welcome Admin</h1>
      <p className="text-gray-600">Logged in as: {user?.name} ({user?.email})</p>
    </div>
  );
};
