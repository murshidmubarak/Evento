import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getQuotationById } from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import { Loader2, CheckCircle2, ArrowLeft, Eye, FileText } from 'lucide-react';

export const AdminQuotationSuccess = () => {
  const { id } = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchQuotation = async () => {
      try {
        setIsLoading(true);
        if (id) {
          const data = await getQuotationById(id);
          setQuotation(data);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load quotation details');
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotation();
  }, [id]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen md:h-[80vh]">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 shadow-sm max-w-2xl mx-auto mt-10">
        <p className="font-medium text-lg">{error || 'Quotation not found.'}</p>
        <Link to="/admin/quotations" className="mt-4 inline-flex items-center gap-2 text-red-700 hover:text-red-900 font-medium">
          <ArrowLeft className="w-4 h-4" />
          Back to Quotations
        </Link>
      </div>
    );
  }

  const isDraft = quotation.status === 'draft';

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-700 pt-10">
      <div className="text-center space-y-4">
        <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-12 h-12 text-green-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
          {quotation.revision > 1
            ? (isDraft ? `Revision ${quotation.revision} Draft Saved` : `Revision ${quotation.revision} Issued Successfully`)
            : (isDraft ? 'Quotation Draft Saved' : 'Quotation Created Successfully')}
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          {quotation.revision > 1
            ? (isDraft ? 'The revised quotation draft has been saved and can be edited or issued.' : 'The revised quotation has been sent back to the client for review.')
            : (isDraft ? 'The quotation has been saved as a draft and is ready for the next step in the existing quotation workflow.' : 'The quotation has been created successfully and is ready for the next step in the existing quotation workflow.')}
        </p>
      </div>

      <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-gray-100 shadow-xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
        <div className="p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            Quotation Summary
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
            <div>
              <p className="text-sm text-gray-500 font-medium">Quotation Number</p>
              <p className="text-lg font-semibold text-gray-900">{quotation.quotationNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Revision</p>
              <p className="text-lg font-semibold text-gray-900">{quotation.revision}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500 font-medium">Event Name</p>
              <p className="text-lg font-semibold text-gray-900">{quotation.eventSnapshot?.title || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Event Type</p>
              <p className="text-lg font-semibold text-gray-900">{quotation.eventSnapshot?.eventType || 'N/A'}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500 font-medium">Client</p>
              <p className="text-lg font-semibold text-gray-900">{quotation.eventSnapshot?.clientName || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Status</p>
              <span className={`inline-block mt-1 px-3 py-1 text-xs font-semibold rounded-full uppercase tracking-wider ${
                isDraft ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {quotation.status}
              </span>
            </div>

            <div>
              <p className="text-sm text-gray-500 font-medium">Issued Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(quotation.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Valid Until</p>
              <p className="text-lg font-semibold text-gray-900">
                {quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
              </p>
            </div>

            <div className="md:col-span-2 pt-4 mt-2 border-t border-gray-100">
              <p className="text-sm text-gray-500 font-medium">Total Amount</p>
              <p className="text-3xl font-extrabold text-indigo-600">{formatCurrency(quotation.finalAmount)}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50/80 p-6 flex flex-col sm:flex-row justify-end gap-3 border-t border-gray-100">
          <Link
            to="/admin/quotations"
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-gray-700 hover:text-gray-900 font-semibold text-xs sm:text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Quotations
          </Link>
          <Link
            to={`/admin/quotations/${quotation._id}`}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#111827] hover:bg-gray-800 text-white font-semibold text-xs sm:text-sm rounded-lg transition-colors shadow-2xs"
          >
            <Eye className="w-4 h-4" />
            View Quotation
          </Link>
        </div>
      </div>
    </div>
  );
};
