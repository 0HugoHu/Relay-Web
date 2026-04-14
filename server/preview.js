const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const DATA_DIR = process.env.DATA_DIR || '/data';

const IMAGE_TYPES = new Set(['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/tiff','image/heic','image/heif','image/avif','image/svg+xml']);
const VIDEO_TYPES = new Set(['video/mp4','video/quicktime','video/x-matroska','video/webm']);
const RAW_EXTS    = new Set(['.cr2','.cr3','.nef','.arw','.dng','.raw','.orf','.rw2']);

function getUploadDir(fileId) {
  return path.join(DATA_DIR, 'uploads', fileId);
}

async function generatePreview(fileId, mimetype, originalPath) {
  const dir = getUploadDir(fileId);
  const previewPath = path.join(dir, 'preview.jpg');
  const thumbPath   = path.join(dir, 'thumb.jpg');

  let hasPreview = false;
  let hasThumb   = false;

  try {
    const sharp = require('sharp');
    const ext = path.extname(originalPath).toLowerCase();

    if (IMAGE_TYPES.has(mimetype) && mimetype !== 'image/svg+xml') {
      // Standard image → resize
      await sharp(originalPath).rotate().resize(1200, 900, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(previewPath);
      await sharp(originalPath).rotate().resize(240, 240, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(thumbPath);
      hasPreview = true;
      hasThumb   = true;

    } else if (mimetype === 'image/svg+xml') {
      // SVG: serve as-is for preview; thumb via sharp rasterize
      await sharp(originalPath, { density: 72 }).resize(240, 240, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(thumbPath);
      hasThumb = true;

    } else if (RAW_EXTS.has(ext)) {
      // RAW: use exiftool to extract embedded JPG preview
      await extractRawPreview(originalPath, previewPath);
      if (fs.existsSync(previewPath)) {
        await sharp(previewPath).resize(240, 240, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(thumbPath);
        hasPreview = true;
        hasThumb   = true;
      }

    } else if (VIDEO_TYPES.has(mimetype)) {
      await extractVideoFrame(originalPath, thumbPath);
      if (fs.existsSync(thumbPath)) {
        await sharp(thumbPath).resize(1200, 900, { fit: 'inside' }).jpeg({ quality: 85 }).toFile(previewPath);
        hasPreview = true;
        hasThumb   = true;
      }
    }
  } catch (e) {
    console.warn(`[preview] Failed for ${fileId}:`, e.message);
  }

  return { hasPreview, hasThumb };
}

function extractRawPreview(input, output) {
  return new Promise((resolve, reject) => {
    // exiftool -b -PreviewImage extracts the embedded preview JPG
    execFile('exiftool', ['-b', '-PreviewImage', input], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err || !stdout || stdout.length === 0) {
        // Fallback: dcraw -e extracts thumbnail
        execFile('dcraw', ['-e', '-c', input], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 }, (e2, buf) => {
          if (e2 || !buf || buf.length === 0) return reject(e2 || new Error('dcraw failed'));
          fs.writeFileSync(output, buf);
          resolve();
        });
        return;
      }
      fs.writeFileSync(output, stdout, 'binary');
      resolve();
    });
  });
}

function extractVideoFrame(input, output) {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    const dir = path.dirname(output);
    const name = path.basename(output, '.jpg');
    ffmpeg(input)
      .on('error', reject)
      .on('end', resolve)
      .screenshots({
        timestamps: ['00:00:00.500'],
        filename: name + '.jpg',
        folder: dir,
        size: '640x?',
      });
  });
}

module.exports = { generatePreview, getUploadDir };
