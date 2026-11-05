# Guía de impresión y encuadernación

[English](printing.md) · [Español](impresion.md)

Esta guía lleva un diseño terminado hasta un libro cosido. Está pensada para una
HP LaserJet 4350 con módulo dúplex, pero cada paso sirve para cualquier impresora
que imprima a doble faz.

## Imprimir o leer en pantalla

La barra superior tiene dos modos. **Diseño** es para la página, el pliego y el libro entero.
**Impresión** suma la hoja impresa y el panel de impresión, y dibuja en cada página la zona que la
impresora no imprime (roja) y el margen de costura (azul).

En **Impresión → Destino** elegís para qué es la agenda. *Imprimir y encuadernar* es todo lo que sigue.
*Leer en pantalla* deja de lado el margen de costura, los recortes, las marcas y las páginas de relleno
que completan los cuadernillos: las páginas conservan su tamaño, las opciones de impresión se pliegan y
el único PDF es de a una página, con enlaces y marcadores. Volver atrás no pierde nada.

## 1. Elegir papel y tamaño de página

| Hoja (lo que entra en la impresora) | Página (donde se escribe) | Notas |
| --- | --- | --- |
| A4, 297 × 210 mm | A5, 148,5 × 210 mm | La clásica. Entra en cualquier impresora. |
| Legal / Oficio, 355,6 × 215,9 mm | 177,8 × 215,9 mm | El tamaño más grande que imprime la LaserJet 4350. Páginas más amplias. |
| Carta, 279,4 × 215,9 mm | 139,7 × 215,9 mm | Papel de EE. UU. |
| Folio, Oficio 340, A3, A5, a medida | la mitad de la hoja | Se elige en **Impresión → Papel**. |

La diagramación se calcula en milímetros para la página elegida. Una página más grande
recibe **más renglones, no renglones estirados**; el texto conserva su cuerpo en puntos.

Gramaje: entre 75 y 90 g/m² se pliega bien en cuadernillos de 4 o 5 hojas. El papel
ahuesado (bookcel) cansa menos la vista. Si se puede, conviene que la fibra del papel
corra paralela al pliegue: el libro abre más plano.

## 2. Elegir cómo se encuaderna

En **Impresión → Encuadernación**:

- **Cuadernillos cosidos** (la opción por defecto). Las hojas se pliegan en grupos
  llamados cuadernillos y cada cuadernillo se cose. Se elige cuántas hojas lleva cada
  uno: 4 hojas son 16 páginas.
  - *Todos iguales*: todos con la misma cantidad de hojas; el último puede ser más chico.
  - *Equilibrados*: los cuadernillos difieren como mucho en una hoja.
  - *A medida*: se escribe una lista como `4, 5, 5, 4`.
  - *Último cuadernillo*: se achica, o se completa con páginas de notas para que todos
    sean iguales.
- **Un solo cuadernillo** (a caballete). Una sola pila plegada, abrochada o cosida por el
  pliegue. Sirve para libros finos.
- **Cortar y apilar**. Se imprime, se corta la pila al medio y se pone la mitad izquierda
  sobre la derecha. Sirve para anillado, espiral, discos o lomo pegado.
- **Una página por hoja**. Sin imposición: la página 1 al frente y la 2 al dorso.

La aplicación completa el documento con páginas de notas o de puntos para que cada
cuadernillo quede lleno, mantiene enfrentados los pliegos semanales y deja las
portadas de mes en páginas derechas.

## 3. Calibrar la impresora (una sola vez)

Exportá la **Hoja de calibración** e imprimila a doble faz, igual que la agenda.

1. **Escala.** Medí la regla de 100 mm. Si no mide 100 mm, el diálogo de impresión está
   escalando la página: elegí «Tamaño real» o «100 %» y desactivá «Ajustar a la página».
2. **Sentido del dúplex.** Las dos caras tienen flechas que apuntan hacia arriba. Si el
   dorso sale al revés, cambiá en la aplicación la doble faz (**borde corto** ↔
   **borde largo**) o la opción «Voltear páginas hacia arriba» del controlador.
