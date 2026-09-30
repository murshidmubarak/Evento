import { EventRepository } from '../repository/event.repository.js';
import { MediaService, type MediaUploadResult } from '../../media/service/media.service.js';
import { MediaRepository } from '../../media/repository/media.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import type { Types } from 'mongoose';

export class EventMediaService {
  private eventRepository: EventRepository;
  private mediaService: MediaService;
  private mediaRepository: MediaRepository;

  constructor() {
    this.eventRepository = new EventRepository();
    this.mediaService = new MediaService();
    this.mediaRepository = new MediaRepository();
  }

  async uploadReferenceImages(userId: string, eventId: string, serviceId: string, files: Express.Multer.File[]): Promise<MediaUploadResult[]> {
    if (!serviceId) {
      throw ApiError.badRequest('serviceId is required');
    }

    if (!files || files.length === 0) {
      throw ApiError.badRequest('No files provided');
    }

    const event = await this.eventRepository.findById(eventId);
    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (event.clientId.toString() !== userId) {
      throw ApiError.forbidden('You do not have permission to modify this event');
    }

    // Find the selected service
    const selectedServiceIndex = event.selectedServices.findIndex(
      (s) => (s.serviceId && (s.serviceId as any)._id && (s.serviceId as any)._id.toString() === serviceId) || 
             (s.serviceId && s.serviceId.toString() === serviceId)
    );

    if (selectedServiceIndex === -1) {
      throw ApiError.badRequest(`Service ID ${serviceId} is not selected for this event`);
    }

    const uploadedImages: MediaUploadResult[] = [];
    const publicIdsToCleanup: string[] = [];

    try {
      // Upload all files to Cloudinary and save to Media collection
      for (const file of files) {
        const result = await this.mediaService.uploadImage(file.buffer, file.originalname, file.mimetype, `events/${eventId}/references`);
        
        await this.mediaRepository.create({
          eventId: eventId as any,
          serviceId: serviceId as any,
          url: result.url,
          publicId: result.publicId,
          fileName: result.fileName,
          mimeType: result.mimeType,
        });

        uploadedImages.push(result);
        publicIdsToCleanup.push(result.publicId);
      }

      return uploadedImages;
    } catch (error) {
      // Cleanup uploaded images if DB save or any upload fails
      for (const publicId of publicIdsToCleanup) {
        await this.mediaService.deleteImage(publicId);
      }
      throw error;
    }
  }
}
