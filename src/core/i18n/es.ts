/**
 * Textos impresos de la agenda en español (variante rioplatense neutra).
 * Es la referencia de claves: los demás idiomas deben tener exactamente la
 * misma forma (lo verifica TypeScript con el tipo `AgendaStrings`).
 * Variables entre llaves: {n}, {year}, {month}, {name}.
 */
export const es = {
  common: {
    notes: 'NOTAS',
    week: 'SEMANA {n}',
    page: 'Página',
    year: 'Año',
    date: 'FECHA',
    total: 'TOTAL',
    currencyLabel: 'IMPORTE',
  },
  titlePage: {
    title: 'Arquitectura del Tiempo',
    kicker: 'AGENDA PERSONAL',
  },
  personal: {
    title: 'Datos personales',
    belongsTo: 'ESTA AGENDA PERTENECE A',
    name: 'Nombre',
    phone: 'Teléfono',
    email: 'Correo electrónico',
    address: 'Dirección',
    reward: 'Si la encontrás, por favor avisame. ¡Gracias!',
    emergency: 'EN CASO DE EMERGENCIA',
    contactName: 'Contacto',
    relation: 'Vínculo',
    bloodType: 'Grupo sanguíneo',
    allergies: 'Alergias',
    insurance: 'Obra social / seguro',
  },
  guide: {
    title: 'Cómo usar esta agenda',
    intro:
      'Esta agenda no impone horarios fijos: vos decidís cuándo hacer cada cosa. Cada método de estas páginas está elegido por su utilidad práctica y, cuando existe, por la evidencia científica que lo respalda.',
    howTo: 'CÓMO SE USA',
    evidence: 'QUÉ DICE LA EVIDENCIA',
    legend: 'SÍMBOLOS',
    references: 'Referencias',
    levels: {
      strong: 'Evidencia sólida',
      moderate: 'Evidencia moderada',
      limited: 'Evidencia limitada',
      practice: 'Práctica sin estudios directos',
      contested: 'Evidencia discutida',
    },
    continued: '(continúa)',
  },
  toc: {
    title: 'Índice',
  },
  /** Marcadores del PDF (índice lateral del lector). */
  outline: {
    cover: 'Portada',
    dedication: 'Dedicatoria',
    monthLog: 'Registro del mes',
  },
  yearOverview: {
    title: 'CALENDARIO ANUAL',
    holidays: 'Feriados',
  },
  birthdays: {
    title: 'Cumpleaños y fechas importantes',
  },
  vision: {
    title: 'Visión Anual',
    subtitle: 'PRIORIDADES A CORTO, MEDIANO Y LARGO PLAZO',
    category: 'CATEGORÍA',
    short: 'CORTO PLAZO',
    medium: 'MEDIANO PLAZO',
    long: 'LARGO PLAZO',
    categories: ['PERSONAL / HOGAR', 'PROYECTOS / CRECIMIENTO', 'SALUD / BIENESTAR', 'FINANZAS / ECONOMÍA'],
  },
  actionPlan: {
    title: 'Plan de Acción',
    subtitle: 'LOS PRIMEROS PASOS SON LOS MÁS IMPORTANTES',
    subtitleEnd: 'ENFOQUE Y VISIÓN FINAL',
    goal: 'OBJETIVO {n}',
    why: '¿Por qué es importante para mí?',
    steps: 'ESTRATEGIA Y PASOS',
    deadline: 'PLAZO',
    obstacle: 'OBSTÁCULO PROBABLE',
    ifThen: 'SI ________ , ENTONCES ________',
    mantra: 'MI MANTRA PARA {year}',
    mantraHint: 'Escribí aquí tu intención o pegá una foto que represente tu año.',
  },
  moodYear: {
    title: 'Mi año en píxeles',
    hint: 'Cada noche pintá o marcá el casillero del día según cómo te sentiste.',
    levels: ['Excelente', 'Bien', 'Normal', 'Bajo', 'Difícil'],
  },
  monthCover: {
    sticker: 'ESPACIO PARA STICKER',
    intention: 'INTENCIÓN DEL MES',
    focusHabit: 'HÁBITO FOCO',
  },
  monthGrid: {
    title: 'Vista mensual',
  },
  week: {
    label: 'SEMANA {n}',
    notes: 'NOTAS / OBJETIVOS SEMANALES',
    priorities: 'PRIORIDADES DE LA SEMANA',
    tasks: 'TAREAS',
    expenses: 'CONTROL DE GASTOS SEMANAL',
    expensesTotal: 'TOTAL ACUMULADO:',
    weekend: 'FIN DE SEMANA',
    review: 'REVISIÓN DE LA SEMANA',
    reviewPrompts: ['¿Qué salió bien?', '¿Qué aprendí?', '¿Qué paso a la semana que viene?'],
  },
  daily: {
    priorities: 'PRIORIDADES',
    notes: 'NOTAS',
    goodThings: '3 COSAS BUENAS DE HOY',
    weekend: 'FIN DE SEMANA',
  },
  habits: {
    title: 'Registro de Hábitos',
    habit: 'HÁBITO',
    total: 'TOTAL',
    anchor: 'DESPUÉS DE…',
    quote: 'La disciplina es el puente entre las metas y los logros.',
    quoteAuthor: 'Jim Rohn',
  },
  balance: {
    title: 'Balance del Mes',
    income: 'INGRESOS / FIJOS',
    variable: 'VARIABLES / OTROS',
    total: 'TOTAL ACUMULADO / BALANCE',
    shopping: 'LISTA DE COMPRAS / PENDIENTES',
  },
  review: {
    title: 'Resumen Mensual',
    achievements: 'LOGROS Y MOMENTOS GRATOS',
    memory: 'RECUERDO DEL MES / ESPACIO CREATIVO',
    memoryHint: 'Capturá un momento especial',
    pending: 'PENDIENTES {month}',
    mood: 'CÓMO ME SENTÍ ESTE MES',
    moods: ['EN CALMA', 'CON ENERGÍA', 'CON CANSANCIO'],
    learned: 'QUÉ APRENDÍ',
    letGo: 'QUÉ DEJO IR',
  },
  passwords: {
    title: 'Contraseñas',
    platform: 'PLATAFORMA',
    user: 'USUARIO',
    hint: 'PISTA',
    note: 'Anotá pistas que solo vos entiendas, no la contraseña completa. Guardá la agenda en un lugar seguro.',
  },
  contacts: {
    title: 'Contactos',
    categories: ['MÉDICOS', 'EMERGENCIAS', 'SERVICIOS', 'FAMILIARES', 'OTROS'],
  },
  health: {
    title: 'Salud',
    bloodType: 'Grupo sanguíneo',
    allergies: 'Alergias',
    insurance: 'Obra social / prepaga',
    memberNumber: 'N.º de afiliado',
    doctor: 'Médico/a de cabecera',
    medication: 'MEDICACIÓN',
    medName: 'MEDICAMENTO',
    dose: 'DOSIS',
    schedule: 'HORARIO',
    since: 'DESDE',
    checkups: 'CONTROLES Y TURNOS',
    specialty: 'ESPECIALIDAD',
  },
  notes: {
    title: 'Notas',
  },
  custom: {
    placeholder: 'Página personalizada',
  },
  calibration: {
    title: 'HOJA DE CALIBRACIÓN',
    printAt100: 'Imprimí al 100 % (desactivá «ajustar a la página»).',
    ruler: 'Esta regla debe medir exactamente 100 mm',
    front: 'FRENTE',
    back: 'DORSO',
    up: 'ARRIBA',
    page: 'PÁG. {n}',
    fold: 'PLIEGUE',
    crosses: 'Mirá la hoja a trasluz: las cruces de ambas caras deben coincidir. Si no, medí la diferencia y cargala en Impresión → «Corrección del dorso».',
    nonPrintable: 'Zona no imprimible ({n} mm)',
    lines: 'MUESTRAS DE LÍNEA',
    dots: 'MUESTRAS DE PUNTOS',
    grays: 'MUESTRAS DE GRIS',
    expected: 'Resultado esperado: las páginas 1 y 2 quedan espalda con espalda, ambas derechas.',
  },
  sewing: {
    title: 'PLANTILLA DE PERFORADO',
    instructions:
      'Doblá esta hoja por la línea del lomo, colocala dentro de cada cuadernillo y perforá en las marcas con un punzón.',
    stations: 'Estaciones de costura: {n}',
    kettle: 'Estaciones de cadeneta (extremos)',
  },
  cover: {
    spine: 'LOMO',
    front: 'TAPA',
    back: 'CONTRATAPA',
    turnIn: 'Margen de doblez',
    board: 'Cartón',
  },
  /** Textos de ejemplo de la plantilla para regalar (la persona los cambia por los suyos). */
  /** Nombre de una agenda nueva según la plantilla ({year}; {name}: la persona). */
  designName: {
    base: 'Agenda {year}',
    person: 'Agenda {name} {year}',
    clara: 'Agenda {year} · Lectura clara',
    minimal: 'Agenda {year} · Mínima',
  },
  gift: {
    title: 'Arquitectura del Tiempo',
    dedicationTitle: '{year}: El tiempo de florecer.',
    dedication:
      'Cada rama de tu historia es un refugio de amor. Hoy, la vida te invita a descansar en tu propia luz, a sembrar nuevos sueños y a disfrutar de la cosecha más dulce: el presente. Florecer no tiene edad; es el arte de habitar tu propia calma con la sabiduría del corazón.',
  },
  phrases: [
    'Un año nuevo es una página en blanco: escribila con calma.',
    'Lo pequeño, repetido, se vuelve grande.',
    'Respirá. No todo tiene que pasar hoy.',
    'Cuidar tus raíces también es avanzar.',
    'Hacé espacio para lo que importa.',
    'La mitad del camino también es un logro.',
    'Volvé a empezar las veces que haga falta.',
    'Tu ritmo también es un buen ritmo.',
    'Florecer lleva su tiempo.',
    'Agradecé lo que ya está floreciendo.',
    'Cosechá lo que sembraste este año.',
    'Cerrá el año con gratitud y abrí espacio a lo nuevo.',
  ],
  pages: {
    bestSelf: {
      title: 'Mi mejor versión posible',
      prompt: 'Imaginá que dentro de unos años todo salió tan bien como podía salir. Escribilo durante 15 o 20 minutos: dónde estás, qué hacés, con quién.',
      horizon: 'DENTRO DE ____ AÑOS',
      values: '3 VALORES PARA ESTE AÑO',
      goal: 'UNA META CONCRETA PARA {year}',
    },
    ifThen: {
      when: 'CUANDO ________ , VOY A ________',
      obstacle: 'SI ________ ME FRENA, ENTONCES ________',
      success: '¿CÓMO SÉ QUE LA CUMPLÍ?',
      difficulty: 'DIFICULTAD',
    },
    woop: {
      title: 'NUEVO COMIENZO',
      wish: 'DESEO',
      outcome: 'MEJOR RESULTADO',
      obstacle: 'OBSTÁCULO INTERNO',
      plan: 'SI [OBSTÁCULO], ENTONCES…',
    },
    sleep: {
      title: 'Diario de sueño',
      hint: 'Completalo cada mañana, en un minuto. Llevarlo dos semanas antes de una consulta aporta información valiosa.',
      bed: 'ME ACOSTÉ',
      latency: 'TARDÉ EN DORMIRME',
      awakenings: 'ME DESPERTÉ',
      up: 'ME LEVANTÉ',
      quality: 'DESCANSO 1–5',
    },
    unstuck: {
      title: 'Destrabar una tarea',
      avoiding: 'LO QUE ESTOY EVITANDO',
      feeling: '¿QUÉ ME HACE SENTIR?',
      firstStep: 'PRIMER PASO DE 5 MINUTOS',
      when: 'CUANDO ________ , LO HAGO',
    },
    estimates: {
      title: 'Estimé / tardé',
      task: 'TAREA',
      steps: 'PASOS',
      estimated: 'ESTIMÉ',
      actual: 'TARDÉ',
    },
    daily: {
      remember: 'HOY TENGO QUE ACORDARME DE…',
      top3: 'LAS 3 IMPORTANTES',
      progress: 'AVANCÉ EN…',
      tomorrow: 'MAÑANA TENGO QUE…',
      learned: 'HOY APRENDÍ…',
      mood: 'ÁNIMO',
      focus: 'BLOQUES DE CONCENTRACIÓN',
    },
    weekly: {
      openLoops: 'ME DA VUELTAS…',
      nextStep: 'PRÓXIMO PASO',
      when: 'CUÁNDO',
      reviewSteps: ['Junté las notas sueltas', 'Miré la semana pasada y la próxima', 'Definí el próximo paso de cada pendiente', 'Moví lo que sigue', 'Elegí 3 prioridades'],
      legend: 'SIGNOS',
      undated: 'SIN DÍA',
      carry: 'PASA A LA PRÓXIMA SEMANA',
    },
    habits: {
      automatic: '¿SALE SOLO? 1–5',
      footnote: 'Un hábito tarda, en la mediana de los estudios, unos dos meses en volverse automático, y varía mucho entre personas. Si fallás un día, retomá al siguiente: contá días hechos, no rachas.',
    },
    migration: {
      title: '¿SIGUE IMPORTANDO?',
      keep: 'LA PASO',
      schedule: 'LA AGENDO',
      drop: 'LA SUELTO',
    },
    signifiers: {
      task: 'Tarea planificada',
      done: 'Hecha',
      migrated: 'Movida a otro día',
      scheduled: 'Agendada más adelante',
      event: 'Evento',
      note: 'Nota',
      progress: 'Empezada',
      resumed: 'Retomé',
      priority: 'Prioridad',
    },
    goodThings: {
      title: '3 COSAS BUENAS',
      why: '¿POR QUÉ PASÓ?',
    },
    mood: {
      scale: '1 = muy bajo · 5 = muy bien',
      words: 'PALABRAS PARA NOMBRARLO',
      wordList: ['tranquila/o', 'contenta/o', 'agradecida/o', 'cansada/o', 'ansiosa/o', 'triste', 'frustrada/o', 'orgullosa/o', 'preocupada/o', 'en paz'],
      influence: '¿QUÉ INFLUYÓ? sueño · movimiento · gente · salud',
    },
    passwords: {
      mainEmail: 'CORREO PRINCIPAL',
      manager: 'GESTOR DE CONTRASEÑAS',
      changed: 'CAMBIO',
      twoFactor: '2 PASOS',
    },
    priorities: {
      top3: '3 PRIORIDADES',
      interrupt: 'SI ME INTERRUMPEN, ENTONCES…',
    },
  },
  weekLetters: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
};

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T;

export type AgendaStrings = Widen<typeof es>;
