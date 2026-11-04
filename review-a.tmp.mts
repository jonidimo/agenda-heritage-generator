import { designJsonSchema, schemaPart } from './src/core/design/jsonSchema';
import { Ajv2020 } from 'ajv/dist/2020.js';
const s = designJsonSchema() as any;
console.log('size', JSON.stringify(s).length);
console.log('assets.builtin', JSON.stringify(s.properties.assets.items.properties.builtin));
console.log('paper', JSON.stringify(s.properties.paper));
console.log('calendar', JSON.stringify(s.properties.calendar).slice(0, 900));
console.log('cover.spine', JSON.stringify(s.properties.cover.properties.spine));
console.log('customBlocks', JSON.stringify(s.properties.customBlocks).slice(0, 1500));
console.log('sections', JSON.stringify(s.properties.sections));
console.log('sectionItem props', JSON.stringify(s.$defs.sectionItem.properties));
console.log('theme', JSON.stringify(s.properties.theme).slice(0, 400));
try { new Ajv2020({ allErrors: true, strict: true }).compile(s); console.log('strict compile OK'); } catch (e) { console.log('strict compile error:', (e as Error).message); }
const tk = s.$defs.themeTokens;
console.log('tokens keys', Object.keys(tk.properties));
console.log('fonts.title', JSON.stringify(tk.properties.fonts.properties.title));
console.log('lines.separator', JSON.stringify(tk.properties.lines.properties.separator));
console.log('palette', JSON.stringify(tk.properties.palette));
console.log('colors', JSON.stringify(tk.properties.colors).slice(0, 600));
