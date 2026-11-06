/**
 * Catálogo de métodos. Cada entrada describe un método de planificación,
 * hábitos o bienestar, con un texto breve para imprimir en la guía, su nivel
 * de evidencia y las referencias verificadas (ver docs/evidencia-metodos.md).
 *
 * Para agregar un método nuevo: sumá una entrada aquí (textos en es/en/pt/it/de/fr,
 * nivel de evidencia y referencias) y, si modifica páginas, consultá
 * `ctx.has('<id>')` en la sección correspondiente. Los usuarios también
 * pueden crear métodos propios desde la interfaz (sin código).
 */
import type { Signifier } from '../layout/widgets';

export type EvidenceLevel = 'strong' | 'moderate' | 'limited' | 'practice' | 'contested';
export type MethodCategory = 'planning' | 'goals' | 'habits' | 'reflection' | 'wellbeing' | 'focus' | 'memory' | 'security';

export interface MethodText {
  name: string;
  text: string;
}

export interface PlannerMethod {
  id: string;
  category: MethodCategory;
  evidence: EvidenceLevel;
  refs: string[];
  legend?: Signifier[];
  /** Secciones que conviene activar con este método. */
  suggests?: string[];
  /** Páginas que modifica (para la interfaz). */
  affects?: string[];
  t: { es: MethodText; en: MethodText; pt: MethodText; it: MethodText; de: MethodText; fr: MethodText };
}

export const CATEGORY_ORDER: MethodCategory[] = ['planning', 'goals', 'habits', 'focus', 'reflection', 'wellbeing', 'memory', 'security'];

