// RAG: retrieves Ugandan law passages relevant to a crime report, plus an incident profile (what police should do first).
// Law library = data/laws.json. Built-in SEED below is a short starter set; run `node import-laws.js yourlaws.pdf` to replace it with the official text.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const LAWS_FILE = path.join(__dirname, 'data', 'laws.json');

const SEED = [
  { source: 'Constitution of Uganda 1995', ref: 'Art. 22', text: 'Protection of right to life. No person shall be deprived of life intentionally except in execution of a lawful sentence. Killing, murder, mob justice, lynching.' },
  { source: 'Constitution of Uganda 1995', ref: 'Art. 24', text: 'Respect for human dignity and protection from inhuman treatment. No person shall be subjected to any form of torture or cruel, inhuman or degrading treatment. Beating, assault by crowd.' },
  { source: 'Constitution of Uganda 1995', ref: 'Art. 26', text: 'Protection from deprivation of property. Every person has a right to own property. No compulsory taking of property. Theft, robbery, burning of property, arson, land grabbing.' },
  { source: 'Constitution of Uganda 1995', ref: 'Art. 28', text: 'Right to a fair hearing. A person charged with a criminal offence is presumed innocent until proved guilty. Mob justice denies a suspect a fair trial.' },
  { source: 'Penal Code Act', ref: 'Murder', text: 'Any person who of malice aforethought causes the death of another person by an unlawful act is guilty of murder. Killing during mob justice is murder; every participant may be liable.' },
  { source: 'Penal Code Act', ref: 'Robbery and aggravated robbery', text: 'Robbery is theft with violence or threat of violence. It is aggravated when the offender is armed with a gun, panga, knife or other deadly weapon, or wounds or threatens to kill. Armed robbery with a firearm or panga.' },
  { source: 'Penal Code Act', ref: 'Theft', text: 'A person who fraudulently and without claim of right takes anything capable of being stolen is guilty of theft. Stolen phone, motorcycle, boda boda, bag, cattle.' },
  { source: 'Penal Code Act', ref: 'Arson', text: 'Any person who wilfully and unlawfully sets fire to a building, crop or property is guilty of arson. Fire outbreak, burning of house, market, shop or vehicle set ablaze.' },
  { source: 'Penal Code Act', ref: 'Assault and grievous harm', text: 'Assault occasioning actual bodily harm, grievous harm, or wounding with a panga, knife or other weapon. Beating, cutting, stabbing.' },
  { source: 'Penal Code Act', ref: 'Rape and defilement', text: 'Rape is unlawful sexual intercourse without consent. Defilement is a sexual act with a child under 18 years. Sexual violence, child abuse.' },
  { source: 'Penal Code Act', ref: 'Kidnap and abduction', text: 'Kidnapping or abducting a person with intent to confine or harm them, or for ransom. Missing person taken by force.' },
  { source: 'Firearms Act 2004', ref: 'Unlawful possession', text: 'Possession or use of a firearm or ammunition without a licence is an offence. Using a gun in a crime attracts severe penalties. Gunmen, shooting.' },
  { source: 'Domestic Violence Act 2010', ref: 'Domestic violence', text: 'A person who commits an act of domestic violence (physical, sexual, emotional, economic abuse) against a family member commits an offence. Protection orders may be sought. Wife beating, abuse at home.' },
  { source: 'Computer Misuse Act 2011', ref: 'Cybercrime', text: 'Unauthorised access, electronic fraud, cyber harassment, offensive communication and child pornography are offences. Hacking, online scam, mobile money fraud by SIM or phishing.' },
  { source: 'Anti-Corruption Act 2009', ref: 'Corruption', text: 'Soliciting or receiving a bribe, abuse of office and embezzlement by a public official are offences. Bribery by police, officials demanding money.' },
  { source: 'Narcotic Drugs and Psychotropic Substances (Control) Act', ref: 'Drug offences', text: 'Possession, trafficking, cultivation or sale of narcotic drugs and psychotropic substances is an offence. Drugs, marijuana, heroin.' },
  { source: 'Children Act', ref: 'Child protection', text: 'Every child has the right to be protected from abuse, neglect, exploitation and violence. Child abuse, child labour, child neglect.' },
];

