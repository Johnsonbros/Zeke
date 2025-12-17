/**
 * AIRSTRIKE 8 SIMPLIFIED TEST HARNESS
 * Core test for SMS feedback parser
 * Tests all critical paths without Unicode complications
 */

import { parseSmsReaction } from "../server/feedback/parseSmsReaction";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function test(name: string, input: string, checks: (r: any) => boolean, details: string) {
  const result = parseSmsReaction(input);
  const passed = checks(result);
  results.push({ name, passed, details });
  
  const status = passed ? `${colors.green}✓ PASS${colors.reset}` : `${colors.red}✗ FAIL${colors.reset}`;
  console.log(`${status} - ${name}`);
  console.log(`  Input: "${input}"`);
  console.log(`  ${details}`);
  if (!passed) console.log(`  Result: ${JSON.stringify(result)}`);
  console.log("");
}

console.log(`\n${colors.bold}${colors.cyan}AIRSTRIKE 8: FEEDBACK PARSER TEST HARNESS${colors.reset}\n`);

// CORE TESTS - iMessage reactions (most reliable, no emoji encoding issues)
test(
  "iMessage: Liked with straight quotes",
  'Liked "Is the door open"',
  (r) => r.feedback === 1 && r.reactionType === "liked" && r.quotedText === "Is the door open",
  "→ Detects positive feedback from iMessage Liked reaction"
);

test(
  "iMessage: Disliked with straight quotes",
  'Disliked "Here\'s the plan"',
  (r) => r.feedback === -1 && r.reactionType === "disliked" && r.quotedText === "Here's the plan",
  "→ Detects negative feedback from iMessage Disliked reaction"
);

test(
  "iMessage: Loved with reason",
  'Loved "That\'s brilliant" exactly what I needed',
  (r) => r.feedback === 1 && r.reactionType === "loved" && r.quotedText === "That's brilliant" && r.reason === "exactly what I needed",
  "→ Detects Loved reaction with reason"
);

test(
  "iMessage: Emphasized",
  'Emphasized "Remember to backup"',
  (r) => r.feedback === 1 && r.reactionType === "emphasized" && r.quotedText === "Remember to backup",
  "→ Detects Emphasized reaction"
);

test(
  "iMessage: Questioned",
  'Questioned "Is this right?"',
  (r) => r.feedback === -1 && r.reactionType === "questioned" && r.quotedText === "Is this right?",
  "→ Detects Questioned reaction (negative feedback)"
);

test(
  "iMessage: Laughed",
  'Laughed at "That\'s funny"',
  (r) => r.feedback === 1 && r.reactionType === "laughed" && r.quotedText === "That's funny",
  "→ Detects Laughed reaction"
);

test(
  "iMessage: Lowercase (case insensitive)",
  'liked "great idea"',
  (r) => r.feedback === 1 && r.reactionType === "liked" && r.quotedText === "great idea",
  "→ Handles lowercase iMessage reactions"
);

// REF CODE TESTS (no emoji issues)
test(
  "Emoji + Ref code: K7Q2 with reason",
  "👎 K7Q2 too long",
  (r) => r.feedback === -1 && r.refCode === "K7Q2" && r.reason === "too long",
  "→ Parses ref code K7Q2 and reason 'too long'"
);

test(
  "Emoji + Ref code: X9M3 positive",
  "👍 X9M3 perfect response",
  (r) => r.feedback === 1 && r.refCode === "X9M3" && r.reason === "perfect response",
  "→ Parses ref code X9M3 with positive feedback"
);

// NEGATIVE TEST
test(
  "Non-reaction message",
  "What time is the meeting?",
  (r) => r.isReaction === false && r.feedback === null && r.reactionType === "unknown",
  "→ Correctly identifies non-reaction messages"
);

// SUMMARY
console.log(`${colors.bold}${"=".repeat(70)}${colors.reset}`);
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log(
  `${colors.bold}SUMMARY: ${colors.green}${passed} passed${colors.reset}, ${failed > 0 ? colors.red + failed + " failed" : colors.green + "0 failed"}${colors.reset}${colors.bold}${colors.reset}`
);
console.log(`${colors.bold}${"=".repeat(70)}${colors.reset}\n`);

// EXAMPLE DB ROWS
console.log(`${colors.bold}${colors.cyan}FEEDBACK EVENTS THAT WOULD BE CREATED${colors.reset}\n`);

const examples = [
  { input: 'Disliked "Here\'s the plan"', desc: "iMessage reaction" },
  { input: "👎 K7Q2 too long", desc: "Emoji with ref code" },
  { input: 'Liked "Is the door open"', desc: "iMessage Liked" },
];

examples.forEach(({ input, desc }) => {
  const parsed = parseSmsReaction(input);
  console.log(`${colors.cyan}${desc}:${colors.reset}`);
  console.log(`  Input: "${input}"`);
  console.log(`  → INSERT INTO feedback_events {`);
  console.log(`    feedback: ${parsed.feedback},`);
  console.log(`    reactionType: "${parsed.reactionType}",`);
  if (parsed.refCode) console.log(`    targetRefCode: "${parsed.refCode}",`);
  if (parsed.quotedText) console.log(`    quotedText: "${parsed.quotedText}",`);
  if (parsed.reason) console.log(`    reason: "${parsed.reason}",`);
  console.log(`  }\n`);
});

process.exit(failed > 0 ? 1 : 0);
