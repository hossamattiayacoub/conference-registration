import { ImageUploadPayload } from '../../core/models/registration.model';

/**
 * Reads a File and resolves an ImageUploadPayload ready to send to the
 * Google Apps Script backend (raw Base64 content, no data-URL prefix).
 */
export function fileToUploadPayload(file: File): Promise<ImageUploadPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.substring(result.indexOf(',') + 1);
      resolve({
        fileName: file.name,
        mimeType: file.type,
        base64Data
      });
    };
    reader.onerror = () => reject(new Error('تعذرت قراءة الملف'));
    reader.readAsDataURL(file);
  });
}