3. **Registro.** Mirá la hoja a trasluz. Las cruces del frente y del dorso están en la
   misma posición. Si no coinciden, medí cuánto se corre el dorso y escribilo en
   **Impresión → Corrección del dorso** (x hacia la derecha, y hacia abajo, en mm).
   Es habitual un corrimiento de alrededor de un milímetro.
4. **Margen no imprimible.** El marco indica la zona a la que la impresora no llega
   (4,2 mm por defecto). La verificación previa avisa si algo cae ahí.

## 4. Imprimir

Exportá el **PDF para imprimir (doble faz)**. Cada página del PDF es una cara de una
hoja, ya impuesta. El PDF les pide a los visores doble faz por el borde corto y tamaño
real.

**Linux (CUPS):**

```bash
lp -d HP_LaserJet_4350 -o sides=two-sided-short-edge -o media=A4 -o print-scaling=none agenda.pdf
```

Reemplazá `HP_LaserJet_4350` por el nombre de tu cola (`lpstat -p` las lista).

Desde Okular o Evince: *Imprimir → Opciones → Doble cara: borde corto*, escala *Ninguna*.

**Windows:** *Imprimir → Propiedades → Acabado*: *Imprimir en ambas caras*. Con la hoja
de calibración vas a ver si tu controlador necesita «Voltear páginas hacia arriba»
activado o no. Elegí *Tamaño real*.

**Android:** abrí el PDF e imprimí con el servicio de impresión de la impresora (por
ejemplo Mopria o el complemento de HP). Elegí *Doble cara: borde corto*. Si el teléfono no
llega a la impresora, mandá el PDF a una computadora.

**Impresoras sin dúplex** (o si el dúplex se traba): elegí *Manual (frentes y luego
dorsos)* en la aplicación y exportá *Frentes* y *Dorsos* por separado. Imprimí los frentes,
volvé a poner la pila en la bandeja como indica la aplicación (puede invertir el orden y
girar los dorsos) e imprimí los dorsos.

## 5. Plegar, coser y encuadernar

1. Mantené las hojas en el orden en que salen. Cada cuadernillo empieza con un frente que
   tiene un número chico al pie del pliegue (el número de cuadernillo) y una barra negra
   sobre el pliegue (la marca de colación). Con todos los cuadernillos apilados, las barras
   forman una escalera: si una está fuera de lugar, el orden está mal.
2. Plegá cada cuadernillo al medio siguiendo las marcas de plegado. Una plegadera de hueso
   deja el pliegue bien marcado.
3. Exportá la **Plantilla de perforado**, plegala junto con los cuadernillos y marcá las
   estaciones con un punzón. Por defecto son 6 estaciones en pares.
4. Cosé los cuadernillos (punto cadeneta, copto o costura larga).
5. Exportá la **Tapa**. El ancho del lomo se calcula con la cantidad de hojas y el espesor
   del papel, o se puede escribir a mano.

### Creep

Al plegar, las hojas de adentro sobresalen hacia el corte. Con cuadernillos de 4 o 5 hojas
plegados a mano y sin refilar, el efecto ronda los 0,4 mm y se puede ignorar: por eso la
compensación viene **apagada**. Si vas a refilar el canto, activala: *Por espesor de hoja*
con el espesor de tu papel (alrededor de 0,1 mm para 80 g/m²) o *Medido en un cuadernillo
de prueba* con el corrimiento total que mediste.

### Marcas de corte y refile

Si vas a refilar el libro, indicá los márgenes en **Impresión → Refile** y activá las marcas
de corte. Las marcas se dibujan en el margen de refile, fuera de la página.

## 6. Línea de comandos

Todo lo que exporta la aplicación también se puede generar desde una terminal:

```bash
npm run agenda -- info designs/norma-2027.agenda.json
```

```bash
npm run pdf -- designs/norma-2027.agenda.json --mode imposed --out output/norma-2027-imprimir.pdf
```

Modos: `imposed`, `pages`, `fronts`, `backs`, `signature --signature N`, `calibration`,
`sewing`, `cover`, `separate`.
