/** Archivos que esbuild incrusta en el paquete del servidor MCP (ver `scripts/build-mcp.ts`). */
declare module '*.md' {
  const text: string;
  export default text;
}
declare module '@resvg/resvg-wasm/index_bg.wasm' {
  const bytes: Uint8Array;
  export default bytes;
}
declare module 'harfbuzzjs/dist/harfbuzz-subset.wasm' {
  const bytes: Uint8Array;
  export default bytes;
}
