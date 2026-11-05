import { BlockOverrideZ, type BlockOverride } from '../../src/core/design/schema';

/** Un ajuste de elemento con todos sus valores por defecto: así un campo nuevo del esquema no rompe cada prueba. */
export const ov = (patch: Partial<BlockOverride> & Pick<BlockOverride, 'pageType' | 'blockId'>): BlockOverride => BlockOverrideZ.parse(patch);
