import { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env';

/**
 * x-api-key doğrulama middleware'i.
 * SigalMedia → AudioService isteklerinde bu header zorunludur.
 *
 * Header örneği:
 *   x-api-key: sigalmedia_super_secret_key_2024
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'] as string | undefined;

  if (!key) {
    res.status(401).json({
      success: false,
      error: 'API anahtarı eksik. Header\'a x-api-key ekle.',
    });
    return;
  }

  if (key !== ENV.AUDIO_SERVICE_API_KEY) {
    res.status(403).json({
      success: false,
      error: 'Geçersiz API anahtarı.',
    });
    return;
  }

  next();
}
