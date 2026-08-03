/**
 * Per-class, per-level story content for the Campaign.
 *
 * Each of the 3 classes has a distinct narrative layered on top of the same
 * 15 mechanical levels. `before` lines play before the fight; `after` lines
 * play only on a win. Both are shown only on first clear — retries skip
 * straight to combat.
 *
 * Adding a new level: add an entry to STORY[classId][levelNumber].
 * Adding a new class: add a new key to STORY and ZONE_META.
 */

export type ClassId = 'berserker' | 'sentinel' | 'phantom';

export interface StoryLine {
  speaker?: string;      // omit for narrator lines
  text: string;
  speakerColor?: string;
  effect?: 'shake' | 'fade' | 'flash';
}

export interface LevelStory {
  before: StoryLine[];
  after?: StoryLine[];
}

export interface ZoneMeta {
  number: 1 | 2 | 3;
  name: string;
  tagline: string; // class-specific flavour shown on zone intro card
}

// Speaker colour per enemy class
const C = {
  berserker: '#ff4422',
  sentinel:  '#4488ff',
  phantom:   '#aa44ff',
} as const;

// Helpers — keep the data readable
const n = (text: string): StoryLine => ({ text });
const s = (speaker: string, color: string, text: string): StoryLine =>
  ({ speaker, speakerColor: color, text });

// ─── Zone metadata ────────────────────────────────────────────────────────────

export const ZONE_META: Record<ClassId, Record<1 | 2 | 3, ZoneMeta>> = {
  sentinel: {
    1: { number: 1, name: 'Ashfall',         tagline: 'The fire started here. So does the reckoning.' },
    2: { number: 2, name: 'Proving Ground',  tagline: 'Word spreads. The crew is ready this time.' },
    3: { number: 3, name: 'The Rift',        tagline: 'One name left. One door left to knock on.' },
  },
  berserker: {
    1: { number: 1, name: 'Ashfall',         tagline: 'Where you first ran. Where it all starts again.' },
    2: { number: 2, name: 'Proving Ground',  tagline: 'They sent their best after you failed to stay down.' },
    3: { number: 3, name: 'The Rift',        tagline: 'The inner circle. No one makes it this far and walks back out.' },
  },
  phantom: {
    1: { number: 1, name: 'Ashfall',         tagline: 'Where you went quiet. The trail starts here.' },
    2: { number: 2, name: 'Proving Ground',  tagline: 'Internal security closes in. They know you\'re alive.' },
    3: { number: 3, name: 'The Rift',        tagline: 'The truth is up here. So is the only one who knows all of it.' },
  },
};

// ─── Story content ────────────────────────────────────────────────────────────

