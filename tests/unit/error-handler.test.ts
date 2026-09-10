/**
 * error-handler (src/server/error-handler.ts).
 *
 * Comportamento atual travado por testes; o enriquecimento com
 * ClientResponseError (status + response.data por campo + cause — oportunidade
 * do SDK >= 0.26.1 listada no diagnóstico, ERR-1) é cenário PENDENTE e deve
 * ficar verde quando a tarefa de código aplicar a melhoria.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ClientResponseError } from 'pocketbase';
import {
  formatError, invalidParamsError, methodNotFoundError,
} from '../../src/server/error-handler.js';
import { makeClientResponseError } from '../fixtures/pb-responses.js';
import { itBug, describeBugs, KNOWN_BUGS } from '../fixtures/known-bugs.js';

describe('formatError', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('McpError: preserva código e mensagem no texto (SDK 1.30 prefixa "MCP error <code>:")', () => {
    const result = formatError(new McpError(ErrorCode.InvalidParams, 'campo X inválido'));
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    // McpError.message no MCP SDK 1.30 = "MCP error -32602: campo X inválido";
    // formatError embrulha com o nome do código.
    expect(result.content[0].text).toBe(
      'Error (InvalidParams): MCP error -32602: campo X inválido'
    );
    expect(result.content[0].text).toContain('campo X inválido');
  });

  it('Error genérico: usa defaultCode (InternalError)', () => {
    const result = formatError(new Error('falha qualquer'));
    expect(result.content[0].text).toBe('Error (InternalError): falha qualquer');
  });

  it('Error genérico com defaultCode explícito', () => {
    const result = formatError(new Error('x'), ErrorCode.MethodNotFound);
    expect(result.content[0].text).toBe('Error (MethodNotFound): x');
  });

  it('valor não-Error → "An unknown error occurred" + InternalError', () => {
    const result = formatError('string crua');
    expect(result.content[0].text).toBe('Error (InternalError): An unknown error occurred');
    expect(result.isError).toBe(true);
  });

  it('ClientResponseError do SDK 0.28 é Error → cai no branch genérico hoje', () => {
    const cre = makeClientResponseError(400, {
      title: { code: 'validation_required', message: 'Missing required value.' },
    }, 'Failed to create record.');
    const result = formatError(cre);
    expect(result.isError).toBe(true);
    // mensagem do server preservada
    expect(result.content[0].text).toContain('Failed to create record.');
  });

  describeBugs('ERR-1 — enriquecimento pendente (cenário pendente)', () => {
    itBug('ClientResponseError deveria expor status e erros por campo ao consumidor LLM', async () => {
      const cre: ClientResponseError = makeClientResponseError(400, {
        title: { code: 'validation_required', message: 'Missing required value.' },
      }, 'Failed to create record.');
      const result = formatError(cre);
      const text = result.content[0].text;
      // EXPECTED (pós-melhoria): status HTTP e o erro do campo visíveis no texto
      // para que o LLM consumidor consiga corrigir a chamada.
      expect(text).toMatch(/400/);
      expect(text).toMatch(/title/);
      expect(text).toMatch(/validation_required|Missing required value/);
      void KNOWN_BUGS.ERR1_ENRICH;
    });
  });

  it('loga o erro internamente via console.error (não stdout)', () => {
    formatError(new Error('x'));
    expect(errSpy).toHaveBeenCalled();
  });
});

describe('factories', () => {
  it('invalidParamsError → McpError InvalidParams', () => {
    const e = invalidParamsError('faltou collection');
    expect(e).toBeInstanceOf(McpError);
    expect(e.code).toBe(ErrorCode.InvalidParams);
    // SDK 1.30: message inclui o prefixo "MCP error <code>: "
    expect(e.message).toContain('faltou collection');
    expect(e.message).toMatch(/-32602|InvalidParams/);
  });

  it('methodNotFoundError → McpError MethodNotFound com nome da tool', () => {
    const e = methodNotFoundError('ferramenta_x');
    expect(e).toBeInstanceOf(McpError);
    expect(e.code).toBe(ErrorCode.MethodNotFound);
    expect(e.message).toContain('Unknown tool: ferramenta_x');
    expect(e.message).toMatch(/-32601|MethodNotFound/);
  });
});
