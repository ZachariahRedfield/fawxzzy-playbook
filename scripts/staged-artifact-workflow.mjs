import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const describePath = (targetPath) => targetPath || '.';

const ensureStageExists = async (stagedPath, label = 'staged artifact') => {
  try {
    return await fs.stat(stagedPath);
  } catch {
    throw new Error(`Missing ${label} at ${describePath(stagedPath)}.`);
  }
};

const copyEntry = async (sourcePath, destinationPath, stats) => {
  if (stats.isDirectory()) {
    await fs.cp(sourcePath, destinationPath, { recursive: true });
    return;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
};

const restoreEntry = async ({ backupPath, destinationPath, existed }) => {
  await fs.rm(destinationPath, { recursive: true, force: true });
  if (!existed) return;

  const backupStats = await fs.stat(backupPath);
  await copyEntry(backupPath, destinationPath, backupStats);
};

const promoteEntries = async (entries) => {
  await withTempDir('playbook-promotion-backup-', async (backupRoot) => {
    const backups = [];
    for (const entry of entries) {
      const destinationPath = entry.destinationPath;
      const backupPath = path.join(backupRoot, String(backups.length));
      let existed = false;

      try {
        const destinationStats = await fs.stat(destinationPath);
        existed = true;
        await copyEntry(destinationPath, backupPath, destinationStats);
      } catch {
        existed = false;
      }

      backups.push({ backupPath, destinationPath, existed });
    }

    try {
      for (const entry of entries) {
        await fs.rm(entry.destinationPath, { recursive: true, force: true });
        await copyEntry(entry.stagedPath, entry.destinationPath, entry.stats);
      }
    } catch (error) {
      for (const backup of backups.reverse()) {
        await restoreEntry(backup);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed promoting staged artifacts; restored original outputs. ${message}`);
    }
  });
};

export const withTempDir = async (prefix, callback) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await callback(tempDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${prefix} pipeline failed before promotion. ${message}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

export const withOverlayWorkspace = async ({ repoRoot, overrides, prefix = 'playbook-overlay-' }, callback) =>
  withTempDir(prefix, async (overlayRoot) => {
    const overridden = new Set(overrides.map((output) => output.relativePath));

    const materializeTree = async (relativePath = '') => {
      const sourceDir = path.join(repoRoot, relativePath);
      const destinationDir = path.join(overlayRoot, relativePath);
      await fs.mkdir(destinationDir, { recursive: true });
      const entries = await fs.readdir(sourceDir, { withFileTypes: true });

      for (const entry of entries) {
        const childRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
        const sourcePath = path.join(repoRoot, childRelativePath);
        const destinationPath = path.join(overlayRoot, childRelativePath);
        const isExactOverride = overridden.has(childRelativePath);
        const containsOverride = [...overridden].some((target) => target.startsWith(`${childRelativePath}${path.sep}`));

        if (isExactOverride) continue;
        if (entry.isDirectory() && containsOverride) {
          await materializeTree(childRelativePath);
          continue;
        }

        await fs.symlink(sourcePath, destinationPath, entry.isDirectory() ? 'dir' : 'file');
      }
    };

    await materializeTree();

    for (const output of overrides) {
      const destination = path.join(overlayRoot, output.relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, output.next);
    }

    return callback(overlayRoot);
  });

export const promoteStagedFiles = async ({ stageRoot, relativePaths, destinationRoot }) => {
  const entries = await Promise.all(relativePaths.map(async (relativePath) => {
    const stagedPath = path.join(stageRoot, relativePath);
    return {
      stagedPath,
      destinationPath: path.join(destinationRoot, relativePath),
      stats: await ensureStageExists(stagedPath, `staged file ${relativePath}`)
    };
  }));

  await promoteEntries(entries);
};

export const promoteStagedFile = async ({ stagedPath, destinationPath }) => {
  const stats = await ensureStageExists(stagedPath, 'staged file');
  await promoteEntries([{ stagedPath, destinationPath, stats }]);
};

export const promoteStagedDirectory = async ({ stagedPath, destinationPath }) => {
  const stats = await ensureStageExists(stagedPath, 'staged directory');
  if (!stats.isDirectory()) {
    throw new Error(`Expected staged directory at ${describePath(stagedPath)}.`);
  }
  await promoteEntries([{ stagedPath, destinationPath, stats }]);
};
