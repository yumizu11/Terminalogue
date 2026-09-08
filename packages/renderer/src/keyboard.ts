/**
 * The horizontal half of a US QWERTY keyboard, and the two random decisions a
 * simulated typo is made of.
 *
 * This is deliberately the smallest model that produces a believable slip: the
 * finger lands one key to the left or to the right of the intended one, on the
 * same row. There is no key geometry, no vertical neighbour, no other layout
 * and no Shift state — a symbol that needs Shift is simply not something this
 * models, so it is typed correctly.
 */

/**
 * The unshifted rows this models, exactly as they sit on a US QWERTY keyboard.
 *
 * The rows are separate strings because a row end has one neighbour, not two:
 * `q` can only slip to `w`, never round the corner to the row above.
 */
const ROWS: readonly string[] = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];

/**
 * Every character's neighbours, computed once when the module loads.
 *
 * Typing asks this question for every character of every command, so it is a
 * map lookup rather than a search through the rows. Uppercase letters get their
 * own entries holding uppercase neighbours, which is what keeps `G` slipping to
 * `F` or `H` rather than to a lowercase `h` no shifted finger could produce.
 */
const NEIGHBOURS: ReadonlyMap<string, readonly string[]> = buildNeighbours();

function buildNeighbours(): Map<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const row of ROWS) {
    for (let i = 0; i < row.length; i++) {
      const key = row[i]!;
      const sides: string[] = [];
      if (i > 0) sides.push(row[i - 1]!);
      if (i < row.length - 1) sides.push(row[i + 1]!);
      map.set(key, sides);

      const shifted = key.toUpperCase();
      // Only the letter rows have a distinct uppercase form; `1` and `;` do not
      // shift into anything this layout models.
      if (shifted !== key) map.set(shifted, sides.map((side) => side.toUpperCase()));
    }
  }
  return map;
}

/**
 * The keys immediately left and right of `char` on the same QWERTY row.
 *
 * Returns the empty array for anything the layout does not contain — a space, a
 * tab, a shifted symbol, a Japanese character, an emoji — which is how the
 * typing engine decides a character cannot be mistyped at all.
 *
 * The returned array is shared and must not be modified.
 */
export function getHorizontalNeighbors(char: string): readonly string[] {
  return NEIGHBOURS.get(char) ?? EMPTY;
}

const EMPTY: readonly string[] = [];

/**
 * The first of a typo's two decisions: does this keystroke go wrong at all?
 *
 * A rate of 0 draws no random number, so a document without `@typo` produces
 * byte-for-byte the timeline it produced before typos existed.
 */
export function shouldTypo(rate: number, random: () => number): boolean {
  if (!(rate > 0)) return false;
  return random() < rate;
}

/**
 * The second decision: which side did the finger land on?
 *
 * An even split between the two neighbours; at the end of a row there is only
 * one candidate and no draw is made.
 */
export function chooseNeighbor(char: string, random: () => number): string | null {
  const sides = getHorizontalNeighbors(char);
  if (sides.length === 0) return null;
  if (sides.length === 1) return sides[0]!;
  return random() < 0.5 ? sides[0]! : sides[1]!;
}

/**
 * The wrong key struck instead of `char`, or `null` for a keystroke that lands
 * correctly.
 *
 * Eligibility is settled before the probability is rolled, so characters the
 * layout does not model consume no randomness and leave the timeline of a
 * document that types nothing else completely unchanged.
 */
export function planTypo(char: string, rate: number, random: () => number): string | null {
  if (getHorizontalNeighbors(char).length === 0) return null;
  if (!shouldTypo(rate, random)) return null;
  return chooseNeighbor(char, random);
}
