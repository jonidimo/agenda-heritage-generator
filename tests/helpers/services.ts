/** Respuestas de las APIs de imágenes y fuentes, con la forma de las reales, para las pruebas sin internet. */
import { makeJpeg } from './jpeg';
import { makePng } from './png';
import type { Route } from './web';

export const OV_ID = '6b4d6f84-0a5b-4cd0-a6c8-3c3e1a5d9b11';
export const OV_ID2 = '0e7a3c52-8f10-4b6e-9c11-aa5c0d9e7f22';
export const OV_ID3 = '1f2e3d4c-5b6a-4879-8a9b-0c1d2e3f4a5b';

export const openverseResults = (): object => ({
  result_count: 3,
  page_count: 1,
  page_size: 20,
  page: 1,
  results: [
    {
      id: OV_ID,
      title: 'Estadio de noche',
      creator: 'Jane Doe',
      creator_url: 'https://www.flickr.com/photos/jane',
      license: 'by',
      license_version: '2.0',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/jane/1',
      url: 'https://live.staticflickr.com/65535/estadio_b.jpg',
      thumbnail: `https://api.openverse.org/v1/images/${OV_ID}/thumb/`,
      filetype: 'jpg',
      width: 3000,
      height: 2000,
    },
    {
      // El original está en un dominio que no se visita: solo se puede bajar la copia reducida.
      id: OV_ID2,
      title: 'Cancha',
      creator: 'Juan Pérez',
      creator_url: null,
      license: 'cc0',
      license_version: '1.0',
      license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      foreign_landing_url: 'https://ejemplo.org/cancha',
      url: 'https://fotos.desconocido.example/cancha.jpg',
      thumbnail: `https://api.openverse.org/v1/images/${OV_ID2}/thumb/`,
      filetype: 'jpg',
      width: 4000,
      height: 3000,
    },
    {
      id: OV_ID3,
      title: 'Escudo',
      creator: 'Ana',
      license: 'by-sa',
      license_version: '4.0',
      foreign_landing_url: 'https://commons.wikimedia.org/wiki/File:Escudo.svg',
      url: 'https://upload.wikimedia.org/wikipedia/commons/escudo.svg',
      thumbnail: `https://api.openverse.org/v1/images/${OV_ID3}/thumb/`,
      filetype: 'svg',
      width: 512,
      height: 512,
    },
  ],
});

export const pixabayResults = (): object => ({
  total: 1,
  totalHits: 1,
  hits: [
    {
      id: 195893,
      pageURL: 'https://pixabay.com/photos/flower-195893/',
      type: 'photo',
      tags: 'flower, blossom, bloom, yellow',
      previewURL: 'https://cdn.pixabay.com/photo/2013/10/15/prev.jpg',
      webformatURL: 'https://pixabay.com/get/thumb_640.jpg',
      largeImageURL: 'https://pixabay.com/get/large_1280.jpg',
      imageWidth: 4000,
      imageHeight: 3000,
      user: 'Josch13',
      user_id: 1664300,
    },
  ],
});

export const unsplashResults = (): object => ({
  total: 1,
  total_pages: 1,
  results: [
    {
      id: 'abc123XYZ',
      width: 6000,
      height: 4000,
      description: 'Montañas al amanecer',
      urls: { raw: 'https://images.unsplash.com/photo-1?ixid=XYZ', small: 'https://images.unsplash.com/photo-1?w=400&ixid=XYZ' },
      links: { html: 'https://unsplash.com/photos/abc123XYZ', download_location: 'https://api.unsplash.com/photos/abc123XYZ/download?ixid=XYZ' },
      user: { name: 'Lía Gómez', username: 'lia', links: { html: 'https://unsplash.com/@lia' } },
    },
  ],
});

const googleFamilies = (): object[] => [
  { family: 'Roboto', category: 'sans-serif', variants: ['regular', 'italic', '700', '700italic'], subsets: ['latin', 'latin-ext', 'cyrillic'], files: { regular: 'http://fonts.gstatic.com/s/roboto/r.ttf', '700': 'http://fonts.gstatic.com/s/roboto/b.ttf' }, lastModified: '2024-01-01' },
  { family: 'Bangers', category: 'display', variants: ['regular'], subsets: ['latin', 'latin-ext', 'vietnamese'], files: { regular: 'http://fonts.gstatic.com/s/bangers/v25/b.ttf' }, lastModified: '2023-05-01' },
  { family: 'Shippori Mincho', category: 'serif', variants: ['regular', '500', '700'], subsets: ['japanese', 'latin', 'latin-ext'], files: { regular: 'http://fonts.gstatic.com/s/shippori/r.ttf', '700': 'http://fonts.gstatic.com/s/shippori/b.ttf' }, lastModified: '2023-05-01' },
  { family: 'Noto Sans JP', category: 'sans-serif', variants: ['regular', '700'], subsets: ['japanese'], files: {}, lastModified: '2023-05-01' },
];
export const googleList = (): object => ({ kind: 'webfonts#webfontList', items: googleFamilies() });

export const OPENVERSE_API = 'https://api.openverse.org/v1/images/';

/** Las rutas de un «internet» con los tres servicios de imágenes y los archivos de las fotos. */
export function imageRoutes(): Route[] {
  const photo = makeJpeg(1500, 1000);
  return [
    { match: /^https:\/\/api\.openverse\.org\/v1\/images\/\?/, body: openverseResults() },
    // La ficha de cada imagen por su id (import_image la pide si la búsqueda no está en la caché).
    ...(openverseResults() as { results: Array<{ id: string }> }).results.map((r) => ({ match: `https://api.openverse.org/v1/images/${r.id}/`, body: r })),
    { match: /^https:\/\/api\.openverse\.org\/v1\/images\/[0-9a-f-]+\/thumb\/$/, type: 'image/jpeg', body: makeJpeg(600, 400) },
    { match: 'https://live.staticflickr.com/65535/estadio_b.jpg', type: 'image/jpeg', body: photo },
    { match: 'https://upload.wikimedia.org/wikipedia/commons/escudo.svg', type: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="40mm" height="40mm"><script>alert(1)</script><rect width="5" height="5" onclick="x()"/></svg>' },
    { match: /^https:\/\/pixabay\.com\/api\/\?/, body: pixabayResults() },
    { match: 'https://pixabay.com/get/large_1280.jpg', type: 'image/jpeg', body: makeJpeg(1280, 960) },
    { match: 'https://pixabay.com/get/thumb_640.jpg', type: 'image/jpeg', body: makeJpeg(640, 480) },
    { match: /^https:\/\/api\.unsplash\.com\/search\/photos/, body: unsplashResults() },
    { match: 'https://api.unsplash.com/photos/abc123XYZ', body: (unsplashResults() as { results: object[] }).results[0]! },
    { match: /^https:\/\/api\.unsplash\.com\/photos\/abc123XYZ\/download/, body: { url: 'x' } },
    { match: /^https:\/\/images\.unsplash\.com\/photo-1\?.*w=4000/, type: 'image/jpeg', body: makeJpeg(2000, 1333) },
    { match: /^https:\/\/images\.unsplash\.com\/photo-1\?w=400/, type: 'image/png', body: makePng(400, 266, [20, 120, 60]) },
  ];
}
