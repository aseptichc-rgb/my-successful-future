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
  "onboarding.step1.title": "¿Cómo serás dentro de 10 años?",
  "onboarding.step1.subtitle":
    "Escribe en un párrafo la versión de ti que quieres llegar a ser. Tu frase diaria se construye a partir de esto.",
  "onboarding.step1.placeholder":
    "Ej.: Dentro de 10 años empiezo cada mañana con ejercicio y lectura, paso tiempo de calidad con mi familia y vivo de un trabajo que amo.",
  "onboarding.step1.example1":
    "Dentro de 5 años gano 10.000 € al mes y elijo en qué y cuándo trabajar. Las mañanas empiezan con ejercicio y lectura.",
  "onboarding.step1.example2":
    "Dentro de 10 años soy una de las voces de referencia en mi área y llego a más gente con charlas y libros.",
  "onboarding.step1.example3":
    "Dentro de 7 años el tiempo con mi familia es lo primero. Trabajo cinco horas al día; los fines de semana son míos.",

  "onboarding.step2.title": "¿Hacia qué metas vas ahora?",
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
    "Responde a esta línea desde Inicio y tu carta de identidad crece.",
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
  "home.future.empty": "Aún no has escrito nada. Toca para escribir.",
  "home.future.saveAndRegen": "Guardar y regenerar la tarjeta de hoy",
  "home.future.saveFailed": "No se pudo guardar tu yo futuro",

  "home.goals.title": "Acciones de hoy hacia tus metas",
  "home.goals.subtitle":
    "Una pequeña acción que te acerca a tu yo futuro. Las 3 primeras también aparecen en la pantalla de bloqueo.",
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

  // Settings
  "settings.title": "Ajustes",
  "settings.subtitle":
    "Gestiona tu yo futuro, afirmaciones diarias, acciones de hoy y curaduría de citas en un solo lugar.",
  "settings.future.title": "Tú, dentro de 10 años",
  "settings.future.subtitle":
    "Tu frase diaria se construye a partir de este párrafo.",
  "settings.affirmations.title": "Un paso más hacia tu yo exitoso",
  "settings.affirmations.subtitle":
    "Aparece en gris claro sobre cada tarjeta diaria. Copia cada línea exactamente para sumar +1 a tu racha.",
  "settings.goals.title": "Acciones de hoy hacia tus metas",
  "settings.goals.subtitle":
    "Una pequeña acción que te acerca a tu yo futuro. Las 3 primeras también aparecen en la pantalla de bloqueo.",
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

  // Auth
  "auth.email": "Correo",
  "auth.password": "Contraseña",
  "auth.displayName": "Nombre",
  "auth.signIn": "Iniciar sesión",
  "auth.signUp": "Crear cuenta",
  "auth.signInWithGoogle": "Continuar con Google",
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
};

export default dict;
