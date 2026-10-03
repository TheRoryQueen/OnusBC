// The crisis check runs before any model call (lib/ask/chain.ts). Offline: no API calls.
// Usage: npm run test:crisis
import { isCrisis } from "../lib/ask/chain.ts";

const crisis = ["I feel suicidal", "thinking about suicide", "I want to kill myself", "I've been self harming", "I keep self-harming",
  "I'm hurting myself", "harming myself again", "I want to die", "I'm in danger", "he's here right now", "help me now", "I don't want to end my life but"];
const fine = ["If I report here, who finds out?", "How long does an investigation take?", "Can I get support without making a formal report?",
  "What does the policy say about safety plans?", "Who is the harm reduction contact?"];
let failed = 0;
for (const q of crisis) if (!isCrisis(q)) { failed++; console.log("FAIL  should be crisis:", q); }
for (const q of fine) if (isCrisis(q)) { failed++; console.log("FAIL  should not be crisis:", q); }
console.log(`${crisis.length + fine.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
