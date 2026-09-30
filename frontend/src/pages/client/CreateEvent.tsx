import { Link } from 'react-router-dom';
import { CreateEventWizard } from '../../features/events/components/CreateEventWizard';
import { ArrowLeft } from 'lucide-react';

export const CreateEvent = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link 
          to="/client/events" 
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel & Return
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Request New Event</h1>
        <p className="text-gray-500 mt-1">Complete the details below to request a new event quotation.</p>
      </div>

      <CreateEventWizard />
    </div>
  );
};
