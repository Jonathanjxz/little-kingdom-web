export interface RandomSource {
  /**
   * Returns a number in the same range as Math.random(): 0 inclusive to 1 exclusive.
   */
  next(): number;
}

export const mathRandomSource: RandomSource = {
  next: () => Math.random(),
};
