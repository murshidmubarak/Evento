import React from 'react';
import { useAppSelector } from '../../store/hooks';

export const ClientDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h1 className="text-2xl font-bold mb-2">Welcome Client</h1>
      <p className="text-gray-600">Hello {user?.name}, manage your events here.</p>
    </div>
  );
};