// What each incident type needs. `ask` = follow-up questions for the reporter, `first` = what police should do first.
const PROFILES = [
  { id: 'fire', label: 'Fire outbreak', emergency: true, q: 'arson setting fire building', words: ['fire', 'burning', 'burnt', 'flames', 'arson', 'ablaze', 'smoke'],
    ask: ['Is anyone trapped or injured?', 'What is burning (house, market, vehicle, fuel)?', 'Is the fire still spreading?'],
    first: ['Alert Fire and Rescue and the nearest ambulance now', 'Dispatch patrol to cordon off and control the crowd', 'Check for signs of arson and secure witnesses'] },
  { id: 'mob', label: 'Mob justice', emergency: true, q: 'right to life fair hearing murder manslaughter grievous harm', words: ['mob', 'lynch', 'crowd beating', 'beating a thief', 'mob justice', 'stoning', 'necklace'],
    ask: ['Is the victim still alive and where are they?', 'Roughly how many people are involved?', 'Are there weapons or fuel?'],
    first: ['Send the nearest patrol and request backup immediately', 'Protect the victim and arrange medical help', 'Record leaders and witnesses for later arrests'] },
  { id: 'armed', label: 'Armed robbery (gun or panga)', emergency: true, q: 'robbery aggravated robbery firearm deadly weapon punishment', words: ['gun', 'pistol', 'rifle', 'panga', 'machete', 'armed', 'gunmen', 'shot', 'shooting', 'robbery'],
    ask: ['Are the attackers still there? Which way did they go?', 'How many attackers, and what weapons?', 'Vehicle, motorcycle or number plate?', 'Is anyone injured?'],
    first: ['Dispatch armed response to the live location', 'Alert nearby posts to block escape routes', 'Send an ambulance if anyone is hurt'] },
  { id: 'sexual', label: 'Sexual violence or child abuse', emergency: true, q: 'rape defilement child under eighteen indecent assault', words: ['rape', 'defile', 'sexual', 'molest', 'child abuse'],
    ask: ['Is the victim safe now?', 'Does the victim need medical care?'],
    first: ['Contact the Child and Family Protection Unit', 'Arrange medical exam and counselling; preserve evidence', 'Handle with strict confidentiality'] },
  { id: 'killing', label: 'Killing or murder', emergency: true, q: 'murder manslaughter punishment of murder', words: ['murder', 'killed', 'strangle', 'dead body', 'shot dead', 'to death'],
    ask: ['Where is the body or victim now?', 'Are the suspects known or still nearby?'],
    first: ['Secure the scene and preserve evidence', 'Alert CID and arrange medical confirmation'] },
  { id: 'violent', label: 'Violent assault', emergency: false, q: 'assault grievous harm wounding actual bodily harm', words: ['stab', 'knife', 'wounded', 'beaten', 'beat up', 'cut with', 'panga'],
    ask: ['Does the victim need medical care?', 'Is the attacker known and still around?'],
    first: ['Arrange medical care and a PF3 medical form', 'Record statements from the victim and witnesses'] },
  { id: 'burglary', label: 'Burglary or break-in', emergency: false, q: 'burglary housebreaking breaking entering building theft', words: ['burglar', 'break in', 'broke into', 'break-in', 'housebreak', 'broken into'],
    ask: ['What was taken and what is it worth?', 'Any signs of how they got in?'], first: ['Visit the scene and collect fingerprints or other evidence', 'Record statement and list of stolen items'] },
  { id: 'kidnap', label: 'Kidnapping or abduction', emergency: true, q: 'kidnap abduct ransom confine', words: ['kidnap', 'abduct', 'ransom', 'taken by force', 'missing child'],
    ask: ['When and where was the person last seen?', 'Description, clothing and a recent photo?', 'Has anyone contacted you demanding money?'], first: ['Alert patrols and nearby posts with the description', 'Trace the phone numbers involved and notify CID'] },
  { id: 'theft', label: 'Theft', emergency: false, q: 'theft stolen steal larceny', words: ['stole', 'stolen', 'theft', 'thief', 'pickpocket', 'snatched'],
    ask: ['What was taken? Any serial number or IMEI?', 'Do you know who took it?'], first: ['Record the items and serial numbers', 'Circulate stolen item details to nearby posts'] },
  { id: 'domestic', label: 'Domestic violence', emergency: false, q: 'domestic violence protection order family abuse', words: ['domestic', 'my husband', 'my wife', 'beats me', 'abuse at home'],
    ask: ['Are you safe right now?', 'Is there a child in the home?'], first: ['Ensure the victim is safe and arrange medical care', 'Refer to the Child and Family Protection Unit if needed'] },
  { id: 'corruption', label: 'Corruption or bribery', emergency: false, q: 'corruption bribe bribery abuse of office complaint police officer', words: ['bribe', 'bribery', 'asked me for money', 'corrupt'],
    ask: ['Name or number of the official and the place and time?'], first: ['Pass to the Professional Standards or district commander for impartial investigation'] },
  { id: 'cyber', label: 'Cyber or mobile money fraud', emergency: false, words: ['mobile money', 'momo', 'phishing', 'hack', 'scam', 'online', 'sim swap', 'airtel money', 'mtn'],
    ask: ['Which number or account received the money?', 'How much and at what time?'],
    first: ['Ask the telecom to freeze the receiving account', 'Preserve messages, screenshots and transaction IDs'] },
];


