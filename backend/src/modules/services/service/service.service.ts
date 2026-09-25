import { ServiceRepository } from '../repository/service.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import type { IService, PricingType } from '../model/service.model.js';

export class ServiceService {
  private repository: ServiceRepository;

  constructor() {
    this.repository = new ServiceRepository();
  }

  async createService(data: { name: string; description: string; pricingType: PricingType; basePrice: number }): Promise<IService> {
    const existingService = await this.repository.findByName(data.name);
    if (existingService) {
      throw ApiError.badRequest('Service with this name already exists');
    }

    return this.repository.create({
      ...data,
      isActive: true,
    });
  }

  async updateService(id: string, data: Partial<Pick<IService, 'name' | 'description' | 'pricingType' | 'basePrice'>>): Promise<IService> {
    const service = await this.repository.findById(id);
    if (!service) {
      throw ApiError.notFound('Service not found');
    }

    if (data.name && data.name !== service.name) {
      const existingService = await this.repository.findByName(data.name);
      if (existingService) {
        throw ApiError.badRequest('Service with this name already exists');
      }
    }

    // Only allow updating catalog fields, no Mass Assignment of other fields like isActive
    const updateData: Partial<IService> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.pricingType !== undefined) updateData.pricingType = data.pricingType;
    if (data.basePrice !== undefined) updateData.basePrice = data.basePrice;

    const updatedService = await this.repository.update(id, updateData);
    if (!updatedService) {
      throw ApiError.notFound('Service not found after update');
    }
    
    return updatedService;
  }

  async updateServiceStatus(id: string, isActive: boolean): Promise<IService> {
    const service = await this.repository.findById(id);
    if (!service) {
      throw ApiError.notFound('Service not found');
    }

    const updatedService = await this.repository.update(id, { isActive });
    if (!updatedService) {
      throw ApiError.notFound('Service not found after update');
    }

    return updatedService;
  }

  async getServices(filter: Partial<Pick<IService, 'isActive'>> = {}): Promise<IService[]> {
    return this.repository.findAll(filter);
  }

  async getServiceById(id: string): Promise<IService> {
    const service = await this.repository.findById(id);
    if (!service) {
      throw ApiError.notFound('Service not found');
    }
    return service;
  }

  async calculatePrice(id: string, data: { guestCount?: number }): Promise<{
    serviceId: string;
    serviceName: string;
    pricingType: PricingType;
    basePrice: number;
    quantity: number | null;
    amount: number;
  }> {
    const service = await this.repository.findById(id);
    if (!service) {
      throw ApiError.notFound('Service not found');
    }

    if (!service.isActive) {
      throw ApiError.badRequest('Cannot calculate price for an inactive service');
    }

    let amount = 0;
    let quantity: number | null = null;

    if (service.pricingType === 'per_guest') {
      if (data.guestCount === undefined || data.guestCount === null) {
        throw ApiError.badRequest('guestCount is required for per_guest pricing');
      }
      quantity = data.guestCount;
      // Money Representation: Use standard JS Numbers but enforce fixed 2-decimal rounding to maintain consistent precision.
      amount = Math.round(service.basePrice * quantity * 100) / 100;
    } else if (service.pricingType === 'per_event') {
      amount = Math.round(service.basePrice * 100) / 100;
    } else if (service.pricingType === 'package') {
      amount = Math.round(service.basePrice * 100) / 100;
    }

    return {
      serviceId: service._id.toString(),
      serviceName: service.name,
      pricingType: service.pricingType,
      basePrice: service.basePrice,
      quantity,
      amount,
    };
  }
}
