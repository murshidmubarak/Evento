import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  CreditCard,
  Receipt,
  Clock,
  Sparkles,
  ArrowRight,
  FileText,
  Lock,
} from 'lucide-react';
import { getAdvanceSummary, createPaymentOrder, verifyPayment } from '../../features/payments/paymentsApi';
import type { AdvancePaymentSummary, VerifyPaymentResponse } from '../../features/payments/payment.types';
import { formatCurrency, formatDate } from '../../utils/formatters';

const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const ClientAdvancePayment = () => {
  const { id } = useParams<{ id: string }>();

  const [summary, setSummary] = useState<AdvancePaymentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Payment form state
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [amountError, setAmountError] = useState<string>('');
  const [isInitiating, setIsInitiating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Verification result modal / banner
  const [verificationResult, setVerificationResult] = useState<VerifyPaymentResponse | null>(null);
  const [verificationError, setVerificationError] = useState<string>('');

  const fetchSummary = useCallback(async () => {
    if (!id) return;
    try {
      setError('');
      const data = await getAdvanceSummary(id);
      setSummary(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load advance payment details.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Calculated custom amount
  const parsedCustomAmount = Number(customAmountStr) || 0;
  const outstandingAmount = summary?.outstandingAdvance || 0;

  const handleCustomAmountChange = (val: string) => {
    setCustomAmountStr(val);
    setAmountError('');
    const num = Number(val);
    if (!val) {
      setAmountError('Please enter an amount.');
    } else if (isNaN(num) || num <= 0) {
      setAmountError('Payment amount must be greater than zero.');
    } else if (num > outstandingAmount) {
      setAmountError(`Amount cannot exceed the outstanding advance (${formatCurrency(outstandingAmount)}).`);
    }
  };

  const selectedPayableAmount =
    paymentMode === 'full' ? outstandingAmount : parsedCustomAmount;

  const handleInitiatePayment = async () => {
    if (!summary || !id || isInitiating || isVerifying) return;

    if (paymentMode === 'partial') {
      if (parsedCustomAmount <= 0) {
        setAmountError('Please enter a valid partial payment amount.');
        return;
      }
      if (parsedCustomAmount > outstandingAmount) {
        setAmountError(`Amount cannot exceed ${formatCurrency(outstandingAmount)}.`);
        return;
      }
    }

    try {
      setIsInitiating(true);
      setVerificationError('');
      setAmountError('');

      // Load Razorpay Checkout SDK
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setVerificationError('Razorpay payment gateway failed to load. Please check your internet connection.');
        setIsInitiating(false);
        return;
      }

      // Create Order via Backend (authoritative amount check on server)
      const orderData = await createPaymentOrder(
        id,
        paymentMode === 'partial' ? parsedCustomAmount : undefined
      );

      // Launch Razorpay Checkout Modal
      const options = {
        key: orderData.keyId,
        amount: Math.round(orderData.amount * 100),
        currency: orderData.currency || 'INR',
        name: 'Evento ERP',
        description: `Advance Payment - ${summary.quotationNumber || 'Event'}`,
        order_id: orderData.razorpayOrderId,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            setIsVerifying(true);
            const verified = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setVerificationResult(verified);
            // Refresh authoritative summary from backend
            await fetchSummary();
          } catch (verifyErr: any) {
            setVerificationError(
              verifyErr.response?.data?.message || 'Payment verification failed. Please contact support.'
            );
          } finally {
            setIsVerifying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsInitiating(false);
          },
        },
        theme: {
          color: '#4F46E5',
        },
      };

      const rzpInstance = new (window as any).Razorpay(options);
      rzpInstance.on('payment.failed', (failResponse: any) => {
        setVerificationError(failResponse.error?.description || 'Payment was declined or cancelled.');
        setIsInitiating(false);
      });
      rzpInstance.open();
    } catch (err: any) {
      setVerificationError(err.response?.data?.message || 'Failed to initiate payment. Please try again.');
    } finally {
      setIsInitiating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 space-y-4">
        <Loader2 className="w-9 h-9 animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-gray-500">Loading advance payment details...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Payment Unavailable</h2>
        <p className="text-sm text-gray-600 mb-6">{error || 'Could not find payment details for this event.'}</p>
        <Link
          to={`/client/events/${id}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Event Details
        </Link>
      </div>
    );
  }

  const isConfirmed = summary.eventStatus === 'confirmed';
  const isAdvancePaid = summary.isFullyPaid;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-500 pb-20">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/client/events/${id}`}
            className="p-2.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-xl transition-colors text-gray-500 shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Event #{summary.eventId.slice(-6)}
              </span>
              <span className="text-gray-300">•</span>
              <span className="text-xs font-medium text-indigo-600 font-mono">
                {summary.quotationNumber} (Rev {summary.quotationRevision})
              </span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
              <span>{summary.eventTitle}</span>
              {isConfirmed ? (
                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase rounded-md border border-emerald-200">
                  Confirmed
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-xs font-bold uppercase rounded-md border border-amber-200">
                  Awaiting Payment
                </span>
              )}
            </h1>
          </div>
        </div>

        {summary.quotationId && (
          <Link
            to={`/client/quotations/${summary.quotationId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0"
          >
            <FileText className="w-4 h-4 text-gray-400" />
            View Accepted Quotation
          </Link>
        )}
      </div>

      {/* Verification Success / Error Banners */}
      {verificationResult && (
        <div
          className={`p-5 rounded-2xl border ${
            verificationResult.isFullyPaid
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
              : 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
          } shadow-sm animate-in zoom-in-95 duration-300`}
        >
          <div className="flex items-start gap-3.5">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                verificationResult.isFullyPaid ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold">
                {verificationResult.isFullyPaid
                  ? 'Advance Payment Completed & Event Confirmed!'
                  : 'Partial Advance Payment Verified!'}
              </h3>
              <p className="text-xs leading-relaxed">
                {verificationResult.isFullyPaid ? (
                  <>
                    Full required advance of{' '}
                    <strong>{formatCurrency(verificationResult.requiredAdvance)}</strong> has been verified. Your
                    event status is now <strong>Confirmed</strong>.
                  </>
                ) : (
                  <>
                    Received payment of <strong>{formatCurrency(verificationResult.amountPaid)}</strong>. Total
                    verified advance paid is{' '}
                    <strong>{formatCurrency(verificationResult.totalAdvancePaid)}</strong>. Outstanding advance is{' '}
                    <strong>{formatCurrency(verificationResult.outstandingAdvance)}</strong>. Event confirmation
                    occurs once the entire advance is paid.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {verificationError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Payment Issue Encountered</p>
            <p>{verificationError}</p>
          </div>
        </div>
      )}

      {/* Authoritative Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Quotation Amount */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Quotation</span>
          <div className="text-2xl font-black text-gray-900">{formatCurrency(summary.totalQuotationAmount)}</div>
          <p className="text-[11px] text-gray-400">Total agreed event value</p>
        </div>

        {/* Required Advance */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Required Advance</span>
          <div className="text-2xl font-black text-indigo-600">{formatCurrency(summary.requiredAdvance)}</div>
          <p className="text-[11px] text-gray-400">Initial milestone required</p>
        </div>

        {/* Verified Paid Amount */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/20 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Verified Paid</span>
          <div className="text-2xl font-black text-emerald-700">{formatCurrency(summary.advancePaidAmount)}</div>
          <p className="text-[11px] text-emerald-600 font-medium">
            {summary.advancePaidAmount > 0
              ? `${Math.round((summary.advancePaidAmount / summary.requiredAdvance) * 100)}% of advance settled`
              : 'No verified payments yet'}
          </p>
        </div>

        {/* Outstanding Advance */}
        <div className="bg-white p-5 rounded-2xl border border-amber-100 bg-gradient-to-b from-white to-amber-50/20 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Outstanding Advance</span>
          <div className="text-2xl font-black text-amber-700">{formatCurrency(summary.outstandingAdvance)}</div>
          <p className="text-[11px] text-amber-600 font-medium">
            {isAdvancePaid ? 'Fully settled' : 'Payable now'}
          </p>
        </div>
      </div>

      {/* Main Grid: Payment Action & Particulars */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Advance Payment Action Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">Advance Payment</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Secure instant payment powered by Razorpay Payments
                </p>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-gray-400">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>256-Bit SSL</span>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {isAdvancePaid ? (
                /* Fully Paid State */
                <div className="p-6 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-extrabold text-emerald-900">Required Advance Is Fully Settled</h3>
                  <p className="text-xs text-emerald-700 max-w-md mx-auto leading-relaxed">
                    The advance installment of {formatCurrency(summary.requiredAdvance)} has been verified. Your
                    event is <strong>Confirmed</strong>. Remaining payments will follow the milestone schedule.
                  </p>
                  <div className="pt-2">
                    <Link
                      to={`/client/events/${id}`}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                    >
                      <span>Go to Event Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                /* Payment Options */
                <div className="space-y-6">
                  {/* Select Payment Mode */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      Payment Milestone Choice
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Option 1: Full Outstanding Advance */}
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMode('full');
                          setAmountError('');
                        }}
                        className={`p-4 rounded-xl border text-left transition-all relative ${
                          paymentMode === 'full'
                            ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600 text-indigo-900'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold">Pay Full Outstanding</span>
                          <span className="w-3.5 h-3.5 rounded-full border border-gray-300 flex items-center justify-center">
                            {paymentMode === 'full' && (
                              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                            )}
                          </span>
                        </div>
                        <div className="text-lg font-black text-gray-900">
                          {formatCurrency(summary.outstandingAdvance)}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Instantly confirms event in full
                        </p>
                      </button>

                      {/* Option 2: Custom Partial Payment */}
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMode('partial');
                          setAmountError('');
                        }}
                        className={`p-4 rounded-xl border text-left transition-all relative ${
                          paymentMode === 'partial'
                            ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600 text-indigo-900'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold">Custom Partial Payment</span>
                          <span className="w-3.5 h-3.5 rounded-full border border-gray-300 flex items-center justify-center">
                            {paymentMode === 'partial' && (
                              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                            )}
                          </span>
                        </div>
                        <div className="text-lg font-black text-gray-900">Choose Amount</div>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Pay partial advance towards milestone
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Custom Partial Amount Input */}
                  {paymentMode === 'partial' && (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                      <label className="block text-xs font-bold text-gray-700">
                        Enter Partial Payment Amount (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="1"
                          max={summary.outstandingAdvance}
                          placeholder={`Max ${summary.outstandingAdvance}`}
                          value={customAmountStr}
                          onChange={(e) => handleCustomAmountChange(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-gray-900"
                        />
                      </div>

                      {parsedCustomAmount > 0 && parsedCustomAmount <= summary.outstandingAdvance && (
                        <div className="text-[11px] text-gray-600 flex justify-between pt-1">
                          <span>Remaining balance after this payment:</span>
                          <strong className="text-gray-900 font-bold">
                            {formatCurrency(summary.outstandingAdvance - parsedCustomAmount)}
                          </strong>
                        </div>
                      )}

                      {amountError && (
                        <p className="text-xs text-rose-600 font-semibold">{amountError}</p>
                      )}
                    </div>
                  )}

                  {/* Payable Amount Summary & Pay Button */}
                  <div className="pt-2 space-y-4">
                    <div className="flex items-baseline justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <div>
                        <span className="text-xs font-semibold text-gray-500">Payable Now:</span>
                        <p className="text-[11px] text-gray-400">
                          {paymentMode === 'full' ? 'Full remaining advance' : 'Custom partial advance'}
                        </p>
                      </div>
                      <div className="text-2xl font-black text-gray-900">
                        {formatCurrency(selectedPayableAmount)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleInitiatePayment}
                      disabled={
                        isInitiating ||
                        isVerifying ||
                        selectedPayableAmount <= 0 ||
                        selectedPayableAmount > summary.outstandingAdvance ||
                        !!amountError
                      }
                      className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isInitiating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Preparing Secure Checkout...</span>
                        </>
                      ) : isVerifying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying Payment...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          <span>Pay {formatCurrency(selectedPayableAmount)} with Razorpay</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Security Footer */}
            <div className="px-6 py-3 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                RBI & PCI-DSS Compliant Gateway
              </span>
              <span>Official Tax Invoices Generated</span>
            </div>
          </div>
        </div>

        {/* Right Column: Installment Details & Payment History (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Milestone Information Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-600" />
              Advance Installment Details
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Milestone Title:</span>
                <span className="font-bold text-gray-900">
                  {summary.advanceInstallment?.title || 'Booking Advance'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Scheduled Amount:</span>
                <span className="font-bold text-gray-900">{formatCurrency(summary.requiredAdvance)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">Installment Status:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                    summary.advanceInstallment?.status === 'Paid' || isAdvancePaid
                      ? 'bg-emerald-50 text-emerald-700'
                      : summary.advancePaidAmount > 0
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {isAdvancePaid
                    ? 'Paid'
                    : summary.advancePaidAmount > 0
                    ? 'Partially Paid'
                    : summary.advanceInstallment?.status || 'Pending'}
                </span>
              </div>
              {summary.advanceInstallment?.dueDate && (
                <div className="flex justify-between py-1.5 border-b border-gray-100">
                  <span className="text-gray-500">Due Date:</span>
                  <span className="font-medium text-gray-900">
                    {formatDate(summary.advanceInstallment.dueDate)}
                  </span>
                </div>
              )}
              {summary.advanceInstallment?.expiryDate && (
                <div className="flex justify-between py-1.5">
                  <span className="text-gray-500">Expiry Date:</span>
                  <span className="font-medium text-gray-900">
                    {formatDate(summary.advanceInstallment.expiryDate)}
                  </span>
                </div>
              )}
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong>Event Confirmation Policy:</strong> The event status updates to{' '}
                <strong>Confirmed</strong> as soon as the total verified advance reaches{' '}
                <strong>{formatCurrency(summary.requiredAdvance)}</strong>.
              </span>
            </div>
          </div>

          {/* Verified Transactions Record Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-gray-900 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                Verified Payments
              </span>
              <span className="text-xs font-bold text-gray-400 font-mono">
                {summary.payments.length} record{summary.payments.length === 1 ? '' : 's'}
              </span>
            </h3>

            {summary.payments.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs">
                No verified payments recorded yet for this event.
              </div>
            ) : (
              <div className="space-y-3">
                {summary.payments.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/60 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900 text-sm">{formatCurrency(p.amount)}</span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase rounded-sm border border-emerald-200">
                        Verified
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                      <span>Txn: {p.razorpayPaymentId || p.receiptReference}</span>
                      <span>{formatDate(p.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
