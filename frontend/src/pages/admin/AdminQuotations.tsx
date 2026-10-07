import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getQuotations } from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import { Loader2, Search, Filter, FileText, Eye, Edit3, Calculator } from 'lucide-react';

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
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-md border border-gray-200/50">Draft</span>;
      case 'sent':
      case 'awaiting_approval':
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-md border border-blue-200/50">Awaiting Approval</span>;
      case 'changes_requested':
        return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold uppercase tracking-wider rounded-md border border-purple-200/50">Changes Requested</span>;
      case 'accepted':
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider rounded-md border border-emerald-200/50">Accepted</span>;
      case 'rejected':
      case 'expired':
        return <span className="px-2.5 py-1 bg-red-50 text-red-700 text-xs font-bold uppercase tracking-wider rounded-md border border-red-200/50">{status}</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-md border border-gray-200/50">{status}</span>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
            Quotations
          </h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Manage and review event quotations, pricing, and approvals.</p>
        </div>
        <Link
          to="/admin/events"
          className="bg-[#111827] text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm"
        >
          <FileText className="w-4 h-4" />
          Draft from Event
        </Link>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-gray-400"
            placeholder="Search by ID, client or event..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="block w-full sm:w-48 pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="awaiting_approval">Awaiting Approval</option>
            <option value="accepted">Accepted</option>
            <option value="changes_requested">Changes Requested</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Main Table Area */}
      {isLoading ? (
        <div className="flex justify-center items-center min-h-[400px] bg-white rounded-xl border border-gray-200 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 shadow-sm">
          <p className="font-medium text-sm">{error}</p>
        </div>
      ) : filteredQuotations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center flex flex-col items-center shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
            <Calculator className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No quotations found</h3>
          <p className="text-sm text-gray-500 max-w-md">There are no quotations matching your current search criteria.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Quotation ID & Date</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Client & Event</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Amount</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedQuotations.map((qtn) => (
                  <tr key={qtn._id} className="hover:bg-gray-50/50 transition-colors group">

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900 text-sm mb-1">{qtn.quotationNumber}</span>
                        <span className="text-xs text-gray-500 font-medium">
                          {new Date(qtn.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900 text-sm mb-1 truncate max-w-[200px] sm:max-w-[300px]">
                          {qtn.eventSnapshot?.clientName || 'Unknown Client'}
                        </span>
                        <span className="text-xs text-gray-500 truncate max-w-[200px] sm:max-w-[300px]">
                          {qtn.eventSnapshot?.title || 'Unknown Event'}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="font-bold text-gray-900">{formatCurrency(qtn.finalAmount)}</span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(qtn.status)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {qtn.status === 'draft' ? (
                          <Link
                            to={`/admin/events/${qtn.eventId}/quotation/create`}
                            className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                            title="Continue Quotation"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Link>
                        ) : (
                          <Link
                            to={`/admin/quotations/${qtn._id}`}
                            className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                            title="View Quotation"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between sm:justify-end gap-4">
              <span className="text-sm text-gray-500">
                Page <span className="font-semibold text-gray-900">{currentPage}</span> of <span className="font-semibold text-gray-900">{totalPages}</span>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
