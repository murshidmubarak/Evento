import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getQuotations } from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import { Loader2, Search, Filter, FileText, Eye, Edit3 } from 'lucide-react';

export const AdminQuotations = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchQuotations = async () => {
      try {
        setIsLoading(true);
        const data = await getQuotations();
        setQuotations(data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load quotations');
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotations();
  }, []);

  const filteredQuotations = quotations.filter(qtn => {
    const clientName = qtn.eventSnapshot?.clientName || '';
    const eventTitle = qtn.eventSnapshot?.title || '';
    const qtnId = qtn.quotationNumber || '';
    
    const matchesSearch = 
      qtnId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eventTitle.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter ? qtn.status === statusFilter : true;
    
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);
  const paginatedQuotations = filteredQuotations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 uppercase tracking-wider">Draft</span>;
      case 'sent':
      case 'awaiting_approval':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 uppercase tracking-wider">Awaiting Approval</span>;
      case 'changes_requested':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 uppercase tracking-wider">Changes Requested</span>;
      case 'accepted':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">Accepted</span>;
      case 'rejected':
      case 'expired':
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 uppercase tracking-wider">{status}</span>;
      default:
        return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 uppercase tracking-wider">{status}</span>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight">
            Quotations
          </h1>
          <p className="text-gray-500 mt-1">Manage and review event quotations, pricing, and quotation status.</p>
        </div>
        <Link
          to="/admin/events"
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm hover:bg-indigo-700 hover:shadow-md transition-all flex items-center gap-2"
        >
          <FileText className="w-5 h-5" />
          New Quotation
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white/50 backdrop-blur-md p-4 rounded-2xl border border-white/20 shadow-sm">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-white/50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all sm:text-sm"
            placeholder="Search by quotation ID, client, or event..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="block w-48 pl-3 pr-10 py-2.5 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-xl bg-white/50"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="awaiting_approval">Awaiting Approval</option>
            <option value="changes_requested">Changes Requested</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 shadow-sm">
          <p className="font-medium text-lg">{error}</p>
        </div>
      ) : filteredQuotations.length === 0 ? (
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-sm border border-gray-100 p-16 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 transform rotate-3">
            <FileText className="w-10 h-10 text-indigo-500" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">No quotations found</h3>
          <p className="text-gray-500 max-w-md">There are no quotations matching your current filters.</p>
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Quotation</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Issued Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Valid Until</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedQuotations.map((qtn) => (
                  <tr key={qtn._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{qtn.quotationNumber}</span>
                        <span className="text-sm text-gray-500">Revision {qtn.revision}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 truncate max-w-xs">{qtn.eventSnapshot?.title || 'Unknown Event'}</span>
                        <span className="text-sm text-gray-500">{qtn.eventSnapshot?.eventType || 'Event'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                          {(qtn.eventSnapshot?.clientName || 'C')[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{qtn.eventSnapshot?.clientName || 'Unknown Client'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-gray-900">{formatCurrency(qtn.finalAmount)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(qtn.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(qtn.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {qtn.validUntil ? new Date(qtn.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {qtn.status === 'draft' ? (
                          <Link
                            to={`/admin/events/${qtn.eventId}/quotation/create`}
                            className="text-amber-600 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
                            title="Continue Quotation"
                          >
                            <Edit3 className="w-4 h-4" />
                            <span>Continue</span>
                          </Link>
                        ) : (
                          <Link
                            to={`/admin/quotations/${qtn._id}`}
                            className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
                            title="View Quotation"
                          >
                            <Eye className="w-4 h-4" />
                            <span>View</span>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredQuotations.length)}</span> of{' '}
                <span className="font-medium">{filteredQuotations.length}</span> results
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
