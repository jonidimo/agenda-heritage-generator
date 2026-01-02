# Generador de Agendas "Heritage" (Python + WeasyPrint)

## Filosofía
El concepto "Heritage" evoca lo atemporal y clásico, con una inspiración botánica del siglo XIX que trasciende la simple estética "vintage". Busca recuperar el valor de lo analógico: papel, tinta y tiempo, ofreciendo una experiencia de uso elegante y permanente.

## Características Principales
*   **Método Alastair Híbrido**: Un sistema de planificación flexible que combina listas de tareas con vistas semanales.
*   **Habit Tracker Rotado**: Seguimiento de hábitos optimizado para aprovechar el espacio.
*   **Zero-Waste A5 Layout**: Diseño meticuloso para impresión en formato A5 sin desperdicio de papel.

## Estructura del Proyecto
Este proyecto ha sido refactorizado para ser totalmente modular. La lógica de generación (Python) está desacoplada del diseño visual, permitiendo la fácil implementación de nuevos temas (como un futuro tema "Engineering") simplemente cambiando la configuración del directorio de temas.

### Directorios
*   `themes/heritage/`: Contiene todos los archivos específicos del tema actual.
    *   `templates/`: Plantillas HTML (Jinja2).
    *   `css/`: Estilos (CSS para impresión).
    *   `assets/`: Recursos gráficos (SVG, imágenes).
*   `output/`: Directorio donde se genera el PDF final.

## Uso
1.  Instalar dependencias: `pip install -r requirements.txt`
2.  Generar agenda: `python build_agenda_2026.py`