export const METHODS: PlannerMethod[] = [
  {
    id: 'alastair-method',
    category: 'planning',
    evidence: 'practice',
    legend: ['task', 'done', 'migrated', 'scheduled'],
    affects: ['weekRight'],
    refs: ['Johnston, A. The Alastair Method (Bullet Journal community). bulletjournal.com/blogs/bulletjournalist/future-log-the-alastair-method'],
    t: {
      es: { name: 'Semana Alastair', text: 'Escribí cada tarea una sola vez y poné un punto en el día en que pensás hacerla. Cuando la termines, tachá el punto; si no llegaste, movelo a otro día. Lo inventó un usuario, no un laboratorio: no fue estudiado directamente, pero combina dos cosas que sí ayudan: planificar y registrar lo que avanzás.' },
      en: { name: 'Alastair week', text: 'Write each task only once and put a dot in the column of the day you plan to do it. When it is done, cross the dot; if you did not get to it, move it to another day. It was invented by a user, not a lab: it has not been studied directly, but it combines two things that do help: planning and recording progress.' },
      pt: { name: 'Semana Alastair', text: 'Escreva cada tarefa uma única vez e marque um ponto no dia em que pretende fazê-la. Quando terminar, risque o ponto; se não deu, mova-o para outro dia. Foi inventado por um usuário, não por um laboratório: não foi estudado diretamente, mas combina duas coisas que ajudam: planejar e registrar o avanço.' },
      it: { name: 'Settimana Alastair', text: 'Scrivi ogni attività una sola volta e metti un punto nel giorno in cui pensi di farla. Quando l’hai finita, barra il punto; se non ci sei arrivato, spostalo a un altro giorno. L’ha inventato un utente, non un laboratorio: non è stato studiato direttamente, ma unisce due cose che aiutano: pianificare e registrare i progressi.' },
      de: { name: 'Alastair-Woche', text: 'Schreib jede Aufgabe nur einmal auf und setz einen Punkt in die Spalte des Tages, an dem du sie erledigen willst. Ist sie erledigt, streich den Punkt durch; hast du es nicht geschafft, verschieb ihn auf einen anderen Tag. Erfunden hat sie ein Nutzer, kein Labor: Sie wurde nicht direkt untersucht, verbindet aber zwei Dinge, die helfen: planen und Fortschritte festhalten.' },
      fr: { name: 'Semaine Alastair', text: 'Écrivez chaque tâche une seule fois et placez un point dans la colonne du jour où vous comptez la faire. Une fois la tâche faite, barrez le point ; si vous n’avez pas pu, déplacez-le à un autre jour. Elle a été inventée par un utilisateur, pas par un laboratoire : elle n’a pas été étudiée directement, mais elle combine deux choses qui aident : planifier et noter ses progrès.' },
    },
  },
  {
    id: 'bullet-journal',
    category: 'planning',
    evidence: 'limited',
    legend: ['task', 'event', 'note', 'done', 'migrated', 'scheduled'],
    affects: ['review', 'weekRight'],
    refs: [
      'Carroll, R. (2018). The Bullet Journal Method. Portfolio. ISBN 9780525533337.',
      'Ayobi, A., Sonne, T., Marshall, P., & Cox, A. L. (2018). Flexible and mindful self-tracking: Design implications from paper bullet journals. CHI 2018. doi:10.1145/3173574.3173602',
    ],
    t: {
      es: { name: 'Registro rápido y migración', text: 'Anotá en frases cortas, cada una con su signo: tarea, evento o nota. Una vez por mes, repasá lo pendiente y decidí: ¿lo paso, lo agendo o lo suelto? Reescribir cuesta un poco, y por eso mismo ayuda a filtrar. Hay estudios cualitativos sobre cómo se usa, pero todavía ningún ensayo controlado.' },
      en: { name: 'Rapid logging and migration', text: 'Write short phrases, each with its symbol: task, event or note. Once a month, review what is still open and decide: carry it, schedule it or let it go? Rewriting takes a little effort, and that is exactly why it filters. There are qualitative studies of how people use it, but no controlled trial yet.' },
      pt: { name: 'Registro rápido e migração', text: 'Anote em frases curtas, cada uma com seu sinal: tarefa, evento ou nota. Uma vez por mês, revise o que ficou pendente e decida: passo adiante, agendo ou deixo ir? Reescrever dá um pouco de trabalho, e justamente por isso ajuda a filtrar. Há estudos qualitativos sobre o uso, mas ainda nenhum ensaio controlado.' },
      it: { name: 'Annotazione rapida e migrazione', text: 'Scrivi frasi brevi, ognuna con il suo segno: attività, evento o nota. Una volta al mese rivedi ciò che è in sospeso e decidi: lo riporto, lo pianifico o lo lascio? Riscrivere costa un po’ di fatica, ed è proprio per questo che aiuta a filtrare. Esistono studi qualitativi sull’uso, ma ancora nessuno studio controllato.' },
      de: { name: 'Kurznotizen und Übertragen', text: 'Notiere in kurzen Sätzen, jeweils mit ihrem Symbol: Aufgabe, Termin oder Notiz. Geh einmal im Monat durch, was noch offen ist, und entscheide: übertragen, einplanen oder loslassen? Das Abschreiben kostet etwas Mühe, und gerade deshalb filtert es. Es gibt qualitative Studien dazu, wie Menschen die Methode nutzen, aber noch keine kontrollierte Studie.' },
      fr: { name: 'Notes rapides et migration', text: 'Notez en phrases courtes, chacune avec son symbole : tâche, événement ou note. Une fois par mois, passez en revue ce qui reste ouvert et décidez : je reporte, je planifie ou je laisse tomber ? Recopier demande un petit effort, et c’est justement pour cela que ça filtre. Il existe des études qualitatives sur son usage, mais encore aucun essai contrôlé.' },
    },
  },
  {
    id: 'implementation-intentions',
    category: 'goals',
    evidence: 'strong',
    affects: ['actionPlan', 'bestSelf'],
    refs: [
      'Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis of effects and processes. Advances in Experimental Social Psychology, 38, 69–119. doi:10.1016/S0065-2601(06)38002-1',
      'Sheeran, P., Listrom, O., & Gollwitzer, P. M. (2025). The when and how of planning: Meta-analysis of the scope and components of implementation intentions in 642 tests. European Review of Social Psychology, 36(1), 162–194. doi:10.1080/10463283.2024.2334563',
    ],
    t: {
      es: { name: 'Planes si-entonces', text: 'Una meta dice qué querés; un plan si-entonces dice cuándo y cómo. Por ejemplo: «Cuando termine de almorzar, salgo a caminar 15 minutos». Cientos de estudios muestran que este tipo de plan ayuda, en promedio, a cumplir metas que ya decidiste. Funciona mejor cuanto más concreta sea la situación.' },
      en: { name: 'If-then plans', text: 'A goal says what you want; an if-then plan says when and how. For example: “When I finish lunch, I will walk for 15 minutes.” Hundreds of studies show that this kind of plan helps, on average, to achieve goals you have already chosen. The more concrete the situation, the better it works.' },
      pt: { name: 'Planos se-então', text: 'Uma meta diz o que você quer; um plano se-então diz quando e como. Por exemplo: «Quando terminar o almoço, saio para caminhar 15 minutos». Centenas de estudos mostram que esse tipo de plano ajuda, em média, a cumprir metas já escolhidas. Funciona melhor quanto mais concreta for a situação.' },
      it: { name: 'Piani se-allora', text: 'Un obiettivo dice cosa vuoi; un piano se-allora dice quando e come. Per esempio: «Quando finisco di pranzare, esco a camminare 15 minuti». Centinaia di studi mostrano che questo tipo di piano aiuta, in media, a raggiungere obiettivi già scelti. Funziona meglio quanto più concreta è la situazione.' },
      de: { name: 'Wenn-dann-Pläne', text: 'Ein Ziel sagt, was du willst; ein Wenn-dann-Plan sagt, wann und wie. Zum Beispiel: „Wenn ich mit dem Mittagessen fertig bin, gehe ich 15 Minuten spazieren.“ Hunderte Studien zeigen, dass solche Pläne im Durchschnitt helfen, Ziele zu erreichen, für die du dich schon entschieden hast. Je konkreter die Situation, desto besser wirkt es.' },
      fr: { name: 'Plans si-alors', text: 'Un objectif dit ce que vous voulez ; un plan si-alors dit quand et comment. Par exemple : « Quand j’aurai fini de déjeuner, je marcherai 15 minutes. » Des centaines d’études montrent que ce type de plan aide, en moyenne, à atteindre des objectifs déjà choisis. Plus la situation est concrète, mieux cela fonctionne.' },
    },
  },
  {
    id: 'woop',
    category: 'goals',
    evidence: 'moderate',
    affects: ['monthCover'],
    refs: ['Wang, G., Wang, Y., & Gai, X. (2021). A meta-analysis of the effects of mental contrasting with implementation intentions on goal attainment. Frontiers in Psychology, 12, 565202. doi:10.3389/fpsyg.2021.565202'],
    t: {
      es: { name: 'WOOP (deseo, resultado, obstáculo, plan)', text: 'Pensá un deseo que sea posible. Imaginá el mejor resultado. Después buscá el obstáculo principal que depende de vos: cansancio, distracción, miedo. Cerrá con un plan: «Si aparece ese obstáculo, entonces voy a…». Los estudios sobre este método muestran efectos de pequeños a medianos.' },
      en: { name: 'WOOP (wish, outcome, obstacle, plan)', text: 'Think of a wish that is possible. Imagine the best outcome. Then find the main obstacle that depends on you: tiredness, distraction, fear. Close with a plan: “If that obstacle shows up, then I will…”. Studies of this method show small to medium effects.' },
      pt: { name: 'WOOP (desejo, resultado, obstáculo, plano)', text: 'Pense num desejo possível. Imagine o melhor resultado. Depois encontre o principal obstáculo que depende de você: cansaço, distração, medo. Feche com um plano: «Se esse obstáculo aparecer, então vou…». Os estudos sobre este método mostram efeitos de pequenos a médios.' },
      it: { name: 'WOOP (desiderio, risultato, ostacolo, piano)', text: 'Pensa a un desiderio possibile. Immagina il risultato migliore. Poi cerca l’ostacolo principale che dipende da te: stanchezza, distrazione, paura. Chiudi con un piano: «Se compare quell’ostacolo, allora farò…». Gli studi su questo metodo mostrano effetti da piccoli a medi.' },
      de: { name: 'WOOP (Wunsch, Ergebnis, Hindernis, Plan)', text: 'Denk an einen Wunsch, der machbar ist. Stell dir das beste Ergebnis vor. Such dann das wichtigste Hindernis, das von dir abhängt: Müdigkeit, Ablenkung, Angst. Schließ mit einem Plan ab: „Wenn dieses Hindernis auftaucht, dann werde ich …“. Studien zu dieser Methode zeigen kleine bis mittlere Effekte.' },
      fr: { name: 'WOOP (souhait, résultat, obstacle, plan)', text: 'Pensez à un souhait réalisable. Imaginez le meilleur résultat. Puis cherchez le principal obstacle qui dépend de vous : fatigue, distraction, peur. Terminez par un plan : « Si cet obstacle se présente, alors je… ». Les études sur cette méthode montrent des effets faibles à moyens.' },
    },
  },
  {
    id: 'specific-goals',
    category: 'goals',
    evidence: 'strong',
    affects: ['actionPlan'],
    refs: ['Locke, E. A., & Latham, G. P. (2002). Building a practically useful theory of goal setting and task motivation: A 35-year odyssey. American Psychologist, 57(9), 705–717. doi:10.1037/0003-066X.57.9.705'],
    t: {
      es: { name: 'Metas concretas y desafiantes', text: '«Caminar más» es difícil de cumplir porque nunca sabés si ya llegaste. «Caminar 20 minutos, 4 días por semana» te dice qué hacer y cuándo festejar. Décadas de investigación indican que las metas concretas y desafiantes, pero alcanzables, suelen funcionar mejor que las vagas.' },
      en: { name: 'Specific, challenging goals', text: '“Walk more” is hard to achieve because you never know whether you have arrived. “Walk 20 minutes, 4 days a week” tells you what to do and when to celebrate. Decades of research suggest that specific, challenging but achievable goals usually work better than vague ones.' },
      pt: { name: 'Metas concretas e desafiadoras', text: '«Caminhar mais» é difícil de cumprir porque você nunca sabe se já chegou. «Caminhar 20 minutos, 4 dias por semana» diz o que fazer e quando comemorar. Décadas de pesquisa indicam que metas concretas e desafiadoras, mas alcançáveis, costumam funcionar melhor que as vagas.' },
      it: { name: 'Obiettivi concreti e sfidanti', text: '«Camminare di più» è difficile da raggiungere perché non sai mai se ci sei arrivato. «Camminare 20 minuti, 4 giorni a settimana» ti dice cosa fare e quando festeggiare. Decenni di ricerca indicano che gli obiettivi concreti e sfidanti, ma raggiungibili, funzionano di solito meglio di quelli vaghi.' },
      de: { name: 'Konkrete, herausfordernde Ziele', text: '„Mehr spazieren gehen“ ist schwer zu erreichen, weil du nie weißt, ob du schon angekommen bist. „20 Minuten gehen, 4 Tage pro Woche“ sagt dir, was zu tun ist und wann du feiern kannst. Jahrzehnte der Forschung deuten darauf hin, dass konkrete, herausfordernde, aber erreichbare Ziele meist besser wirken als vage.' },
      fr: { name: 'Objectifs précis et ambitieux', text: '« Marcher plus » est difficile à atteindre, car on ne sait jamais si on y est arrivé. « Marcher 20 minutes, 4 jours par semaine » vous dit quoi faire et quand vous féliciter. Des décennies de recherche suggèrent que des objectifs précis et ambitieux, mais atteignables, fonctionnent généralement mieux que des objectifs vagues.' },
    },
  },
  {
    id: 'progress-monitoring',
    category: 'habits',
    evidence: 'strong',
    affects: ['habits'],
    refs: ['Harkin, B., Webb, T. L., Chang, B. P. I., Prestwich, A., Conner, M., Kellar, I., Benn, Y., & Sheeran, P. (2016). Does monitoring goal progress promote goal attainment? A meta-analysis of the experimental evidence. Psychological Bulletin, 142(2), 198–229. doi:10.1037/bul0000025'],
    t: {
      es: { name: 'Registrar el progreso', text: 'Registrar tu avance en papel, con regularidad, es de las estrategias mejor respaldadas. En un análisis de 138 experimentos, quienes seguían su progreso cumplían más sus metas, sobre todo cuando lo anotaban o se lo contaban a alguien. Con una marca por día alcanza.' },
      en: { name: 'Tracking progress', text: 'Regularly recording your progress on paper is one of the best-supported strategies. In an analysis of 138 experiments, people who tracked their progress achieved their goals more often, especially when they wrote it down or told someone. One mark a day is enough.' },
      pt: { name: 'Registrar o progresso', text: 'Registrar seu avanço no papel, com regularidade, é uma das estratégias mais bem fundamentadas. Numa análise de 138 experimentos, quem acompanhava o progresso cumpria mais suas metas, sobretudo quando anotava ou contava a alguém. Uma marca por dia basta.' },
      it: { name: 'Registrare i progressi', text: 'Registrare i tuoi progressi su carta, con regolarità, è tra le strategie meglio sostenute. In un’analisi di 138 esperimenti, chi seguiva i propri progressi raggiungeva più spesso gli obiettivi, soprattutto se li annotava o li raccontava a qualcuno. Basta un segno al giorno.' },
      de: { name: 'Fortschritte festhalten', text: 'Deine Fortschritte regelmäßig auf Papier festzuhalten, gehört zu den am besten belegten Strategien. In einer Auswertung von 138 Experimenten erreichten Menschen, die ihren Fortschritt verfolgten, ihre Ziele häufiger, vor allem, wenn sie ihn aufschrieben oder jemandem davon erzählten. Ein Strich pro Tag reicht.' },
      fr: { name: 'Suivre ses progrès', text: 'Noter régulièrement vos progrès sur papier est l’une des stratégies les mieux étayées. Dans une analyse de 138 expériences, les personnes qui suivaient leurs progrès atteignaient plus souvent leurs objectifs, surtout quand elles les notaient ou en parlaient à quelqu’un. Une marque par jour suffit.' },
    },
  },
  {
    id: 'habit-timeline',
    category: 'habits',
    evidence: 'moderate',
    affects: ['habits'],
    refs: [
      'Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. European Journal of Social Psychology, 40(6), 998–1009. doi:10.1002/ejsp.674',
      'Singh, B., et al. (2024). Time to form a habit: A systematic review and meta-analysis of health behaviour habit formation and its determinants. Healthcare, 12(23), 2488. doi:10.3390/healthcare12232488',
    ],
    t: {
      es: { name: 'Cuánto tarda un hábito', text: 'Un hábito nuevo no tarda 21 días. En los estudios, la mediana ronda los dos meses, y cambia muchísimo de una persona a otra: de unas semanas a casi un año. Si te lleva más, no estás haciendo nada mal: lo que cuenta es repetirlo en la misma situación.' },
      en: { name: 'How long a habit takes', text: 'A new habit does not take 21 days. In studies the median is around two months, and it varies enormously between people: from a few weeks to almost a year. If it takes you longer, you are not doing anything wrong: what counts is repeating it in the same situation.' },
      pt: { name: 'Quanto demora um hábito', text: 'Um hábito novo não leva 21 dias. Nos estudos, a mediana fica em torno de dois meses, e varia muito de pessoa para pessoa: de algumas semanas a quase um ano. Se levar mais, você não está fazendo nada errado: o que conta é repetir na mesma situação.' },
      it: { name: 'Quanto ci vuole per un’abitudine', text: 'Un’abitudine nuova non richiede 21 giorni. Negli studi la mediana è di circa due mesi, e varia moltissimo da persona a persona: da qualche settimana a quasi un anno. Se ti serve più tempo non stai sbagliando: conta ripeterla nella stessa situazione.' },
      de: { name: 'Wie lange eine Gewohnheit braucht', text: 'Eine neue Gewohnheit braucht nicht 21 Tage. In Studien liegt der Median bei etwa zwei Monaten, und das ist von Mensch zu Mensch enorm verschieden: von ein paar Wochen bis fast zu einem Jahr. Wenn es bei dir länger dauert, machst du nichts falsch: Entscheidend ist, sie in derselben Situation zu wiederholen.' },
      fr: { name: 'Le temps d’une habitude', text: 'Une nouvelle habitude ne prend pas 21 jours. Dans les études, la médiane tourne autour de deux mois, et elle varie énormément d’une personne à l’autre : de quelques semaines à presque un an. Si cela vous prend plus de temps, vous ne faites rien de mal : ce qui compte, c’est de la répéter dans la même situation.' },
    },
  },
  {
    id: 'habit-anchoring',
    category: 'habits',
    evidence: 'moderate',
    affects: ['habits'],
    refs: [
      'Wood, W., & Rünger, D. (2016). Psychology of habit. Annual Review of Psychology, 67, 289–314. doi:10.1146/annurev-psych-122414-033417',
      'Judah, G., Gardner, B., & Aunger, R. (2013). Forming a flossing habit: An exploratory study of the psychological determinants of habit formation. British Journal of Health Psychology, 18(2), 338–353.',
    ],
    t: {
      es: { name: 'Anclar hábitos a una rutina', text: 'Los hábitos se forman repitiendo algo en la misma situación hasta que esa situación lo dispara sola. Elegí una rutina que ya tenés y sumale algo pequeño: «Después de cepillarme los dientes, uso el hilo dental». Empezá chico; agrandar viene después.' },
      en: { name: 'Anchoring habits to a routine', text: 'Habits form by repeating something in the same situation until the situation triggers it on its own. Pick a routine you already have and add something small: “After brushing my teeth, I floss.” Start small; growing comes later.' },
      pt: { name: 'Ancorar hábitos numa rotina', text: 'Os hábitos se formam repetindo algo na mesma situação até que a própria situação o dispare. Escolha uma rotina que você já tem e acrescente algo pequeno: «Depois de escovar os dentes, uso o fio dental». Comece pequeno; crescer vem depois.' },
      it: { name: 'Ancorare le abitudini a una routine', text: 'Le abitudini si formano ripetendo qualcosa nella stessa situazione finché è la situazione stessa a farla scattare. Scegli una routine che hai già e aggiungi qualcosa di piccolo: «Dopo essermi lavato i denti, uso il filo interdentale». Comincia in piccolo; crescere viene dopo.' },
      de: { name: 'Gewohnheiten an eine Routine knüpfen', text: 'Gewohnheiten entstehen, wenn du etwas in derselben Situation wiederholst, bis die Situation es von selbst auslöst. Nimm eine Routine, die du schon hast, und häng etwas Kleines daran: „Nachdem ich mir die Zähne geputzt habe, benutze ich Zahnseide.“ Fang klein an; steigern kommt später.' },
      fr: { name: 'Ancrer une habitude à une routine', text: 'Les habitudes se forment en répétant un geste dans la même situation, jusqu’à ce que celle-ci le déclenche seule. Choisissez une routine que vous avez déjà et ajoutez-y quelque chose de petit : « Après m’être brossé les dents, je passe le fil dentaire. » Commencez petit ; vous élargirez plus tard.' },
    },
  },
  {
    id: 'streaks',
    category: 'habits',
    evidence: 'moderate',
    affects: ['habits'],
    legend: ['resumed'],
    refs: ['Silverman, J., & Barasch, A. (2023). On or off track: How (broken) streaks affect consumer decisions. Journal of Consumer Research, 49(6), 1095–1117. doi:10.1093/jcr/ucac029'],
    t: {
      es: { name: 'Días hechos, no rachas', text: 'Una cadena de días seguidos motiva… hasta que se corta, y ahí mucha gente abandona. Por eso este registro cuenta cuántos días lo hiciste, no cuántos seguidos. Saltearte un día no arruina un hábito: lo importante es volver al día siguiente, aunque sea con una versión mínima.' },
      en: { name: 'Days done, not streaks', text: 'A chain of consecutive days motivates… until it breaks, and then many people give up. That is why this tracker counts how many days you did it, not how many in a row. Skipping one day does not ruin a habit: what matters is coming back the next day, even with a minimal version.' },
      pt: { name: 'Dias feitos, não sequências', text: 'Uma corrente de dias seguidos motiva… até se romper, e aí muita gente desiste. Por isso este registro conta quantos dias você fez, não quantos seguidos. Pular um dia não estraga um hábito: o importante é voltar no dia seguinte, nem que seja com uma versão mínima.' },
      it: { name: 'Giorni fatti, non serie', text: 'Una catena di giorni consecutivi motiva… finché si spezza, e lì molti mollano. Per questo il registro conta quanti giorni l’hai fatto, non quanti di fila. Saltare un giorno non rovina un’abitudine: l’importante è tornare il giorno dopo, anche con una versione minima.' },
      de: { name: 'Erledigte Tage statt Serien', text: 'Eine Kette aufeinanderfolgender Tage motiviert… bis sie reißt, und dann geben viele auf. Deshalb zählt dieser Tracker, an wie vielen Tagen du es getan hast, nicht wie viele am Stück. Ein ausgelassener Tag ruiniert keine Gewohnheit: Wichtig ist, am nächsten Tag weiterzumachen, notfalls in einer Mini-Version.' },
      fr: { name: 'Jours faits, pas séries', text: 'Une chaîne de jours consécutifs motive… jusqu’à ce qu’elle se brise, et beaucoup abandonnent alors. C’est pourquoi ce suivi compte le nombre de jours où vous l’avez fait, pas combien d’affilée. Sauter un jour ne ruine pas une habitude : l’important est de revenir le lendemain, même avec une version minimale.' },
    },
  },
  {
    id: 'top-priorities',
    category: 'planning',
    evidence: 'practice',
    affects: ['weekLeft', 'daily'],
    refs: ['Parke, M. R., Weinhardt, J. M., Brodsky, A., Tangirala, S., & DeVoe, S. E. (2018). When daily planning improves employee performance: The importance of planning type, engagement, and interruptions. Journal of Applied Psychology, 103(3), 300–312. doi:10.1037/apl0000278'],
    t: {
      es: { name: 'Tres prioridades', text: 'Anotá las tres tareas más importantes, en orden, y empezá por la primera. La famosa historia de Ivy Lee y su cheque de 25.000 dólares no está documentada, pero en estudios con empleados priorizar y prever interrupciones sí se asocia con días de trabajo más productivos.' },
      en: { name: 'Three priorities', text: 'Write down the three most important tasks, in order, and start with the first. The famous story of Ivy Lee and his 25,000-dollar cheque is not documented, but in studies with employees, prioritising and planning for interruptions is associated with more productive workdays.' },
      pt: { name: 'Três prioridades', text: 'Anote as três tarefas mais importantes, em ordem, e comece pela primeira. A famosa história de Ivy Lee e seu cheque de 25 mil dólares não é documentada, mas em estudos com funcionários priorizar e prever interrupções se associa a dias de trabalho mais produtivos.' },
      it: { name: 'Tre priorità', text: 'Annota le tre attività più importanti, in ordine, e comincia dalla prima. La famosa storia di Ivy Lee e del suo assegno da 25.000 dollari non è documentata, ma negli studi con dipendenti dare priorità e prevedere le interruzioni si associa a giornate più produttive.' },
      de: { name: 'Drei Prioritäten', text: 'Schreib die drei wichtigsten Aufgaben der Reihe nach auf und fang mit der ersten an. Die berühmte Geschichte von Ivy Lee und seinem Scheck über 25.000 Dollar ist nicht belegt, aber in Studien mit Beschäftigten hängen Priorisieren und das Einplanen von Unterbrechungen mit produktiveren Arbeitstagen zusammen.' },
      fr: { name: 'Trois priorités', text: 'Notez les trois tâches les plus importantes, dans l’ordre, et commencez par la première. La célèbre histoire d’Ivy Lee et de son chèque de 25 000 dollars n’est pas documentée, mais dans des études auprès de salariés, prioriser et anticiper les interruptions est associé à des journées de travail plus productives.' },
    },
  },
  {
    id: 'weekly-review',
    category: 'planning',
    evidence: 'practice',
    affects: ['weekRight'],
    refs: ['Heylighen, F., & Vidal, C. (2008). Getting Things Done: The science behind stress-free productivity. Long Range Planning, 41(6), 585–605. doi:10.1016/j.lrp.2008.09.004'],
    t: {
      es: { name: 'Revisión semanal', text: 'Una vez por semana, dedicale 20 minutos a la agenda: juntá las notas sueltas, mirá la semana que pasó y la que viene, y definí el siguiente paso de cada pendiente. Viene de la práctica (Getting Things Done) y no fue evaluada en estudios controlados, pero combina planificar, registrar y reflexionar.' },
      en: { name: 'Weekly review', text: 'Once a week, give your planner 20 minutes: gather loose notes, look at the week that passed and the one ahead, and define the next step for each open item. It comes from practice (Getting Things Done) and has not been tested in controlled studies, but it combines planning, recording and reflecting.' },
      pt: { name: 'Revisão semanal', text: 'Uma vez por semana, dedique 20 minutos à agenda: junte as notas soltas, olhe a semana que passou e a próxima, e defina o próximo passo de cada pendência. Vem da prática (Getting Things Done) e não foi avaliada em estudos controlados, mas combina planejar, registrar e refletir.' },
      it: { name: 'Revisione settimanale', text: 'Una volta alla settimana dedica 20 minuti all’agenda: raccogli gli appunti sparsi, guarda la settimana passata e quella che viene e definisci il prossimo passo di ogni sospeso. Nasce dalla pratica (Getting Things Done) e non è stata valutata in studi controllati, ma unisce pianificare, registrare e riflettere.' },
      de: { name: 'Wochenrückblick', text: 'Nimm dir einmal pro Woche 20 Minuten für deinen Planer: Sammle lose Notizen, schau auf die vergangene und die kommende Woche und leg für jeden offenen Punkt den nächsten Schritt fest. Das kommt aus der Praxis (Getting Things Done) und wurde nicht in kontrollierten Studien geprüft, verbindet aber Planen, Festhalten und Nachdenken.' },
      fr: { name: 'Bilan hebdomadaire', text: 'Une fois par semaine, accordez 20 minutes à votre agenda : rassemblez les notes éparses, regardez la semaine écoulée et celle à venir, et définissez la prochaine étape de chaque point ouvert. Cela vient de la pratique (Getting Things Done) et n’a pas été évalué dans des études contrôlées, mais combine planifier, noter et réfléchir.' },
    },
  },
  {
    id: 'time-estimates',
    category: 'planning',
    evidence: 'moderate',
    suggests: ['estimates'],
    refs: [
      'Buehler, R., Griffin, D., & Ross, M. (1994). Exploring the “planning fallacy”: Why people underestimate their task completion times. Journal of Personality and Social Psychology, 67(3), 366–381. doi:10.1037/0022-3514.67.3.366',
      'Kruger, J., & Evans, M. (2004). If you don’t want to be late, enumerate: Unpacking reduces the planning fallacy. Journal of Experimental Social Psychology, 40(5), 586–598. doi:10.1016/j.jesp.2003.11.001',
    ],
    t: {
      es: { name: 'Estimé / tardé', text: 'Casi todos subestimamos cuánto tardan las cosas, aunque ya nos haya pasado antes. Dos trucos ayudan: dividir la tarea en pasos antes de estimar, y anotar después cuánto tardaste de verdad. Con el tiempo, tu columna de «tardé» va a ser tu mejor guía.' },
      en: { name: 'Estimated / actual', text: 'Almost all of us underestimate how long things take, even when it has happened before. Two tricks help: break the task into steps before estimating, and afterwards write down how long it really took. Over time, your “actual” column becomes your best guide.' },
      pt: { name: 'Estimei / levei', text: 'Quase todos subestimamos quanto tempo as coisas levam, mesmo quando já aconteceu antes. Dois truques ajudam: dividir a tarefa em passos antes de estimar e anotar depois quanto tempo levou de verdade. Com o tempo, a coluna «levei» será seu melhor guia.' },
      it: { name: 'Stimato / impiegato', text: 'Quasi tutti sottovalutiamo quanto tempo richiedono le cose, anche se ci è già successo. Due trucchi aiutano: dividere il compito in passi prima di stimare e annotare dopo quanto ci hai messo davvero. Col tempo la colonna «impiegato» sarà la tua guida migliore.' },
      de: { name: 'Geschätzt / tatsächlich', text: 'Fast alle von uns unterschätzen, wie lange Dinge dauern, selbst wenn es uns schon einmal passiert ist. Zwei Tricks helfen: die Aufgabe vor dem Schätzen in Schritte zerlegen und hinterher notieren, wie lange es wirklich gedauert hat. Mit der Zeit wird deine Spalte „tatsächlich“ zu deinem besten Wegweiser.' },
      fr: { name: 'Estimé / réel', text: 'Presque tous, nous sous-estimons le temps que prennent les choses, même quand cela nous est déjà arrivé. Deux astuces aident : découper la tâche en étapes avant d’estimer, puis noter combien de temps elle a vraiment pris. Avec le temps, votre colonne « réel » deviendra votre meilleur guide.' },
    },
  },
  {
    id: 'open-loops',
    category: 'planning',
    evidence: 'limited',
    affects: ['weekLeft'],
    refs: [
      'Masicampo, E. J., & Baumeister, R. F. (2011). Consider it done! Plan making can eliminate the cognitive effects of unfulfilled goals. Journal of Personality and Social Psychology, 101(4), 667–683. doi:10.1037/a0024192',
      'Ghibellini, R., & Meier, B. (2025). Interruption, recall and resumption: A meta-analysis of the Zeigarnik and Ovsiankina effects. Humanities and Social Sciences Communications, 12, 962. doi:10.1057/s41599-025-05000-w',
    ],
    t: {
      es: { name: 'Pendientes que dan vueltas', text: 'Si un pendiente te da vueltas en la cabeza, anotá el próximo paso concreto y cuándo lo vas a hacer. Un estudio de 2011 encontró que planificarlo así reducía esos pensamientos que interrumpen. Todavía no hay replicaciones directas: tomalo como una idea prometedora, no como una garantía.' },
      en: { name: 'Open loops', text: 'If an open task keeps circling in your head, write down the concrete next step and when you will do it. A 2011 study found that planning it this way reduced those intrusive thoughts. There are no direct replications yet: take it as a promising idea, not a guarantee.' },
      pt: { name: 'Pendências que não saem da cabeça', text: 'Se uma pendência não sai da sua cabeça, anote o próximo passo concreto e quando vai fazê-lo. Um estudo de 2011 encontrou que planejar assim reduzia esses pensamentos intrusivos. Ainda não há replicações diretas: tome como uma ideia promissora, não como garantia.' },
      it: { name: 'Pensieri in sospeso', text: 'Se un sospeso ti gira in testa, annota il prossimo passo concreto e quando lo farai. Uno studio del 2011 ha trovato che pianificarlo così riduceva quei pensieri intrusivi. Non ci sono ancora repliche dirette: prendila come un’idea promettente, non come una garanzia.' },
      de: { name: 'Offene Schleifen', text: 'Wenn dir eine offene Aufgabe nicht aus dem Kopf geht, notiere den konkreten nächsten Schritt und wann du ihn machst. Eine Studie von 2011 fand, dass so ein Plan diese störenden Gedanken verringerte. Direkte Replikationen gibt es noch nicht: Sieh es als vielversprechende Idee, nicht als Garantie.' },
      fr: { name: 'Tâches qui trottent dans la tête', text: 'Si une tâche en suspens vous trotte dans la tête, notez la prochaine étape concrète et quand vous la ferez. Une étude de 2011 a montré que planifier ainsi réduisait ces pensées intrusives. Il n’existe pas encore de réplications directes : voyez-y une idée prometteuse, pas une garantie.' },
    },
  },
  {
    id: 'brain-dump',
    category: 'wellbeing',
    evidence: 'limited',
    affects: ['daily'],
    refs: ['Scullin, M. K., Krueger, M. L., Ballard, H. K., Pruett, N., & Bliwise, D. L. (2018). The effects of bedtime writing on difficulty falling asleep: A polysomnographic study comparing to-do lists and completed activity lists. Journal of Experimental Psychology: General, 147(1), 139–146. doi:10.1037/xge0000374'],
    t: {
      es: { name: 'Lista para mañana', text: 'Antes de dormir, tomate cinco minutos para anotar lo que tenés que hacer mañana, lo más concreto posible. En un estudio de laboratorio, quienes lo hicieron se durmieron unos diez minutos antes que quienes anotaron lo ya hecho. Fue con jóvenes sanos: probalo y fijate si te sirve.' },
      en: { name: 'Tomorrow list', text: 'Before sleeping, take five minutes to write down what you have to do tomorrow, as concretely as possible. In a laboratory study, people who did this fell asleep about ten minutes sooner than those who wrote what they had already done. It was done with healthy young adults: try it and see if it helps you.' },
      pt: { name: 'Lista para amanhã', text: 'Antes de dormir, tire cinco minutos para anotar o que precisa fazer amanhã, o mais concreto possível. Num estudo de laboratório, quem fez isso dormiu uns dez minutos antes de quem anotou o que já tinha feito. Foi com jovens saudáveis: experimente e veja se ajuda.' },
      it: { name: 'Lista per domani', text: 'Prima di dormire prenditi cinque minuti per annotare cosa devi fare domani, nel modo più concreto possibile. In uno studio di laboratorio chi lo ha fatto si è addormentato circa dieci minuti prima di chi ha annotato ciò che aveva già fatto. Era con giovani sani: provalo e vedi se ti aiuta.' },
      de: { name: 'Liste für morgen', text: 'Nimm dir vor dem Schlafen fünf Minuten, um aufzuschreiben, was du morgen erledigen musst, so konkret wie möglich. In einer Laborstudie schliefen Menschen, die das taten, etwa zehn Minuten früher ein als jene, die aufschrieben, was sie schon erledigt hatten. Getestet wurde mit gesunden jungen Erwachsenen: Probier es aus und schau, ob es dir hilft.' },
      fr: { name: 'Liste pour demain', text: 'Avant de dormir, prenez cinq minutes pour noter ce que vous avez à faire demain, de la façon la plus concrète possible. Dans une étude en laboratoire, les personnes qui l’ont fait se sont endormies environ dix minutes plus tôt que celles qui notaient ce qu’elles avaient déjà fait. C’était avec de jeunes adultes en bonne santé : essayez et voyez si cela vous aide.' },
    },
  },
  {
    id: 'three-good-things',
    category: 'wellbeing',
    evidence: 'moderate',
    affects: ['daily'],
    refs: [
      'Emmons, R. A., & McCullough, M. E. (2003). Counting blessings versus burdens. Journal of Personality and Social Psychology, 84(2), 377–389. doi:10.1037/0022-3514.84.2.377',
      'Seligman, M. E. P., Steen, T. A., Park, N., & Peterson, C. (2005). Positive psychology progress: Empirical validation of interventions. American Psychologist, 60(5), 410–421.',
      'Davis, D. E., et al. (2016). Thankful for the little things: A meta-analysis of gratitude interventions. Journal of Counseling Psychology, 63(1), 20–31. doi:10.1037/cou0000107',
      'Cregg, D. R., & Cheavens, J. S. (2021). Gratitude interventions: Effective self-help? A meta-analysis of the impact on symptoms of depression and anxiety. Journal of Happiness Studies, 22, 413–445. doi:10.1007/s10902-020-00236-6',
    ],
    t: {
      es: { name: 'Tres cosas buenas', text: 'Al final del día, anotá tres cosas que salieron bien y por qué pasaron. Los estudios muestran efectos pequeños pero reales sobre el bienestar. No reemplaza un tratamiento si estás pasando un momento difícil: es un hábito chico para entrenar la mirada.' },
      en: { name: 'Three good things', text: 'At the end of the day, write down three things that went well and why they happened. Studies show small but real effects on wellbeing. It does not replace treatment if you are going through a hard time: it is a small habit to train your attention.' },
      pt: { name: 'Três coisas boas', text: 'No fim do dia, anote três coisas que deram certo e por que aconteceram. Os estudos mostram efeitos pequenos, mas reais, sobre o bem-estar. Não substitui um tratamento se você estiver passando por um momento difícil: é um hábito pequeno para treinar o olhar.' },
      it: { name: 'Tre cose belle', text: 'A fine giornata annota tre cose andate bene e perché sono successe. Gli studi mostrano effetti piccoli ma reali sul benessere. Non sostituisce una cura se stai attraversando un momento difficile: è una piccola abitudine per allenare lo sguardo.' },
      de: { name: 'Drei gute Dinge', text: 'Schreib am Ende des Tages drei Dinge auf, die gut gelaufen sind, und warum sie passiert sind. Studien zeigen kleine, aber echte Effekte auf das Wohlbefinden. Es ersetzt keine Behandlung, wenn du gerade eine schwere Zeit durchmachst: Es ist eine kleine Gewohnheit, um den Blick zu schulen.' },
      fr: { name: 'Trois bonnes choses', text: 'En fin de journée, notez trois choses qui se sont bien passées et pourquoi elles sont arrivées. Les études montrent des effets faibles mais réels sur le bien-être. Cela ne remplace pas un traitement si vous traversez une période difficile : c’est une petite habitude pour entraîner le regard.' },
    },
  },
  {
    id: 'daily-reflection',
    category: 'reflection',
    evidence: 'limited',
    affects: ['review', 'daily'],
    refs: ['Di Stefano, G., Gino, F., Pisano, G. P., & Staats, B. R. Learning by thinking: How reflection can spur progress along the learning curve. Harvard Business School Working Paper 14-093. papers.ssrn.com/abstract=2414478'],
    t: {
      es: { name: 'Reflexión breve', text: 'Dedicá unos minutos al final del día o del mes a escribir qué aprendiste y qué harías distinto. En un estudio con empleados de un centro de servicios, quienes reflexionaban 15 minutos por día rendían más que quienes seguían trabajando ese rato. Es un resultado preliminar, pero probarlo cuesta poco.' },
      en: { name: 'Brief reflection', text: 'Spend a few minutes at the end of the day or month writing what you learned and what you would do differently. In a study with employees of a service centre, those who reflected for 15 minutes a day performed better than those who kept working. It is a preliminary result, but trying it costs little.' },
      pt: { name: 'Reflexão breve', text: 'Dedique alguns minutos no fim do dia ou do mês para escrever o que aprendeu e o que faria diferente. Num estudo com funcionários de uma central de serviços, quem refletia 15 minutos por dia rendia mais do que quem continuava trabalhando. É um resultado preliminar, mas experimentar custa pouco.' },
      it: { name: 'Breve riflessione', text: 'Dedica qualche minuto alla fine della giornata o del mese a scrivere cosa hai imparato e cosa faresti diversamente. In uno studio con dipendenti di un centro servizi, chi rifletteva 15 minuti al giorno rendeva di più di chi continuava a lavorare. È un risultato preliminare, ma provarlo costa poco.' },
      de: { name: 'Kurze Reflexion', text: 'Nimm dir am Ende des Tages oder des Monats ein paar Minuten, um aufzuschreiben, was du gelernt hast und was du anders machen würdest. In einer Studie mit Beschäftigten eines Servicecenters schnitten diejenigen, die täglich 15 Minuten reflektierten, besser ab als die, die in dieser Zeit weiterarbeiteten. Das Ergebnis ist vorläufig, aber ein Versuch kostet wenig.' },
      fr: { name: 'Brève réflexion', text: 'Prenez quelques minutes en fin de journée ou de mois pour écrire ce que vous avez appris et ce que vous feriez autrement. Dans une étude auprès d’employés d’un centre de services, ceux qui réfléchissaient 15 minutes par jour étaient plus performants que ceux qui continuaient à travailler. C’est un résultat préliminaire, mais essayer coûte peu.' },
    },
  },
  {
    id: 'fresh-start',
    category: 'reflection',
    evidence: 'moderate',
    affects: ['monthCover'],
    refs: [
      'Dai, H., Milkman, K. L., & Riis, J. (2014). The fresh start effect: Temporal landmarks motivate aspirational behavior. Management Science, 60(10), 2563–2582. doi:10.1287/mnsc.2014.1901',
      'Beshears, J., Dai, H., Milkman, K. L., & Benartzi, S. (2021). Using fresh starts to nudge increased retirement savings. Organizational Behavior and Human Decision Processes, 167, 72–87.',
    ],
    t: {
      es: { name: 'Nuevos comienzos', text: 'Los comienzos —un lunes, un mes nuevo, tu cumpleaños— nos dan ganas de empezar de cero. Aprovechalos: elegí una sola cosa para arrancar y anotá cuándo y cómo. Los estudios muestran que estos hitos aumentan los intentos; que duren depende del plan y del seguimiento.' },
      en: { name: 'Fresh starts', text: 'Beginnings — a Monday, a new month, your birthday — make us want to start over. Use them: pick just one thing to begin and write down when and how. Studies show these landmarks increase attempts; whether they last depends on the plan and on follow-up.' },
      pt: { name: 'Novos começos', text: 'Os começos — uma segunda-feira, um mês novo, seu aniversário — dão vontade de recomeçar. Aproveite: escolha uma única coisa para começar e anote quando e como. Os estudos mostram que esses marcos aumentam as tentativas; que durem depende do plano e do acompanhamento.' },
      it: { name: 'Nuovi inizi', text: 'Gli inizi — un lunedì, un mese nuovo, il tuo compleanno — ci fanno venire voglia di ricominciare. Approfittane: scegli una sola cosa da avviare e annota quando e come. Gli studi mostrano che queste tappe aumentano i tentativi; che durino dipende dal piano e dal monitoraggio.' },
      de: { name: 'Neuanfänge', text: 'Anfänge – ein Montag, ein neuer Monat, dein Geburtstag – wecken die Lust, neu zu beginnen. Nutze sie: Such dir eine einzige Sache aus, mit der du anfängst, und notiere, wann und wie. Studien zeigen, dass solche Wendepunkte die Zahl der Versuche erhöhen; ob sie anhalten, hängt vom Plan und vom Dranbleiben ab.' },
      fr: { name: 'Nouveaux départs', text: 'Les débuts — un lundi, un nouveau mois, votre anniversaire — nous donnent envie de repartir de zéro. Profitez-en : choisissez une seule chose à commencer et notez quand et comment. Les études montrent que ces repères augmentent les tentatives ; qu’elles durent dépend du plan et du suivi.' },
    },
  },
  {
    id: 'best-possible-self',
    category: 'reflection',
    evidence: 'moderate',
    suggests: ['bestSelf'],
    refs: [
      'King, L. A. (2001). The health benefits of writing about life goals. Personality and Social Psychology Bulletin, 27(7), 798–807.',
      'Carrillo, A., Rubio-Aparicio, M., Molinari, G., Enrique, Á., Sánchez-Meca, J., & Baños, R. M. (2019). Effects of the Best Possible Self intervention: A systematic review and meta-analysis. PLOS ONE, 14(9), e0222386. doi:10.1371/journal.pone.0222386',
    ],
    t: {
      es: { name: 'Mi mejor versión posible', text: 'Imaginá que dentro de unos años todo salió tan bien como podía salir, y escribilo durante 15 o 20 minutos: dónde estás, qué hacés, con quién. Varios estudios encuentran mejoras de pequeñas a moderadas en el optimismo y el ánimo. Después, convertí una parte de esa imagen en una meta concreta para este año.' },
      en: { name: 'Best possible self', text: 'Imagine that in a few years everything has gone as well as it could, and write about it for 15 to 20 minutes: where you are, what you do, who you are with. Several studies find small to moderate improvements in optimism and mood. Then turn part of that picture into a concrete goal for this year.' },
      pt: { name: 'Minha melhor versão possível', text: 'Imagine que daqui a alguns anos tudo deu tão certo quanto poderia, e escreva por 15 a 20 minutos: onde você está, o que faz, com quem. Vários estudos encontram melhoras de pequenas a moderadas no otimismo e no ânimo. Depois, transforme parte dessa imagem numa meta concreta para este ano.' },
      it: { name: 'La mia versione migliore', text: 'Immagina che tra qualche anno tutto sia andato nel miglior modo possibile e scrivilo per 15–20 minuti: dove sei, cosa fai, con chi. Diversi studi trovano miglioramenti da piccoli a moderati nell’ottimismo e nell’umore. Poi trasforma una parte di quell’immagine in un obiettivo concreto per quest’anno.' },
      de: { name: 'Bestmögliches Selbst', text: 'Stell dir vor, in ein paar Jahren ist alles so gut gelaufen, wie es nur ging, und schreib 15 bis 20 Minuten darüber: wo du bist, was du tust, mit wem. Mehrere Studien finden kleine bis mittlere Verbesserungen bei Optimismus und Stimmung. Mach danach aus einem Teil dieses Bildes ein konkretes Ziel für dieses Jahr.' },
      fr: { name: 'Ma meilleure version possible', text: 'Imaginez que, dans quelques années, tout s’est passé aussi bien que possible, et écrivez-le pendant 15 à 20 minutes : où vous êtes, ce que vous faites, avec qui. Plusieurs études trouvent des améliorations faibles à modérées de l’optimisme et de l’humeur. Ensuite, transformez une partie de cette image en un objectif concret pour cette année.' },
    },
  },
  {
    id: 'done-list',
    category: 'reflection',
    evidence: 'limited',
    affects: ['daily'],
    refs: ['Amabile, T. M., & Kramer, S. J. (2011). The Progress Principle. Harvard Business Review Press.'],
    t: {
      es: { name: 'Lista de avances', text: 'Anotá lo que avanzaste hoy, aunque sea poco. En un estudio con miles de diarios de trabajadores, los días en que se avanzaba en algo significativo eran los de mejor ánimo y motivación. Hacé esta lista al terminar tu jornada; antes de dormir conviene más anotar lo de mañana.' },
      en: { name: 'Progress list', text: 'Write down what you moved forward today, even if it is little. In a study of thousands of workers’ diary entries, days with progress on something meaningful were the days with the best mood and motivation. Make this list when your workday ends; before sleep, it is better to note tomorrow’s tasks.' },
      pt: { name: 'Lista de avanços', text: 'Anote o que avançou hoje, mesmo que pouco. Num estudo com milhares de diários de trabalhadores, os dias em que se avançava em algo significativo eram os de melhor ânimo e motivação. Faça esta lista ao terminar o expediente; antes de dormir, convém mais anotar o de amanhã.' },
      it: { name: 'Lista dei progressi', text: 'Annota cosa hai fatto avanzare oggi, anche se poco. In uno studio con migliaia di diari di lavoratori, i giorni con progressi in qualcosa di significativo erano quelli con umore e motivazione migliori. Fai questa lista a fine giornata lavorativa; prima di dormire conviene annotare le cose di domani.' },
      de: { name: 'Fortschrittsliste', text: 'Schreib auf, womit du heute vorangekommen bist, auch wenn es wenig ist. In einer Studie mit Tausenden Tagebucheinträgen von Beschäftigten waren die Tage mit Fortschritten bei etwas Sinnvollem die mit der besten Stimmung und Motivation. Mach diese Liste am Ende deines Arbeitstags; vor dem Schlafen notierst du besser die Aufgaben für morgen.' },
      fr: { name: 'Liste des avancées', text: 'Notez ce que vous avez fait avancer aujourd’hui, même si c’est peu. Dans une étude portant sur des milliers de journaux de travailleurs, les jours où l’on progressait sur quelque chose qui avait du sens étaient ceux où l’humeur et la motivation étaient les meilleures. Faites cette liste à la fin de votre journée de travail ; avant de dormir, mieux vaut noter les tâches du lendemain.' },
    },
  },
  {
    id: 'procrastination',
    category: 'focus',
    evidence: 'moderate',
    suggests: ['unstuck'],
    refs: [
      'Steel, P. (2007). The nature of procrastination: A meta-analytic and theoretical review of quintessential self-regulatory failure. Psychological Bulletin, 133(1), 65–94. doi:10.1037/0033-2909.133.1.65',
      'Sirois, F., & Pychyl, T. (2013). Procrastination and the priority of short-term mood regulation: Consequences for future self. Social and Personality Psychology Compass, 7(2), 115–127. doi:10.1111/spc3.12011',
      'van Eerde, W., & Klingsieck, K. B. (2018). Overcoming procrastination? A meta-analysis of intervention studies. Educational Research Review, 25, 73–85. doi:10.1016/j.edurev.2018.09.002',
    ],
    t: {
      es: { name: 'Destrabar la postergación', text: 'Postergar no es solo un problema de horarios: muchas veces evitamos el malestar que nos da una tarea. Ponele nombre a lo que sentís, achicá el primer paso a cinco minutos y decidí cuándo lo vas a dar. Los programas de terapia cognitivo-conductual son los que mejores resultados muestran; estas páginas toman algunas de sus ideas.' },
      en: { name: 'Getting past procrastination', text: 'Procrastinating is not just a scheduling problem: often we avoid the discomfort a task causes. Name what you feel, shrink the first step to five minutes and decide when you will take it. Cognitive-behavioural programmes show the best results; these pages borrow some of their ideas.' },
      pt: { name: 'Destravar a procrastinação', text: 'Procrastinar não é só um problema de horário: muitas vezes evitamos o desconforto que uma tarefa causa. Dê nome ao que sente, reduza o primeiro passo a cinco minutos e decida quando vai dá-lo. Os programas de terapia cognitivo-comportamental mostram os melhores resultados; estas páginas usam algumas de suas ideias.' },
      it: { name: 'Sbloccare la procrastinazione', text: 'Rimandare non è solo un problema di orari: spesso evitiamo il disagio che un compito ci dà. Dai un nome a ciò che senti, riduci il primo passo a cinque minuti e decidi quando farlo. I programmi di terapia cognitivo-comportamentale mostrano i risultati migliori; queste pagine riprendono alcune delle loro idee.' },
      de: { name: 'Aufschieben überwinden', text: 'Aufschieben ist nicht nur ein Zeitproblem: Oft weichen wir dem Unbehagen aus, das eine Aufgabe auslöst. Benenne, was du fühlst, verkleinere den ersten Schritt auf fünf Minuten und leg fest, wann du ihn machst. Kognitiv-verhaltenstherapeutische Programme zeigen die besten Ergebnisse; diese Seiten übernehmen einige ihrer Ideen.' },
      fr: { name: 'Vaincre la procrastination', text: 'Remettre à plus tard n’est pas qu’un problème d’emploi du temps : souvent, nous évitons le malaise que nous cause une tâche. Nommez ce que vous ressentez, réduisez le premier pas à cinq minutes et décidez quand vous le ferez. Les programmes de thérapie cognitivo-comportementale montrent les meilleurs résultats ; ces pages reprennent certaines de leurs idées.' },
    },
  },
  {
    id: 'urgent-important',
    category: 'focus',
    evidence: 'practice',
    refs: ['Zhu, M., Yang, Y., & Hsee, C. K. (2018). The mere urgency effect. Journal of Consumer Research, 45(3), 673–690.'],
    t: {
      es: { name: 'Urgente no es importante', text: 'Lo urgente grita; lo importante espera en silencio. Los experimentos muestran que tendemos a elegir lo que parece urgente aunque valga menos. Antes de decidir, preguntate: «¿Qué gano de verdad con esto?». La famosa matriz de cuatro cuadros es una herramienta práctica, no un método probado en laboratorio.' },
      en: { name: 'Urgent is not important', text: 'The urgent shouts; the important waits quietly. Experiments show we tend to choose what looks urgent even when it is worth less. Before deciding, ask yourself: “What do I really gain from this?” The famous four-box matrix is a practical tool, not a lab-tested method.' },
      pt: { name: 'Urgente não é importante', text: 'O urgente grita; o importante espera em silêncio. Os experimentos mostram que tendemos a escolher o que parece urgente mesmo valendo menos. Antes de decidir, pergunte-se: «O que eu ganho de verdade com isso?». A famosa matriz de quatro quadros é uma ferramenta prática, não um método testado em laboratório.' },
      it: { name: 'Urgente non è importante', text: 'L’urgente grida; l’importante aspetta in silenzio. Gli esperimenti mostrano che tendiamo a scegliere ciò che sembra urgente anche se vale meno. Prima di decidere chiediti: «Cosa ci guadagno davvero?». La famosa matrice a quattro quadranti è uno strumento pratico, non un metodo provato in laboratorio.' },
      de: { name: 'Dringend ist nicht wichtig', text: 'Das Dringende schreit; das Wichtige wartet still. Experimente zeigen, dass wir dazu neigen, das zu wählen, was dringend wirkt, auch wenn es weniger wert ist. Frag dich vor einer Entscheidung: „Was gewinne ich dadurch wirklich?“ Die berühmte Vier-Felder-Matrix ist ein praktisches Werkzeug, keine im Labor geprüfte Methode.' },
      fr: { name: 'Urgent n’est pas important', text: 'L’urgent crie ; l’important attend en silence. Des expériences montrent que nous avons tendance à choisir ce qui paraît urgent, même quand cela vaut moins. Avant de décider, demandez-vous : « Qu’est-ce que j’y gagne vraiment ? » La célèbre matrice à quatre cases est un outil pratique, pas une méthode testée en laboratoire.' },
    },
  },
  {
    id: 'focus-breaks',
    category: 'focus',
    evidence: 'moderate',
    affects: ['daily'],
    refs: [
      'Albulescu, P., Macsinga, I., Rusu, A., Sulea, C., Bodnaru, A., & Tulbure, B. T. (2022). “Give me a break!” A systematic review and meta-analysis on the efficacy of micro-breaks. PLOS ONE, 17(8), e0272460.',
      'Biwer, F., Wiradhany, W., oude Egbrink, M. G. A., & de Bruin, A. B. H. (2023). Understanding effort regulation: Comparing ‘Pomodoro’ breaks and self-regulated breaks. British Journal of Educational Psychology, 93(S2), 353–367. doi:10.1111/bjep.12593',
    ],
    t: {
      es: { name: 'Bloques y pausas', text: 'Trabajá en bloques, por ejemplo de 25 minutos, y hacé pausas cortas planificadas antes de agotarte. En un estudio con estudiantes, las pausas programadas dejaron menos cansancio y más concentración que parar «cuando me parezca». Las micropausas mejoran el ánimo y la energía; su efecto en el rendimiento es más modesto.' },
      en: { name: 'Blocks and breaks', text: 'Work in blocks, for example of 25 minutes, and take short planned breaks before you are exhausted. In a study with students, scheduled breaks left less fatigue and more concentration than stopping “whenever I feel like it”. Micro-breaks improve mood and energy; their effect on performance is more modest.' },
      pt: { name: 'Blocos e pausas', text: 'Trabalhe em blocos, por exemplo de 25 minutos, e faça pausas curtas planejadas antes de se esgotar. Num estudo com estudantes, as pausas programadas deixaram menos cansaço e mais concentração do que parar «quando der vontade». As micropausas melhoram o ânimo e a energia; o efeito no rendimento é mais modesto.' },
      it: { name: 'Blocchi e pause', text: 'Lavora a blocchi, per esempio di 25 minuti, e fai pause brevi pianificate prima di esaurirti. In uno studio con studenti, le pause programmate hanno lasciato meno stanchezza e più concentrazione che fermarsi «quando mi va». Le micropause migliorano umore ed energia; l’effetto sul rendimento è più modesto.' },
      de: { name: 'Blöcke und Pausen', text: 'Arbeite in Blöcken, zum Beispiel von 25 Minuten, und mach kurze, geplante Pausen, bevor du erschöpft bist. In einer Studie mit Studierenden führten geplante Pausen zu weniger Müdigkeit und mehr Konzentration als Aufhören, „wann mir danach ist“. Mikropausen verbessern Stimmung und Energie; ihr Effekt auf die Leistung ist bescheidener.' },
      fr: { name: 'Blocs et pauses', text: 'Travaillez par blocs, par exemple de 25 minutes, et faites de courtes pauses planifiées avant l’épuisement. Dans une étude auprès d’étudiants, les pauses programmées ont laissé moins de fatigue et plus de concentration que s’arrêter « quand j’en ai envie ». Les micropauses améliorent l’humeur et l’énergie ; leur effet sur la performance est plus modeste.' },
    },
  },
  {
    id: 'time-blocking',
    category: 'focus',
    evidence: 'limited',
    refs: ['Aeon, B., Faber, A., & Panaccio, A. (2021). Does time management work? A meta-analysis. PLOS ONE, 16(1), e0245066. doi:10.1371/journal.pone.0245066'],
    t: {
      es: { name: 'Bloques de tiempo', text: 'Reservá en tu agenda un bloque para lo importante, como si fuera una cita con vos. Organizar el tiempo se asocia con más bienestar y algo más de rendimiento, aunque los bloques de horario en sí casi no fueron estudiados. Dejá huecos libres: los imprevistos llegan igual.' },
      en: { name: 'Time blocks', text: 'Reserve a block in your planner for what matters, as if it were an appointment with yourself. Managing time is associated with more wellbeing and somewhat better performance, although time blocks themselves have barely been studied. Leave free gaps: the unexpected arrives anyway.' },
      pt: { name: 'Blocos de tempo', text: 'Reserve na agenda um bloco para o importante, como se fosse um compromisso com você. Organizar o tempo se associa a mais bem-estar e um pouco mais de rendimento, embora os blocos de horário em si quase não tenham sido estudados. Deixe espaços livres: os imprevistos chegam mesmo assim.' },
      it: { name: 'Blocchi di tempo', text: 'Riserva nell’agenda un blocco per ciò che conta, come fosse un appuntamento con te. Organizzare il tempo si associa a più benessere e a un rendimento un po’ migliore, anche se i blocchi orari in sé sono stati poco studiati. Lascia spazi liberi: gli imprevisti arrivano comunque.' },
      de: { name: 'Zeitblöcke', text: 'Reserviere in deinem Planer einen Block für das Wichtige, als wäre es ein Termin mit dir selbst. Zeitmanagement geht mit mehr Wohlbefinden und etwas besserer Leistung einher, auch wenn Zeitblöcke selbst kaum untersucht wurden. Lass Lücken frei: Unvorhergesehenes kommt sowieso.' },
      fr: { name: 'Blocs de temps', text: 'Réservez dans votre agenda un bloc pour ce qui compte, comme un rendez-vous avec vous-même. Organiser son temps est associé à plus de bien-être et à des performances un peu meilleures, même si les blocs horaires eux-mêmes ont été très peu étudiés. Laissez des créneaux libres : les imprévus arrivent quand même.' },
    },
  },
  {
    id: 'mood-log',
    category: 'wellbeing',
    evidence: 'limited',
    suggests: ['moodYear'],
    affects: ['review', 'daily'],
    refs: [
      'Lieberman, M. D., Eisenberger, N. I., Crockett, M. J., Tom, S. M., Pfeifer, J. H., & Way, B. M. (2007). Putting feelings into words: Affect labeling disrupts amygdala activity in response to affective stimuli. Psychological Science, 18(5), 421–428. doi:10.1111/j.1467-9280.2007.01916.x',
      'Kauer, S. D., et al. (2012). Self-monitoring using mobile phones in the early stages of adolescent depression: Randomized controlled trial. Journal of Medical Internet Research, 14(3), e67.',
    ],
    t: {
      es: { name: 'Registro del ánimo', text: 'Elegí un número o un color para cómo te sentiste hoy y, si podés, una palabra que lo nombre: «ansioso», «tranquila», «frustrado». Ponerle nombre a una emoción puede bajarle la intensidad, y ver el mes completo ayuda a encontrar patrones. Si ves muchos días difíciles seguidos, hablá con alguien de confianza o con un profesional.' },
      en: { name: 'Mood log', text: 'Choose a number or a colour for how you felt today and, if you can, a word that names it: “anxious”, “calm”, “frustrated”. Naming an emotion can lower its intensity, and seeing the whole month helps you find patterns. If you see many hard days in a row, talk to someone you trust or to a professional.' },
      pt: { name: 'Registro do humor', text: 'Escolha um número ou uma cor para como você se sentiu hoje e, se puder, uma palavra que o nomeie: «ansioso», «tranquila», «frustrado». Dar nome a uma emoção pode diminuir sua intensidade, e ver o mês inteiro ajuda a encontrar padrões. Se notar muitos dias difíceis seguidos, fale com alguém de confiança ou com um profissional.' },
      it: { name: 'Registro dell’umore', text: 'Scegli un numero o un colore per come ti sei sentito oggi e, se puoi, una parola che lo nomini: «ansioso», «tranquilla», «frustrato». Dare un nome a un’emozione può ridurne l’intensità, e vedere il mese intero aiuta a trovare schemi. Se vedi molti giorni difficili di fila, parlane con qualcuno di fiducia o con un professionista.' },
      de: { name: 'Stimmungstagebuch', text: 'Wähle eine Zahl oder eine Farbe dafür, wie du dich heute gefühlt hast, und, wenn du magst, ein Wort, das es benennt: „ängstlich“, „ruhig“, „frustriert“. Ein Gefühl zu benennen kann seine Intensität senken, und der Blick auf den ganzen Monat hilft, Muster zu erkennen. Wenn du viele schwere Tage hintereinander siehst, sprich mit einem Menschen deines Vertrauens oder mit einer Fachperson.' },
      fr: { name: 'Journal d’humeur', text: 'Choisissez un chiffre ou une couleur pour votre ressenti du jour et, si possible, un mot pour le nommer : « anxieux », « sereine », « frustré ». Nommer une émotion peut en diminuer l’intensité, et voir le mois entier aide à repérer des tendances. Si vous voyez beaucoup de jours difficiles d’affilée, parlez-en à une personne de confiance ou à un professionnel.' },
    },
  },
  {
    id: 'sleep-diary',
    category: 'wellbeing',
    evidence: 'strong',
    suggests: ['sleepDiary'],
    refs: [
      'Carney, C. E., Buysse, D. J., Ancoli-Israel, S., Edinger, J. D., Krystal, A. D., Lichstein, K. L., & Morin, C. M. (2012). The Consensus Sleep Diary: Standardizing prospective sleep self-monitoring. Sleep, 35(2), 287–302. doi:10.5665/sleep.1642',
      'Trauer, J. M., Qian, M. Y., Doyle, J. S., Rajaratnam, S. M. W., & Cunnington, D. (2015). Cognitive behavioral therapy for chronic insomnia: A systematic review and meta-analysis. Annals of Internal Medicine, 163(3), 191–204. doi:10.7326/M14-2841',
    ],
    t: {
      es: { name: 'Diario de sueño', text: 'Completalo cada mañana, en un minuto: a qué hora te acostaste, cuánto tardaste en dormirte, cuántas veces te despertaste y cómo descansaste. Es la herramienta que usan los especialistas en sueño; llevarlo dos semanas antes de una consulta aporta información valiosa. Por sí solo no es un tratamiento.' },
      en: { name: 'Sleep diary', text: 'Fill it in every morning, in one minute: what time you went to bed, how long it took to fall asleep, how many times you woke up and how rested you felt. It is the tool sleep specialists use; keeping it for two weeks before an appointment gives valuable information. On its own it is not a treatment.' },
      pt: { name: 'Diário do sono', text: 'Preencha toda manhã, em um minuto: a que horas deitou, quanto demorou para dormir, quantas vezes acordou e como descansou. É a ferramenta que os especialistas em sono usam; registrar duas semanas antes de uma consulta traz informação valiosa. Sozinho, não é um tratamento.' },
      it: { name: 'Diario del sonno', text: 'Compilalo ogni mattina, in un minuto: a che ora sei andato a letto, quanto ci hai messo ad addormentarti, quante volte ti sei svegliato e come hai riposato. È lo strumento che usano gli specialisti del sonno; tenerlo per due settimane prima di una visita dà informazioni preziose. Da solo non è una cura.' },
      de: { name: 'Schlaftagebuch', text: 'Füll es jeden Morgen in einer Minute aus: wann du ins Bett gegangen bist, wie lange du zum Einschlafen gebraucht hast, wie oft du aufgewacht bist und wie erholt du dich fühlst. Es ist das Werkzeug, das Schlaffachleute verwenden; zwei Wochen vor einem Arzttermin geführt, liefert es wertvolle Informationen. Für sich allein ist es keine Behandlung.' },
      fr: { name: 'Agenda du sommeil', text: 'Remplissez-le chaque matin, en une minute : l’heure du coucher, le temps mis à vous endormir, le nombre de réveils et la qualité de votre repos. C’est l’outil qu’utilisent les spécialistes du sommeil ; le tenir deux semaines avant une consultation apporte des informations précieuses. À lui seul, ce n’est pas un traitement.' },
    },
  },
  {
    id: 'external-memory',
    category: 'memory',
    evidence: 'moderate',
    affects: ['daily', 'monthGrid'],
    suggests: ['health', 'monthGrid'],
    refs: [
      'Risko, E. F., & Gilbert, S. J. (2016). Cognitive offloading. Trends in Cognitive Sciences, 20(9), 676–688. doi:10.1016/j.tics.2016.07.002',
      'Schryer, E., & Ross, M. (2013). The use and benefits of external memory aids in older and younger adults. Applied Cognitive Psychology, 27(5). doi:10.1002/acp.2946',
      'Scullin, M. K., et al. (2022). Using smartphone technology to improve prospective memory functioning: A randomized controlled trial. Journal of the American Geriatrics Society, 70(2), 459–469. doi:10.1111/jgs.17551',
    ],
    t: {
      es: { name: 'La agenda como memoria externa', text: 'Anotar no es hacer trampa: es usar el papel como una extensión de la memoria. Los estudios muestran que las personas mayores se benefician especialmente de tener notas, aunque a veces las usan menos de lo que podrían. Elegí un lugar fijo para esta agenda y un momento del día para mirarla.' },
      en: { name: 'Your planner as external memory', text: 'Writing things down is not cheating: it is using paper as an extension of memory. Studies show that older adults benefit especially from notes, although they sometimes use them less than they could. Choose a fixed place for this planner and a moment of the day to look at it.' },
      pt: { name: 'A agenda como memória externa', text: 'Anotar não é trapacear: é usar o papel como extensão da memória. Os estudos mostram que pessoas mais velhas se beneficiam especialmente de ter anotações, embora às vezes as usem menos do que poderiam. Escolha um lugar fixo para esta agenda e um momento do dia para olhá-la.' },
      it: { name: 'L’agenda come memoria esterna', text: 'Scrivere non è barare: è usare la carta come estensione della memoria. Gli studi mostrano che le persone anziane traggono particolare beneficio dagli appunti, anche se a volte li usano meno di quanto potrebbero. Scegli un posto fisso per questa agenda e un momento della giornata per guardarla.' },
      de: { name: 'Der Planer als externes Gedächtnis', text: 'Aufschreiben ist kein Schummeln: Es heißt, Papier als Erweiterung des Gedächtnisses zu nutzen. Studien zeigen, dass gerade ältere Menschen von Notizen profitieren, auch wenn sie sie manchmal weniger nutzen, als sie könnten. Gib diesem Planer einen festen Platz und such dir eine Tageszeit, um hineinzuschauen.' },
      fr: { name: 'L’agenda comme mémoire externe', text: 'Noter n’est pas tricher : c’est utiliser le papier comme une extension de la mémoire. Les études montrent que les personnes âgées tirent particulièrement profit des notes, même si elles les utilisent parfois moins qu’elles ne le pourraient. Choisissez une place fixe pour cet agenda et un moment de la journée pour le consulter.' },
    },
  },
  {
    id: 'handwriting',
    category: 'memory',
    evidence: 'contested',
    refs: [
      'Mueller, P. A., & Oppenheimer, D. M. (2014). The pen is mightier than the keyboard. Psychological Science. doi:10.1177/0956797614524581',
      'Morehead, K., Dunlosky, J., & Rawson, K. A. (2019). How much mightier is the pen than the keyboard for note-taking? Educational Psychology Review, 31(3), 753–780. doi:10.1007/s10648-019-09468-2',
      'Flanigan, A. E., Wheeler, J., Colliot, T., Lu, J., & Kiewra, K. A. (2024). Typed versus handwritten lecture notes and college student achievement: A meta-analysis. Educational Psychology Review, 36(3). doi:10.1007/s10648-024-09914-w',
    ],
    t: {
      es: { name: 'Escribir a mano', text: '¿Escribir a mano ayuda a recordar? Quizás un poco. Algunos estudios encontraron ventajas y otros no, y los que miden la actividad del cerebro no prueban por sí solos que se aprenda más. Lo que sí parece ayudar es escribir con tus palabras y volver a leer lo anotado. Esta agenda te invita a las dos cosas.' },
      en: { name: 'Writing by hand', text: 'Does writing by hand help you remember? Perhaps a little. Some studies found advantages and others did not, and those that measure brain activity do not by themselves prove that people learn more. What does seem to help is writing in your own words and rereading what you wrote. This planner invites you to do both.' },
      pt: { name: 'Escrever à mão', text: 'Escrever à mão ajuda a lembrar? Talvez um pouco. Alguns estudos encontraram vantagens e outros não, e os que medem a atividade cerebral não provam, sozinhos, que se aprende mais. O que parece ajudar é escrever com suas palavras e reler o que anotou. Esta agenda convida você às duas coisas.' },
      it: { name: 'Scrivere a mano', text: 'Scrivere a mano aiuta a ricordare? Forse un po’. Alcuni studi hanno trovato vantaggi e altri no, e quelli che misurano l’attività cerebrale non dimostrano da soli che si impari di più. Ciò che sembra aiutare è scrivere con parole tue e rileggere ciò che hai annotato. Questa agenda ti invita a fare entrambe le cose.' },
      de: { name: 'Mit der Hand schreiben', text: 'Hilft Schreiben mit der Hand beim Erinnern? Vielleicht ein wenig. Manche Studien fanden Vorteile, andere nicht, und Messungen der Hirnaktivität beweisen für sich allein nicht, dass man mehr lernt. Was offenbar hilft: in eigenen Worten schreiben und das Notierte noch einmal lesen. Dieser Planer lädt dich zu beidem ein.' },
      fr: { name: 'Écrire à la main', text: 'Écrire à la main aide-t-il à retenir ? Peut-être un peu. Certaines études ont trouvé des avantages, d’autres non, et celles qui mesurent l’activité du cerveau ne prouvent pas à elles seules qu’on apprend davantage. Ce qui semble aider, c’est d’écrire avec ses propres mots et de relire ce qu’on a noté. Cet agenda vous invite à faire les deux.' },
    },
  },
  {
    id: 'analog-vs-digital',
    category: 'memory',
    evidence: 'limited',
    refs: ['Huang, Y., Yang, Z., & Morwitz, V. G. How using a paper versus mobile calendar influences everyday planning and plan fulfillment. Journal of Consumer Psychology. doi:10.1002/jcpy.1297'],
    t: {
      es: { name: '¿Papel o teléfono?', text: 'Depende. Un estudio encontró que el papel ayuda más con los planes de varios pasos, porque se ve el conjunto, y que el teléfono sirve más para citas puntuales gracias a las alarmas. Usá esta agenda para planificar y, si te sirve, el teléfono para los avisos.' },
      en: { name: 'Paper or phone?', text: 'It depends. One study found that paper helps more with multi-step plans, because you see the whole picture, and that the phone works better for single appointments thanks to alarms. Use this planner to plan and, if it helps, your phone for reminders.' },
      pt: { name: 'Papel ou celular?', text: 'Depende. Um estudo encontrou que o papel ajuda mais com planos de várias etapas, porque se vê o conjunto, e que o celular serve mais para compromissos pontuais graças aos alarmes. Use esta agenda para planejar e, se ajudar, o celular para os avisos.' },
      it: { name: 'Carta o telefono?', text: 'Dipende. Uno studio ha trovato che la carta aiuta di più con i piani in più passi, perché si vede l’insieme, e che il telefono serve di più per gli appuntamenti singoli grazie alle sveglie. Usa questa agenda per pianificare e, se ti aiuta, il telefono per i promemoria.' },
      de: { name: 'Papier oder Handy?', text: 'Kommt darauf an. Eine Studie fand, dass Papier bei Plänen mit mehreren Schritten mehr hilft, weil man das Ganze sieht, und dass das Handy dank Alarmen besser für einzelne Termine taugt. Nutze diesen Planer zum Planen und, wenn es dir hilft, das Handy für Erinnerungen.' },
      fr: { name: 'Papier ou téléphone ?', text: 'Cela dépend. Une étude a montré que le papier aide davantage pour les plans en plusieurs étapes, car on voit l’ensemble, et que le téléphone convient mieux aux rendez-vous ponctuels grâce aux alarmes. Utilisez cet agenda pour planifier et, si cela vous aide, le téléphone pour les rappels.' },
    },
  },
  {
    id: 'password-log',
    category: 'security',
    evidence: 'practice',
    affects: ['passwords'],
    refs: [
      'UK National Cyber Security Centre, guidance on password managers and writing passwords down (via Computer Weekly, 2019). computerweekly.com/news/252499089',
      'NIST SP 800-63B, Digital Identity Guidelines: Authentication and Lifecycle Management. pages.nist.gov/800-63-4/sp800-63b/changelog',
    ],
    t: {
      es: { name: 'Contraseñas en papel', text: 'Anotar contraseñas en papel puede ser razonable si la hoja queda en casa, guardada lejos de la computadora y del teléfono, y no sale con vos. Usá una contraseña distinta para cada servicio (por ejemplo, tres palabras al azar). Si podés, un gestor de contraseñas es todavía mejor. Evitá anotar los PIN de tus tarjetas.' },
      en: { name: 'Passwords on paper', text: 'Writing passwords on paper can be reasonable if the sheet stays at home, kept away from the computer and phone, and does not travel with you. Use a different password for each service (for example, three random words). If you can, a password manager is even better. Avoid writing down your card PINs.' },
      pt: { name: 'Senhas no papel', text: 'Anotar senhas no papel pode ser razoável se a folha ficar em casa, guardada longe do computador e do celular, e não sair com você. Use uma senha diferente para cada serviço (por exemplo, três palavras aleatórias). Se puder, um gerenciador de senhas é ainda melhor. Evite anotar os PINs dos seus cartões.' },
      it: { name: 'Password su carta', text: 'Annotare le password su carta può essere ragionevole se il foglio resta a casa, lontano dal computer e dal telefono, e non esce con te. Usa una password diversa per ogni servizio (per esempio tre parole a caso). Se puoi, un gestore di password è ancora meglio. Evita di annotare i PIN delle carte.' },
      de: { name: 'Passwörter auf Papier', text: 'Passwörter auf Papier zu notieren kann vernünftig sein, wenn das Blatt zu Hause bleibt, getrennt von Computer und Handy aufbewahrt wird und nicht mit dir unterwegs ist. Nutze für jeden Dienst ein anderes Passwort (zum Beispiel drei zufällige Wörter). Wenn möglich, ist ein Passwort-Manager noch besser. Schreib die PINs deiner Karten lieber nicht auf.' },
      fr: { name: 'Mots de passe sur papier', text: 'Noter ses mots de passe sur papier peut être raisonnable si la feuille reste à la maison, rangée loin de l’ordinateur et du téléphone, et ne sort pas avec vous. Utilisez un mot de passe différent pour chaque service (par exemple, trois mots au hasard). Si vous le pouvez, un gestionnaire de mots de passe est encore mieux. Évitez de noter les codes PIN de vos cartes.' },
    },
  },
  {
    id: 'legibility',
    category: 'memory',
    evidence: 'practice',
    refs: [
      'RNIB. What are the different font sizes such as clear print, large print and giant print? help.rnib.org.uk/help/daily-living/large-print-size',
      'Legge, G. E., & Bigelow, C. A. (2011). Does print size matter for reading? A review of findings from vision science and typography. Journal of Vision, 11(5):8, 1–22. doi:10.1167/11.5.8',
    ],
    t: {
      es: { name: 'Lectura clara', text: 'La edición de lectura clara usa letras más grandes, alto contraste y renglones más amplios, siguiendo las guías de organizaciones de personas con baja visión. Si leer o escribir en espacios chicos te cansa, no es un lujo: es comodidad.' },
      en: { name: 'Clear print', text: 'The clear-print edition uses larger letters, high contrast and wider lines, following the guidelines of organisations for people with low vision. If reading or writing in small spaces tires you, it is not a luxury: it is comfort.' },
      pt: { name: 'Leitura clara', text: 'A edição de leitura clara usa letras maiores, alto contraste e linhas mais amplas, seguindo as orientações de organizações de pessoas com baixa visão. Se ler ou escrever em espaços pequenos cansa você, não é luxo: é conforto.' },
      it: { name: 'Lettura chiara', text: 'L’edizione a lettura chiara usa lettere più grandi, contrasto elevato e righe più ampie, seguendo le linee guida delle organizzazioni per persone ipovedenti. Se leggere o scrivere in spazi piccoli ti stanca, non è un lusso: è comodità.' },
      de: { name: 'Gut lesbar', text: 'Die gut lesbare Ausgabe nutzt größere Buchstaben, hohen Kontrast und größere Zeilenabstände, nach den Leitlinien von Organisationen für Menschen mit Sehbehinderung. Wenn dich Lesen oder Schreiben auf kleinem Raum ermüdet, ist sie kein Luxus, sondern Komfort.' },
      fr: { name: 'Lecture facile', text: 'L’édition lecture facile utilise des lettres plus grandes, un contraste élevé et des lignes plus espacées, selon les recommandations d’organisations de personnes malvoyantes. Si lire ou écrire dans de petits espaces vous fatigue, ce n’est pas un luxe : c’est du confort.' },
    },
  },
];

export const METHOD_BY_ID = new Map(METHODS.map((m) => [m.id, m]));

/** Métodos recomendados por defecto (mayor valor por página según la evidencia). */
export const DEFAULT_METHODS = [
  'implementation-intentions',
  'progress-monitoring',
  'habit-timeline',
  'habit-anchoring',
  'streaks',
  'alastair-method',
  'top-priorities',
  'weekly-review',
  'three-good-things',
  'woop',
  'fresh-start',
  'external-memory',
  'password-log',
];

export function methodText(m: PlannerMethod, lang: string): MethodText {
  return (m.t as Record<string, MethodText>)[lang] ?? m.t.es;
}
