/**
 * AIRSTRIKE 8 TEST HARNESS
 * Comprehensive test suite for SMS feedback parser
 * Tests emoji reactions, ref codes, quoted text, and smart quotes
 */

import { parseSmsReaction } from "../server/feedback/parseSmsReaction";

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

interface TestCase {
  name: string;
  input: string;
  expectedFeedback: 1 | -1 | null;
  expectedType:
    | "liked"
    | "disliked"
    | "loved"
    | "laughed"
    | "emphasized"
    | "questioned"
    | "unknown";
  expectedRefCode?: string;
  expectedQuotedText?: string;
  expectedReason?: string;
}

// Test cases covering all scenarios
const testCases: TestCase[] = [
  // Direct emoji
  {
    name: "Direct positive emoji (thumbs up)",
    input: "\u{1F44D}",
    expectedFeedback: 1,
    expectedType: "liked",
  },
  {
    name: "Direct negative emoji (thumbs down)",
    input: "\u{1F44E}",
    expectedFeedback: -1,
    expectedType: "disliked",
  },

  // Emoji with ref code
  {
    name: "Negative emoji with ref code and reason",
    input: "\u{1F44E} K7Q2 too long",
    expectedFeedback: -1,
    expectedType: "disliked",
    expectedRefCode: "K7Q2",
    expectedReason: "too long",
  },
  {
    name: "Positive emoji with ref code and reason",
    input: "\u{1F44D} X9M3 perfect response",
    expectedFeedback: 1,
    expectedType: "liked",
    expectedRefCode: "X9M3",
    expectedReason: "perfect response",
  },

  // iMessage/SMS reactions with straight quotes
  {
    name: 'iMessage Liked with straight quotes',
    input: 'Liked "Is the door open"',
    expectedFeedback: 1,
    expectedType: "liked",
    expectedQuotedText: "Is the door open",
  },
  {
    name: 'iMessage Disliked with straight quotes',
    input: 'Disliked "Here\'s the plan"',
    expectedFeedback: -1,
    expectedType: "disliked",
    expectedQuotedText: "Here's the plan",
  },

  // iMessage/SMS reactions with smart quotes (curly quotes)
  {
    name: "iMessage Liked with smart quotes (left/right)",
    input: 'Liked \u201cIs the door open\u201d',
    expectedFeedback: 1,
    expectedType: "liked",
    expectedQuotedText: "Is the door open",
  },
  {
    name: "iMessage Disliked with smart quotes and ellipsis",
    input: 'Disliked \u201cHere\u2019s the plan\u2026\u201d',
    expectedFeedback: -1,
    expectedType: "disliked",
    expectedQuotedText: "Here\u2019s the plan\u2026",
  },

  // iMessage reactions with reason
  {
    name: "iMessage Loved with reason and straight quotes",
    input: 'Loved "That\'s brilliant" exactly what I needed',
    expectedFeedback: 1,
    expectedType: "loved",
    expectedQuotedText: "That's brilliant",
    expectedReason: "exactly what I needed",
  },
  {
    name: "iMessage Emphasized with smart quotes and reason",
    input: 'Emphasized \u201cRemember to backup\u201d important',
    expectedFeedback: 1,
    expectedType: "emphasized",
    expectedQuotedText: "Remember to backup",
    expectedReason: "important",
  },

  // Case insensitivity
  {
    name: "Lowercase iMessage reaction",
    input: 'liked "great idea"',
    expectedFeedback: 1,
    expectedType: "liked",
    expectedQuotedText: "great idea",
  },

  // Edge cases
  {
    name: "Multiple emoji (positive wins)",
    input: "\u{1F44D} \u{1F44E} K7Q2",
    expectedFeedback: 1,
    expectedType: "liked",
  },
  {
    name: "Emoji with only whitespace after",
    input: "\u{1F44E}   ",
    expectedFeedback: -1,
    expectedType: "disliked",
  },
  {
    name: "Non-reaction message",
    input: "What time is the meeting?",
    expectedFeedback: null,
    expectedType: "unknown",
  },
];