// What the REPORTER should do now / keep, per incident type. (Police-side steps are the profile's `first`.)
const GUIDE = {
  armed: { now: ['Get to a safe place. Do not chase or confront the attackers.', 'Call 999 or 112 if they are nearby or anyone is hurt.', 'Get medical care for any injury and ask the police for a PF3 medical form.', 'Write down now: how many attackers, weapons, clothing, direction they went, any vehicle or boda number plate.', 'Keep your phone on so officers can reach you.'], keep: ['Do not touch or clean the scene.', 'Keep anything the attackers left behind.', 'Ask witnesses to save phone videos or CCTV.', 'List stolen items; for phones dial *#06# to get the IMEI.'] },
  fire: { now: ['Move everyone to safety and stay out of the building.', 'Call the fire service and 999 or 112 now if the fire is still burning.', 'Help others only if it is safe. Do not go back in.'], keep: ['Take photos or video from a safe distance.', 'Note who was nearby and anything unusual before the fire.'] },
  mob: { now: ['Do not try to stop a crowd alone and do not join in.', 'Call 999 or 112 now. Give the exact place.', 'If the victim is alive, get help to them only when it is safe.'], keep: ['From a safe distance, note people who led or used weapons.', 'Do not post videos that could identify the victim.'] },
  sexual: { now: ['Get to a safe place with someone you trust.', 'Seek medical care as soon as you can. Treatment works best within 72 hours.', 'Ask police for a PF3 medical form. Everything you share is handled with strict confidentiality.'], keep: ['If possible do not wash or change clothes before the examination. Keep them in a paper bag.', 'Write down what you remember while it is fresh.'] },
  killing: { now: ['Call 999 or 112 now.', 'Do not touch or move the body or anything near it.', 'Keep people away so the scene is not disturbed.'], keep: ['Note who was present and anything you saw or heard.'] },
  violent: { now: ['Get medical care and ask police for a PF3 medical form.', 'Stay away from the attacker. If you are in danger call 999 or 112.'], keep: ['Photograph injuries and torn clothing.', 'Keep any weapon or item left behind untouched.', 'Note names of witnesses.'] },
  cyber: { now: ['Call your mobile network or bank now and ask them to block the transaction or account.', 'Change your PIN and passwords. Do not send any more money.', 'Do not reply to the scammer.'], keep: ['Screenshot messages, numbers and profiles.', 'Save the transaction ID, amount, time and the receiving number.'] },
  theft: { now: ['If a phone was stolen, ask your network to block the SIM and report the IMEI.', 'Change passwords on accounts that were on the device.'], keep: ['List the items with serial numbers, IMEI or receipts.', 'Keep photos of the items if you have them.'] },
  burglary: { now: ['Do not enter or touch anything if the intruders may still be inside. Call 999 or 112.', 'Once it is safe, check for injured people.'], keep: ['Leave the scene as it is so officers can look for fingerprints.', 'List what is missing and its value.'] },
  kidnap: { now: ['Call 999 or 112 immediately.', 'Keep every message and call record from the kidnappers. Do not delete them.', 'Do not pay or negotiate without police advice.'], keep: ['Have a recent photo and description of the missing person ready.', 'Write down the last time and place they were seen.'] },
  domestic: { now: ['Get to a safe place. If you are in danger call 999 or 112.', 'Get medical care for any injury and ask for a PF3 form.', 'Police can help you apply for a protection order.'], keep: ['Photograph injuries and damage.', 'Keep threatening messages.'] },
  corruption: { now: ['Do not pay. Write down the official\u2019s name or number, the place, the time and what was asked.'], keep: ['Save messages, call logs and any receipts.', 'You can also make a written complaint to the most senior police officer in the district or to the Inspector General (Police Act, s.70).'] },
};
const GENERIC = { now: ['Stay safe. If anyone is in danger call 999 or 112.', 'Write down everything you remember while it is fresh: who, what, where, when.'], keep: ['Keep any messages, photos, receipts or other evidence.', 'Do not confront the suspect.'] };
const NEXT_STEPS = ['Your report was received and sent to the police station for your area.', 'An officer reviews it. Urgent cases are flagged and pop up on officers\u2019 screens straight away.', 'Police may contact you by SMS or ask questions on your Track page. Answer there with your reference and PIN.', 'The status on your Track page changes as the case moves forward.'];
function advice(result, category) {
  const ids = result.incidents.map(i => i.id), now = [], keep = [];
  for (const id of ids) { const g = GUIDE[id]; if (g) { g.now.forEach(x => now.includes(x) || now.push(x)); g.keep.forEach(x => keep.includes(x) || keep.push(x)); } }
  if (!now.length) { now.push(...GENERIC.now); keep.push(...GENERIC.keep); }
  return { now: now.slice(0, 7), keep: keep.slice(0, 6), police: result.incidents.flatMap(i => i.first).slice(0, 4), next: NEXT_STEPS, laws: result.laws.slice(0, 2).map(l => ({ source: l.source, ref: l.ref, text: l.text.slice(0, 220) })) };
}

