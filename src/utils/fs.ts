import fss from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

// because ugh.
export async function createDir(dir: string) {
  try {
    await fs.stat(dir);
  } catch (error: unknown) {
    if ((error as { code: string }).code === "ENOENT") {
      await fs.mkdir(dir, { recursive: true });
    } else {
      throw error;
    }
  }
}

export function createDirSync(dir: string) {
  try {
    fss.statSync(dir);
  } catch (error: unknown) {
    if ((error as { code: string }).code === "ENOENT") {
      fss.mkdirSync(dir, { recursive: true });
    } else {
      throw error;
    }
  }
}

export async function statExists(file: string): Promise<boolean> {
  try {
    await fs.stat(file);
    return true;
  } catch (error: unknown) {
    if ((error as { code: string }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function statExistsSync(file: string): boolean {
  try {
    fss.statSync(file);
    return true;
  } catch (error: unknown) {
    if ((error as { code: string }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function dirExists(dir: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dir);
    return stats.isDirectory();
  } catch (error: unknown) {
    if ((error as { code: string }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function dirExistsSync(dir: string): boolean {
  try {
    const stats = fss.statSync(dir);
    return stats.isDirectory();
  } catch (error: unknown) {
    if ((error as { code: string }).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/**
 * Searches for a file in the specified directories.
 * if a path is a direct file path, it checks that file as well.
 *
 * @param fileName - The name of the file to search for
 * @param paths - An array of directories or file pathsto search
 */
export async function findFile(fileName: string, paths: string[]): Promise<string | undefined> {
  for (const p of paths) {
    try {
      const stats = await fs.stat(p);

      if (stats.isFile()) {
        if (path.basename(p) === fileName) {
          return path.resolve(p);
        }
      } else if (stats.isDirectory()) {
        const candidate = path.join(p, fileName);
        try {
          await fs.access(candidate, fs.constants.F_OK);
          return path.resolve(candidate);
        } catch {
          // not found, move on
        }
      }
    } catch {
      // doesnt exist, skip
    }
  }

  return;
}
