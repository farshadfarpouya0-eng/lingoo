/** Pure, dependency-free placement-test content — safe to import in client components. */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const GOALS = [
  "Conversation", "IELTS", "TOEFL", "TOEIC", "Business", "Travel", "Kids",
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

/** Five goal-focused questions. The first 15 questions remain shared by every learner. */
const GOAL_QUESTIONS: Record<string, PlacementQuestion[]> = {
  Conversation: [
    { id: 101, band: "A1", prompt: "Someone says, ‘Nice to meet you.’ What is the best reply?", options: ["Nice to meet you too.", "I am meeting yesterday.", "At seven o’clock.", "I like coffee."], answer: 0 },
    { id: 102, band: "A2", prompt: "Your friend asks, ‘Would you like to join us?’ You are busy. What do you say?", options: ["I joined yesterday.", "I’d love to, but I can’t today.", "I am not like.", "Yes, I was."], answer: 1 },
    { id: 103, band: "B1", prompt: "You didn’t hear someone clearly. What is the most natural response?", options: ["Repeat you.", "What you said?", "Could you say that again, please?", "Say again it."], answer: 2 },
    { id: 104, band: "B2", prompt: "Which phrase politely interrupts a conversation?", options: ["Stop talking.", "I hate to interrupt, but…", "You are wrong.", "Listen me."], answer: 1 },
    { id: 105, band: "C1", prompt: "Which response best acknowledges a different opinion while disagreeing?", options: ["That’s nonsense.", "I see your point; however, I interpret the situation differently.", "No, never.", "You don’t understand."], answer: 1 },
  ],
  Travel: [
    { id: 111, band: "A1", prompt: "At the airport, where do you show your passport and ticket?", options: ["At the check-in desk.", "At the swimming pool.", "At the pharmacy.", "At the platform yesterday."], answer: 0 },
    { id: 112, band: "A2", prompt: "How would you ask a hotel employee for another towel?", options: ["I need towel yesterday.", "Could I have another towel, please?", "Where towel go?", "I am towel."], answer: 1 },
    { id: 113, band: "B1", prompt: "Your flight has been delayed. What would you ask the airline staff?", options: ["How long is the delay expected to be?", "Where did you delayed?", "How much is my passport?", "Why you are flight?"], answer: 0 },
    { id: 114, band: "B2", prompt: "Which sentence is best for politely requesting a room change?", options: ["Change my room now.", "I was wondering whether it might be possible to move to a quieter room.", "This room is bad, change.", "You must give room."], answer: 1 },
    { id: 115, band: "C1", prompt: "A reservation is non-refundable. What does this mean?", options: ["It can always be changed for free.", "The payment generally cannot be returned if you cancel.", "It includes unlimited meals.", "It has no confirmed date."], answer: 1 },
  ],
  IELTS: [
    { id: 121, band: "A1", prompt: "Choose the correct meaning of ‘increase’. ", options: ["To become greater", "To become smaller", "To disappear", "To repeat"], answer: 0 },
    { id: 122, band: "A2", prompt: "Choose the best connector: ‘The weather was cold; ___, we went swimming.’", options: ["because", "however", "so that", "unless"], answer: 1 },
    { id: 123, band: "B1", prompt: "Which sentence best summarizes a paragraph about the benefits of public transport?", options: ["Public transport has several advantages for cities.", "Buses are sometimes blue.", "I bought a ticket yesterday.", "The paragraph has five lines."], answer: 0 },
    { id: 124, band: "B2", prompt: "In academic writing, which phrase introduces a contrast?", options: ["Furthermore", "In contrast", "For instance", "As a result"], answer: 1 },
    { id: 125, band: "C1", prompt: "‘The findings are inconclusive’ means the findings…", options: ["prove the theory completely", "do not lead to a definite conclusion", "were never collected", "are intentionally misleading"], answer: 1 },
  ],
  TOEFL: [
    { id: 131, band: "A1", prompt: "Choose the closest meaning of ‘rapid’. ", options: ["Fast", "Quiet", "Expensive", "Careful"], answer: 0 },
    { id: 132, band: "A2", prompt: "Choose the correct sentence.", options: ["She interested in science.", "She is interested in science.", "She be interested science.", "She interesting in science."], answer: 1 },
    { id: 133, band: "B1", prompt: "A text says plants convert sunlight into energy. What is the main idea?", options: ["Plants use sunlight to produce energy.", "Sunlight is always harmful.", "Plants cannot grow indoors.", "Energy comes only from soil."], answer: 0 },
    { id: 134, band: "B2", prompt: "Choose the best completion: ‘The experiment was repeated ___ verify the results.’", options: ["in order to", "despite", "whereas", "although"], answer: 0 },
    { id: 135, band: "C1", prompt: "‘The author’s argument is predicated on an assumption’ means it is…", options: ["based on an assumption", "opposed to all evidence", "written without a conclusion", "unrelated to the topic"], answer: 0 },
  ],
  TOEIC: [
    { id: 141, band: "A1", prompt: "Where would you usually find a meeting agenda?", options: ["In a meeting invitation", "On a restaurant menu", "On a boarding pass", "In a weather report"], answer: 0 },
    { id: 142, band: "A2", prompt: "Choose the correct sentence for a workplace email.", options: ["Please find the report attached.", "Please finding report attach.", "The report attach yesterday please.", "Please attached the reporting."], answer: 0 },
    { id: 143, band: "B1", prompt: "The manager asked everyone to ___ the deadline.", options: ["meet", "do", "make", "take"], answer: 0 },
    { id: 144, band: "B2", prompt: "Which phrase is most appropriate when rescheduling a business meeting?", options: ["Let’s move the meeting to Thursday.", "Meeting go another day maybe.", "I no come meeting.", "Thursday is meeting moved by."], answer: 0 },
    { id: 145, band: "C1", prompt: "A company is ‘undergoing a restructuring’. It is…", options: ["changing its organizational structure", "closing every customer account", "launching a new product only", "moving all meetings online"], answer: 0 },
  ],
  Business: [
    { id: 151, band: "A1", prompt: "Which phrase is a polite way to greet a customer?", options: ["How can I help you?", "You go now.", "Give me that.", "Why here?"], answer: 0 },
    { id: 152, band: "A2", prompt: "Choose the best phrase to arrange an appointment.", options: ["Can we meet on Tuesday?", "We meeting Tuesday yesterday.", "You meet me Tuesday now.", "Tuesday is meet."], answer: 0 },
    { id: 153, band: "B1", prompt: "A client asks for an update. Which reply is most appropriate?", options: ["I’ll send you the latest figures this afternoon.", "You wait.", "Figures are yesterday.", "No update you."], answer: 0 },
    { id: 154, band: "B2", prompt: "Which expression is most suitable for negotiating a deadline?", options: ["Would an extension until Friday be workable?", "Friday or nothing.", "You must delay it.", "I not finish."], answer: 0 },
    { id: 155, band: "C1", prompt: "‘We need to align our priorities’ means we need to…", options: ["make sure our priorities are consistent", "cancel every current project", "avoid discussing objectives", "work without a plan"], answer: 0 },
  ],
  Kids: [
    { id: 161, band: "A1", prompt: "Which one is an animal?", options: ["A cat", "A pencil", "A table", "A shoe"], answer: 0 },
    { id: 162, band: "A1", prompt: "Choose the correct sentence.", options: ["I like apples.", "I likes apples.", "I liking apples.", "I am like apples."], answer: 0 },
    { id: 163, band: "A2", prompt: "What do you wear when it rains?", options: ["A raincoat", "Sunglasses at night", "A swimsuit", "Slippers in the pool"], answer: 0 },
    { id: 164, band: "A2", prompt: "Complete: ‘Yesterday, I ___ football with my friends.’", options: ["play", "played", "playing", "plays"], answer: 1 },
    { id: 165, band: "B1", prompt: "Choose the best way to describe a character who is not afraid of danger.", options: ["Brave", "Sleepy", "Tiny", "Hungry"], answer: 0 },
  ],
};

export function getPlacementQuestions(goal: string): PlacementQuestion[] {
  const specific = GOAL_QUESTIONS[goal] ?? [];
  return [...PLACEMENT_QUESTIONS, ...specific];
}

export function gradePlacement(answers: number[], goal = ""): { score: number; level: CefrLevel } {
  let score = 0;
  const perBand = new Map<CefrLevel, number>();
  getPlacementQuestions(goal).forEach((q, i) => {
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
