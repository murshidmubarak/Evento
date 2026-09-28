import React from 'react';
import { useAppSelector } from '../../store/hooks';

export const WorkerDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border">
      <h1 className="text-xl font-bold mb-2">Welcome Worker</h1>
      <p className="text-gray-600">{user?.name} - {user?.workerType}</p>
    </div>
  );
};