let LAWS = null;
function laws() {
  if (!LAWS) { try { LAWS = JSON.parse(fs.readFileSync(LAWS_FILE, 'utf8')); } catch { LAWS = SEED; } }
  return LAWS;
}
function reload() { LAWS = null; return laws().length; }

const STOP = new Set('the a an and or of to in on at for with by is are was were be been it this that from as he she they them his her their there then who what when which have has had not no but if so we i you my our your me us'.split(' '));
const tok = s => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.length > 5 ? w.slice(0, 5) : w);   // crude stemming: defiled/defilement -> defil

// BM25 over law chunks
function retrieve(query, k = 4) {
  const docs = laws(), q = [...new Set(tok(query))]; if (!q.length) return [];
  const toks = docs.map(d => tok(d.source + ' ' + d.text).concat(tok(d.ref), tok(d.ref), tok(d.ref)));   // section title counts 3x
  const avg = toks.reduce((a, t) => a + t.length, 0) / (docs.length || 1);
  const df = {}; toks.forEach(t => new Set(t).forEach(w => df[w] = (df[w] || 0) + 1));
  const scored = docs.map((d, i) => {
    const tf = {}; toks[i].forEach(w => tf[w] = (tf[w] || 0) + 1);
    let s = 0;
    for (const w of q) if (tf[w]) { const idf = Math.log(1 + (docs.length - df[w] + .5) / (df[w] + .5)); s += idf * (tf[w] * 2.2) / (tf[w] + 1.2 * (.25 + .75 * toks[i].length / avg)); }
    return { ...d, score: +s.toFixed(3) };
  }).filter(x => x.score > 0.5).sort((a, b) => b.score - a.score);
  const seen = new Set(), out = [];
  for (const x of scored) { const key = x.source + '|' + x.ref.replace('(cont.) ', ''); if (seen.has(key)) continue; seen.add(key); out.push(x); }
  return out.slice(0, k);
}

// Main entry: category + free text (typed description and/or audio transcript)
function analyse(text, category) {
  const t = (text + ' ' + category).toLowerCase();
  const incidents = PROFILES.filter(p => p.words.some(w => t.includes(w)));
  const hits = retrieve(text + ' ' + category + ' ' + incidents.map(i => i.label + ' ' + (PROFILES.find(p => p.id === i.id).q || '')).join(' '));
  const out = {
    incidents: incidents.map(i => ({ id: i.id, label: i.label, emergency: i.emergency, ask: i.ask, first: i.first })),
    emergency: incidents.some(i => i.emergency),
    laws: hits.map(h => ({ source: h.source, ref: h.ref, text: h.text.slice(0, 300), score: h.score })),
  };
  out.advice = advice(out, category); return out;
}

// Optional: if ANTHROPIC_API_KEY is set, Claude writes a 3-line police summary grounded ONLY in the retrieved passages.
async function summarise(text, result) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key || !result.laws.length) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 300,
        messages: [{ role: 'user', content: 'You assist Uganda Police. In at most 3 short lines, say which of these law passages the report may relate to and why. Use only the passages. Say "not enough information" if unsure.\n\nREPORT:\n' + text.slice(0, 3000) + '\n\nPASSAGES:\n' + result.laws.map(l => `- ${l.source} ${l.ref}: ${l.text}`).join('\n') }] }),
    });
    const j = await r.json(); return (j.content || []).map(c => c.text || '').join('').trim() || null;
  } catch { return null; }
}
module.exports = { advice, analyse, retrieve, summarise, reload, SEED, LAWS_FILE };
