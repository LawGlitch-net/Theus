export function wordsFromText(text) {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

export function normalizeWord(word) {
  return word.normalize('NFKC').toLocaleLowerCase();
}

export function collapseRepeatedWords(words) {
  return words.filter((word, index) => index === 0 || normalizeWord(word) !== normalizeWord(words[index - 1]));
}

function damerauLevenshtein(left, right) {
  const matrix = Array.from({ length: left.length + 1 }, (_, row) =>
    Array.from({ length: right.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : 0));

  for (let row = 1; row <= left.length; row++) {
    for (let column = 1; column <= right.length; column++) {
      const substitution = matrix[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        substitution,
      );
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

export function isApproximatePhraseMatch(recognizedWords, triggerWords) {
  if (!triggerWords.length || recognizedWords.length !== triggerWords.length) return false;

  let totalErrorRatio = 0;
  for (let index = 0; index < triggerWords.length; index++) {
    const recognized = normalizeWord(recognizedWords[index]);
    const expected = normalizeWord(triggerWords[index]);
    if (recognized === expected) continue;

    const longestLength = Math.max(recognized.length, expected.length);
    if (longestLength <= 2) return false;
    const distance = damerauLevenshtein(recognized, expected);
    const maxDistance = Math.min(2, Math.floor(longestLength * 0.25));
    if (distance > maxDistance) return false;
    totalErrorRatio += distance / longestLength;
  }

  return totalErrorRatio / triggerWords.length <= 0.3;
}
