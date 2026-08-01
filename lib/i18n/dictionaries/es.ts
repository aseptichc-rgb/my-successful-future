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
  "onboarding.futureSelf.sectionLabel": "Lo que de verdad quiero",
  "onboarding.progress.remaining": "Quedan {remaining}",
  "onboarding.progress.lastStep": "Último paso",
  "onboarding.futureSelf.dream.q": "¿Cuál es el sueño que de verdad quieres alcanzar?",
  "onboarding.futureSelf.dream.hint": "Solo uno. Nadie más va a leer esto.",
  "onboarding.futureSelf.dream.placeholder":
    "Ej.: Para 2035, llevar mi propia marca a 10 millones de euros al año con un equipo de 20, trabajar cuatro días a la semana desde una casa frente al mar y pasar un mes al año fuera con mi hijo.",
  "onboarding.futureSelf.dream.why":
    "Números, plazos, nombres: cuanto más concreto, mejor. Esta frase será la materia prima de cada tarjeta que recibas.",
  "onboarding.futureSelf.daily.q": "Dentro de 10 años, ¿cómo fluye un día normal de tu vida?",
  "onboarding.futureSelf.daily.placeholder":
    "Dónde despiertas, qué llena tu mañana, cómo termina tu tarde.",
  "onboarding.futureSelf.work.q":
    "¿En qué trabajas entonces y qué lugar ocupas entre la gente?",
  "onboarding.futureSelf.work.placeholder":
    "Tu rol, tu lugar en el equipo, por qué la gente te busca.",
  "onboarding.futureSelf.wealth.q": "¿Cómo están tus finanzas y tu patrimonio?",
  "onboarding.futureSelf.wealth.placeholder":
    "Ingresos mensuales, lo que has construido, dónde vives, las decisiones que el dinero ya no limita.",
  "onboarding.futureSelf.family.q": "¿Cómo es la vida con tu familia?",
  "onboarding.futureSelf.family.placeholder":
    "El tiempo que compartís, lo que les das, la calidez de esos lazos.",
  "onboarding.futureSelf.achievements.q": "¿Qué has logrado para entonces?",
  "onboarding.futureSelf.achievements.placeholder":
    "Lo que has creado, las metas alcanzadas, los logros que más te enorgullecen.",
  "onboarding.futureSelf.respect.q":
    "¿Cómo te ve la gente y qué respetan de ti?",
  "onboarding.futureSelf.respect.placeholder":
    "La confianza, la reputación y el respeto que te dan — y por qué.",
  "onboarding.futureSelf.growth.q":
    "¿Cómo están tu cuerpo y tu mente, y cómo sigues creciendo?",
  "onboarding.futureSelf.growth.placeholder":
    "Tu salud, lo que estás aprendiendo, cómo sigues avanzando.",

  // Sugerencias personalizadas del paso 2 — sacadas del sueño escrito en el paso 1.
  "onboarding.suggest.loading":
    "Leyendo el sueño que acabas de escribir para elegir frases que encajen contigo…",
  "onboarding.suggest.personalized": "Sacado del sueño que acabas de escribir",

  // Paso 2, campo superior — una línea en primera persona y presente. Se copia cada día.
  "onboarding.declaration.title": "El tú que alcanzó ese sueño, en una línea",
  "onboarding.declaration.subtitle":
    "Escríbela como quien ya llegó. Es la línea que copiarás cada día.",
  "onboarding.declaration.example1": "Soy alguien a quien el dinero no persigue",
  "onboarding.declaration.example2": "Soy alguien fuerte de cuerpo y mente",
  "onboarding.declaration.example3": "Soy alguien cuyo trabajo ayuda a otros",
  "onboarding.declaration.placeholder": "Soy alguien que…",
  "onboarding.declaration.writeMyOwn": "Escribir la mía",

  // Paso 2, campo inferior — la acción de hoy hacia esa persona. Independiente de la línea.
  "onboarding.goal.title": "Una sola cosa hoy, para ser esa persona",
  "onboarding.goal.subtitle":
    "Con una basta. Si la mantienes, se abrirá sitio para otra meta.",
  "onboarding.goal.placeholder": "leo 30 páginas cada día y anoto una línea",
  "onboarding.goal.hint":
    "Escríbela como una acción que hoy hiciste o no hiciste: así se puede marcar.",
  // Alternativas estáticas, solo cuando no hay sugerencia personalizada.
  // Cada una lleva número, frecuencia y unidad contable (ver lib/goalQuality).
  "onboarding.goal.example1": "Leo 20 páginas cada mañana y anoto una línea",
  "onboarding.goal.example2": "Escribo cada noche mis 3 tareas en 10 minutos",
  "onboarding.goal.example3": "Camino 30 minutos 4 veces cada semana",
  "onboarding.goal.pickOne":
    "Elige solo una. No hace falta varias desde el primer día: repetir esa única cada día es todo.",

  "onboarding.step4.cta": "Recibir la frase de hoy →",
  "onboarding.step4.preparing": "Preparando…",

  "onboarding.step5.titleLoading": "Creando tu frase de hoy…",
  "onboarding.step5.titleDone": "Cada mañana, tu día dentro de diez años cobra vida ante ti.",
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
  "home.goals.placeholder": "Ej.: Probar 1 cosa que nunca he hecho, cada día",
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
  "auth.error.emailInUse": "Este correo ya está registrado. Inicia sesión en su lugar.",
  "auth.error.invalidCredentials": "Correo o contraseña incorrectos.",
  "auth.error.tooManyRequests": "Demasiados intentos. Inténtalo más tarde.",
  "auth.error.network": "Revisa tu conexión a internet.",
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

  // Ajustes de notificaciones (recordatorios locales)
  "settings.notifications.header": "Notificaciones",
  "settings.notifications.row": "Recordatorios diarios",
  "settings.notifications.off": "Desactivado",
  "settings.notifications.footer":
    "Los recordatorios se programan solo en este dispositivo. Máximo 2 al día — nunca por lo que ya hiciste.",
  "settings.notifications.morning.title": "Recordatorio matutino de afirmación",
  "settings.notifications.morning.desc": "Una señal para empezar el día escribiendo tu declaración.",
  "settings.notifications.evening.title": "Recordatorio nocturno de registro",
  "settings.notifications.evening.desc": "Llega solo si aún no marcaste la meta de hoy.",
  "settings.notifications.weekly.title": "Repaso del domingo",
  "settings.notifications.weekly.desc": "Un aviso por la tarde cuando tu repaso semanal esté listo.",
  "settings.notifications.time": "Hora",

  // Textos de notificación (iOS — Android usa recursos nativos)
  "notify.morning.title": "Un paso más hacia tu yo futuro",
  "notify.morning.body": "Empieza el día escribiendo tu afirmación.",
  "notify.evening.title": "La meta de hoy sigue esperando",
  "notify.evening.body": "Solo toma un momento — marca el paso de hoy.",
  "notify.weekly.title": "Hora de repasar tu semana",
  "notify.weekly.body": "El registro de tu semana está listo. Tómate un momento para verlo.",

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
  "settings.pro.purchaseIncomplete.title": "Compra no completada",
  "settings.pro.purchaseIncomplete.desc":
    "La compra no se completó. Si ya la compraste, toca ‘Restaurar compra’ abajo.",
  "settings.pro.restoreDone.title": "Restauración completada",
  "settings.pro.restoreDone.desc": "Tu compra se ha restaurado.",
  "settings.pro.restoreNone.title": "Nada que restaurar",
  "settings.pro.restoreNone.desc": "No se encontraron compras anteriores.",

  // ── Planes de ejecución WOOP (if-then) ────────────
  "woop.section.title": "Planes de ejecución (if-then)",
  "woop.section.footer": "Nombrar tu obstáculo por adelantado multiplica la probabilidad de actuar.",
  "woop.section.designCta": "Diseñar",
  "woop.sheet.title": "Plan de ejecución",
  "woop.step.wish": "Meta",
  "woop.step.outcome": "Mejor resultado",
  "woop.step.obstacle": "Obstáculo interior",
  "woop.step.plan": "Plan if-then",
  "woop.wish.hint": "¿Para qué meta es este plan?",
  "woop.wish.empty": "Primero agrega una meta mensual en Ajustes.",
  "woop.outcome.hint": "¿Cómo es el mejor momento cuando logras esta meta?",
  "woop.outcome.placeholder": "ej.: Imaginarme habiéndolo logrado me acelera el corazón",
  "woop.obstacle.hint": "¿Qué obstáculo INTERIOR te bloquea? Busca en tu mente, no en las circunstancias.",
  "woop.obstacle.placeholder": "ej.: Por la noche estoy cansado y quiero aplazarlo",
  "woop.obstacle.suggest": "Recibir sugerencias de IA",
  "woop.obstacle.suggesting": "Creando sugerencias…",
  "woop.plan.ifLabel": "Si (if)",
  "woop.plan.thenLabel": "Entonces (then)",
  "woop.plan.ifPlaceholder": "cuando llegue el momento del obstáculo",
  "woop.plan.thenPlaceholder": "haré esto",
  "woop.identity.pickLabel": "Identidad que refuerza esta práctica",
  "woop.save": "Guardar",
  "woop.saving": "Guardando…",
  "woop.delete": "Eliminar",
  "woop.saveFailed": "No se pudo guardar el plan de ejecución.",
  "woop.suggestFailed": "No se pudieron cargar las sugerencias.",

  // ── Hoja de diseño: intro "¿Por qué decidirlo por adelantado?" (plegada) ──
  "woop.why.toggle": "¿Por qué decidirlo por adelantado?",
  "woop.why.p1":
    "La fuerza de voluntad es más débil en el momento de decidir. Una noche cansada, el teléfono ya en la mano — si lo piensas entonces, sueles perder.",
  "woop.why.p2":
    "Fijar de antemano una frase — 'Si A, entonces hago B' — pasa el disparador de 'yo' a la situación. En estudios de neuroimagen, con una intención de implementación fijada, los circuitos guiados por señales asumieron el trabajo de las regiones prefrontales mediales usadas para el recuerdo autoiniciado.",
  "woop.why.p3":
    "Por eso el efecto es grande: un metaanálisis de 94 estudios halló un tamaño de efecto de d = 0.65 en el logro de metas.",
  "woop.why.p4":
    "Y nombra siempre el obstáculo dentro de ti. Se ha comprobado una y otra vez que imaginar solo el buen resultado drena la energía para actuar.",
  "woop.why.source":
    "Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011",

  // ── Tarjeta if-then de hoy (modo mañana) ──────────
  "plan.today.title": "El if-then de hoy",
  "plan.today.if": "Si",
  "plan.today.then": "Entonces",
  "plan.today.desc":
    "La acción de hoy, decidida antes de que llegue el momento. Cuando llegue, hazla sin pensarlo.",
  "plan.today.rotation": "Tus {count} planes se turnan: cada día aparece uno distinto.",
  "plan.today.emptyCta": "Crea el plan de ejecución de hoy",
  "plan.today.emptyDesc":
    "Una frase: «Si pasa A, hago B» · Elige un borrador de la IA y listo, sin escribir",
  "plan.today.firstAction": "La primera acción que eligió mi yo de anoche",
  "unlock.teaser.title": "Algo que todavía no se ha abierto",
  "unlock.teaser.hint": "Qué es, lo sabrás el día que se abra.",
  "unlock.locked.body": "Se abre con {days} días seguidos · ahora {progress} días",

  // ── Modo noche: primera acción de mañana ──────────
  "home.evening.firstAction.title": "Una primera acción para mañana",
  "home.evening.firstAction.placeholder": "La pequeña acción que harás primero mañana",
  "home.evening.firstAction.footer": "Escribirla calma tu mente durante la noche · guardado automático",

  // ── Progreso (/progress) ──────────────────────────
  "progress.title": "Progreso",
  "progress.back": "← Inicio",
  "progress.chipAria": "Ver progreso",
  "progress.streak.current": "Racha actual",
  "progress.streak.days": "{count} días",
  "progress.streak.best": "Mejor {count} días",
  "progress.goalDays": "{count} días con una meta lograda",
  "progress.freeze.label": "Hielos restantes este mes",
  "progress.freeze.desc": "Si fallas un día, un hielo une tu racha automáticamente ({max}/mes)",
  "progress.heatmap.title": "Últimos 30 días",
  "progress.consistency": "Constancia {pct}%",
  "progress.identity.title": "Registro de evidencia de identidad",
  "progress.identity.subtitle": "Cada acción es un voto por la persona en la que te conviertes.",
  "progress.identity.iAm": "Soy {label}",
  "progress.identity.votes": "{count}×",
  "progress.identity.empty": "Aún no hay evidencia. Empieza con el check-in de hoy.",
  "progress.evidence.title": "Evidencia reciente",
  "progress.source.checkin": "Afirmación",
  "progress.source.deep": "Todas las líneas",
  "progress.source.goal": "Meta",
  "progress.source.win": "Logro",
  "progress.source.mission": "Misión",
  "progress.loadFailed": "No se pudo cargar tu progreso.",

  // ── Tarjeta de recompromiso ───────────────────────
  "recommit.title": "Hoy es un buen día para empezar de nuevo",
  "recommit.body":
    "Tus {prev} días no se borran · mejor {best} días. ¿Empezamos de nuevo hoy?",
  "recommit.freezeChip": "Haz check-in ahora y {count} hielo(s) unirán tu racha",
  "recommit.cta": "Hacer check-in ahora",
  "recommit.dismissAria": "Cerrar",

  // ── Coach de afirmaciones ─────────────────────────
  "coach.buttonAria": "Recibir sugerencias del coach de IA",
  "coach.title": "Sugerencias del coach",
  "coach.loading": "Creando sugerencias…",
  "coach.style.process": "Proceso",
  "coach.style.question": "Pregunta",
  "coach.style.identity": "Identidad",
  "coach.failed": "No se pudieron cargar las sugerencias.",
  "coach.quota": "Agotaste las sugerencias del coach de hoy. Hasta mañana.",

  // ── Afirmación de hoy (una línea obligatoria, el resto opcional) ──
  "affirmations.focus.title": "Tu yo futuro y exitoso",
  "affirmations.focus.rotation": "{index} de {total}",
  "affirmations.focus.hint": "Escribe, con detalle, al tú que ya vive ese sueño.",
  "affirmations.focus.placeholder": "Cada línea lo hace más real…",
  "affirmations.focus.expand": "Grabar las {count} líneas",
  "affirmations.focus.collapse": "Solo la línea de hoy",
  "affirmations.focus.deepHint": "Si las grabas todas, ganas un voto de identidad más.",
  "affirmations.focus.mismatch": "Escríbela igual que la línea de arriba, letra por letra.",
  "affirmations.extra.mismatch":
    "Hay una línea para repasar — el registro de hoy ya está completo.",

  // ── Justo después del registro ────────────────────
  "checkin.reward.title": "Hoy viviste como esa persona",
  "checkin.reward.streak": "Día {count} seguido",
  "checkin.reward.evidence": "Evidencia de identidad +{count} · Soy {label}",
  "checkin.reward.evidencePlain": "Evidencia de identidad +{count}",
  "checkin.reward.deepBadge": "Todas las líneas",
  "checkin.reward.freeze": "{count} hielo(s) unieron los días que faltaron",

  // ── Anillo de ritmo de 7 días ─────────────────────
  "rhythm.title": "El ritmo de esta semana",
  "rhythm.count": "{done}/{total}",
  "rhythm.footer": "{done} de los últimos 7 días grabados.",
  "rhythm.startCaption": "Contamos desde el día en que empezaste.",
  "rhythm.todayAria": "Hoy",

  // ── Repaso semanal (domingo por la noche, sin escribir) ──
  "weekly.title": "Repaso de la semana",
  "weekly.checkinDays": "{count} días grabados",
  "weekly.wins": "{count} logros",
  "weekly.evidence": "{count} votos",
  "weekly.topIdentity": "Lo que más probaste esta semana · Soy {label}",
  "weekly.empty":
    "Una semana tranquila. Volvemos a contar en tu próximo registro.",
  "weekly.footer": "No hay nada que escribir — solo mira los últimos 7 días.",

  // ── Diseño rápido WOOP (3 toques, sin teclado) ────
  "woop.quick.title": "Diseño rápido",
  "woop.quick.pickGoal": "¿Para qué meta lo diseñamos?",
  "woop.quick.draftCta": "Recibir 3 borradores",
  "woop.quick.drafting": "Escribiendo borradores…",
  "woop.quick.pickDraft": "Elige el borrador que te guste y guárdalo tal cual.",
  "woop.quick.saveDraft": "Guardar así",
  "woop.quick.manual": "Escribirlo yo",
  "woop.quick.outcomeLabel": "Mejor resultado",
  "woop.quick.obstacleLabel": "Obstáculo interno",
  "woop.section.moreCta": "{count} meta(s) más sin plan",
  "woop.section.footerOne":
    "De una en una — practicar una vale más que anotar tres.",

  // ── Secciones plegables del inicio ────────────────
  "home.section.today": "La acción de hoy",
  "home.section.record": "El registro de hoy",
  "home.section.expandAria": "Desplegar",
  "home.section.collapseAria": "Plegar",
  "home.wins.addRow": "Añadir otra línea",
  "home.record.footer": "Lo que escribas se guarda solo.",
  "home.plans.manage": "Gestionar diseños de ejecución",
  "home.plans.manageLocked": "Gestionar objetivos",
  // En Inicio solo quedan la frase, la tarjeta de hoy y el anillo de 7 días.
  "home.section.more": "Ver más",
  "home.more.summary": "Yo futuro · Notas · Planes",
  "home.more.summaryLocked": "Yo futuro · Objetivos · algo aún bloqueado",

  // ── Marcar la meta de hoy (misma tarjeta que la transcripción) ──
  "home.todayGoal.title": "Meta de hoy",
  "home.todayGoal.question": "¿La cumpliste hoy?",
  "home.todayGoal.did": "Sí, la cumplí",
  "home.todayGoal.notYet": "Todavía no",
  "home.todayGoal.doneToday": "Cumplida hoy",
  "home.todayGoal.undo": "Deshacer",
  "home.todayGoal.empty": "Aún no has fijado una meta.",
  "home.todayGoal.setCta": "Fijar una meta",
  "home.todayGoal.afterCheckin": "Escrita. Ahora solo dinos si hoy la cumpliste de verdad.",

  // ── Yo futuro, una línea ──
  "home.futureLine.label": "Mi yo futuro",
  "home.futureLine.empty": "Aún no has escrito nada.",
  "home.futureLine.write": "Escribirlo ahora",

  // ── Espacios para metas ──
  "goalSlot.unlock.title": "Has abierto sitio para otra meta",
  "goalSlot.unlock.body":
    "{days} días seguidos. Añade una meta nueva o haz más nítida la que ya tienes.",
  "goalSlot.unlock.bodyGoal":
    "Cumpliste tu meta {days} días. Añade una meta nueva o haz más nítida la que ya tienes.",
  "goalSlot.unlock.addGoal": "Añadir meta",
  "goalSlot.unlock.refine": "Afinar mi meta actual",
  "goalSlot.unlock.later": "Más tarde",
  "goalSlot.locked": "🔒 Se abre a los {days} días seguidos",
  "goalSlot.lockedProgress": "{progress} hasta ahora",
  "goalSlot.maxed": "Hasta {max} metas. Cuantas menos lleves, mejor las cumples.",
  "goalSlot.hint": "Mantén una y se abrirá sitio para la siguiente.",

  // ── Etapa de crecimiento (votos de evidencia acumulados) ──
  "growth.title": "Etapa de crecimiento",
  "growth.subtitle": "Los check-ins, las transcripciones completas, las metas logradas y los logros se vuelven votos que suben tu etapa.",
  "growth.votes": "{count} votos",
  "growth.toNext": "{count} votos para la siguiente etapa",
  "growth.stage.0": "Semilla",
  "growth.stage.1": "Brote",
  "growth.stage.2": "Tallo",
  "growth.stage.3": "Rama",
  "growth.stage.4": "Árbol",
  "growth.stage.5": "Bosque",

  // ── Sugerencia de subir el reto ──
  "stepUp.title": "Lo estás cumpliendo muy bien",
  "stepUp.body": "¿Subimos un poco? p. ej. {draft}",
  "stepUp.apply": "Ir a ajustes",
  "stepUp.later": "Después",

  // ── Concreción de la meta ──
  "goal.specific.hint": "Un poco más concreta y será más fácil cumplirla",
  "goal.specific.count": "un número",
  "goal.specific.cadence": "cada cuánto",
  "goal.specific.unit": "una unidad",
  "goal.specific.countExample": "30",
  "goal.specific.cadenceExample": "cada día",
  "goal.specific.unitExample": "minutos",
  "goal.refine.title": "Hazla más nítida",
  "goal.refine.subtitle": "Toca la pieza que falta para añadirla. Dejarla así también vale.",
  "goal.refine.apply": "Usar esta meta",

  "settings.futureSelf.moreDetail": "Añadir más detalle",

  // ── Aviso único para cuentas de la época derivada (DeclarationNudgeCard) ──
  "declarationNudge.title": "Tu línea y tu meta son la misma frase",
  "declarationNudge.body":
    "Antes creábamos tu línea diaria desde tu meta. Reescribirla como “ya lo soy” cambia cómo te llega cada mañana.",
  "declarationNudge.cta": "Reescribir mi línea",
  "declarationNudge.dismiss": "No, gracias",
};

export default dict;