// Run all tests
function runTests() {
  let passed = 0;
  let failed = 0;

  console.log(
    `\n${colors.bold}${colors.cyan}AIRSTRIKE 8: FEEDBACK PARSER TEST HARNESS${colors.reset}\n`
  );
  console.log(`${colors.yellow}Running ${testCases.length} test cases...${colors.reset}\n`);

  testCases.forEach((testCase, index) => {
    const result = parseSmsReaction(testCase.input);

    // Verify expectations
    let testPassed = true;
    const failures: string[] = [];

    if (result.feedback !== testCase.expectedFeedback) {
      testPassed = false;
      failures.push(
        `feedback: expected ${testCase.expectedFeedback}, got ${result.feedback}`
      );
    }

    if (result.reactionType !== testCase.expectedType) {
      testPassed = false;
      failures.push(
        `type: expected "${testCase.expectedType}", got "${result.reactionType}"`
      );
    }

    if (testCase.expectedRefCode && result.refCode !== testCase.expectedRefCode) {
      testPassed = false;
      failures.push(
        `refCode: expected "${testCase.expectedRefCode}", got "${result.refCode}"`
      );
    }

    if (
      testCase.expectedQuotedText &&
      result.quotedText !== testCase.expectedQuotedText
    ) {
      testPassed = false;
      failures.push(
        `quotedText: expected "${testCase.expectedQuotedText}", got "${result.quotedText}"`
      );
    }

    if (testCase.expectedReason && result.reason !== testCase.expectedReason) {
      testPassed = false;
      failures.push(
        `reason: expected "${testCase.expectedReason}", got "${result.reason}"`
      );
    }

    // Print result
    const status = testPassed ? `${colors.green}✓ PASS${colors.reset}` : `${colors.red}✗ FAIL${colors.reset}`;
    console.log(`[${index + 1}/${testCases.length}] ${status} - ${testCase.name}`);

    if (!testPassed) {
      console.log(`    ${colors.red}Input: "${testCase.input}"${colors.reset}`);
      failures.forEach((failure) => {
        console.log(`    ${colors.red}  ✗ ${failure}${colors.reset}`);
      });
      failed++;
    } else {
      passed++;
      console.log(
        `    Parsed: feedback=${result.feedback}, type="${result.reactionType}"${
          result.refCode ? `, refCode="${result.refCode}"` : ""
        }${result.quotedText ? `, quoted="${result.quotedText}"` : ""}${
          result.reason ? `, reason="${result.reason}"` : ""
        }`
      );
    }
    console.log("");
  });

  // Summary
  console.log(`${colors.bold}${"=".repeat(70)}${colors.reset}`);
  console.log(
    `${colors.bold}SUMMARY: ${colors.green}${passed} passed${colors.reset}, ${failed > 0 ? colors.red + failed + " failed" + colors.reset : colors.green + "0 failed" + colors.reset}${colors.reset}`
  );
  console.log(`${colors.bold}${"=".repeat(70)}${colors.reset}\n`);

  // Example feedback events that would be created
  console.log(`${colors.bold}${colors.cyan}EXAMPLE FEEDBACK EVENTS (DB rows)${colors.reset}\n`);

  const exampleCases = [
    testCases[1], // Negative emoji
    testCases[2], // Negative emoji with ref code
    testCases[4], // Liked with quotes
    testCases[7], // Disliked with smart quotes
  ];

  exampleCases.forEach((testCase) => {
    const parsed = parseSmsReaction(testCase.input);
    console.log(`Input: "${testCase.input}"`);
    console.log(
      `→ Would insert feedback_events row:`
    );
    console.log(`  {`);
    console.log(`    "feedback": ${parsed.feedback},`);
    console.log(`    "reactionType": "${parsed.reactionType}",`);
    if (parsed.refCode) console.log(`    "targetRefCode": "${parsed.refCode}",`);
    if (parsed.quotedText) console.log(`    "quotedText": "${parsed.quotedText}",`);
    if (parsed.reason) console.log(`    "reason": "${parsed.reason}",`);
    console.log(`  }\n`);
  });

  return failed === 0 ? 0 : 1;
}

// Run tests and exit with appropriate code
const exitCode = runTests();
process.exit(exitCode);
