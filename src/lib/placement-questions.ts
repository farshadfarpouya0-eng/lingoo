/** Pure, dependency-free placement-test content — safe to import in client components. */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const GOALS = [
  "Conversation", "IELTS", "TOEFL", "TOEIC", "Business",
  "Interview", "Travel", "Grammar", "Writing", "Pronunciation", "Kids",
] as const;

export type PlacementQuestion = {
  id: number;
  band: CefrLevel;
  prompt: string;
  options: [string, string, string, string];
  answer: number; // index of the correct option
};

/** 15 questions, 3 per CEFR band, ordered from easiest to hardest. */
export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  // A1
  { id: 1, band: "A1", prompt: "She ___ a teacher.", options: ["is", "are", "am", "be"], answer: 0 },
  { id: 2, band: "A1", prompt: "I have two ___ .", options: ["childs", "childes", "children", "childrens"], answer: 2 },
  { id: 3, band: "A1", prompt: "___ you like coffee?", options: ["Does", "Do", "Is", "Are"], answer: 1 },
  // A2
  { id: 4, band: "A2", prompt: "Yesterday we ___ to the cinema.", options: ["go", "goes", "went", "gone"], answer: 2 },
  { id: 5, band: "A2", prompt: "This book is ___ than that one.", options: ["interestinger", "more interesting", "most interesting", "interesting"], answer: 1 },
  { id: 6, band: "A2", prompt: "I have lived here ___ 2019.", options: ["for", "from", "since", "until"], answer: 2 },
  // B1
  { id: 7, band: "B1", prompt: "If it rains tomorrow, we ___ at home.", options: ["would stay", "will stay", "stayed", "stay yesterday"], answer: 1 },
  { id: 8, band: "B1", prompt: "The report ___ by the manager yesterday.", options: ["wrote", "was written", "is writing", "has write"], answer: 1 },
  { id: 9, band: "B1", prompt: "I'm looking forward ___ you again.", options: ["to see", "to seeing", "see", "seen"], answer: 1 },
  // B2
  { id: 10, band: "B2", prompt: "By this time next year, she ___ her degree.", options: ["will finish", "will have finished", "finishes", "is finish"], answer: 1 },
  { id: 11, band: "B2", prompt: "The committee decided to ___ the meeting until Friday.", options: ["put off", "put on", "put up", "put in"], answer: 0 },
  { id: 12, band: "B2", prompt: "Hardly ___ the door when the phone rang.", options: ["I had closed", "had I closed", "I have closed", "did I had closed"], answer: 1 },
  // C1
  { id: 13, band: "C1", prompt: "The new policy is expected to ___ far-reaching changes in the sector.", options: ["bring about", "bring up", "bring off", "bring round to"], answer: 0 },
  { id: 14, band: "C1", prompt: "___ the evidence, the jury reached a swift verdict.", options: ["Having examined", "Examined being", "To have examine", "Be examined"], answer: 0 },
  { id: 15, band: "C1", prompt: "His argument was so ___ that nobody could follow it.", options: ["convoluted", "convoluting", "convolution", "convolutedly"], answer: 0 },
];

export function gradePlacement(answers: number[]): { score: number; level: CefrLevel } {
  let score = 0;
  const perBand = new Map<CefrLevel, number>();
  PLACEMENT_QUESTIONS.forEach((q, i) => {
    if (answers[i] === q.answer) {
      score += 1;
      perBand.set(q.band, (perBand.get(q.band) ?? 0) + 1);
    }
  });
  // Level = highest band in an unbroken run (≥2 of 3 correct) starting from A1.
  let level: CefrLevel = "A1";
  for (const band of CEFR_LEVELS) {
    if ((perBand.get(band) ?? 0) >= 2) level = band;
    else break;
  }
  return { score, level };
}
