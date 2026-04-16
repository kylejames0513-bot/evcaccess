/**
 * EVC nickname dictionary — bidirectional mappings for name resolution.
 * Ported from Kyle's VBA GetNicknames ladder.
 * Both directions are indexed: "mike" resolves to "michael" and vice versa.
 */

const PAIRS: [string, string][] = [
  ["mike", "michael"],
  ["frankie", "niyonyishu"],
  ["abbi", "abbigayle"],
  ["bob", "robert"],
  ["liz", "elizabeth"],
  ["beth", "elizabeth"],
  ["betty", "elizabeth"],
  ["bill", "william"],
  ["billy", "william"],
  ["will", "william"],
  ["willy", "william"],
  ["jim", "james"],
  ["jimmy", "james"],
  ["jamie", "james"],
  ["joe", "joseph"],
  ["joey", "joseph"],
  ["tom", "thomas"],
  ["tommy", "thomas"],
  ["dan", "daniel"],
  ["danny", "daniel"],
  ["dave", "david"],
  ["davy", "david"],
  ["chris", "christopher"],
  ["topher", "christopher"],
  ["nick", "nicholas"],
  ["nicky", "nicholas"],
  ["rick", "richard"],
  ["ricky", "richard"],
  ["dick", "richard"],
  ["rich", "richard"],
  ["sam", "samuel"],
  ["sammy", "samuel"],
  ["tony", "anthony"],
  ["ed", "edward"],
  ["eddie", "edward"],
  ["ted", "theodore"],
  ["teddy", "theodore"],
  ["matt", "matthew"],
  ["matty", "matthew"],
  ["pat", "patricia"],
  ["patty", "patricia"],
  ["trish", "patricia"],
  ["kate", "katherine"],
  ["kathy", "katherine"],
  ["katie", "katherine"],
  ["kat", "katherine"],
  ["cathy", "catherine"],
  ["cat", "catherine"],
  ["jen", "jennifer"],
  ["jenny", "jennifer"],
  ["jenn", "jennifer"],
  ["sue", "susan"],
  ["suzy", "susan"],
  ["meg", "margaret"],
  ["maggie", "margaret"],
  ["peggy", "margaret"],
  ["maddie", "madison"],
  ["maddy", "madison"],
  ["abby", "abigail"],
  ["gail", "abigail"],
  ["alex", "alexander"],
  ["al", "albert"],
  ["ally", "allison"],
  ["ali", "allison"],
  ["angie", "angela"],
  ["ang", "angela"],
  ["andy", "andrew"],
  ["drew", "andrew"],
  ["barb", "barbara"],
  ["becca", "rebecca"],
  ["becky", "rebecca"],
  ["ben", "benjamin"],
  ["benny", "benjamin"],
  ["bernie", "bernard"],
  ["charlie", "charles"],
  ["chuck", "charles"],
  ["cindy", "cynthia"],
  ["debbie", "deborah"],
  ["deb", "deborah"],
  ["don", "donald"],
  ["donnie", "donald"],
  ["frank", "franklin"],
  ["freddy", "frederick"],
  ["fred", "frederick"],
  ["gina", "virginia"],
  ["ginny", "virginia"],
  ["greg", "gregory"],
  ["hank", "henry"],
  ["harry", "harold"],
  ["jack", "john"],
  ["jackie", "jacqueline"],
  ["jake", "jacob"],
  ["jeff", "jeffrey"],
  ["jerry", "gerald"],
  ["jess", "jessica"],
  ["jessie", "jessica"],
  ["jo", "josephine"],
  ["joann", "joanne"],
  ["johnny", "john"],
  ["jon", "jonathan"],
  ["josh", "joshua"],
  ["judy", "judith"],
  ["kenny", "kenneth"],
  ["ken", "kenneth"],
  ["larry", "lawrence"],
  ["leo", "leonard"],
  ["lenny", "leonard"],
  ["les", "leslie"],
  ["lou", "louis"],
  ["louie", "louis"],
  ["luke", "lucas"],
  ["manny", "manuel"],
  ["marty", "martin"],
  ["mel", "melvin"],
  ["mike", "michael"],
  ["mitch", "mitchell"],
  ["nate", "nathaniel"],
  ["nat", "nathaniel"],
  ["pete", "peter"],
  ["phil", "philip"],
  ["ray", "raymond"],
  ["rob", "robert"],
  ["robbie", "robert"],
  ["ron", "ronald"],
  ["ronnie", "ronald"],
  ["russ", "russell"],
  ["sandy", "sandra"],
  ["steph", "stephanie"],
  ["steve", "steven"],
  ["stu", "stuart"],
  ["terry", "terence"],
  ["tim", "timothy"],
  ["tina", "christina"],
  ["chris", "christina"],
  ["vicky", "victoria"],
  ["vic", "victoria"],
  ["walt", "walter"],
  ["wes", "wesley"],
  ["zach", "zachary"],
  ["zack", "zachary"],
  // EVC-specific from Kyle's list
  ["mary jane", "mary"],
  ["mj", "mary"],
];

/** Map from lowercase nickname → Set of canonical names it could match */
const INDEX = new Map<string, Set<string>>();

for (const [a, b] of PAIRS) {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (!INDEX.has(la)) INDEX.set(la, new Set());
  if (!INDEX.has(lb)) INDEX.set(lb, new Set());
  INDEX.get(la)!.add(lb);
  INDEX.get(lb)!.add(la);
}

/**
 * Given a first name, return all known nicknames/variants (lowercase).
 * Returns empty array if no match.
 */
export function getNicknames(firstName: string): string[] {
  const key = firstName.toLowerCase().trim();
  const matches = INDEX.get(key);
  return matches ? [...matches] : [];
}

/**
 * Check if two first names are nickname-equivalent.
 */
export function isNicknameMatch(a: string, b: string): boolean {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return true;
  const variants = INDEX.get(la);
  return variants ? variants.has(lb) : false;
}
