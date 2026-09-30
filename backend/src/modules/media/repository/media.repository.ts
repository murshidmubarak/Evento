import { Media, type IMedia } from '../model/media.model.js';

export class MediaRepository {
  async create(data: Partial<IMedia>): Promise<IMedia> {
    const media = new Media(data);
    return (await media.save()) as unknown as Promise<IMedia>;
  }
  
  async findByEventAndService(eventId: string, serviceId: string): Promise<IMedia[]> {
    return Media.find({ eventId, serviceId }) as unknown as Promise<IMedia[]>;
  }

  async findByEvent(eventId: string): Promise<IMedia[]> {
    return Media.find({ eventId }) as unknown as Promise<IMedia[]>;
  }
}
