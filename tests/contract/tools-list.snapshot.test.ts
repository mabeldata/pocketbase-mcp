/**
 * CONTRATO MCP — snapshot de tools/list.
 *
 * Trava 100% dos nomes, descrições e inputSchemas das tools registradas
 * (requisito do diagnóstico: "preservar 100% dos nomes e inputSchemas";
 * qualquer mudança exige regeneração deliberada com `-u` + justificativa).
 *
 * Roda SEMPORE antes e depois de mudanças de dependência (MCP SDK 1.7→1.30)
 * e de código, provando retrocompatibilidade do contrato.
 */
import { describe, it, expect } from 'vitest';
import { registerTools } from '../../src/tools/index.js';

describe('tools/list — snapshot do contrato', () => {
  it('lista completa de tools (nomes + descrições + inputSchemas)', () => {
    const { tools } = registerTools();
    // snapshot determinístico: ordena por nome para diffs estáveis
    const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted).toMatchSnapshot();
  });

  it('nomes das tools (lista plana — checagem rápida de contrato)', () => {
    const names = registerTools().tools.map(t => t.name).sort();
    expect(names).toMatchSnapshot();
  });
});
