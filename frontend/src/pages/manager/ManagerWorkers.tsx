import React, { useState, useEffect } from 'react';
import { workersApi, WORKER_TYPES, type WorkerType } from '../../features/workers/workersApi';
import type { User } from '../../types/auth';
import { 
  UserPlus, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Briefcase, 
  Phone, 
  Mail, 
  MapPin,
  Loader2,
  Users,
  Send
} from 'lucide-react';

export const ManagerWorkers: React.FC = () => {
  const [workers, setWorkers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Resend state
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdSuccessUser, setCreatedSuccessUser] = useState<User | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [workerType, setWorkerType] = useState<WorkerType>('Catering Boy');
  const [phone, setPhone] = useState('');

  const fetchWorkers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await workersApi.getWorkers();
      setWorkers(Array.isArray(data.workers) ? data.workers : []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load workers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  const handleOpenModal = () => {
    setName('');
    setEmail('');
    setWorkerType('Catering Boy');
    setPhone('');
    setFormError(null);
    setCreatedSuccessUser(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setFormError(null);
    setCreatedSuccessUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Full name is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setFormError('A valid email address is required.');
      return;
    }

    if (!workerType) {
      setFormError('Worker type is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const newUser = await workersApi.createWorker({
        name: name.trim(),
        email: email.trim(),
        workerType,
        phone: phone.trim() ? phone.trim() : undefined,
      });

      setCreatedSuccessUser(newUser);
      await fetchWorkers();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.[0] || 'Failed to create worker account';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvitation = async (worker: User) => {
    try {
      setResendingId(worker.id);
      setActionFeedback(null);
      const result = await workersApi.resendInvitation(worker.id);
      setActionFeedback({
        type: 'success',
        message: result.message || `Invitation resent successfully to ${worker.email}`,
      });
      await fetchWorkers();
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.response?.data?.message || `Failed to resend invitation to ${worker.email}`,
      });
    } finally {
      setResendingId(null);
    }
  };

  // Filter workers based on search, workerType, and status
  const filteredWorkers = workers.filter((worker) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = !q || (
      worker.name?.toLowerCase().includes(q) ||
      worker.email?.toLowerCase().includes(q) ||
      (worker.businessId && `W-${worker.businessId}`.toLowerCase().includes(q)) ||
      (worker.businessId && worker.businessId.toString().includes(q)) ||
      (worker.workerType && worker.workerType.toLowerCase().includes(q))
    );

    const matchesType = selectedTypeFilter === 'all' || worker.workerType === selectedTypeFilter;

    let matchesStatus = true;
    if (selectedStatusFilter === 'active') {
      matchesStatus = !!worker.isActive;
    } else if (selectedStatusFilter === 'pending') {
      matchesStatus = !worker.isActive && !worker.invitationAcceptedAt;
    }

    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Users size={26} className="text-emerald-700" />
            Manage Workers
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Onboard, invite, and oversee operational staff for the shared workforce pool.
          </p>
        </div>

        <button
          onClick={handleOpenModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors shrink-0"
        >
          <UserPlus size={18} />
          Create Worker
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800">
          <AlertCircle size={20} className="shrink-0 text-red-600" />
          <div className="flex-1 text-sm text-red-700">
            <span className="font-semibold">Error:</span> {error}
          </div>
          <button
            onClick={fetchWorkers}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
          actionFeedback.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs font-semibold opacity-75 hover:opacity-100 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, email, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 hover:bg-gray-100/60 focus:bg-white border border-gray-200 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
            />
          </div>

          {/* Worker Type Filter */}
          <div className="w-full sm:w-56">
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100/60 focus:bg-white border border-gray-200 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
            >
              <option value="all">All Worker Types</option>
              {WORKER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full sm:w-44">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100/60 focus:bg-white border border-gray-200 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending Invitation</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={fetchWorkers}
            disabled={isLoading}
            className="p-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-600 hover:text-gray-900 transition-colors"
            title="Refresh list"
            aria-label="Refresh list"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-emerald-700' : ''} />
          </button>
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
            {filteredWorkers.length} {filteredWorkers.length === 1 ? 'worker' : 'workers'}
          </span>
        </div>
      </div>

      {/* Workers Table Card */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-emerald-700 animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-600">Loading worker directory...</p>
          </div>
        ) : filteredWorkers.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mb-4">
              <Users size={28} />
            </div>
            <h3 className="text-base font-bold text-gray-900">No Workers Found</h3>
            <p className="text-sm text-gray-500 mt-1.5 mb-5">
              {searchTerm || selectedTypeFilter !== 'all' || selectedStatusFilter !== 'all'
                ? 'No workers matched your filters. Try clearing or broadening your criteria.'
                : 'No workers have been created yet. Click below to onboard your first worker.'}
            </p>
            {!searchTerm && selectedTypeFilter === 'all' && selectedStatusFilter === 'all' && (
              <button
                onClick={handleOpenModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-semibold text-sm rounded-lg transition-colors"
              >
                <UserPlus size={16} />
                Create Worker
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-200/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Worker ID</th>
                  <th className="py-3 px-4">Name & Email</th>
                  <th className="py-3 px-4">Worker Type</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Actions</th>
                  <th className="py-3 px-4">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-gray-800 text-xs">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded border border-gray-200">
                        {worker.businessId ? `W-${worker.businessId}` : '—'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                          {worker.name?.charAt(0)?.toUpperCase() || 'W'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{worker.name}</p>
                          <p className="text-xs text-gray-500">{worker.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200/80">
                        <Briefcase size={12} />
                        {worker.workerType || 'General'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 text-xs">
                      {worker.phone || <span className="text-gray-400 italic">Not provided</span>}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 text-xs">
                      {worker.location?.address ? (
                        <span className="inline-flex items-center gap-1 text-gray-700 truncate max-w-[180px]" title={worker.location.address}>
                          <MapPin size={12} className="text-gray-400 shrink-0" />
                          <span className="truncate">{worker.location.address}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Not specified</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {worker.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200/80">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : !worker.invitationAcceptedAt ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full border border-amber-200/80" title="Invitation sent, awaiting password setup">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Pending Invitation
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full border border-gray-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {!worker.isActive && !worker.invitationAcceptedAt ? (
                        <button
                          type="button"
                          onClick={() => handleResendInvitation(worker)}
                          disabled={resendingId === worker.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                          title="Resend invitation email"
                        >
                          {resendingId === worker.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin text-amber-700" />
                              <span>Resending...</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} className="text-amber-700" />
                              <span>Resend</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No action needed</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">
                      {worker.createdAt ? new Date(worker.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Worker Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {createdSuccessUser ? 'Worker Account Created' : 'Onboard New Worker'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {createdSuccessUser 
                    ? 'Invitation dispatched successfully' 
                    : 'Enter worker details to send a secure account invitation.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {createdSuccessUser ? (
                /* Success View */
                <div className="space-y-5 text-center py-2">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} />
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-gray-900">Invitation Email Dispatched!</h4>
                    <p className="text-xs text-gray-600 mt-1">
                      A pending account has been created for <span className="font-semibold text-gray-800">{createdSuccessUser.name}</span>.
                    </p>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 text-left space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-emerald-200/50">
                      <span className="text-gray-600 font-medium">Business ID:</span>
                      <span className="font-mono font-bold text-emerald-900">
                        {createdSuccessUser.businessId ? `W-${createdSuccessUser.businessId}` : 'Allocated'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-emerald-200/50">
                      <span className="text-gray-600 font-medium">Worker Type:</span>
                      <span className="font-semibold text-emerald-900">{createdSuccessUser.workerType}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-emerald-200/50">
                      <span className="text-gray-600 font-medium">Email:</span>
                      <span className="font-semibold text-emerald-900">{createdSuccessUser.email}</span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-gray-600 font-medium">Initial Status:</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Pending Invitation (24h)
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed">
                    The worker must open their invitation link, create a password, and verify their email to activate the account.
                  </p>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="w-full py-2.5 px-4 bg-gray-900 hover:bg-black text-white font-semibold rounded-lg text-sm transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* Form View */
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  {formError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {/* Notice */}
                  <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
                    <span className="font-semibold block mb-0.5">Invitation-Based Onboarding</span>
                    Workers will receive an invitation email with a secure link to set their own password and activate their account.
                  </div>

                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        required
                        placeholder="worker@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                      />
                    </div>
                  </div>

                  {/* Worker Type */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Worker Type <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select
                        required
                        value={workerType}
                        onChange={(e) => setWorkerType(e.target.value as WorkerType)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                      >
                        {WORKER_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Phone Number <span className="text-gray-400 font-normal lowercase">(optional)</span>
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="tel"
                        placeholder="e.g. +91 9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                      />
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      disabled={isSubmitting}
                      className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold rounded-lg text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg text-sm shadow-xs transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Creating & Sending Invite...
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          Send Invitation
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
