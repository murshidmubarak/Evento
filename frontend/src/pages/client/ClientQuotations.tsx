import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getQuotations } from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import {
  Loader2,
  Search,
  Filter,
  FileText,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

export const ClientQuotations: React.FC = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const fetchQuotations = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await getQuotations();
      setQuotations(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load quotations. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isExpired = (validUntil?: string) => {
    if (!validUntil) return false;
    return new Date() > new Date(validUntil);
  };

  const isActionable = (quotation: Quotation) => {
    const status = quotation.status;
    return (status === 'sent' || status === 'awaiting_approval') && !isExpired(quotation.validUntil);
  };

  const getStatusBadge = (quotation: Quotation) => {
    const expired = isExpired(quotation.validUntil) && ['draft', 'sent', 'awaiting_approval'].includes(quotation.status);

    if (expired) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-md border border-gray-200">
          <Clock className="w-3.5 h-3.5 text-gray-500" />
          Expired
        </span>
      );
    }

    switch (quotation.status) {
      case 'sent':
      case 'awaiting_approval':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 text-xs font-semibold rounded-md border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Awaiting Approval
          </span>
        );
      case 'changes_requested':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-md border border-purple-200">
            <RefreshCw className="w-3.5 h-3.5 text-purple-500" />
            Changes Requested
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-md border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded-md border border-red-200">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            Rejected
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-md border border-gray-200">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            Expired
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-md border border-gray-200">
            Draft
          </span>
        );
    }
  };

  const filteredQuotations = quotations.filter((qtn) => {
    const eventTitle = qtn.eventSnapshot?.title || '';
    const eventType = qtn.eventSnapshot?.eventType || '';
    const qtnId = qtn.quotationNumber || '';

    const matchesSearch =
      qtnId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eventTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eventType.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (statusFilter) {
      if (statusFilter === 'awaiting_approval') {
        matchesStatus = (qtn.status === 'sent' || qtn.status === 'awaiting_approval') && !isExpired(qtn.validUntil);
      } else if (statusFilter === 'expired') {
        matchesStatus = qtn.status === 'expired' || isExpired(qtn.validUntil);
      } else {
        matchesStatus = qtn.status === statusFilter;
      }
    }

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);
  const paginatedQuotations = filteredQuotations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Metrics
  const awaitingCount = quotations.filter(
    (q) => (q.status === 'sent' || q.status === 'awaiting_approval') && !isExpired(q.validUntil)
  ).length;
  const acceptedCount = quotations.filter((q) => q.status === 'accepted').length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Quotations</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Review detailed event quotations, pricing, payment schedules, and accept or request changes.
          </p>
        </div>
        <Link
          to="/client/events"
          className="self-start sm:self-auto px-4 py-2 bg-white border border-gray-200 text-gray-700 text-xs sm:text-sm font-semibold rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-xs inline-flex items-center gap-2"
        >
          <Calendar className="w-4 h-4 text-gray-500" />
          My Events
        </Link>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Quotations</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{quotations.length}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Awaiting Decision</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{awaitingCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Accepted</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{acceptedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200/80 shadow-xs">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-gray-400"
            placeholder="Search by quotation number or event title..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="block w-full sm:w-48 pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="awaiting_approval">Awaiting Decision</option>
            <option value="changes_requested">Changes Requested</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col justify-center items-center min-h-[300px] bg-white rounded-xl border border-gray-200/80 shadow-xs">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-sm text-gray-500 font-medium">Loading your quotations...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 text-center">
          <p className="font-semibold text-base mb-1">Unable to Load Quotations</p>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchQuotations}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : filteredQuotations.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            {searchTerm || statusFilter ? 'No matching quotations found' : 'No Quotations Yet'}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto mb-5">
            {searchTerm || statusFilter
              ? 'Try adjusting your search terms or filters to find what you are looking for.'
              : 'When our event planning team prepares a formal quotation for your requested event, it will appear here for your review and approval.'}
          </p>
          {!searchTerm && !statusFilter && (
            <Link
              to="/client/events/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
            >
              Request an Event
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm divide-y divide-gray-200">
                <thead className="bg-gray-50/75 text-gray-600 font-semibold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Quotation #</th>
                    <th className="px-6 py-3.5">Event</th>
                    <th className="px-6 py-3.5">Event Date</th>
                    <th className="px-6 py-3.5">Quotation Amount</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Valid Until</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedQuotations.map((qtn) => {
                    const actionable = isActionable(qtn);
                    return (
                      <tr
                        key={qtn._id}
                        className="hover:bg-gray-50/60 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                              {qtn.quotationNumber}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded">
                              Rev {qtn.revision}
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-400 block mt-0.5">
                            Issued: {formatDate(qtn.createdAt)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">{qtn.eventSnapshot?.title || 'Event'}</p>
                          <span className="text-xs text-gray-500 capitalize">{qtn.eventSnapshot?.eventType || 'Standard'}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-600 text-xs">
                          {formatDate(qtn.eventSnapshot?.date)}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900">{formatCurrency(qtn.finalAmount)}</p>
                          {qtn.advanceAmount > 0 && (
                            <span className="text-[11px] text-gray-500">
                              Advance: {formatCurrency(qtn.advanceAmount)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(qtn)}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {formatDate(qtn.validUntil)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {qtn.status === 'accepted' && (
                              <Link
                                to={`/client/events/${qtn.eventId}/payment`}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                              >
                                Advance Payment
                              </Link>
                            )}
                            <Link
                              to={`/client/quotations/${qtn._id}`}
                              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                                actionable
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {actionable ? (
                                <>
                                  Review & Decide
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  View Quotation
                                </>
                              )}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Layout */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {paginatedQuotations.map((qtn) => {
              const actionable = isActionable(qtn);
              return (
                <div
                  key={qtn._id}
                  className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-sm">{qtn.quotationNumber}</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded">
                          Rev {qtn.revision}
                        </span>
                      </div>
                      <p className="font-semibold text-gray-800 text-sm mt-1">{qtn.eventSnapshot?.title || 'Event'}</p>
                      <p className="text-xs text-gray-500 capitalize">{qtn.eventSnapshot?.eventType || 'Standard'}</p>
                    </div>
                    {getStatusBadge(qtn)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-gray-100">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Total Amount</span>
                      <span className="font-bold text-gray-900 text-sm">{formatCurrency(qtn.finalAmount)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Advance Req.</span>
                      <span className="font-semibold text-indigo-600 text-sm">{formatCurrency(qtn.advanceAmount)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Event Date</span>
                      <span className="text-gray-700">{formatDate(qtn.eventSnapshot?.date)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Valid Until</span>
                      <span className="text-gray-700">{formatDate(qtn.validUntil)}</span>
                    </div>
                  </div>

                  {qtn.status === 'accepted' && (
                    <Link
                      to={`/client/events/${qtn.eventId}/payment`}
                      className="w-full py-2 px-4 mb-2 rounded-lg text-xs font-bold bg-emerald-600 text-white flex items-center justify-center gap-1.5 transition-all shadow-xs"
                    >
                      <span>Proceed to Advance Payment</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}

                  <Link
                    to={`/client/quotations/${qtn._id}`}
                    className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-xs ${
                      actionable
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {actionable ? (
                      <>
                        Review & Decide
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        View Quotation Document
                      </>
                    )}
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-gray-200/80 shadow-xs text-xs sm:text-sm">
              <span className="text-gray-500">
                Showing{' '}
                <span className="font-semibold text-gray-900">
                  {(currentPage - 1) * itemsPerPage + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-gray-900">
                  {Math.min(currentPage * itemsPerPage, filteredQuotations.length)}
                </span>{' '}
                of <span className="font-semibold text-gray-900">{filteredQuotations.length}</span> quotations
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
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
