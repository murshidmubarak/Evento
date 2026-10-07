import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getQuotationById } from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import { Loader2, ArrowLeft, Printer, Download, Calculator } from 'lucide-react';

export const AdminViewQuotation = () => {
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
        setError(err.response?.data?.message || 'Failed to load quotation');
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotation();
  }, [id]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 max-w-2xl mx-auto mt-8 shadow-sm">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p>{error || 'Quotation not found'}</p>
        <Link to="/admin/quotations" className="inline-block mt-4 text-indigo-600 hover:underline font-medium">
          ← Back to Quotations
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 print:p-0 print:m-0 print:space-y-0">
      
      {/* Top Action Bar (Hidden when printing) */}
      <div className="flex items-center justify-between print:hidden mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()} className="p-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors shadow-sm">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Quotation {quotation.quotationNumber}</h1>
              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider
                ${quotation.status === 'draft' ? 'bg-gray-100 text-gray-800' : 
                  quotation.status === 'sent' ? 'bg-blue-100 text-blue-800' : 
                  quotation.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' :
                  'bg-amber-100 text-amber-800'}`}
              >
                {quotation.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-[#172542] text-white rounded-xl hover:bg-[#0f192d] transition-colors shadow-sm font-medium">
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>

      {/* A4 Document Container */}
      <div className="bg-white shadow-xl sm:rounded-md print:shadow-none print:rounded-none overflow-hidden text-[13px] font-sans text-gray-800 border border-gray-200 print:border-none relative min-h-[1056px]">
        
        {/* Top Dark Bar */}
        <div className="h-8 bg-[#172542] w-full flex items-center justify-between px-10">
          <span className="text-white/80 text-[9px] font-medium tracking-widest uppercase">EventOps ERP SYSTEM</span>
          <span className="text-white/80 text-[9px] font-medium tracking-widest uppercase">Premium Event Experience</span>
        </div>

        <div className="p-10 sm:px-14 sm:py-12">
          
          {/* Header Section */}
          <div className="flex justify-between items-start mb-8">
            <div className="flex flex-col gap-5">
              {/* Company Logo / Branding */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#172542] rounded-lg flex items-center justify-center text-white shadow-sm">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[#172542] tracking-tight leading-none mb-1">EventOps ERP</h2>
                  <p className="text-gray-400 font-medium text-[10px] tracking-widest uppercase">Event Management</p>
                </div>
              </div>
              <div className="space-y-1 text-gray-500 text-[11px]">
                <p>123 Business Avenue, Suite 100</p>
                <p>contact@eventops.example.com</p>
                <p>+1 (555) 123-4567</p>
              </div>
            </div>
            
            <div className="text-right flex flex-col items-end">
              <h1 className="text-4xl font-black text-[#172542] tracking-wide mb-6">QUOTATION</h1>
              <div className="bg-gray-50/80 rounded-md p-4 min-w-[240px]">
                <table className="w-full text-left text-[11px]">
                  <tbody>
                    <tr>
                      <td className="text-gray-500 py-1 font-medium">Quotation No:</td>
                      <td className="font-semibold text-gray-900 text-right py-1">{quotation.quotationNumber}</td>
                    </tr>
                    <tr>
                      <td className="text-gray-500 py-1 font-medium">Date:</td>
                      <td className="font-semibold text-gray-900 text-right py-1">{formatDate(quotation.createdAt)}</td>
                    </tr>
                    <tr>
                      <td className="text-gray-500 py-1 font-medium">Valid Until:</td>
                      <td className="font-semibold text-gray-900 text-right py-1">{formatDate(quotation.validUntil)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-gray-200 mb-8"></div>

          {/* Client & Event Info Section */}
          <div className="grid grid-cols-2 gap-12 mb-10">
            <div>
              <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3">Prepared For</h3>
              <p className="text-lg font-bold text-gray-900 mb-1">{quotation.eventSnapshot?.clientName || 'Client Name'}</p>
              {quotation.eventSnapshot?.location?.address ? (
                <p className="text-gray-500 leading-relaxed pr-8">
                  {quotation.eventSnapshot.location.address}
                </p>
              ) : (
                <p className="text-gray-400 italic">No address provided</p>
              )}
            </div>
            
            <div>
              <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3">Event Details</h3>
              <p className="text-lg font-bold text-gray-900 mb-3">{quotation.eventSnapshot?.title || 'Event Title'}</p>
              
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                <div className="flex">
                  <span className="text-gray-400 w-12 font-medium">Type:</span>
                  <span className="font-semibold text-gray-800">{quotation.eventSnapshot?.eventType || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-400 w-12 font-medium">Time:</span>
                  <span className="font-semibold text-gray-800">{quotation.eventSnapshot?.startTime} - {quotation.eventSnapshot?.endTime}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-400 w-12 font-medium">Date:</span>
                  <span className="font-semibold text-gray-800">{formatDate(quotation.eventSnapshot?.date)}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-400 w-12 font-medium">Guests:</span>
                  <span className="font-semibold text-gray-800">{quotation.eventSnapshot?.guestCount || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Services & Pricing Heading */}
          <h2 className="text-lg font-bold text-[#172542] mb-3">Services & pricing</h2>

          {/* Line Items Table */}
          <div className="mb-10">
            <table className="w-full text-left">
              <thead className="bg-[#172542] text-white">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest w-[55%]">Item & Description</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-center w-[15%]">Qty</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-right w-[15%]">Rate</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-right w-[15%]">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotation.items.map((item, index) => (
                  <tr key={index} className="align-top">
                    <td className="px-4 py-5">
                      <p className="font-semibold text-gray-900 text-[14px] mb-1">{item.name}</p>
                      {item.requirements && (
                        <p className="text-gray-500 mb-4">{item.requirements}</p>
                      )}
                      
                      {/* Nested Detailed Content */}
                      {item.detailedContent && item.detailedContent.length > 0 && (
                        <div className="bg-gray-50/80 rounded border border-gray-100 p-4 mt-2">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3">Included Services</p>
                          
                          {/* We try to format it in columns if there are multiple sections */}
                          <div className={`grid gap-4 ${item.detailedContent.length >= 3 ? 'grid-cols-3' : item.detailedContent.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {item.detailedContent.map((section, sidx) => (
                              <div key={sidx}>
                                <p className="font-semibold text-gray-800 text-[11px] mb-2">{section.sectionName}</p>
                                <ul className="space-y-1 ml-3 list-[circle] text-gray-500 text-[11px] marker:text-gray-300">
                                  {section.items.map((listItem, lidx) => (
                                    <li key={lidx} className="pl-1">{listItem}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-5 text-center font-medium text-gray-700">{item.quantity}</td>
                    <td className="px-4 py-5 text-right font-medium text-gray-700">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-4 py-5 text-right font-semibold text-gray-900">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Section */}
          <div className="flex justify-between items-start gap-10">
            
            {/* Left Side: Payment Schedule & Terms */}
            <div className="flex-1 space-y-8">
              {quotation.paymentPlan && quotation.paymentPlan.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Payment Schedule</h3>
                  <div className="space-y-4">
                    {quotation.paymentPlan.map((plan, idx) => (
                      <div key={idx} className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-900">{plan.title}</p>
                          {plan.dueDateDescription && <p className="text-gray-500 text-[11px] mt-0.5">{plan.dueDateDescription}</p>}
                        </div>
                        <p className="font-bold text-gray-900">{formatCurrency(plan.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {quotation.structuredTerms && quotation.structuredTerms.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 mt-8">Terms & Conditions</h3>
                  <ul className="list-[circle] marker:text-gray-300 space-y-2 ml-4">
                    {quotation.structuredTerms.map((term, idx) => (
                      <li key={idx} className="text-gray-600 text-[11px] pl-1">
                        {term.title} {term.content && `- ${term.content}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right Side: Totals Summary */}
            <div className="w-[340px] shrink-0">
              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <div className="p-5">
                  <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Quotation Summary</h3>
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="py-2 text-gray-500 font-medium">Subtotal</td>
                        <td className="py-2 text-right font-bold text-gray-900">{formatCurrency(quotation.subtotal)}</td>
                      </tr>
                      {quotation.discount > 0 && (
                        <tr>
                          <td className="py-2 text-gray-500 font-medium">Discount</td>
                          <td className="py-2 text-right font-bold text-red-600">-{formatCurrency(quotation.discount)}</td>
                        </tr>
                      )}
                      {quotation.discount > 0 && (
                        <tr>
                          <td className="py-2 text-gray-500 font-medium">Taxable Amount</td>
                          <td className="py-2 text-right font-bold text-gray-900">{formatCurrency(quotation.taxableAmount)}</td>
                        </tr>
                      )}
                      {quotation.tax.taxType !== 'none' && (
                        <tr>
                          <td className="py-2 text-gray-500 font-medium flex items-center gap-1">
                            Tax <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[9px] font-bold">{quotation.tax.taxType.toUpperCase()} @ {quotation.tax.taxRate}%</span>
                          </td>
                          <td className="py-2 text-right font-bold text-gray-900">{formatCurrency(quotation.tax.taxAmount)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                <div className="bg-[#172542] text-white p-5 m-1 rounded-md flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1">Total Amount</span>
                  <span className="text-3xl font-bold tracking-tight">{formatCurrency(quotation.finalAmount)}</span>
                </div>
              </div>
              
              {/* Authorized Signature */}
              <div className="mt-16 text-center">
                <p className="text-gray-400 text-[10px] mb-1">Authorized Signatory</p>
                <p className="font-bold text-[#172542] uppercase text-[11px] tracking-wider">EventOps Management</p>
              </div>
            </div>
          </div>
          
        </div>
        
        {/* Footer Note */}
        <div className="absolute bottom-6 w-full text-center">
          <p className="text-[10px] text-gray-400">
            Thank you for choosing EventOps ERP. For any inquiries, reach out at: support@eventops.example.com
          </p>
        </div>

      </div>
    </div>
  );
};
