/**
 * Helpers de filesystem de migrations (src/migrations/helpers/file-system.ts).
 * Sem impacto de versão no diagnóstico — travam comportamento existente.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import {
  setMigrationsDirectory,
  createMigrationFile,
  listMigrationFiles,
} from '../../src/migrations/helpers/file-system.js';

describe('setMigrationsDirectory', () => {
  it('default → <cwd>/pb_migrations', () => {
    expect(setMigrationsDirectory()).toBe(path.resolve(process.cwd(), 'pb_migrations'));
  });

  it('caminho absoluto é usado como está', () => {
    expect(setMigrationsDirectory('/tmp/xyz')).toBe('/tmp/xyz');
  });

  it('caminho relativo é resolvido a partir do cwd', () => {
    expect(setMigrationsDirectory('mig')).toBe(path.resolve(process.cwd(), 'mig'));
  });
});

describe('createMigrationFile', () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-fs-'));
    setMigrationsDirectory(tmpDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('cria o arquivo e retorna o caminho absoluto', async () => {
    const p = await createMigrationFile('1700000000_test.js', '// hi');
    expect(p).toBe(path.join(tmpDir, '1700000000_test.js'));
    expect(await fs.readFile(p, 'utf-8')).toBe('// hi');
  });

  it('cria o diretório de migrations se não existir', async () => {
    const nested = path.join(tmpDir, 'deep', 'dir');
    setMigrationsDirectory(nested);
    const p = await createMigrationFile('1700000000_test.js', 'x');
    expect(p.startsWith(nested)).toBe(true);
    await expect(fs.access(p)).resolves.toBeUndefined();
  });

  it('acrescenta .js se ausente', async () => {
    const p = await createMigrationFile('1700000000_test', 'x');
    expect(p.endsWith('.js')).toBe(true);
  });

  it('nome de arquivo inválido (path traversal) → Error', async () => {
    await expect(createMigrationFile('../evil.js', 'x')).rejects.toThrow(/Invalid migration filename/);
    await expect(createMigrationFile('a b.js', 'x')).rejects.toThrow(/Invalid migration filename/);
  });

  it('não sobrescreve arquivo existente', async () => {
    await createMigrationFile('1700000000_dup.js', 'first');
    await expect(createMigrationFile('1700000000_dup.js', 'second')).rejects.toThrow(/already exists/);
    expect(await fs.readFile(path.join(tmpDir, '1700000000_dup.js'), 'utf-8')).toBe('first');
  });
});

describe('listMigrationFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-ls-'));
    setMigrationsDirectory(tmpDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('diretório inexistente → lista vazia (não lança)', async () => {
    setMigrationsDirectory(path.join(tmpDir, 'nao-existe'));
    await expect(listMigrationFiles()).resolves.toEqual([]);
  });

  it('filtra apenas <dígitos>_*.js e ordena por timestamp', async () => {
    await fs.writeFile(path.join(tmpDir, '1700000002_b.js'), '');
    await fs.writeFile(path.join(tmpDir, '1700000001_a.js'), '');
    await fs.writeFile(path.join(tmpDir, 'not-a-migration.js'), ''); // sem prefixo numérico
    await fs.writeFile(path.join(tmpDir, '1700000003_c.txt'), '');   // extensão errada
    expect(await listMigrationFiles()).toEqual([
      '1700000001_a.js',
      '1700000002_b.js',
    ]);
  });
});
