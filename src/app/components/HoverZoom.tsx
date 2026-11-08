/**
 * Al pasar el mouse por una miniatura, la imagen se ve lo más grande posible en el centro de la ventana, sin salirse de
 * ella ni tapar los clics (no atrapa el mouse). `src` puede ser una función asíncrona (para cargar el original recién
 * al hacer falta).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Source = string | undefined | (() => Promise<string | undefined>);

export function HoverZoom({ src, caption, children, className }: { src: Source; caption?: string | undefined; children: ReactNode; className?: string }) {
  const [url, setUrl] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const token = useRef(0);

  const show = (): void => {
    window.clearTimeout(timer.current);
    const mine = ++token.current;
    timer.current = window.setTimeout(() => {
      void (async () => {
        const got = typeof src === 'function' ? await src().catch(() => undefined) : src;
        if (token.current === mine && got) {
          setUrl(got);
          setOpen(true);
        }
      })();
    }, 350);
  };
  const hide = (): void => {
    window.clearTimeout(timer.current);
    token.current++;
    setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Escape o un clic cierran la vista (no quedan pegadas si el mouse se va rápido).
  useEffect(() => {
    if (!open) return;
    const close = (): void => hide();
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
    };
  }, [open]);

  return (
    <span className={className} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} data-testid="hover-zoom">
      {children}
      {open &&
        url &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center p-6" data-testid="hover-zoom-preview">
            <figure className="flex max-h-full max-w-full flex-col items-center gap-1 rounded-lg border border-line bg-white p-2 shadow-2xl">
              <img src={url} alt="" className="max-h-[calc(100vh-7rem)] max-w-[calc(100vw-3rem)] object-contain" />
              {caption && <figcaption className="max-w-full truncate text-[12px] text-ink-soft">{caption}</figcaption>}
            </figure>
          </div>,
          document.body,
        )}
    </span>
  );
}
