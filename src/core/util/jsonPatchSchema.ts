/**
 * Validador de una operación JSON Patch (RFC 6902) tal como la reciben desde afuera el puente en vivo,
 * el servidor MCP y el asistente de la aplicación: los tres aceptan exactamente lo mismo.
 */
import { z } from 'zod';

/** Un puntero JSON no necesita más que esto en una agenda; uno más largo es un error o un abuso. */
const POINTER_MAX = 500;

export const JsonPatchOpZ = z.union([
  z.object({ op: z.enum(['add', 'replace', 'test']), path: z.string().max(POINTER_MAX), value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: z.string().max(POINTER_MAX) }),
  z.object({ op: z.enum(['move', 'copy']), from: z.string().max(POINTER_MAX), path: z.string().max(POINTER_MAX) }),
]);
