// Grading guidance for each criterion, rubric v2 (docs/rubric-v2-proposal.md, approved Oct 4, 2026):
// full credit only for commitments that are explicit, specific and enforceable; permissive or vague
// language caps at 1; missing is 0. Scores: 0 not addressed, 1 partial, 2 full.
// Ids and labels match the criteria table seeded in supabase/migrations.
export const PROMPT_VERSION = "2026-10-04.2";

export const RUBRIC: { id: string; category: string; label: string; guide: string }[] = [
  { id: "AC-1", category: "Accessible", label: "Stand-alone policy, not run through the student code of conduct",
    guide: "2 if this is a dedicated sexual violence policy whose own process governs reports, independent of the general student code of conduct. 1 if a dedicated policy exists but sends some or all reports through the general code of conduct or another general process, or its own coverage is permissive. 0 if there is no stand-alone policy." },
  { id: "AC-2", category: "Accessible", label: "Publicly posted and easy to find",
    guide: "2 if the text commits, in binding language, to the policy being publicly available, for example posted on the institution's website. 1 if publication is mentioned vaguely or permissively, for example available on request. 0 if not mentioned." },
  { id: "AC-3", category: "Accessible", label: "Plain-language reporting steps",
    guide: "2 if it sets out clear steps to disclose or report: who to contact by role or office, how, and what happens next, stated as the defined process. 1 if reporting is mentioned with incomplete or vague steps, or steps left to discretion. 0 if not addressed." },
  { id: "SR-1", category: "Survivor rights", label: "No questions about sexual history",
    guide: "2 if it states, in binding language, that the complainant's past sexual history will not be asked about, raised, or considered. 1 if the protection exists but is discretionary, limited, or full of exceptions. 0 if not addressed." },
  { id: "SR-2", category: "Survivor rights", label: "Protection from face-to-face contact",
    guide: "2 if it guarantees the complainant will not have to face the respondent: no direct cross-examination, separate or remote proceedings as a right. 1 if the protection is possible or arranged at discretion, for example where practicable. 0 if not addressed." },
  { id: "SR-3", category: "Survivor rights", label: "No gag orders",
    guide: "2 if it states outright that complainants are not required to sign a non-disclosure agreement or stay silent, and are free to speak about their own experience; an NDA only at the complainant's own request still counts. 1 if confidentiality expectations are limited but unclear, or silence protections are permissive. 0 if not addressed, or if it requires complainants to keep the matter confidential." },
  { id: "SR-4", category: "Survivor rights", label: "Choice of institutional and external processes",
    guide: "2 if it states the choice is the person's: the institutional process, the police or criminal process, both, or neither, in binding language that the institution honours it and never requires a police report. 1 if options are mentioned without the right to choose, or the right is hedged by broad institutional overrides. 0 if not addressed." },
  { id: "SR-5", category: "Survivor rights", label: "Amnesty for drug or alcohol use when reporting",
    guide: "2 if it commits, in binding language, that a person who reports will not be disciplined for drug or alcohol use, or related breaches, around the time of the incident. 1 if amnesty is discretionary or conditional, for example case by case. 0 if not addressed." },
  { id: "PR-1", category: "Process", label: "Reasonable, binding timelines",
    guide: "2 if it sets specific binding timelines that meet or beat the benchmark: the complaint process inside 45 days and immediate accommodations inside 48 hours. 1 if timelines are vague (timely, as soon as possible), permissive, or specific but slower than the benchmark. 0 if not addressed." },
  { id: "PR-2", category: "Process", label: "Interim protections (class, residence, work changes)",
    guide: "2 if the institution commits, in binding language, to interim measures while a matter is open, naming what can change: classes, residence, work arrangements. 1 if interim measures are possible but discretionary (may include, as appropriate), or named without a commitment. 0 if not addressed." },
  { id: "PR-3", category: "Process", label: "Covers co-op, internships, work placements",
    guide: "2 if the scope names co-op, practicum, internship or work placement settings explicitly, as a binding scope statement. 1 if off-campus activity is covered only in general terms, or the named settings are covered permissively. 0 if not addressed." },
  { id: "AB-1", category: "Accountability", label: "Survivor told the outcome",
    guide: "2 if it commits, in binding language, to telling the complainant the outcome, including any sanction or measure that affects them. 1 if informing them is discretionary, partial, or hedged without specifics. 0 if not addressed." },
  { id: "AB-2", category: "Accountability", label: "Public annual reporting of numbers",
    guide: "2 if it commits, in binding language, to publishing annual numbers: disclosures, reports, outcomes. 1 if reporting is internal only, vague about numbers, or permissive. 0 if not addressed." },
  { id: "AB-3", category: "Accountability", label: "Policy reviewed every 2 years",
    guide: "2 if it requires review at least every 2 years, in binding language. 1 if review is required on a longer cycle, or with no stated interval, or permissive. 0 if not addressed." },
  { id: "AB-4", category: "Accountability", label: "At least 30% student representation on policy committees",
    guide: "2 if it requires students to make up at least 30% of the committee that reviews the policy. 1 if student membership or consultation is required without that share, or the share is stated permissively. 0 if not addressed." },
  { id: "TR-1", category: "Training", label: "Mandatory trauma-informed training for decision-makers",
    guide: "2 if it requires investigators and decision-makers to complete trauma-informed training, in binding language. 1 if training is mentioned without being required, required but not trauma-informed, or advisory (should). 0 if not addressed." },
  { id: "TR-2", category: "Training", label: "Prevention education for students",
    guide: "2 if the institution commits, in binding language, to prevention education or programming for students. 1 if mentioned aspirationally or permissively (endeavour to, aim to, may offer). 0 if not addressed." },
];
