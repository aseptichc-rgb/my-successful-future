/**
 * Diccionario de traducciones en español. Las claves deben coincidir exactamente con ko.ts.
 */
import type { DictKey } from "./ko";

const dict: Record<DictKey, string> = {
  // Common
  "common.save": "Guardar",
  "common.saving": "Guardando…",
  "common.saved": "Guardado",
  "common.cancel": "Cancelar",
  "common.close": "Cerrar",
  "common.next": "Siguiente",
  "common.prev": "Atrás",
  "common.skip": "Omitir",
  "common.add": "Añadir",
  "common.edit": "Editar",
  "common.done": "Hecho",
  "common.write": "Escribir",
  "common.delete": "Eliminar",
  "common.remove": "Quitar",
  "common.loading": "Cargando…",
  "common.error": "Error",
  "common.retry": "Reintentar",
  "common.unsavedChanges": "Tienes cambios sin guardar",
  "common.savedState": "Todo al día",
  "common.saveFailed": "No se pudo guardar.",
  "common.tryAgainLater": "Inténtalo de nuevo en un momento.",

  // Language
  "language.title": "Elige tu idioma",
  "language.subtitle": "한국어 · English · Español · 中文",
  "language.changeNote": "Puedes cambiarlo cuando quieras en Ajustes.",
  "language.settings.title": "Idioma",
  "language.settings.subtitle":
    "La app y tu frase diaria se mostrarán en este idioma.",
  "language.settings.note":
    "Tras cambiarlo, tu próxima tarjeta llegará en el nuevo idioma.",

  // Onboarding
  // "Mi yo dentro de 10 años" — flujo inmersivo de una pregunta por pantalla.
  "onboarding.futureSelf.sectionLabel": "Mi yo dentro de 10 años",
  "onboarding.futureSelf.progress": "{current} / {total}",
  "onboarding.futureSelf.hint":
    "Escribe tan concreto como te salga. Si una pregunta se te hace difícil ahora, déjala en blanco y sigue.",
  "onboarding.futureSelf.daily.q": "Dentro de 10 años, ¿cómo fluye un día normal de tu vida?",
  "onboarding.futureSelf.daily.placeholder":
    "Dónde despiertas, qué llena tu mañana, cómo termina tu tarde.",
  "onboarding.futureSelf.daily.example1":
    "Despierto a las 6 en una casa con vistas al río, abro el día con ejercicio, trabajo concentrado toda la mañana y paso la tarde con mi familia.",
  "onboarding.futureSelf.daily.example2":
    "Sin trayectos al trabajo: dos horas de escritura en mi estudio con café, y por la tarde camino mientras doy forma al siguiente proyecto.",
  "onboarding.futureSelf.daily.example3":
    "Desde mi estudio con vistas al mar, dirijo a mi equipo por videollamada por la mañana y por la tarde cocino la cena con mi hijo escuchando las olas.",
  "onboarding.futureSelf.work.q":
    "¿En qué trabajas entonces y qué lugar ocupas entre la gente?",
  "onboarding.futureSelf.work.placeholder":
    "Tu rol, tu lugar en el equipo, por qué la gente te busca.",
  "onboarding.futureSelf.work.example1":
    "Dirijo una empresa de 10 personas y la gente del sector me busca primero para pedir consejo.",
  "onboarding.futureSelf.work.example2":
    "Soy una de las voces de referencia en mi área y amplío mi alcance con charlas y libros.",
  "onboarding.futureSelf.work.example3":
    "Trabajo por mi cuenta y elijo solo los proyectos que quiero: los clientes esperan meses para trabajar conmigo.",
  "onboarding.futureSelf.wealth.q": "¿Cómo están tus finanzas y tu patrimonio?",
  "onboarding.futureSelf.wealth.placeholder":
    "Ingresos mensuales, lo que has construido, dónde vives, las decisiones que el dinero ya no limita.",
  "onboarding.futureSelf.wealth.example1":
    "Construí ingresos que me pagan 8.000 € al mes trabaje o no, y vivo en una casa sin hipoteca.",
  "onboarding.futureSelf.wealth.example2":
    "Hago la compra sin mirar precios y planeo los viajes eligiendo primero las fechas: mi cuenta ya no me quita el sueño.",
  "onboarding.futureSelf.wealth.example3":
    "Cubro los gastos de mis padres cada mes y aun así llevo a toda la familia al extranjero dos veces al año.",
  "onboarding.futureSelf.family.q": "¿Cómo es la vida con tu familia?",
  "onboarding.futureSelf.family.placeholder":
    "El tiempo que compartís, lo que les das, la calidez de esos lazos.",
  "onboarding.futureSelf.family.example1":
    "Acampadas con los niños cada fin de semana, y cenas donde nos contamos el día — sin móviles en la mesa.",
  "onboarding.futureSelf.family.example2":
    "Cada primavera llevo a mis padres de viaje a ver flores, y con mi pareja seguimos guardando nuestra cita de los viernes.",
  "onboarding.futureSelf.family.example3":
    "En una casa con jardín, los niños y el perro juegan juntos, y una vez al mes toda la familia cocina una gran comida.",
  "onboarding.futureSelf.achievements.q": "¿Qué has logrado para entonces?",
  "onboarding.futureSelf.achievements.placeholder":
    "Lo que has creado, las metas alcanzadas, los logros que más te enorgullecen.",
  "onboarding.futureSelf.achievements.example1":
    "Un libro con mi nombre y un servicio que usan 10.000 personas.",
  "onboarding.futureSelf.achievements.example2":
    "Empezando de cero, construí una casa sin deudas y un negocio sólido.",
  "onboarding.futureSelf.achievements.example3":
    "Alcancé la libertad financiera, y una beca con mi nombre financia cada año los sueños de diez estudiantes.",
  "onboarding.futureSelf.respect.q":
    "¿Cómo te ve la gente y qué respetan de ti?",
  "onboarding.futureSelf.respect.placeholder":
    "La confianza, la reputación y el respeto que te dan — y por qué.",
  "onboarding.futureSelf.respect.example1":
    "Se sabe que mi palabra vale: antes de una decisión importante, la gente pregunta primero mi opinión.",
  "onboarding.futureSelf.respect.example2":
    "Los más jóvenes me buscan diciendo que quieren llegar a ser como yo, y con gusto les dedico tiempo para mostrarles el camino.",
  "onboarding.futureSelf.respect.example3":
    "Me recuerdan por la constancia más que por el brillo: 'la persona que cumplió cada día durante diez años'.",
  "onboarding.futureSelf.growth.q":
    "¿Cómo están tu cuerpo y tu mente, y cómo sigues creciendo?",
  "onboarding.futureSelf.growth.placeholder":
    "Tu salud, lo que estás aprendiendo, cómo sigues avanzando.",
  "onboarding.futureSelf.growth.example1":
    "Corro 5 km cada mañana y me siento ligero, leo 50 libros al año y sigo entrando en campos nuevos.",
  "onboarding.futureSelf.growth.example2":
    "Una mente firme forjada con meditación, y un idioma nuevo con el que converso con la gente local cuando viajo.",
  "onboarding.futureSelf.growth.example3":
    "Estoy más sano que a los veinte, aprendo un instrumento los fines de semana: cada día un poco mejor que ayer.",

  "onboarding.step2.title": "Escribe las acciones concretas que necesitas para alcanzar tus metas",
  "onboarding.step2.subtitle":
    "Tus 3 metas principales aparecen en la tarjeta diaria y en la pantalla de bloqueo, en orden de prioridad.",
  "onboarding.step2.placeholder": "Ej.: Leer 30 minutos cada día",
  "onboarding.step2.addGoal": "+ Añadir meta",
  "onboarding.step2.removeGoalAria": "Quitar esta meta",

  "onboarding.step3.title": "Escribe tu yo exitoso, una línea por afirmación",
  "onboarding.step3.subtitle":
    "Tus afirmaciones aparecen como texto tenue en cada tarjeta diaria. Vuelve a escribirlas exactamente para construir una racha. Puedes dejarlo vacío y añadirlas más tarde en Ajustes.",

  "onboarding.step4.title": "¿La voz de quién quieres oír cada día?",
  "onboarding.step4.subtitle":
    "Si fijas a una persona, sus palabras llegan primero unos 4 días por semana. El resto es rotación curada. Puedes dejarlo vacío.",
  "onboarding.step4.autoTitle": "Rotación automática",
  "onboarding.step4.autoSubtitle":
    "Unos 8 mentores rotan de forma determinista cada semana.",
  "onboarding.step4.changeLater":
    "Puedes cambiarlo o desactivarlo en Ajustes cuando quieras.",
  "onboarding.step4.cta": "Recibir la frase de hoy →",
  "onboarding.step4.preparing": "Preparando…",

  "onboarding.step5.titleLoading": "Creando tu frase de hoy…",
  "onboarding.step5.titleDone": "Esto es lo que te llegará cada día.",
  "onboarding.step5.subtitleLoading": "Un momento.",
  "onboarding.step5.subtitleDone":
    "El widget de pantalla de bloqueo muestra una frase distinta cada día. Instala la app de Android para añadir el widget.",
  "onboarding.step5.todayLabel": "FRASE DE HOY",
  "onboarding.step5.missionLabel": "MISIÓN DE HOY",
  "onboarding.step5.missionIdentityPrefix": "Soy",
  "onboarding.step5.missionFooter":
    "Responde a esta línea desde Inicio y tu identidad crece paso a paso.",
  "onboarding.step5.previewError":
    "No se pudo generar la vista previa. Inténtalo desde Inicio después de empezar.",
  "onboarding.step5.widgetTitle": "Cómo añadir el widget en Android",
  "onboarding.step5.widgetStep1":
    "1. Mantén pulsado un espacio vacío en la pantalla de inicio",
  "onboarding.step5.widgetStep2": "2. \"Widgets\" → busca Anima",
  "onboarding.step5.widgetStep3":
    "3. Añádelo a la pantalla de bloqueo y recibirás una frase nueva cada día",
  "onboarding.step5.start": "Empezar",
  "onboarding.step5.finishing": "Finalizando…",
  "onboarding.step5.portraitLabel": "MI YO DENTRO DE 10 AÑOS",
  "onboarding.step5.portraitLoading": "Pintando tu yo de dentro de 10 años…",
  "onboarding.step5.portraitError":
    "No se pudo crear tu retrato futuro. Podrás crearlo desde Inicio después de empezar.",

  "onboarding.saveError": "No se pudo guardar.",
  "onboarding.category.philosophy": "Filosofía",
  "onboarding.category.entrepreneur": "Empresario",
  "onboarding.category.classic": "Clásico",
  "onboarding.category.leader": "Líder",
  "onboarding.category.scientist": "Científico",
  "onboarding.category.literature": "Literatura",

  // Home
  "home.title": "Motivación de hoy",
  "home.subtitle": "Empieza el día con una frase nueva escrita para ti.",
  "home.dateFormat": "{day}/{month}/{year}",
  "home.settingsAria": "Ajustes",
  "home.tab.future": "Yo futuro",
  "home.tab.actions": "Acciones de hoy",

  "home.future.title": "Tú, dentro de 10 años",
  "home.future.subtitle":
    "Cuanto más concreto sea tu yo futuro, más nítida será la frase diaria que recibas.",
  "home.future.empty": "Aún no has escrito nada. Puedes hacerlo en Ajustes.",
  "home.future.saveAndRegen": "Guardar y regenerar la tarjeta de hoy",
  "home.future.saveFailed": "No se pudo guardar tu yo futuro",

  // Tarjeta de retrato "Mi yo dentro de 10 años"
  "futureSelf.portrait.headerLabel": "MI YO DENTRO DE 10 AÑOS",
  "futureSelf.portrait.loading": "Pintando tu yo de dentro de 10 años…",
  "futureSelf.portrait.error": "No se pudo pintar tu retrato futuro.",
  "futureSelf.portrait.regenerate": "Volver a pintar el retrato",
  "futureSelf.portrait.regenerating": "Repintando…",

  "home.goals.title": "Acciones de hoy hacia tus metas",
  "home.goals.subtitle":
    "Una pequeña acción que te acerca a tu yo futuro.",
  "home.goals.todayProgress": "Hoy {done}/{total}",
  "home.goals.placeholder": "Ej.: Leer 30 minutos cada día",
  "home.goals.maxAlert": "Puedes añadir hasta {max} metas.",
  "home.goals.deleteAria": "Eliminar meta",
  "home.goals.toggleAchievedAria": "Marcar como hecho hoy",
  "home.goals.toggleUnachievedAria": "Deshacer hecho",
  "home.goals.toggleAchievedTitle": "Marcar como hecho hoy",
  "home.goals.toggleUnachievedTitle": "Hecho hoy — toca para deshacer",
  "home.goals.saveFailed": "No se pudieron guardar tus metas.",

  "home.wins.title": "{max} cosas buenas que hiciste hoy",
  "home.wins.subtitle":
    "Aunque sean pequeñas. Si las guardas, las verás luego por fecha.",
  "home.wins.history": "Ver registros anteriores",
  "home.wins.placeholder1": "Ej.: Respondí ese correo que estaba aplazando.",
  "home.wins.placeholder2": "Ej.: Caminé 10 minutos por la mañana.",
  "home.wins.placeholder3": "Ej.: Le dije algo amable a mi familia.",
  "home.wins.saveFailed":
    "No se pudo guardar. Inténtalo de nuevo en un momento.",

  // MotivationCard
  "motivation.wallpaper.goalsLabel": "Mis metas",
  "motivation.wallpaper.watermark": "Anima · Yo del futuro",
  "motivation.wallpaper.download": "Guardar como fondo de pantalla",
  "motivation.wallpaper.downloading": "Guardando…",
  "motivation.wallpaper.downloadFailed": "No se pudo guardar la imagen.",
  "motivation.regenerating": "Regenerando…",
  "motivation.headerTodayLabel": "Frase de hoy",
  "motivation.responseEmpty": "Escribe una línea.",
  "motivation.responsePlaceholder": "Responde en una línea (60 car.)",
  "motivation.responseEdited": "Respuesta actualizada",
  "motivation.responseToast": "+1 — eres [{tag}]",
  "motivation.preparingCard": "Preparando tu tarjeta de motivación…",
  "motivation.loading": "Creando tu frase de hoy…",
  "motivation.error.title": "No se pudo crear la tarjeta de hoy",
  "motivation.regenerate": "Recibir otra",
  "motivation.todayLabel": "FRASE DE HOY",
  "motivation.missionLabel": "MISIÓN DE HOY",
  "motivation.missionPlaceholder": "Responde en una línea…",
  "motivation.submit": "Guardar",
  "motivation.submitting": "Guardando…",
  "motivation.alreadyAnsweredToday":
    "Hoy ya respondiste — tu próxima frase llega mañana.",
  "motivation.firstResponseToast":
    "Tu identidad \"Soy {tag}\" ha sumado 1 paso hoy.",
  "motivation.editResponse": "Editar respuesta",
  "motivation.identityPrefix": "Soy",
  "motivation.affirmations.title": "Un paso más hacia tu yo exitoso",
  "motivation.affirmations.streak": "Racha de {count} días",
  "motivation.affirmations.placeholder": "Copia la línea de arriba, exacta",
  "motivation.affirmations.checkin": "Grabar las afirmaciones de hoy",
  "motivation.affirmations.checkingIn": "Grabando…",
  "motivation.affirmations.matched":
    "Grabado por hoy. ¡{count} días seguidos!",
  "motivation.affirmations.mismatched":
    "Cada carácter debe coincidir. Copia la línea de arriba tal cual.",
  "motivation.affirmations.alreadyToday":
    "Ya lo grabaste hoy. Hasta mañana.",
  "motivation.affirmations.empty":
    "Añade afirmaciones en Ajustes para copiarlas a diario y construir una racha.",

  // ── Visión del día futuro (un día viviendo el sueño) ──
  "futureVision.headerLabel": "Hoy, un día viviendo ese sueño",
  "futureVision.loading": "Pintando tu día futuro…",
  "futureVision.error": "No se pudo pintar tu día futuro.",
  "futureVision.regenerate": "Ver otro día",
  "futureVision.regenerating": "Pintando otro día…",
  "futureVision.reveal": "Desplegar el día de hoy",
  "futureVision.empty.title": "Primero, imagina tu yo futuro",
  "futureVision.empty.body":
    "Escribe un párrafo sobre quién quieres llegar a ser en 10 años, y cada día pintaré ante tus ojos ese día de sueño cumplido.",
  "futureVision.empty.cta": "Escribir mi yo futuro",

  // Settings
  "settings.title": "Ajustes",
  "settings.subtitle":
    "Gestiona tu yo futuro, afirmaciones diarias, acciones de hoy y curaduría de citas en un solo lugar.",
  "settings.future.title": "Tú, dentro de 10 años",
  "settings.future.subtitle":
    "Tu frase diaria se construye a partir de este párrafo.",
  "settings.futureSelf.legacyNote":
    "Esto es lo que escribiste antes. Al responder las preguntas de arriba y guardar, lo reemplazará.",
  "settings.affirmations.title": "Un paso más hacia tu yo exitoso",
  "settings.affirmations.subtitle":
    "Aparece en gris claro sobre cada tarjeta diaria. Copia cada línea exactamente para sumar +1 a tu racha.",
  "settings.goals.title": "Acciones de hoy hacia tus metas",
  "settings.goals.subtitle":
    "Una pequeña acción que te acerca a tu yo futuro.",
  "settings.goals.empty":
    "Añade metas desde Inicio y podrás editarlas aquí.",
  "settings.quote.title": "Curaduría de citas",
  "settings.quote.subtitle":
    "Déjalo vacío para rotación automática semanal, o fija a una persona y elige con qué frecuencia aparece.",
  "settings.quote.pinAuthor": "Fijar a una persona",
  "settings.quote.noPin": "— Sin fijar (rotación semanal) —",
  "settings.quote.daysLabel": "Días fijados por semana:",
  "settings.quote.daysOff": "Apagado",
  "settings.quote.daysEveryday": "Cada día",
  "settings.quote.daysPerWeek": "{n} días/semana",
  "settings.account.title": "Cuenta",
  "settings.account.signOut": "Cerrar sesión",
  "settings.account.delete": "Eliminar cuenta",
  "settings.account.delete.subtitle": "Elimina de forma permanente tu perfil, afirmaciones e historial. Es irreversible.",
  "settings.account.delete.confirmTitle": "¿Eliminar tu cuenta?",
  "settings.account.delete.confirmBody":
    "Tu yo futuro, las afirmaciones diarias y el registro de logros se borrarán.\nLos recibos también se limpiarán. Podrás volver a registrarte con el mismo correo más tarde.",
  "settings.account.delete.confirmInputLabel": "Escribe \"eliminar\" abajo para confirmar.",
  "settings.account.delete.confirmInputKeyword": "eliminar",
  "settings.account.delete.confirmCancel": "Cancelar",
  "settings.account.delete.confirmConfirm": "Eliminar permanentemente",
  "settings.account.delete.deleting": "Eliminando…",
  "settings.account.delete.failed": "No se pudo eliminar la cuenta. Inténtalo de nuevo en unos momentos.",

  // Auth
  "auth.email": "Correo",
  "auth.password": "Contraseña",
  "auth.displayName": "Nombre",
  "auth.signIn": "Iniciar sesión",
  "auth.signUp": "Crear cuenta",
  "auth.signInWithGoogle": "Continuar con Google",
  "auth.continueWithGoogle": "Continuar con Google",
  "auth.continueWithApple": "Continuar con Apple",
  "auth.or": "o",
  "auth.noAccount": "¿Es tu primera vez?",
  "auth.signingIn": "Iniciando…",
  "auth.signingUp": "Creando cuenta…",
  "auth.signIn.title": "Bienvenido de nuevo",
  "auth.signIn.subtitle":
    "Donde te llega cada día una frase de tu yo de dentro de 10 años.",
  "auth.signIn.noAccount": "¿Es tu primera vez?",
  "auth.signIn.toSignUp": "Crear cuenta",
  "auth.signUp.title": "Conoce a tu yo de dentro de 10 años",
  "auth.signUp.subtitle": "Recibe ahora mismo tu primera frase diaria.",
  "auth.signUp.haveAccount": "¿Ya tienes cuenta?",
  "auth.signUp.toSignIn": "Iniciar sesión",
  "auth.error.invalidEmail": "Revisa el formato del correo.",
  "auth.error.invalidPassword":
    "La contraseña debe tener al menos 6 caracteres.",
  "auth.error.requireDisplayName": "Por favor, escribe tu nombre.",
  "auth.error.generic": "Algo salió mal. Inténtalo de nuevo.",
  "auth.link.title": "Vincular cuenta de Google",
  "auth.link.description": "{email} ya está registrado con correo y contraseña. Escribe tu contraseña para vincular esta cuenta de Google y usar cualquiera de los dos métodos.",
  "auth.link.submit": "Vincular e iniciar sesión",
  "auth.link.cancel": "Cancelar",
  "auth.link.failed": "No se pudo vincular la cuenta. Verifica tu contraseña.",
  "auth.link.apple.title": "Vincular cuenta de Apple",
  "auth.link.apple.description": "{email} ya está registrado con correo y contraseña. Escribe tu contraseña para vincular esta cuenta de Apple y usar cualquiera de los dos métodos.",
  "auth.password.placeholder": "Mínimo 6 caracteres",
  "auth.displayName.placeholder": "Nombre para mostrar",

  // Wins history
  "wins.history.title": "Tus logros, por día",
  "wins.history.subtitle":
    "Cada pequeña línea, reunida — un registro tuyo en el tiempo.",
  "wins.history.empty": "Aún no hay nada escrito.",
  "wins.history.back": "← Volver a inicio",
  "wins.history.loadFailed": "No se pudieron cargar tus registros.",

  // Affirmations editor
  "affirmations.editor.placeholder":
    "Ej.: Soy un emprendedor exitoso con un patrimonio de más de mil millones de dólares.",
  "affirmations.editor.add": "+ Añadir afirmación",
  "affirmations.editor.removeAria": "Quitar esta afirmación",
  "affirmations.editor.maxNote":
    "Hasta {max} entradas, {len} caracteres por línea.",

  // Billing
  "billing.trialBanner": "Te quedan {days} días de prueba",
  "billing.trialEnded": "Tu prueba gratuita terminó.",
  "billing.upgrade": "Mejorar",

  // Apple iOS redesign — settings/auth/legal/common additions
  "auth.signOut": "Cerrar sesión",
  "common.deleting": "Eliminando…",
  "common.empty": "Vacío",
  "common.none": "Ninguno",
  "common.set": "Configurado",
  "legal.privacy": "Política de privacidad",
  "legal.terms": "Términos de servicio",
  "settings.profile.header": "Perfil",
  "settings.affirmations.header": "Afirmaciones diarias",
  "settings.quote.header": "Tarjeta",
  "settings.quote.pinnedAuthor": "Autor favorito",
  "settings.language.header": "Idioma",
  "settings.account.header": "Cuenta",
  "settings.account.deleteConfirm":
    "Todos tus datos se eliminarán permanentemente. Escribe \"ELIMINAR\" abajo para confirmar.",
  "settings.streakLabel": "RACHA {count}",

  // Anima Pro (compra dentro de la app)
  "settings.pro.header": "ANIMA PRO",
  "settings.pro.footerActive": "Todas las funciones están activas.",
  "settings.pro.footerInactive": "Pago único, acceso de por vida · Sin anuncios",
  "settings.pro.active": "Anima Pro activo",
  "settings.pro.buy": "Comprar acceso de por vida",
  "settings.pro.processing": "Procesando…",
  "settings.pro.restore": "Restaurar compra",
  "settings.pro.restoring": "Restaurando…",
  "settings.pro.purchaseDone.title": "Compra completada",
  "settings.pro.purchaseDone.desc": "Tu compra de Anima Pro se completó. ¡Gracias!",
  "settings.pro.pending.title": "Pendiente de aprobación",
  "settings.pro.pending.desc": "Tu pago está pendiente de aprobación. Se aplicará automáticamente una vez aprobado.",
  "settings.pro.purchaseFailed.title": "Pago fallido",
  "settings.pro.purchaseFailed.desc": "El pago falló.",
  "settings.pro.restoreDone.title": "Restauración completada",
  "settings.pro.restoreDone.desc": "Tu compra se ha restaurado.",
  "settings.pro.restoreNone.title": "Nada que restaurar",
  "settings.pro.restoreNone.desc": "No se encontraron compras anteriores.",
};

export default dict;
