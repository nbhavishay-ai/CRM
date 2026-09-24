const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const srcPath = 'C:/Users/toxic/.gemini/antigravity/brain/1ed90e8c-f40a-4f53-bea2-8b317c0eb621/.user_uploaded/media_1789329083006.jpg';
const publicDir = path.join(__dirname, '..', 'public');
const appDir = path.join(__dirname, '..', 'app');

async function main() {
  console.log('Processing ORVION luxury icons from new image...');

  if (!fs.existsSync(srcPath)) {
    console.error('Source file not found at:', srcPath);
    process.exit(1);
  }

  // 1. Save master logo
  await sharp(srcPath)
    .png()
    .toFile(path.join(publicDir, 'logo.png'));
  console.log('Created public/logo.png');

  // 2. Square icon 512x512
  await sharp(srcPath)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Created public/icon-512.png');

  // 3. Square icon 192x192
  await sharp(srcPath)
    .resize(192, 192, { fit: 'cover' })
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Created public/icon-192.png');

  // 4. Apple Touch Icon 180x180
  await sharp(srcPath)
    .resize(180, 180, { fit: 'cover' })
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Created public/apple-touch-icon.png');

  await sharp(srcPath)
    .resize(180, 180, { fit: 'cover' })
    .png()
    .toFile(path.join(appDir, 'apple-icon.png'));
  console.log('Created app/apple-icon.png');

  // 5. Favicon 48x48 png (emblem focused for crystal clarity at small size)
  const metadata = await sharp(srcPath).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // Crop the central O emblem region
  const emblemCrop = {
    left: Math.round(width * 0.15),
    top: Math.round(height * 0.08),
    width: Math.round(width * 0.70),
    height: Math.round(height * 0.70),
  };

  await sharp(srcPath)
    .extract(emblemCrop)
    .resize(48, 48)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('Created public/favicon.png (emblem optimized)');

  // 6. Favicon 32x32 png
  await sharp(srcPath)
    .extract(emblemCrop)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('Created public/favicon-32x32.png');

  // 7. Favicon in app directory (Next.js automatically serves app/icon.png or app/favicon.ico)
  await sharp(srcPath)
    .extract(emblemCrop)
    .resize(48, 48)
    .png()
    .toFile(path.join(appDir, 'icon.png'));
  console.log('Created app/icon.png');

  await sharp(srcPath)
    .extract(emblemCrop)
    .resize(48, 48)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Created public/favicon.ico');

  await sharp(srcPath)
    .extract(emblemCrop)
    .resize(48, 48)
    .png()
    .toFile(path.join(appDir, 'favicon.ico'));
  console.log('Created app/favicon.ico');

  console.log('All icons successfully generated!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
