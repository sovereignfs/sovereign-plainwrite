import { describe, expect, it } from 'vitest';
import {
  buildImageReferenceUrl,
  buildImageUploadFilePath,
  MAX_IMAGE_UPLOAD_BYTES,
  slugifyImageBasename,
  validateProjectImage,
} from '../image-rules';

describe('validateProjectImage', () => {
  it('accepts supported image types under the size limit', () => {
    expect(validateProjectImage('image/png', 1024)).toEqual({ ok: true, extension: 'png' });
    expect(validateProjectImage('image/jpeg', 1024)).toEqual({ ok: true, extension: 'jpg' });
    expect(validateProjectImage('image/webp', 1024)).toEqual({ ok: true, extension: 'webp' });
    expect(validateProjectImage('image/gif', 1024)).toEqual({ ok: true, extension: 'gif' });
  });

  it('rejects an unsupported content type', () => {
    expect(validateProjectImage('image/svg+xml', 1024)).toEqual({
      ok: false,
      error: 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.',
    });
    expect(validateProjectImage(null, 1024)).toEqual({
      ok: false,
      error: 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.',
    });
  });

  it('rejects an empty file', () => {
    expect(validateProjectImage('image/png', 0)).toEqual({ ok: false, error: 'Empty file.' });
  });

  it('rejects a file over the size limit', () => {
    expect(validateProjectImage('image/png', MAX_IMAGE_UPLOAD_BYTES + 1)).toEqual({
      ok: false,
      error: 'Image is larger than 5 MB.',
    });
  });

  it('accepts a file exactly at the size limit', () => {
    expect(validateProjectImage('image/png', MAX_IMAGE_UPLOAD_BYTES)).toEqual({
      ok: true,
      extension: 'png',
    });
  });
});

describe('slugifyImageBasename', () => {
  it('slugifies a readable filename and strips the extension', () => {
    expect(slugifyImageBasename('My Vacation Photo.png')).toBe('my-vacation-photo');
  });

  it('collapses non-alphanumeric runs and trims leading/trailing dashes', () => {
    expect(slugifyImageBasename('__weird!!file (1).jpeg')).toBe('weird-file-1');
  });

  it('falls back to "image" for a name with nothing slug-worthy', () => {
    expect(slugifyImageBasename('.png')).toBe('image');
    expect(slugifyImageBasename('###.jpg')).toBe('image');
  });
});

describe('buildImageUploadFilePath', () => {
  it('joins the upload path, slugified basename, and unique suffix', () => {
    expect(buildImageUploadFilePath('public/images', 'Sunset.png', 'png', 'a1b2c3d4')).toBe(
      'public/images/sunset-a1b2c3d4.png',
    );
  });

  it('trims slashes from the upload path', () => {
    expect(buildImageUploadFilePath('/public/images/', 'sunset.png', 'png', 'a1b2c3d4')).toBe(
      'public/images/sunset-a1b2c3d4.png',
    );
  });
});

describe('buildImageReferenceUrl', () => {
  it('strips a leading public/ prefix and adds a leading slash', () => {
    expect(buildImageReferenceUrl('public/images/sunset-a1b2c3d4.png')).toBe(
      '/images/sunset-a1b2c3d4.png',
    );
  });

  it('adds a leading slash without stripping a non-public/ prefix', () => {
    expect(buildImageReferenceUrl('assets/images/sunset-a1b2c3d4.png')).toBe(
      '/assets/images/sunset-a1b2c3d4.png',
    );
  });
});
