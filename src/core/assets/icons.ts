/**
 * Biblioteca de íconos integrados (de Lucide, licencia ISC): dibujos de trazo, livianos y que se
 * pueden teñir. Cada uno vive en `public/icons/lucide/<id>.svg` (los genera `scripts/build-icons.ts`
 * desde el paquete `lucide-react`, sin nada de React en el programa).
 *
 * En cualquier lugar que lleva una imagen (un elemento imagen, una marca de agua, la portada del mes,
 * un ornamento con `asset:`) se puede escribir `icon:<id>`: el ícono se usa sin declararlo en
 * `assets`. Un nombre que no está en la lista no dibuja nada y la revisión avisa (`missingAsset`).
 */
import type { AssetRef, Design } from '../design/schema';

export interface IconDef {
  id: string;
  /** Palabras para encontrarlo (castellano, inglés, portugués, italiano), además del id. */
  tags: string;
}

export const ICON_PREFIX = 'icon:';

/** Los íconos, en el orden en que los muestra el selector. */
export const ICONS: readonly IconDef[] = [
  { id: 'calendar', tags: 'calendario fecha calendar date calendário data' },
  { id: 'calendar-check', tags: 'calendario hecho cita appointment done compromisso appuntamento' },
  { id: 'calendar-heart', tags: 'calendario aniversario cita anniversary date aniversário anniversario' },
  { id: 'clock', tags: 'reloj hora tiempo clock time relógio orologio ora' },
  { id: 'alarm-clock', tags: 'despertador alarma alarm wake despertador sveglia' },
  { id: 'hourglass', tags: 'reloj de arena espera hourglass ampulheta clessidra' },
  { id: 'timer', tags: 'temporizador cronómetro timer cronômetro timer' },
  { id: 'bell', tags: 'campana recordatorio aviso bell reminder sino lembrete campanella promemoria' },
  { id: 'star', tags: 'estrella favorito star favourite estrela stella preferito' },
  { id: 'heart', tags: 'corazón amor favorito heart love coração amor cuore amore' },
  { id: 'hand-heart', tags: 'cuidado gratitud ayuda care gratitude cuidado gratidão cura gratitudine' },
  { id: 'smile', tags: 'sonrisa ánimo feliz smile mood happy sorriso humor felice umore' },
  { id: 'thumbs-up', tags: 'bien pulgar arriba ok like joinha pollice' },
  { id: 'sparkles', tags: 'brillo magia nuevo sparkles magic brilho magia scintille' },
  { id: 'crown', tags: 'corona rey reina crown king queen coroa corona' },
  { id: 'gem', tags: 'gema joya diamante gem jewel joia gemma gioiello' },
  { id: 'medal', tags: 'medalla premio logro medal award medalha medaglia premio' },
  { id: 'trophy', tags: 'trofeo copa premio logro meta trophy cup award goal troféu trofeo' },
  { id: 'target', tags: 'objetivo meta diana target goal alvo meta obiettivo bersaglio' },
  { id: 'flag', tags: 'bandera meta hito flag milestone bandeira bandiera' },
  { id: 'rocket', tags: 'cohete lanzamiento proyecto rocket launch foguete razzo' },
  { id: 'lightbulb', tags: 'idea bombilla foco lightbulb idea lâmpada lampadina' },
  { id: 'check', tags: 'tilde hecho listo check done visto fatto' },
  { id: 'circle-check', tags: 'hecho completado tarea done completed concluído completato' },
  { id: 'list-checks', tags: 'lista pendientes tareas checklist todo lista tarefas lista compiti' },
  { id: 'clipboard-list', tags: 'lista portapapeles plan clipboard list prancheta lista appunti' },
  { id: 'bookmark', tags: 'marcador señalador bookmark marcador segnalibro' },
  { id: 'book', tags: 'libro lectura leer book read livro leitura libro lettura' },
  { id: 'notebook-pen', tags: 'cuaderno diario escribir notebook journal write caderno diário quaderno diario' },
  { id: 'pen', tags: 'lapicera bolígrafo escribir pen write caneta penna' },
  { id: 'pencil', tags: 'lápiz escribir dibujar pencil draw lápis matita' },
  { id: 'paperclip', tags: 'clip adjunto paperclip attach clipe graffetta' },
  { id: 'scissors', tags: 'tijera cortar scissors cut tesoura forbici' },
  { id: 'palette', tags: 'paleta pintura arte colores palette paint art paleta tavolozza arte' },
  { id: 'brush', tags: 'pincel pintar brush paint pincel pennello' },
  { id: 'music', tags: 'música canción nota music song música musica canzone' },
  { id: 'camera', tags: 'cámara foto fotografía camera photo câmera foto fotocamera' },
  { id: 'phone', tags: 'teléfono llamada phone call telefone ligação telefono chiamata' },
  { id: 'mail', tags: 'correo carta email mail letter e-mail carta posta lettera' },
  { id: 'key', tags: 'llave clave contraseña key password chave chiave' },
  { id: 'lock', tags: 'candado seguro privado lock private cadeado lucchetto' },
  { id: 'gift', tags: 'regalo cumpleaños sorpresa gift birthday present presente regalo compleanno' },
  { id: 'cake', tags: 'torta pastel cumpleaños cake birthday bolo aniversário torta compleanno' },
  { id: 'party-popper', tags: 'fiesta festejo celebración party celebration festa celebração festa' },
  { id: 'house', tags: 'casa hogar home house lar casa' },
  { id: 'bed', tags: 'cama dormir sueño bed sleep cama dormir letto sonno' },
  { id: 'bath', tags: 'baño bañera bath bathtub banho bagno vasca' },
  { id: 'shirt', tags: 'remera ropa camisa shirt clothes camiseta roupa maglietta vestiti' },
  { id: 'shopping-cart', tags: 'compras carrito supermercado shopping cart compras carrinho spesa carrello' },
  { id: 'wallet', tags: 'billetera dinero gastos wallet money carteira dinheiro portafoglio soldi' },
  { id: 'piggy-bank', tags: 'ahorro chanchito alcancía savings piggy bank poupança cofrinho risparmio salvadanaio' },
  { id: 'briefcase', tags: 'trabajo maletín oficina work briefcase trabalho maleta lavoro valigetta' },
  { id: 'graduation-cap', tags: 'estudio graduación escuela universidad study school graduation estudo escola studio scuola' },
  { id: 'stethoscope', tags: 'médico salud turno doctor health médico saúde medico salute' },
  { id: 'pill', tags: 'remedio pastilla medicación pill medicine remédio comprimido pillola medicina' },
  { id: 'droplet', tags: 'gota agua hidratación drop water gota água goccia acqua' },
  { id: 'dumbbell', tags: 'pesa gimnasio ejercicio dumbbell gym exercise haltere academia manubrio palestra' },
  { id: 'bike', tags: 'bicicleta ciclismo bike cycling bicicleta bicicletta' },
  { id: 'footprints', tags: 'pasos caminar huellas steps walk passos caminhar passi camminare' },
  { id: 'volleyball', tags: 'pelota deporte vóley ball sport voleibol bola pallavolo palla sport' },
  { id: 'baby', tags: 'bebé niño baby child bebê neonato bambino' },
  { id: 'dog', tags: 'perro mascota dog pet cachorro cão cane animale' },
  { id: 'cat', tags: 'gato mascota cat pet gato gatto' },
  { id: 'utensils', tags: 'comida cubiertos almuerzo cena food meal comida refeição cibo pasto' },
  { id: 'coffee', tags: 'café taza desayuno coffee cup café caffè tazza' },
  { id: 'apple', tags: 'manzana fruta alimentación apple fruit maçã fruta mela frutta' },
  { id: 'carrot', tags: 'zanahoria verdura carrot vegetable cenoura legume carota verdura' },
  { id: 'pizza', tags: 'pizza comida food comida cibo' },
  { id: 'cookie', tags: 'galletita galleta cookie biscoito biscotto' },
  { id: 'ice-cream-cone', tags: 'helado verano ice cream sorvete gelato' },
  { id: 'wine', tags: 'vino copa brindis wine glass vinho vino calice' },
  { id: 'sun', tags: 'sol día verano sun day summer sol dia sole giorno estate' },
  { id: 'moon', tags: 'luna noche moon night lua noite luna notte' },
  { id: 'sun-moon', tags: 'día y noche rutina day night rotina giorno notte' },
  { id: 'cloud', tags: 'nube clima cloud weather nuvem tempo nuvola meteo' },
  { id: 'cloud-rain', tags: 'lluvia nube rain cloud chuva pioggia' },
  { id: 'umbrella', tags: 'paraguas lluvia umbrella rain guarda-chuva ombrello' },
  { id: 'snowflake', tags: 'nieve invierno copo snow winter neve inverno' },
  { id: 'flame', tags: 'fuego llama racha flame fire streak fogo chama fuoco fiamma' },
  { id: 'zap', tags: 'rayo energía zap energy raio energia fulmine energia' },
  { id: 'leaf', tags: 'hoja planta naturaleza leaf plant nature folha planta foglia pianta' },
  { id: 'sprout', tags: 'brote planta crecer sprout grow broto crescer germoglio crescere' },
  { id: 'flower', tags: 'flor primavera flower spring flor fiore primavera' },
  { id: 'tree-pine', tags: 'pino árbol bosque pine tree forest pinheiro árvore pino albero' },
  { id: 'mountain', tags: 'montaña excursión mountain hiking montanha montagna escursione' },
  { id: 'waves', tags: 'olas mar playa waves sea beach ondas mar praia onde mare spiaggia' },
  { id: 'tent', tags: 'carpa camping acampar tent camping barraca tenda campeggio' },
  { id: 'compass', tags: 'brújula viaje rumbo compass travel bússola bussola viaggio' },
  { id: 'globe', tags: 'mundo globo viaje world travel mundo viagem mondo viaggio' },
  { id: 'map-pin', tags: 'lugar ubicación mapa place location map local lugar luogo posizione' },
  { id: 'plane', tags: 'avión viaje vuelo plane travel flight avião viagem aereo volo' },
  { id: 'car', tags: 'auto coche viaje car carro auto macchina' },
  { id: 'bus', tags: 'colectivo autobús bus ônibus autobus' },
  { id: 'train-front', tags: 'tren viaje train trem treno' },
  { id: 'ship', tags: 'barco viaje ship boat navio barco nave barca' },
  { id: 'anchor', tags: 'ancla mar anchor âncora ancora' },
];

