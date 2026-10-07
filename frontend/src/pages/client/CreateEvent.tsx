import { Link } from 'react-router-dom';
import { CreateEventWizard } from '../../features/events/components/CreateEventWizard';
import { ArrowLeft } from 'lucide-react';

export const CreateEvent = () => {
  return (
    <div className="max-w-6xl mx-auto space-y-3 animate-in fade-in duration-500">
      <Link 
        to="/client/events" 
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Cancel & Back to My Events
      </Link>

      <CreateEventWizard />
    </div>
  );
};
