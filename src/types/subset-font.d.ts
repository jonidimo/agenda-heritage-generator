declare module 'subset-font' {
  interface SubsetOptions {
    targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype';
    preserveNameIds?: number[];
    variationAxes?: Record<string, number | { min: number; max: number; default?: number }>;
    noLayoutClosure?: boolean;
  }
  export default function subsetFont(buffer: Uint8Array, text: string, options?: SubsetOptions): Promise<Uint8Array & { length: number }>;
}
