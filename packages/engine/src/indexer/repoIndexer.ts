import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config/load.js';
import { getCoreRules } from '../rules/coreRules.js';

export type RepositoryIndex = {
  schemaVersion: '1.0';
  framework: string;
  language: string;
  architecture: string;
  modules: string[];
  database: string;
  rules: string[];
};

const readPackageJson = (projectRoot: string): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined => {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
};

const detectFramework = (projectRoot: string): string => {
  if (fs.existsSync(path.join(projectRoot, 'next.config.js')) || fs.existsSync(path.join(projectRoot, 'next.config.mjs')) || fs.existsSync(path.join(projectRoot, 'next.config.ts'))) {
    return 'nextjs';
  }

  if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
    return 'node';
  }

  return 'unknown';
};

const detectLanguage = (projectRoot: string): string => {
  if (fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
    return 'typescript';
  }

  if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
    return 'javascript';
  }

  return 'unknown';
};

const detectArchitecture = (projectRoot: string): string => {
  const defaultArchitecture = 'modular-monolith';

  const configPath = path.join(projectRoot, 'playbook.config.json');
  if (!fs.existsSync(configPath)) {
    return defaultArchitecture;
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { architecture?: string };
  if (typeof parsed.architecture === 'string' && parsed.architecture.trim().length > 0) {
    return parsed.architecture.trim();
  }

  return defaultArchitecture;
};

const detectModules = (projectRoot: string): string[] => {
  const srcPath = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcPath)) {
    return [];
  }

  return fs
    .readdirSync(srcPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
};

const detectDatabase = (projectRoot: string): string => {
  const pkg = readPackageJson(projectRoot);
  if (!pkg) {
    return 'none';
  }

  const dependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies
  };

  if (dependencies['@supabase/supabase-js']) {
    return 'supabase';
  }

  if (dependencies.prisma || dependencies['@prisma/client']) {
    return 'prisma';
  }

  if (dependencies.typeorm) {
    return 'typeorm';
  }

  if (dependencies.sequelize) {
    return 'sequelize';
  }

  if (dependencies['drizzle-orm']) {
    return 'drizzle';
  }

  return 'none';
};

const detectRules = (projectRoot: string): string[] => {
  const { config } = loadConfig(projectRoot);
  return getCoreRules(config)
    .map((rule) => rule.id)
    .sort();
};

export const generateRepositoryIndex = (projectRoot: string): RepositoryIndex => ({
  schemaVersion: '1.0',
  framework: detectFramework(projectRoot),
  language: detectLanguage(projectRoot),
  architecture: detectArchitecture(projectRoot),
  modules: detectModules(projectRoot),
  database: detectDatabase(projectRoot),
  rules: detectRules(projectRoot)
});
