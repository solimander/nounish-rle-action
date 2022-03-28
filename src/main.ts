import { PNGCollectionEncoder, PngImage } from '@nouns/sdk';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import * as core from '@actions/core';
import { PNG } from 'pngjs';

/**
 * Get all directory names within `source`
 * @param source The source directory
 */
const getDirectories = async (source: string) => {
  const dir = await fs.readdir(source, { withFileTypes: true });
  return dir.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
};

/**
 * Read a PNG image file and return a `PngImage` object.
 * @param path The path to the PNG file
 */
const readPngImage = async (path: string): Promise<PngImage> => {
  const buffer = await fs.readFile(path);
  const png = PNG.sync.read(buffer);

  return {
    width: png.width,
    height: png.height,
    rgbaAt: (x: number, y: number) => {
      const idx = (png.width * y + x) << 2;
      const [r, g, b, a] = [png.data[idx], png.data[idx + 1], png.data[idx + 2], png.data[idx + 3]];
      return {
        r,
        g,
        b,
        a,
      };
    },
  };
};

/**
 * Run the Github action, converting all PNG image data into a single RLE output file.
 */
const run = async (): Promise<void> => {
  try {
    const workspace = process.env.GITHUB_WORKSPACE ?? '';

    const outputPath = join(workspace, core.getInput('outputPath'));
    const rootPath = join(workspace, core.getInput('rootDirectoryPath'));
    const existingPalette = core.getInput('existingPalette')?.split(',');

    const encoder = new PNGCollectionEncoder(existingPalette);

    const partFolders = await getDirectories(rootPath);

    for (const folder of partFolders) {
      const folderPath = join(rootPath, folder);
      const files = await fs.readdir(folderPath);
      for (const file of files) {
        // Ignore non-PNG files in directory
        if (extname(file) !== '.png') {
          continue;
        }

        const image = await readPngImage(join(folderPath, file));
        encoder.encodeImage(file.replace(/\.png$/, ''), image, folder.replace(/^\d-/, ''));
      }
    }

    const data = JSON.stringify(
      {
        bgcolors: ['d5d7e1', 'e1d7d5'],
        ...encoder.data,
      },
      null,
      2,
    );

    await fs.writeFile(outputPath, `${data}\n`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
};

run();
