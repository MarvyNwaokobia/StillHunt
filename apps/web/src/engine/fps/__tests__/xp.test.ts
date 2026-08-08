import { describe, it, expect } from 'vitest';
import {
  xpForKill, rankForXp, rankIndexForXp, xpIntoRank, xpBarSize, rankUpsBetween,
  gReward, careerXpFor, XP_REWARD, RANK_STEP_XP, PRESTIGE_STEP_XP, xpForNextRank,
} from '../xp';

// Career XP at which each rank is reached, walked down the progressive curve.
// These MUST equal cumulative_xp_for_rank() in apps/api battles.rs.
const AT = {
  Drifter: 0,
  Tracker: 400,
  Stalker: 1_300,
  Marksman: 2_600,
  Ranger: 5_100,
  Ghost: 9_600,
  Apex: 17_600,
} as const;

describe('earn loop: XP per kill', () => {
  it('a body kill is worth the base, a headshot kill more', () => {
    expect(xpForKill('torso')).toBe(XP_REWARD.KILL);
    expect(xpForKill('leg')).toBe(XP_REWARD.KILL);
    expect(xpForKill('arm')).toBe(XP_REWARD.KILL);
    expect(xpForKill('head')).toBe(XP_REWARD.KILL + XP_REWARD.HEADSHOT_BONUS);
    expect(xpForKill('head')).toBeGreaterThan(xpForKill('torso'));
  });

  it('the kills in a level sum to the level XP', () => {
    const kills: Array<Parameters<typeof xpForKill>[0]> = ['torso', 'head', 'leg', 'torso', 'head'];
    const total = kills.reduce((sum, p) => sum + xpForKill(p), 0);
    expect(total).toBe(3 * XP_REWARD.KILL + 2 * (XP_REWARD.KILL + XP_REWARD.HEADSHOT_BONUS));
  });
});

describe('the ladder is progressive', () => {
  it('each rank costs strictly more than the one below it', () => {
    const steps = [
      RANK_STEP_XP.Tracker, RANK_STEP_XP.Stalker, RANK_STEP_XP.Marksman,
      RANK_STEP_XP.Ranger, RANK_STEP_XP.Ghost, RANK_STEP_XP.Apex,
    ];
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it('the client curve matches the server cumulative thresholds', () => {
    // Drift here is the bug that silently withholds rank-up money, so pin it.
    expect(careerXpFor('Tracker', 0)).toBe(AT.Tracker);
    expect(careerXpFor('Stalker', 0)).toBe(AT.Stalker);
    expect(careerXpFor('Marksman', 0)).toBe(AT.Marksman);
    expect(careerXpFor('Ranger', 0)).toBe(AT.Ranger);
    expect(careerXpFor('Ghost', 0)).toBe(AT.Ghost);
    expect(careerXpFor('Apex', 0)).toBe(AT.Apex);
  });

  it('sizes the bar by the rank you are currently filling', () => {
    expect(xpForNextRank('Drifter')).toBe(RANK_STEP_XP.Tracker);
    expect(xpForNextRank('Marksman')).toBe(RANK_STEP_XP.Ranger);
    expect(xpForNextRank('Ghost')).toBe(RANK_STEP_XP.Apex);
    // At the top the bar becomes the prestige step, not a dead full bar.
    expect(xpForNextRank('Apex')).toBe(PRESTIGE_STEP_XP);
  });
});

describe('earn loop: rank from XP', () => {
  it('starts at Drifter and climbs the curve', () => {
    expect(rankForXp(0)).toBe('Drifter');
    expect(rankForXp(AT.Tracker - 1)).toBe('Drifter');
    expect(rankForXp(AT.Tracker)).toBe('Tracker');
    expect(rankForXp(AT.Stalker)).toBe('Stalker');
    expect(rankForXp(AT.Marksman)).toBe('Marksman');
    expect(rankForXp(AT.Ranger)).toBe('Ranger');
    expect(rankForXp(AT.Ghost)).toBe('Ghost');
    expect(rankForXp(AT.Apex)).toBe('Apex');
  });

  it('one full campaign clear lands Marksman, the calibration anchor', () => {
    // 15 ops at their kill caps, body shots only.
    const FULL_CAMPAIGN_XP = 2_610;
    expect(rankForXp(FULL_CAMPAIGN_XP)).toBe('Marksman');
  });

  it('caps at the top rank instead of overflowing', () => {
    expect(rankForXp(999_999)).toBe('Apex');
    expect(rankIndexForXp(999_999)).toBe(6);
  });

  it('reports progress into the current rank', () => {
    expect(xpIntoRank(0)).toBe(0);
    expect(xpIntoRank(340)).toBe(340);                       // 340 into Drifter's 400 bar
    expect(xpIntoRank(AT.Tracker + 120)).toBe(120);           // 120 into Tracker's 900 bar
    expect(xpIntoRank(AT.Ghost + 4_499)).toBe(4_499);
  });

  it('keeps counting past Apex instead of pinning the bar full', () => {
    // The old flat ladder read a maxed player as permanently full, which is what hid
    // the Apex XP-delete bug. Progress past Apex now cycles the prestige bar.
    expect(xpIntoRank(AT.Apex)).toBe(0);
    expect(xpIntoRank(AT.Apex + 250)).toBe(250);
    expect(xpIntoRank(AT.Apex + PRESTIGE_STEP_XP)).toBe(0);
    expect(xpIntoRank(AT.Apex + PRESTIGE_STEP_XP + 7)).toBe(7);
    expect(xpBarSize(AT.Apex + 250)).toBe(PRESTIGE_STEP_XP);
  });

  it('names every rank crossed, including several at once', () => {
    expect(rankUpsBetween(AT.Tracker - 20, AT.Tracker + 5)).toEqual(['Tracker']);
    expect(rankUpsBetween(0, AT.Tracker - 1)).toEqual([]);
    // A full campaign dropped on a fresh player crosses three ranks at once.
    expect(rankUpsBetween(0, 2_610)).toEqual(['Tracker', 'Stalker', 'Marksman']);
  });

  // Flat, and it must STAY flat: this number is rendered in the fight HUD's rank-up
  // banner, so anything the server does not settle is a promise made mid-reward.
  // The authority is RANK_UP_REWARD_G in apps/api handlers/battles.rs.
  it('pays a flat TALLY reward at every rank', () => {
    expect(gReward('Tracker')).toBe(200);
    expect(gReward('Stalker')).toBe(200);
    expect(gReward('Apex')).toBe(200);
    expect(gReward('Apex')).toBe(gReward('Tracker'));
  });
});

describe('seeding the HUD from the server account', () => {
  it('careerXpFor round-trips back to the account rank + progress', () => {
    for (const [rank, into] of [
      ['Drifter', 0], ['Drifter', 399], ['Tracker', 750], ['Stalker', 120], ['Ranger', 999],
      ['Ghost', 4_499], ['Apex', 500],
    ] as const) {
      const seed = careerXpFor(rank, into);
      expect(rankForXp(seed)).toBe(rank);
      expect(xpIntoRank(seed)).toBe(into);
    }
  });

  it('is robust to junk input', () => {
    expect(careerXpFor('Drifter', -50)).toBe(0);
    // Progress beyond the rank's own bar clamps into the band rather than leaking
    // the player into a rank the server never granted them.
    expect(careerXpFor('Drifter', 99_999)).toBe(AT.Tracker);
    expect(careerXpFor('Apex', 300)).toBe(AT.Apex + 300);
  });
});
