/**
 * English famous-quote seed pool.
 *
 * Curation principle (per user request):
 *  - Globally recognized voices (Stoics, scientists, founders, leaders).
 *  - U.S./U.K./globally English-speaking cultural figures.
 *  - Author names rendered in the form most commonly searchable in English.
 *  - Quotes are the most widely cited, verifiable forms in English. We avoid
 *    well-known misattributions (e.g. the spurious "Be the change…" line).
 */
import type { FamousQuoteSeed } from "@/lib/famousQuotesSeed";

export const FAMOUS_QUOTES_SEED_EN: ReadonlyArray<FamousQuoteSeed> = [
  // Philosophy / Stoics / classics
  {
    id: "en_aurelius_obstacle",
    text: "The impediment to action advances action. What stands in the way becomes the way.",
    author: "Marcus Aurelius",
    category: "philosophy",
    language: "en",
  },
  {
    id: "en_aurelius_today",
    text: "You have power over your mind — not outside events. Realize this, and you will find strength.",
    author: "Marcus Aurelius",
    category: "philosophy",
    language: "en",
  },
  {
    id: "en_seneca_time",
    text: "It is not that we have a short time to live, but that we waste a lot of it.",
    author: "Seneca",
    category: "philosophy",
    language: "en",
  },
  {
    id: "en_socrates_examined",
    text: "The unexamined life is not worth living.",
    author: "Socrates",
    category: "philosophy",
    language: "en",
  },
  {
    id: "en_aristotle_excellence",
    text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    author: "Aristotle",
    category: "philosophy",
    language: "en",
  },
  {
    id: "en_nietzsche_why",
    text: "He who has a why to live for can bear almost any how.",
    author: "Friedrich Nietzsche",
    category: "philosophy",
    language: "en",
  },
  {
    id: "en_confucius_stop",
    text: "It does not matter how slowly you go, as long as you do not stop.",
    author: "Confucius",
    category: "philosophy",
    language: "en",
  },
  {
    id: "en_laozi_step",
    text: "A journey of a thousand miles begins with a single step.",
    author: "Lao Tzu",
    category: "philosophy",
    language: "en",
  },

  // Entrepreneurs / leaders
  {
    id: "en_jobs_dots",
    text: "You can't connect the dots looking forward; you can only connect them looking backwards. So you have to trust that the dots will somehow connect in your future.",
    author: "Steve Jobs",
    category: "entrepreneur",
    language: "en",
  },
  {
    id: "en_jobs_time",
    text: "Your time is limited, so don't waste it living someone else's life.",
    author: "Steve Jobs",
    category: "entrepreneur",
    language: "en",
  },
  {
    id: "en_buffett_reputation",
    text: "It takes 20 years to build a reputation and five minutes to ruin it. If you think about that, you'll do things differently.",
    author: "Warren Buffett",
    category: "entrepreneur",
    language: "en",
  },
  {
    id: "en_buffett_compound",
    text: "Someone is sitting in the shade today because someone planted a tree a long time ago.",
    author: "Warren Buffett",
    category: "entrepreneur",
    language: "en",
  },
  {
    id: "en_bezos_regret",
    text: "I knew that if I failed I wouldn't regret that, but I knew the one thing I might regret is not trying.",
    author: "Jeff Bezos",
    category: "entrepreneur",
    language: "en",
  },
  {
    id: "en_edison_perspiration",
    text: "Genius is one percent inspiration and ninety-nine percent perspiration.",
    author: "Thomas Edison",
    category: "scientist",
    language: "en",
  },
  {
    id: "en_einstein_imagination",
    text: "Imagination is more important than knowledge.",
    author: "Albert Einstein",
    category: "scientist",
    language: "en",
  },
  {
    id: "en_einstein_mistakes",
    text: "A person who never made a mistake never tried anything new.",
    author: "Albert Einstein",
    category: "scientist",
    language: "en",
  },
  {
    id: "en_curie_understand",
    text: "Nothing in life is to be feared, it is only to be understood. Now is the time to understand more, so that we may fear less.",
    author: "Marie Curie",
    category: "scientist",
    language: "en",
  },

  // Leaders
  {
    id: "en_lincoln_future",
    text: "The best way to predict the future is to create it.",
    author: "Abraham Lincoln",
    category: "leader",
    language: "en",
  },
  {
    id: "en_mandela_impossible",
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela",
    category: "leader",
    language: "en",
  },
  {
    id: "en_mlk_step",
    text: "Faith is taking the first step even when you don't see the whole staircase.",
    author: "Martin Luther King Jr.",
    category: "leader",
    language: "en",
  },
  {
    id: "en_roosevelt_arena",
    text: "It is not the critic who counts… the credit belongs to the man who is actually in the arena.",
    author: "Theodore Roosevelt",
    category: "leader",
    language: "en",
  },
  {
    id: "en_eleanor_dream",
    text: "The future belongs to those who believe in the beauty of their dreams.",
    author: "Eleanor Roosevelt",
    category: "leader",
    language: "en",
  },

  // Literature
  {
    id: "en_angelou_rise",
    text: "You may encounter many defeats, but you must not be defeated.",
    author: "Maya Angelou",
    category: "literature",
    language: "en",
  },
  {
    id: "en_angelou_courage",
    text: "Courage is the most important of all the virtues, because without courage you can't practice any other virtue consistently.",
    author: "Maya Angelou",
    category: "literature",
    language: "en",
  },
  {
    id: "en_hemingway_strong",
    text: "The world breaks everyone, and afterward many are strong at the broken places.",
    author: "Ernest Hemingway",
    category: "literature",
    language: "en",
  },
  {
    id: "en_emerson_self",
    text: "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.",
    author: "Ralph Waldo Emerson",
    category: "literature",
    language: "en",
  },
  {
    id: "en_thoreau_dreams",
    text: "Go confidently in the direction of your dreams. Live the life you have imagined.",
    author: "Henry David Thoreau",
    category: "literature",
    language: "en",
  },
];
