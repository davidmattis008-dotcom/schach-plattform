export type OrderedQuizAnswers = {
  answers: string[];
  correctAnswer: number;
};

function createRandom(seed: string) {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function orderQuizAnswers(seed: string, answers: string[], correctAnswer: number): OrderedQuizAnswers {
  if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= answers.length) {
    throw new RangeError(`Correct answer index is outside the answer list for "${seed}".`);
  }
  if (answers.length < 2) {
    throw new RangeError(`A quiz needs at least two answers for "${seed}".`);
  }

  const random = createRandom(seed);
  const correct = answers[correctAnswer];
  const distractors = answers.filter((_, index) => index !== correctAnswer);
  for (let index = distractors.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [distractors[index], distractors[swapIndex]] = [distractors[swapIndex], distractors[index]];
  }
  const correctPosition = (correctAnswer + 1 + Math.floor(random() * (answers.length - 1))) % answers.length;
  distractors.splice(correctPosition, 0, correct);
  return {
    answers: distractors,
    correctAnswer: correctPosition,
  };
}
