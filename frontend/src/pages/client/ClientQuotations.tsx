import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getQuotations } from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import {
  Loader2,
  Search,
  Filter,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  ArrowRight,
  RefreshCw,
  History,
  X,
  ChevronRight,
} from 'lucide-react';

interface QuotationThread {
  quotationNumber: string;
  eventId: string;
  latestQuotation: Quotation;
  revisions: Quotation[];
  totalRevisions: number;
}

export const ClientQuotations: React.FC = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedThreadForRevisions, setSelectedThreadForRevisions] = useState<QuotationThread | null>(null);

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

  // Consolidate revisions by quotation thread (quotationNumber or eventId)
  // Each quotation thread represents a single row displaying its latest active revision.
  const threads = useMemo<QuotationThread[]>(() => {
    const map = new Map<string, Quotation[]>();
    for (const q of quotations) {
      const key = q.quotationNumber || q.eventId || q._id;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(q);
    }

    const result: QuotationThread[] = [];
    map.forEach((revs, key) => {
      // Sort descending by revision, fallback to createdAt
      revs.sort((a, b) => {
        if (b.revision !== a.revision) return b.revision - a.revision;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      const latest = revs[0];
      result.push({
        quotationNumber: latest.quotationNumber || key,
        eventId: latest.eventId,
        latestQuotation: latest,
        revisions: revs,
        totalRevisions: revs.length,
      });
    });

    // Sort threads by latest quotation creation time descending
    result.sort((a, b) => {
      return (
        new Date(b.latestQuotation.createdAt).getTime() -
        new Date(a.latestQuotation.createdAt).getTime()
      );
    });

    return result;
  }, [quotations]);

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

  // Metrics across consolidated threads
  const metrics = useMemo(() => {
    let all = threads.length;
    let awaitingApproval = 0;
    let changesRequested = 0;
    let accepted = 0;

    for (const t of threads) {
      const q = t.latestQuotation;
      const expired = isExpired(q.validUntil);
      if ((q.status === 'sent' || q.status === 'awaiting_approval') && !expired) {
        awaitingApproval++;
      } else if (q.status === 'changes_requested') {
        changesRequested++;
      } else if (q.status === 'accepted') {
        accepted++;
      }
    }

    return { all, awaitingApproval, changesRequested, accepted };
  }, [threads]);

  const getStatusBadge = (quotation: Quotation) => {
    const expired = isExpired(quotation.validUntil) && ['draft', 'sent', 'awaiting_approval'].includes(quotation.status);

    if (expired) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
          <Clock className="w-3 h-3 text-slate-500" />
          Expired
        </span>
      );
    }

    switch (quotation.status) {
      case 'sent':
      case 'awaiting_approval':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            Awaiting Decision
          </span>
        );
      case 'changes_requested':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
            <RefreshCw className="w-3 h-3 text-purple-500" />
            Changes Requested
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-500" />
            Rejected
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-500" />
            Expired
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Draft
          </span>
        );
    }
  };

  // Filter threads based on search term and status filter
  const filteredThreads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return threads.filter((thread) => {
      const qtn = thread.latestQuotation;
      const eventTitle = qtn.eventSnapshot?.title || '';
      const eventType = qtn.eventSnapshot?.eventType || '';
      const qtnId = thread.quotationNumber || '';

      const matchesSearch =
        !query ||
        qtnId.toLowerCase().includes(query) ||
        eventTitle.toLowerCase().includes(query) ||
        eventType.toLowerCase().includes(query);

      let matchesStatus = true;
      if (statusFilter) {
        if (statusFilter === 'awaiting_approval') {
          matchesStatus =
            (qtn.status === 'sent' || qtn.status === 'awaiting_approval') &&
            !isExpired(qtn.validUntil);
        } else if (statusFilter === 'expired') {
          matchesStatus = qtn.status === 'expired' || isExpired(qtn.validUntil);
        } else {
          matchesStatus = qtn.status === statusFilter;
        }
      }

      return matchesSearch && matchesStatus;
    });
  }, [threads, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredThreads.length / itemsPerPage);
  const paginatedThreads = filteredThreads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Quotations</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review formal pricing proposals, track revision updates, and approve event plans.
          </p>
        </div>
        <Link
          to="/client/events"
          className="self-start sm:self-auto px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs inline-flex items-center gap-2"
        >
          <Calendar className="w-4 h-4 text-slate-500" />
          My Events
        </Link>
      </div>

      {/* KPI Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => {
            setStatusFilter('');
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
            statusFilter === ''
              ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Quotations
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              statusFilter === '' ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {metrics.all}
          </span>
        </button>

        {metrics.awaitingApproval > 0 && (
          <button
            onClick={() => {
              setStatusFilter('awaiting_approval');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
              statusFilter === 'awaiting_approval'
                ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Awaiting Decision
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                statusFilter === 'awaiting_approval'
                  ? 'bg-amber-700 text-amber-100'
                  : 'bg-amber-200/80 text-amber-900'
              }`}
            >
              {metrics.awaitingApproval}
            </span>
          </button>
        )}

        {metrics.changesRequested > 0 && (
          <button
            onClick={() => {
              setStatusFilter('changes_requested');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
              statusFilter === 'changes_requested'
                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Changes Requested
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                statusFilter === 'changes_requested'
                  ? 'bg-purple-700 text-purple-100'
                  : 'bg-purple-200/80 text-purple-900'
              }`}
            >
              {metrics.changesRequested}
            </span>
          </button>
        )}

        <button
          onClick={() => {
            setStatusFilter('accepted');
            setCurrentPage(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
            statusFilter === 'accepted'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Accepted
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              statusFilter === 'accepted' ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {metrics.accepted}
          </span>
        </button>
      </div>

      {/* Toolbar: Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-8 py-2 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
            placeholder="Search by quotation number or event title..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Filter className="h-3.5 w-3.5" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="block w-full pl-8 pr-8 py-2 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 cursor-pointer"
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
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col justify-center items-center min-h-[340px] bg-white rounded-xl border border-slate-200 shadow-2xs">
          <Loader2 className="w-8 h-8 animate-spin text-slate-600 mb-2" />
          <p className="text-xs text-slate-500 font-medium">Loading quotations...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 text-rose-700 p-6 rounded-xl border border-rose-200 text-center shadow-2xs">
          <p className="font-semibold text-sm mb-1">Unable to Load Quotations</p>
          <p className="text-xs text-rose-600 mb-4">{error}</p>
          <button
            onClick={fetchQuotations}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : filteredThreads.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center flex flex-col items-center shadow-2xs">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3 border border-slate-200/60">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            {searchTerm || statusFilter ? 'No matching quotations found' : 'No Quotations Yet'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mb-5">
            {searchTerm || statusFilter
              ? 'Try adjusting your search terms or filters.'
              : 'When our planning team issues a formal quotation for your requested event, it will appear here for your review and approval.'}
          </p>
          {searchTerm || statusFilter ? (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
              }}
              className="text-xs font-medium text-slate-900 hover:text-slate-700 underline"
            >
              Clear all filters
            </button>
          ) : (
            <Link
              to="/client/events/create"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors shadow-2xs"
            >
              Request an Event
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3 whitespace-nowrap">Quotation</th>
                    <th className="px-3 py-3">Event Details</th>
                    <th className="px-3 py-3 whitespace-nowrap">Event Date</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Total Amount</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedThreads.map((thread) => {
                    const qtn = thread.latestQuotation;
                    const actionable = isActionable(qtn);
                    const totalRevs = thread.totalRevisions;

                    return (
                      <tr
                        key={thread.quotationNumber}
                        onClick={() => navigate(`/client/quotations/${qtn._id}`)}
                        className="group cursor-pointer hover:bg-slate-50/80 transition-colors"
                      >
                        {/* Quotation Number & Revisions Indicator */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                {thread.quotationNumber}
                              </span>
                              {totalRevs > 1 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedThreadForRevisions(thread);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer"
                                  title="Click to view all revisions in this quotation"
                                >
                                  <History className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
                                  <span>{totalRevs} revs</span>
                                </button>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                                  Rev 1
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 mt-0.5">
                              {formatDate(qtn.updatedAt || qtn.createdAt)}
                            </span>
                          </div>
                        </td>

                        {/* Event Title & Type */}
                        <td className="px-3 py-3">
                          <div className="flex flex-col max-w-[200px] lg:max-w-[260px]">
                            <span className="font-medium text-slate-900 truncate">
                              {qtn.eventSnapshot?.title || 'Event'}
                            </span>
                            <span className="text-xs text-slate-500 truncate mt-0.5 capitalize">
                              {qtn.eventSnapshot?.eventType || 'Standard'}
                            </span>
                          </div>
                        </td>

                        {/* Event Date */}
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600 text-xs font-medium">
                          {formatDate(qtn.eventSnapshot?.date)}
                        </td>

                        {/* Amount & Advance Details */}
                        <td className="px-3 py-3 whitespace-nowrap text-right">
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(qtn.finalAmount)}
                          </span>
                          {qtn.advanceAmount > 0 && (
                            <span className="block text-[11px] text-slate-500 tabular-nums mt-0.5">
                              Adv: {formatCurrency(qtn.advanceAmount)}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          {getStatusBadge(qtn)}
                        </td>

                        {/* Actions (Clicking row opens quotation) */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {qtn.status === 'accepted' && (
                              <Link
                                to={`/client/events/${qtn.eventId}/payment`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs whitespace-nowrap"
                                title="Proceed to advance payment"
                              >
                                <span>Pay Advance</span>
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            )}

                            {actionable ? (
                              <Link
                                to={`/client/quotations/${qtn._id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-2xs whitespace-nowrap"
                              >
                                <span>Review & Decide</span>
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            ) : (
                              <div className="p-1 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all inline-flex items-center">
                                <ChevronRight className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Consolidated Cards View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {paginatedThreads.map((thread) => {
              const qtn = thread.latestQuotation;
              const actionable = isActionable(qtn);
              const totalRevs = thread.totalRevisions;

              return (
                <div
                  key={thread.quotationNumber}
                  onClick={() => navigate(`/client/quotations/${qtn._id}`)}
                  className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 cursor-pointer hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {thread.quotationNumber}
                        </span>
                        {totalRevs > 1 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedThreadForRevisions(thread);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 transition-colors"
                          >
                            <History className="w-2.5 h-2.5" />
                            {totalRevs} revisions
                          </button>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded">
                            Rev 1
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-slate-800 text-sm mt-1">
                        {qtn.eventSnapshot?.title || 'Event'}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">
                        {qtn.eventSnapshot?.eventType || 'Standard'}
                      </p>
                    </div>
                    {getStatusBadge(qtn)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                        Total Amount
                      </span>
                      <span className="font-bold text-slate-900 text-sm tabular-nums">
                        {formatCurrency(qtn.finalAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                        Advance Req.
                      </span>
                      <span className="font-semibold text-slate-700 text-sm tabular-nums">
                        {formatCurrency(qtn.advanceAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                        Event Date
                      </span>
                      <span className="text-slate-700">{formatDate(qtn.eventSnapshot?.date)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                        Valid Until
                      </span>
                      <span className="text-slate-700">{formatDate(qtn.validUntil)}</span>
                    </div>
                  </div>

                  {(qtn.status === 'accepted' || actionable) && (
                    <div className="flex flex-col gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      {qtn.status === 'accepted' && (
                        <Link
                          to={`/client/events/${qtn.eventId}/payment`}
                          className="w-full py-2 px-4 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <span>Proceed to Advance Payment</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      )}

                      {actionable && (
                        <Link
                          to={`/client/quotations/${qtn._id}`}
                          className="w-full py-2 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs bg-slate-900 hover:bg-slate-800 text-white"
                        >
                          <span>Review & Decide</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-2xs text-xs sm:text-sm">
              <span className="text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-900">
                  {(currentPage - 1) * itemsPerPage + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-900">
                  {Math.min(currentPage * itemsPerPage, filteredThreads.length)}
                </span>{' '}
                of <span className="font-semibold text-slate-900">{filteredThreads.length}</span>{' '}
                quotations
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* Revision History Modal (Like Admin Page)                 */}
      {/* ======================================================== */}
      {selectedThreadForRevisions && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50/70">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600 mt-0.5">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-900">Quotation Revision History</h2>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-200 text-slate-700">
                      {selectedThreadForRevisions.totalRevisions} Revisions Total
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedThreadForRevisions.quotationNumber} •{' '}
                    {selectedThreadForRevisions.latestQuotation.eventSnapshot?.title || 'Event'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedThreadForRevisions(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: List of Revisions */}
            <div className="p-5 overflow-y-auto space-y-3.5 divide-y divide-slate-100">
              {selectedThreadForRevisions.revisions.map((rev) => {
                const isLatest = rev._id === selectedThreadForRevisions.latestQuotation._id;

                return (
                  <div
                    key={rev._id}
                    className={`pt-3.5 first:pt-0 rounded-xl p-4 transition-all border ${
                      isLatest
                        ? 'border-indigo-200 bg-indigo-50/20 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">
                          Revision {rev.revision}
                        </span>
                        {isLatest ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active / Latest
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                            Superseded
                          </span>
                        )}
                      </div>
                      <div>{getStatusBadge(rev)}</div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs py-2 bg-slate-50/80 rounded-lg px-3 border border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                          Total Amount
                        </span>
                        <span className="font-bold text-slate-900 text-sm tabular-nums">
                          {formatCurrency(rev.finalAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                          Advance Required
                        </span>
                        <span className="font-semibold text-slate-700 text-sm tabular-nums">
                          {formatCurrency(rev.advanceAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                          Date Issued
                        </span>
                        <span className="text-slate-700 font-medium">
                          {formatDate(rev.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Client Notes / Change Requests on this revision */}
                    {rev.clientNotes && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-purple-50/70 border border-purple-200/70 text-xs">
                        <span className="font-semibold text-purple-900 block mb-0.5">
                          Client Change Request Notes:
                        </span>
                        <p className="text-purple-950 whitespace-pre-wrap">{rev.clientNotes}</p>
                      </div>
                    )}

                    {/* Action link to view this revision */}
                    <div className="mt-3 flex justify-end">
                      <Link
                        to={`/client/quotations/${rev._id}`}
                        onClick={() => setSelectedThreadForRevisions(null)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 hover:border-slate-300 transition-colors shadow-2xs"
                      >
                        <span>Open Revision {rev.revision} Document</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Click any revision to inspect historical terms.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedThreadForRevisions(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
                >
                  Close
                </button>
                <Link
                  to={`/client/quotations/${selectedThreadForRevisions.latestQuotation._id}`}
                  onClick={() => setSelectedThreadForRevisions(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-2xs inline-flex items-center gap-1.5"
                >
                  <span>Open Latest Active</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
