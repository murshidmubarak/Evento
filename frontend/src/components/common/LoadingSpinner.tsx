import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-300">Loading EventOps...</p>
      </div>
    </div>
  );
};
