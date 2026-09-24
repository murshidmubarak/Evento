import type { Response } from 'express';

/**
 * ApiResponse — standard success response shape.
 *
 * Success format:
 * {
 *   "success": true,
 *   "message": "...",
 *   "data": {}
 * }
 */
export class ApiResponse<T = unknown> {
  public readonly success: boolean;
  public readonly message: string;
  public readonly data: T;

  constructor(
    public readonly statusCode: number,
    message: string,
    data: T,
  ) {
    this.success = statusCode < 400;
    this.message = message;
    this.data = data;
  }

  /**
   * Sends the response via Express's `res` object.
   */
  send(res: Response): Response {
    return res.status(this.statusCode).json({
      success: this.success,
      message: this.message,
      data: this.data,
    });
  }
}