const BY_ID = new Map(ICONS.map((i) => [i.id, i]));

/** Dónde está el dibujo de un ícono, dentro de la carpeta de recursos integrados. */
export const iconPath = (id: string): string => `icons/lucide/${id}.svg`;

/** El id del ícono de una referencia `icon:<id>` (o `null` si no es una, o no es un ícono conocido). */
export function iconIdOf(ref: string): string | null {
  if (!ref.startsWith(ICON_PREFIX)) return null;
  const id = ref.slice(ICON_PREFIX.length);
  return BY_ID.has(id) ? id : null;
}

/** La imagen de un ícono, como cualquier otra imagen integrada de la agenda (su id es `icon:<id>`). */
export function iconAsset(id: string): AssetRef {
  return { id: `${ICON_PREFIX}${id}`, name: id, kind: 'vector', mime: 'image/svg+xml', width: 24, height: 24, builtin: iconPath(id) };
}

/** Busca íconos por id o por palabras (sin importar mayúsculas ni tildes). */
export function searchIcons(query: string): IconDef[] {
  const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...ICONS];
  return ICONS.filter((i) => {
    const hay = fold(`${i.id} ${i.tags}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Las referencias `icon:<id>` (también dentro de `asset:icon:<id>`) que aparecen en alguna parte del diseño. */
function iconMentions(v: unknown, out: Set<string>, depth = 0): void {
  if (depth > 40) return;
  if (typeof v === 'string') {
    const m = /^(?:asset:)?icon:([a-z0-9-]+)$/.exec(v);
    if (m) out.add(m[1]!);
    return;
  }
  if (Array.isArray(v)) for (const x of v) iconMentions(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) iconMentions(x, out, depth + 1);
}

/**
 * Las imágenes que una agenda usa de verdad: las declaradas en `assets` y los íconos que nombra con
 * `icon:<id>` sin declararlos. La usan quienes cargan las imágenes (Node, la aplicación y la revisión).
 */
export function effectiveAssets(design: Pick<Design, 'assets'> & Record<string, unknown>): AssetRef[] {
  const declared = new Set(design.assets.map((a) => a.id));
  const used = new Set<string>();
  for (const [key, value] of Object.entries(design)) if (key !== 'assets') iconMentions(value, used);
  const extra = [...used].filter((id) => BY_ID.has(id) && !declared.has(`${ICON_PREFIX}${id}`)).map(iconAsset);
  return extra.length === 0 ? design.assets : [...design.assets, ...extra];
}