export const STORY: Record<ClassId, Record<number, LevelStory>> = {

  // ══════════════════════════════════════════════════════════════════════════
  // SENTINEL — Revenge
  // ══════════════════════════════════════════════════════════════════════════
  sentinel: {

    // Zone 1 · Ashfall — the night it happened
    1: {
      before: [
        n("You don't remember how long you stood in the ashes after they left. You remember every face."),
        n("This one was posted outside that night. He didn't pull the trigger — he just watched the door."),
        s('GUARD', C.sentinel, "Just doing what I was told. Same as always."),
      ],
      after: [
        n("He talked, eventually. A route. A name that keeps coming up: Hollow."),
        s('GUARD', C.sentinel, "Hollow's crew doesn't lose people. Not them. You'll see."),
      ],
    },
    2: {
      before: [
        n("The scout. The one who found the house before anyone else did. Found it, and told them."),
        s('SCOUT', C.phantom, "I just look. I don't decide who gets found."),
      ],
      after: [
        n("He knew exactly which window had no lock. He'd been there before, days before the fire."),
      ],
    },
    3: {
      before: [
        n("After it happened, this one made sure nobody on the street talked. Threats. Broken windows. It worked, for a while."),
        s('ENFORCER', C.berserker, "Whole block knew to keep quiet. That was the job."),
      ],
      after: [
        n("No remorse in him. Just annoyance that the silence didn't hold."),
      ],
    },
    4: {
      before: [
        n("The same scout — better armed now, sent back to finish what the silence couldn't."),
        s('TRACKER', C.phantom, "They told me you'd come back around. Didn't think you'd make it this far."),
      ],
      after: [
        n("One name left before the fire itself: the one who carried the match."),
      ],
    },
    5: {
      before: [
        n("Cinder. The name they use like a title. He doesn't deny what he did — he's almost proud of it."),
        s('CINDER', C.berserker, "You want to know what it looked like? I'll show you. Right before I put you in the ground next to them."),
      ],
      after: [
        n("He goes down still talking."),
        s('CINDER', C.berserker, "Hollow gave the order... I just struck the match. You're still aiming at the wrong man."),
      ],
    },

    // Zone 2 · Proving Ground — the crew knows it's being hunted
    6: {
      before: [
        n("Word travels fast in a crew like this. Somebody's cutting through their ranks, and Cinder isn't answering calls anymore."),
        s('QUARTERMASTER', C.sentinel, "You think killing soldiers gets you closer? Hollow's never even met half of us."),
      ],
      after: [
        n("Maybe not. But every soldier down is one less between you and the truth."),
      ],
    },
    7: {
      before: [
        n("Young. Eager. The kind who volunteers to be the one who finally stops you, because his name will mean something after."),
        s('BRUISER', C.berserker, "They said you were tough. I say you're just lucky."),
      ],
      after: [
        n("He's not lucky. He's not tough either, not anymore."),
      ],
    },
    8: {
      before: [
        n("Not crew — a contractor. Brought in because the crew's own people keep losing, and Hollow doesn't like losing twice."),
        s('HUNTER', C.phantom, "Strictly business. Don't take it personal."),
      ],
      after: [
        n("It is personal. It always was."),
      ],
    },
    9: {
      before: [
        n("This is the one who decided your family \"knew too much.\" Decided it, and walked away."),
        s('HANDLER', C.sentinel, "Somebody has to make the calls nobody wants to make. That was me. I'd make it again."),
      ],
      after: [
        n("He doesn't apologize. You didn't come for one."),
      ],
    },
    10: {
      before: [
        n("Warden doesn't run the crew. Warden makes sure nobody gets close enough to the one who does."),
        s('WARDEN', C.sentinel, "Every fire this crew ever needed putting out, I put out. You're just one more."),
      ],
      after: [
        s('WARDEN', C.sentinel, "...Hollow's going to want to know how you got this far. So will I — if I'm still breathing to ask."),
        n("He isn't."),
      ],
    },

    // Zone 3 · The Rift — closing in on leadership
    11: {
      before: [
        n("Hollow's shadow. The one who watches from rooftops so Hollow never has to look over their own shoulder."),
        s('GHOST', C.phantom, "I've had you in my sights for three levels. I was waiting to see if you'd earn this."),
      ],
      after: [
        n("You did."),
      ],
    },
    12: {
      before: [
        n("Groomed to take the crew over one day. Whatever happens here, that day isn't coming."),
        s('HEIR', C.berserker, "You think this ends with me? Someone else just takes the chair. That's how Hollow built it."),
      ],
      after: [
        n("Built to survive anyone falling. Not built to survive you."),
      ],
    },
    13: {
      before: [
        n("The fixer. Keeps the records — who gave which order, when. The proof you've been chasing without knowing it."),
        s('FIXER', C.sentinel, "Burn me down and the truth burns with me. That's the whole point of my job."),
      ],
      after: [
        n("The records survive. He didn't expect that to matter to you more than the gun did."),
      ],
    },
    14: {
      before: [
        n("The last one standing between you and Hollow. Loyal in a way that isn't about money anymore."),
        s('LOYALIST', C.phantom, "You'll get your fight. But you'll go through everything I am to get it."),
      ],
      after: [
        s('LOYALIST', C.phantom, "Tell them upstairs... it wasn't enough."),
        n("He says it like he already knew it wouldn't be."),
      ],
    },
    15: {
      before: [
        n("No guards left. No excuses left. Just the name that's been chasing you since the night the house burned — finally standing in front of you."),
        s('STILLHUNT', C.berserker, "You found me. Good. Now you hear it from me instead of the men I sent to die in my place: I gave the order. I'd give it again."),
      ],
      after: [
        n("The fire's out. The name doesn't feel like a weight anymore — just a name."),
        n("You didn't come back for forgiveness. You came back to make sure that order was the last one Hollow ever gave."),
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BERSERKER — Refusal
  // ══════════════════════════════════════════════════════════════════════════
  berserker: {

    // Zone 1 · Ashfall — escaping the first retrieval attempts
    1: {
      before: [
        n("They've had eyes on this block for weeks. You knew they would."),
        n("This one's just a watcher — reports back, nothing more. Doesn't matter. He's still one of theirs."),
        s('GUARD', C.sentinel, "You really thought you could just... walk away? From all of us?"),
      ],
      after: [
        n("He ran his mouth the whole time. Didn't change how it ended."),
        s('GUARD', C.sentinel, "They're gonna send someone better than me. You know that, right?"),
      ],
    },
    2: {
      before: [
        n("A tracker. Quiet, careful — good enough that you almost didn't notice him."),
        s('TRACKER', C.phantom, "Just confirming you're still breathing. Command wants to know before they decide what's next."),
      ],
      after: [
        n("He'll report back. Let them decide. You're not waiting around to find out."),
      ],
    },
    3: {
      before: [
        n("Someone you used to trust. Sent not to fight — sent to talk."),
        s('ALLY', C.berserker, "Come on. You know how this ends if you don't come back. Don't make them send someone who isn't me."),
      ],
      after: [
        n("He meant it as a kindness. It still felt like a leash."),
        s('ALLY', C.berserker, "You're making a mistake. They don't forget. They don't let go."),
      ],
    },
    4: {
      before: [
        n("Same tracker. No more quiet conversation — just orders, and a gun to back them up."),
        s('TRACKER', C.phantom, "Guess talking didn't work. Fine by me."),
      ],
      after: [
        n("Talking was never going to work. You told them that the first time."),
      ],
    },
    5: {
      before: [
        n("Cinder doesn't do warnings. Cinder gets sent when the crew wants the problem gone, permanently."),
        s('CINDER', C.berserker, "No one walks. That's not a rule, that's just how it is. You should've learned that the easy way."),
      ],
      after: [
        n("He's still moving when he hits the ground, still trying to finish the sentence."),
        s('CINDER', C.berserker, "There's no 'out.' There's only how far you get before they drag you back."),
        n("You're about to find out how far that really is."),
      ],
    },

    // Zone 2 · Proving Ground — the crew gets serious
    6: {
      before: [
        n("Word's spread that Cinder didn't make it back. This one runs discipline — makes examples of anyone who thinks about leaving."),
        s('ENFORCER', C.sentinel, "You're not the first to try. You won't be remembered as anything different either."),
      ],
      after: [
        n("You don't feel like an example. You feel like the first crack in something they thought was solid."),
      ],
    },
    7: {
      before: [
        n("Younger. Hungrier. Been waiting years for a shot at your old spot in the crew."),
        s('RIVAL', C.berserker, "They keep saying you're untouchable. I don't believe in untouchable."),
      ],
      after: [
        n("Neither do you. That's the whole point."),
      ],
    },
    8: {
      before: [
        n("Not crew — paid. The crew's own people keep losing, so now they're throwing money at the problem."),
        s('CONTRACTOR', C.phantom, "Don't make this weird. I don't care about your reasons. I care about getting paid."),
      ],
      after: [
        n("At least he was honest about it. More than the crew ever was with you."),
      ],
    },
    9: {
      before: [
        n("Runs the \"loyalty audits\" — makes sure nobody else in the crew gets ideas watching you win."),
        s('AUDITOR', C.sentinel, "Every fight you win, somebody back home starts wondering if they could do the same. Can't have that."),
      ],
      after: [
        n("Good. Let them wonder. Let them ask the question the crew never wanted asked."),
      ],
    },
    10: {
      before: [
        n("Warden's the one who actually holds the crew together. Hollow gives the orders; Warden makes sure they stick."),
        s('WARDEN', C.sentinel, "You think this is about you leaving? It's never been about you. It's about what happens if they let you."),
      ],
      after: [
        s('WARDEN', C.sentinel, "...Hollow's gonna have to deal with this personally now. Hope you're ready for that."),
        n("You've been ready since the day you walked."),
      ],
    },

    // Zone 3 · The Rift — the founder's inner circle
    11: {
      before: [
        n("Hollow's personal shadow — the one who makes sure nothing ever gets close enough to matter."),
        s('GHOST', C.phantom, "Funny, watching you fight your way up here. Almost looks like something Hollow would've trained, once."),
      ],
      after: [
        n("Maybe it does. Doesn't mean it still belongs to them."),
      ],
    },
    12: {
      before: [
        n("Your old mentor. The one who actually taught you to fight like this."),
        s('MENTOR', C.berserker, "I made you. Everything you're using against me, I gave you. Doesn't that count for something?"),
      ],
      after: [
        n("It counts for exactly nothing, the moment it's used to drag someone back in a cage."),
      ],
    },
    13: {
      before: [
        n("The one who'll take over if Hollow falls — already measuring the chair for size."),
        s('HEIR', C.sentinel, "Even if you get past me, past Hollow — somebody just takes the seat. The crew doesn't end. It just changes hands."),
      ],
      after: [
        n("Maybe. But it ends for you, today. That's the only part that matters right now."),
      ],
    },
    14: {
      before: [
        n("The last one between you and Hollow. Not paid, not ordered — just loyal, in a way that's almost hard to hate."),
        s('LOYALIST', C.phantom, "You'll get your fight. But you go through everything I believe in to get it."),
      ],
      after: [
        s('LOYALIST', C.phantom, "Tell Hollow... I held as long as I could."),
        n("He says it like loyalty was ever going to be enough."),
      ],
    },
    15: {
      before: [
        n("No one left to send. Just the founder, the one who built the rule that nobody walks — the one you once would've died for."),
        s('STILLHUNT', C.berserker, "You used to believe in this. In me. What changed?"),
        s('BERSERKER', '#ffffff', "I left. That's what changed."),
      ],
      after: [
        n("The rule dies here, whether Hollow does or not. No one else gets dragged back for wanting out."),
        n("You didn't come here for revenge. You came here to make sure the door stays open behind you."),
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PHANTOM — Exposure
  // ══════════════════════════════════════════════════════════════════════════
  phantom: {

    // Zone 1 · Ashfall — going quiet, the crew sweeping for the leak
    1: {
      before: [
        n("You've been quiet for months. Apparently not quiet enough."),
        n("This one's just watching a door that doesn't matter anymore. Still, doors that don't matter have a way of leading to ones that do."),
        s('GUARD', C.sentinel, "Didn't expect anyone to still be looking this way. Guess I was wrong."),
      ],
      after: [
        n("He wasn't looking for you specifically. He just happened to be standing where the trail started."),
      ],
    },
    2: {
      before: [
        n("A rival broker. Someone who does what you used to do, hired to find what you used to know."),
        s('BROKER', C.phantom, "Word is there's a price on whatever you're sitting on. I intend to collect it."),
      ],
      after: [
        n("She won't be the last one looking. The price tends to attract company."),
      ],
    },
    3: {
      before: [
        n("Not subtle. Just here to make sure nobody keeps hiding you, one broken door at a time."),
        s('MUSCLE', C.berserker, "Whoever's helping you, they'll stop. People always stop, eventually."),
      ],
      after: [
        n("Eventually isn't today."),
      ],
    },
    4: {
      before: [
        n("The broker again — this time with backup, because the first attempt told her you're worth taking seriously."),
        s('BROKER', C.phantom, "No hard feelings. This is just what the job looks like now."),
      ],
      after: [
        n("The job just got more expensive. That tends to happen, the closer you get to the truth."),
      ],
    },
    5: {
      before: [
        n("Cinder isn't here to negotiate. Hired for exactly one outcome: you disappear, quietly, permanently."),
        s('CINDER', C.berserker, "Quiet would've been easier for both of us. You picked the hard way."),
      ],
      after: [
        n("He came for quiet. He's leaving with neither quiet nor a job finished."),
        s('CINDER', C.berserker, "This isn't over. They'll send someone smarter next time."),
        n("They will. You're counting on it."),
      ],
    },

    // Zone 2 · Proving Ground — internal security hunts the leak
    6: {
      before: [
        n("Internal security, going back through every name you've ever talked to. Methodical. Patient."),
        s('AUDITOR', C.sentinel, "You left a longer trail than you think. We're cleaning it up, one name at a time."),
      ],
      after: [
        n("Cleaning it up means he just confirmed which names still matter. Thanks for narrowing the list."),
      ],
    },
    7: {
      before: [
        n("Not here for you directly — here to make sure one of your old contacts stays quiet."),
        s('MUSCLE', C.berserker, "Funny seeing you here. Guess you still care what happens to people who used to know you."),
      ],
      after: [
        n("Caring was never the weakness they thought it was."),
      ],
    },
    8: {
      before: [
        n("Another broker, bought outright this time. The crew finally figured out the right currency."),
        s('CONTRACTOR', C.phantom, "No grudge here. Just better paid than you ever were."),
      ],
      after: [
        n("Better paid doesn't mean better informed. That's the part they keep getting wrong."),
      ],
    },
    9: {
      before: [
        n("Finally, someone with the skill to actually be a threat — sharp, exactly as careful as you used to be."),
        s('INTEL', C.sentinel, "I've read every report you ever filed. I know how you think. That's the part you should be worried about."),
      ],
      after: [
        n("Knowing how someone thinks and out-thinking them aren't the same job."),
      ],
    },
    10: {
      before: [
        n("Head of security. Responsible for burying every leak before it reaches daylight."),
        s('WARDEN', C.sentinel, "You're not the first ghost to come back asking questions. You'll be buried like all the others."),
      ],
      after: [
        s('WARDEN', C.sentinel, "...whatever you think you know, it dies with this conversation."),
        n("It doesn't. It just got a lot more interesting."),
      ],
    },

    // Zone 3 · The Rift — closing in on the truth itself
    11: {
      before: [
        n("Hollow's courier — the one who carries the real paperwork, not the version everyone else gets shown."),
        s('COURIER', C.phantom, "Everything you're chasing is in this case. Funny thing to die protecting, isn't it?"),
      ],
      after: [
        n("Not funny at all. It's the only thing in this entire crew that was ever actually true."),
      ],
    },
    12: {
      before: [
        n("Sent specifically to burn what the courier was carrying before it reaches anyone who'd believe it."),
        s('DESTROYER', C.berserker, "Paper doesn't matter once it's ash. You're chasing smoke."),
      ],
      after: [
        n("You read it before it burned. Smoke doesn't matter once you already know what it said."),
      ],
    },
    13: {
      before: [
        n("The last living person who could confirm the truth out loud — which is exactly why they got here before you did."),
        s('WITNESS', C.sentinel, "They got to me first. Whatever I could've told you, I can't anymore."),
      ],
      after: [
        n("He can't talk. Doesn't mean the truth stopped being true."),
      ],
    },
    14: {
      before: [
        n("Hollow's closest confidant — the only one who knows precisely what you're about to make public."),
        s('CONFIDANT', C.phantom, "You really think anyone believes a ghost? You have no name. No proof they'll trust."),
      ],
      after: [
        s('CONFIDANT', C.phantom, "It doesn't matter what you publish. No one trusts a name nobody's heard of."),
        n("They'll trust it when they hear it from Hollow's own mouth instead."),
      ],
    },
    15: {
      before: [
        n("Just Hollow now. No couriers, no confidants, no one left to burn the paper trail for them."),
        s('STILLHUNT', C.berserker, "You've spent this whole chase proving a truth nobody asked for. Was it worth it?"),
        s('PHANTOM', '#aa44ff', "You're about to find out. On the record, this time."),
      ],
      after: [
        n("The truth doesn't need you to win this fight to matter — it just needed someone willing to ask the question out loud."),
        n("Hollow's name stops meaning what it used to. That was always the actual target."),
      ],
    },
  },
};

/** Returns the zone number (1–3) for a given campaign level. */
export function zoneFor(level: number): 1 | 2 | 3 {
  if (level <= 5)  return 1;
  if (level <= 10) return 2;
  return 3;
}

/** True if this level is the first level in its zone (zone transition). */
export function isZoneOpener(level: number): boolean {
  return level === 1 || level === 6 || level === 11;
}
