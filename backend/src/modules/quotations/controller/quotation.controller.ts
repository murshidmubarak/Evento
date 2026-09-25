import { Request, Response } from 'express';
import { QuotationService, CreateQuotationInput } from '../service/quotation.service.js';
import { catchAsync } from '../../../utils/catchAsync.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';

const quotationService = new QuotationService();

export const createQuotation = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };

  const input: CreateQuotationInput = {
    eventId: req.body.eventId,
    items: req.body.items,
    discount: req.body.discount,
    advanceAmount: req.body.advanceAmount,
    validUntil: req.body.validUntil,
    notes: req.body.notes,
    terms: req.body.terms,
  };

  const quotation = await quotationService.createQuotation(user, input);

  new ApiResponse(201, 'Quotation created successfully', quotation).send(res);
});

export const getQuotations = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  const { eventId } = req.query;

  if (eventId) {
    const quotations = await quotationService.getQuotationsByEvent(user, eventId as string);
    new ApiResponse(200, 'Quotations retrieved successfully', quotations).send(res);
  } else {
    // If Admin wants to fetch all quotations
    if (user.role === 'admin') {
      const allQuotations = await (quotationService as any).quotationRepository.findAll();
      new ApiResponse(200, 'All quotations retrieved successfully', allQuotations).send(res);
    } else {
      res.status(403).json({ success: false, message: 'Insufficient permissions to list all quotations' });
    }
  }
});

export const getQuotation = catchAsync(async (req: Request, res: Response) => {
  const user = {
    id: req.user!.id,
    role: req.user!.role,
  };
  const { id } = req.params;

  const quotation = await quotationService.getQuotationById(user, id);

  new ApiResponse(200, 'Quotation retrieved successfully', quotation).send(res);
});

export const sendQuotation = catchAsync(async (req: Request, res: Response) => {
  const user = { id: req.user!.id, role: req.user!.role };
  const quotation = await quotationService.sendQuotation(user, req.params.id);
  new ApiResponse(200, 'Quotation sent successfully', quotation).send(res);
});

export const acceptQuotation = catchAsync(async (req: Request, res: Response) => {
  const user = { id: req.user!.id, role: req.user!.role };
  const quotation = await quotationService.acceptQuotation(user, req.params.id);
  new ApiResponse(200, 'Quotation accepted successfully', quotation).send(res);
});

export const rejectQuotation = catchAsync(async (req: Request, res: Response) => {
  const user = { id: req.user!.id, role: req.user!.role };
  const quotation = await quotationService.rejectQuotation(user, req.params.id);
  new ApiResponse(200, 'Quotation rejected successfully', quotation).send(res);
});

export const requestChangesQuotation = catchAsync(async (req: Request, res: Response) => {
  const user = { id: req.user!.id, role: req.user!.role };
  const quotation = await quotationService.requestChangesQuotation(user, req.params.id);
  new ApiResponse(200, 'Changes requested successfully', quotation).send(res);
});
