const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgFiles = {
  'app-icon': path.join(__dirname, '../assets/icons/app-icon.svg'),
  'tray-icon': path.join(__dirname, '../assets/icons/tray-icon.svg'),
  'tray-icon-active': path.join(__dirname, '../assets/icons/tray-icon-active.svg')
};

const pngSizes = {
  'app-icon': [16, 32, 48, 64, 128, 256],
  'tray-icon': [16, 32, 48],
  'tray-icon-active': [16, 32, 48]
};

async function convertSvgToPng(svgPath, outputPath, size) {
  await sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(outputPath);
  console.log(`Created ${outputPath} (${size}x${size})`);
}

async function createIco(pngPaths, icoPath) {
  const images = await Promise.all(
    pngPaths.map(async (pngPath) => {
      const size = parseInt(path.basename(pngPath).match(/(\d+)/)[1]);
      const buffer = await sharp(pngPath).toBuffer();
      if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
        throw new Error(`Invalid PNG format for ${pngPath}`);
      }
      return { size, buffer };
    })
  );

  images.sort((a, b) => b.size - a.size);

  const icoBuffer = createIcoBuffer(images);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Created ICO: ${icoPath}`);

  const verified = verifyIcoFile(icoPath);
  if (!verified) {
    throw new Error(`ICO file verification failed: ${icoPath}`);
  }
  console.log(`Verified ICO: ${icoPath}`);
}

function verifyIcoFile(icoPath) {
  const buffer = fs.readFileSync(icoPath);
  if (buffer.length < 6) return false;
  if (buffer[0] !== 0 || buffer[1] !== 0) return false;
  if (buffer[2] !== 1 || buffer[3] !== 0) return false;
  const numImages = buffer.readUInt16LE(4);
  if (numImages === 0) return false;
  const dirEntrySize = 16;
  if (buffer.length < 6 + (dirEntrySize * numImages)) return false;
  return true;
}

function createIcoBuffer(images) {
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;

  let dataOffset = headerSize + (dirEntrySize * numImages);
  const dirEntries = [];
  const imageData = [];

  for (const { size, buffer } of images) {
    const dirEntry = Buffer.alloc(16);
    dirEntry.writeUInt8(size >= 256 ? 0 : size, 0);
    dirEntry.writeUInt8(size >= 256 ? 0 : size, 1);
    dirEntry.writeUInt8(0, 2);
    dirEntry.writeUInt8(0, 3);
    dirEntry.writeUInt16LE(1, 4);
    dirEntry.writeUInt16LE(32, 6);
    dirEntry.writeUInt32LE(buffer.length, 8);
    dirEntry.writeUInt32LE(dataOffset, 12);

    dirEntries.push(dirEntry);
    imageData.push(buffer);
    dataOffset += buffer.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(numImages, 4);

  return Buffer.concat([header, ...dirEntries, ...imageData]);
}

async function main() {
  console.log('Starting icon conversion...\n');

  for (const [name, svgPath] of Object.entries(svgFiles)) {
    const baseOutputDir = path.join(__dirname, '../assets/icons');

    const sizes = pngSizes[name];
    const pngPaths = [];

    for (const size of sizes) {
      const pngPath = path.join(baseOutputDir, `${name}-${size}.png`);
      await convertSvgToPng(svgPath, pngPath, size);
      pngPaths.push(pngPath);
    }

    if (name === 'app-icon') {
      const icoPath = path.join(baseOutputDir, 'app-icon.ico');
      await createIco(pngPaths, icoPath);
    }
  }

  console.log('\nIcon conversion completed!');
}

main().catch(console.error);