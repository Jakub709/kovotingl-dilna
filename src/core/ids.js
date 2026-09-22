/** Generátor identifikátorů. Deterministický v rámci běhu, čitelný v souboru. */
let counter = 0;

export function newId(prefix = 'o') {
  counter += 1;
  const t = Date.now().toString(36).slice(-5);
  return `${prefix}_${t}${counter.toString(36).padStart(2, '0')}`;
}

/** Po načtení projektu posune čítač, aby nové id nekolidovala. */
export function bumpCounter(n) {
  counter = Math.max(counter, n | 0);
}
