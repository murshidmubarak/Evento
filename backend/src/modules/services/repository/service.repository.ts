import { Service, type IService } from '../model/service.model.js';

export class ServiceRepository {
  async create(serviceData: Partial<IService>): Promise<IService> {
    const service = new Service(serviceData);
    return service.save() as unknown as Promise<IService>;
  }

  async findById(id: string): Promise<IService | null> {
    return Service.findById(id) as unknown as Promise<IService | null>;
  }

  async findByName(name: string): Promise<IService | null> {
    return Service.findOne({ name }) as unknown as Promise<IService | null>;
  }

  async findAll(filter: any = {}): Promise<IService[]> {
    return Service.find(filter).sort({ createdAt: -1 }) as unknown as Promise<IService[]>;
  }

  async update(id: string, updateData: any): Promise<IService | null> {
    return Service.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }) as unknown as Promise<IService | null>;
  }
}
