import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../../config/env.js';

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

export interface MediaUploadResult {
  url: string;
  publicId: string;
  fileName: string;
  mimeType: string;
}

export class MediaService {
  async uploadImage(fileBuffer: Buffer, fileName: string, mimeType: string, folder: string = 'eventops'): Promise<MediaUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          filename_override: fileName,
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Upload to Cloudinary failed without error object'));
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            fileName: result.original_filename || fileName,
            mimeType: `${result.resource_type}/${result.format}`,
          });
        }
      );

      uploadStream.end(fileBuffer);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error(`Failed to delete image from Cloudinary [${publicId}]:`, error);
    }
  }
}
