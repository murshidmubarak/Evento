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
}
