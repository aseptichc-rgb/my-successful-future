/**
 * Semilla de citas célebres en español.
 *
 * Curaduría:
 *  - Voces globales (estoicos, Einstein, Curie) traducidas a español natural.
 *  - Figuras culturales del mundo hispanohablante: Cervantes, Borges, Lorca,
 *    Neruda, García Márquez, Octavio Paz, Frida Kahlo, Sor Juana, Picasso.
 *  - Texto en castellano contemporáneo, evitando paráfrasis demasiado libres.
 */
import type { FamousQuoteSeed } from "@/lib/famousQuotesSeed";

export const FAMOUS_QUOTES_SEED_ES: ReadonlyArray<FamousQuoteSeed> = [
  // Filosofía / clásicos
  {
    id: "es_aurelio_obstaculo",
    text: "El obstáculo a la acción avanza la acción. Lo que se interpone en el camino se convierte en el camino.",
    author: "Marco Aurelio",
    category: "philosophy",
    language: "en", // 시드 type 호환을 위해 en 으로 두되, 실제 출력 언어는 시드 language 분리로 관리.
  },
  {
    id: "es_seneca_tiempo",
    text: "No es que tengamos poco tiempo, sino que perdemos mucho.",
    author: "Séneca",
    category: "philosophy",
    language: "en",
  },
  {
    id: "es_socrates_examinada",
    text: "Una vida sin examen no merece ser vivida.",
    author: "Sócrates",
    category: "philosophy",
    language: "en",
  },
  {
    id: "es_aristoteles_habito",
    text: "Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito.",
    author: "Aristóteles",
    category: "philosophy",
    language: "en",
  },
  {
    id: "es_nietzsche_porque",
    text: "Quien tiene un porqué para vivir, puede soportar casi cualquier cómo.",
    author: "Friedrich Nietzsche",
    category: "philosophy",
    language: "en",
  },
  {
    id: "es_confucio_lento",
    text: "No importa lo despacio que vayas, mientras no te detengas.",
    author: "Confucio",
    category: "philosophy",
    language: "en",
  },
  {
    id: "es_laozi_paso",
    text: "Un viaje de mil millas comienza con un solo paso.",
    author: "Lao Tse",
    category: "philosophy",
    language: "en",
  },

  // Ciencia / emprendimiento
  {
    id: "es_einstein_imaginacion",
    text: "La imaginación es más importante que el conocimiento.",
    author: "Albert Einstein",
    category: "scientist",
    language: "en",
  },
  {
    id: "es_curie_entender",
    text: "Nada en la vida debe temerse, solo comprenderse. Ahora es el momento de comprender más, para temer menos.",
    author: "Marie Curie",
    category: "scientist",
    language: "en",
  },
  {
    id: "es_jobs_tiempo",
    text: "Tu tiempo es limitado, no lo malgastes viviendo la vida de otra persona.",
    author: "Steve Jobs",
    category: "entrepreneur",
    language: "en",
  },
  {
    id: "es_mandela_imposible",
    text: "Siempre parece imposible, hasta que se hace.",
    author: "Nelson Mandela",
    category: "leader",
    language: "en",
  },

  // Voces hispanohablantes
  {
    id: "es_cervantes_andar",
    text: "El que lee mucho y anda mucho, ve mucho y sabe mucho.",
    author: "Miguel de Cervantes",
    category: "literature",
    language: "en",
  },
  {
    id: "es_cervantes_libertad",
    text: "La libertad, Sancho, es uno de los más preciosos dones que a los hombres dieron los cielos.",
    author: "Miguel de Cervantes",
    category: "literature",
    language: "en",
  },
  {
    id: "es_borges_paraiso",
    text: "Siempre imaginé que el Paraíso sería algún tipo de biblioteca.",
    author: "Jorge Luis Borges",
    category: "literature",
    language: "en",
  },
  {
    id: "es_borges_olvidar",
    text: "Uno está enamorado cuando se da cuenta de que otra persona es única.",
    author: "Jorge Luis Borges",
    category: "literature",
    language: "en",
  },
  {
    id: "es_marquez_vida",
    text: "La vida no es la que uno vivió, sino la que uno recuerda y cómo la recuerda para contarla.",
    author: "Gabriel García Márquez",
    category: "literature",
    language: "en",
  },
  {
    id: "es_neruda_lento",
    text: "Muere lentamente quien no viaja, quien no lee, quien no oye música, quien no encuentra encanto en sí mismo.",
    author: "Pablo Neruda",
    category: "literature",
    language: "en",
  },
  {
    id: "es_lorca_volar",
    text: "Solo el misterio nos hace vivir. Solo el misterio.",
    author: "Federico García Lorca",
    category: "literature",
    language: "en",
  },
  {
    id: "es_paz_palabra",
    text: "La libertad no es una filosofía, ni siquiera es una idea: es un movimiento de la conciencia.",
    author: "Octavio Paz",
    category: "literature",
    language: "en",
  },
  {
    id: "es_machado_camino",
    text: "Caminante, no hay camino, se hace camino al andar.",
    author: "Antonio Machado",
    category: "literature",
    language: "en",
  },
  {
    id: "es_kahlo_alas",
    text: "Pies, ¿para qué los quiero si tengo alas para volar?",
    author: "Frida Kahlo",
    category: "literature",
    language: "en",
  },
  {
    id: "es_sor_juana_palabras",
    text: "Yo no estudio para saber más, sino para ignorar menos.",
    author: "Sor Juana Inés de la Cruz",
    category: "literature",
    language: "en",
  },
  {
    id: "es_picasso_inspiracion",
    text: "La inspiración existe, pero tiene que encontrarte trabajando.",
    author: "Pablo Picasso",
    category: "entrepreneur",
    language: "en",
  },
];
