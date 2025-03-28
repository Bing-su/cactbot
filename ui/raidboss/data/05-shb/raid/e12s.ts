import Conditions from '../../../../../resources/conditions';
import { UnreachableCode } from '../../../../../resources/not_reached';
import Outputs from '../../../../../resources/outputs';
import { callOverlayHandler } from '../../../../../resources/overlay_plugin_api';
import { Responses } from '../../../../../resources/responses';
import ZoneId from '../../../../../resources/zone_id';
import { RaidbossData } from '../../../../../types/data';
import { NetMatches } from '../../../../../types/net_matches';
import { PartyMemberParamObject } from '../../../../../types/party';
import { LocaleText, Output, TriggerSet } from '../../../../../types/trigger';

export interface Data extends RaidbossData {
  isDoorBoss?: boolean;
  decOffset?: number;

  tethers?: string[];
  stockedTethers?: string[];
  castCount?: number;
  junctionSuffix?: string;
  junctionCount?: number;
  formlessTargets?: string[];
  weightTargets?: string[];
  seenFirstBombs?: boolean;
  statueStacks: string[];
  statueTetherNumber?: number;
  statueIds?: number[];
  statueDir?: string;
  statueLaserCount?: number;
  smallLions?: NetMatches['AddedCombatant'][];

  phase?: 'basic' | 'intermediate' | 'advanced' | 'terminal';
  // Used across various stacks.
  waterStacks: string[];
  seenInitialSpread?: boolean;
  seenInitialStacks?: boolean;
  basicDebuffs: NetMatches['GainsEffect'][];
  myBasicDebuff?: 'eye' | 'shortIce' | 'longIce' | 'shortFire' | 'longFire' | 'water';
  basicEyes: string[];
  intermediateDebuffs: { [name: string]: number };
  intermediateDebuffsOutputKeys: string[];
  safeZone?: string;
  advancedDebuffs: NetMatches['GainsEffect'][];
  sorrows?: { [name: string]: number };
}

// TODO: double apoc clockwise vs counterclockwise call would be nice
// TODO: stack partners
// TODO: shadow eye people on blu need mit

// Each tether ID corresponds to a primal:
// 008C -- Shiva
// 008D -- Titan
// 008E -- Leviathan
// 008F -- Ifrit
// 0090 -- Ramuh
// 0091 -- Garuda
// We can collect + store these for later use on Stock/Release.
const shivaTetherId = '008C';
const titanTetherId = '008D';
const tetherIds = ['008E', '008F', '0090', '0091'];

const getTetherString = (tethers: string[] | undefined, output: Output) => {
  // All tethers in E12S are double tethers, plus an optional junction (not in the tether list).
  const sorted = tethers?.sort();

  const [first, second] = sorted ?? [];
  if (first === undefined || second === undefined)
    return;

  const comboStr = first + second;
  if (comboStr in primalOutputStrings)
    return output[comboStr]!();

  return output.combined!({
    safespot1: output[first]!(),
    safespot2: output[second]!(),
  });
};

// TODO: also on the pre-statue cast, call south for any levi mechanics, west for any ifrit.
const primalOutputStrings = {
  // Tethers.
  '008E': Outputs.middle,
  '008F': Outputs.sides,
  '0090': Outputs.out,
  '0091': {
    en: 'Intercards',
    de: 'Interkardinale Himmelsrichtungen',
    fr: 'Intercardinal',
    ja: '斜め',
    cn: '四角',
    ko: '대각',
  },
  // Tether combos.
  '008E008F': {
    en: 'Under + Sides',
    de: 'Runter + Seiten',
    fr: 'En dessous + côtés',
    ja: '真ん中 + 横へ',
    cn: '正中间两侧',
    ko: '보스 안쪽 + 양옆',
  },
  '008E0090': {
    en: 'North/South + Out',
    de: 'Norden/Süden + Raus',
    fr: 'Nord/Sud + Extérieur',
    ja: '北/南 + 外へ',
    cn: '上/下远离',
    ko: '남/북 + 바깥',
  },
  '008E0091': {
    en: 'Under + Intercards',
    de: 'Runter + Interkardinale Himmerlsrichtungen',
    fr: 'En dessous + Intercardinal',
    ja: '真ん中 + 斜め',
    cn: '正中间四角',
    ko: '보스 안쪽 + 대각',
  },
  // Text output.
  'combined': {
    en: '${safespot1} + ${safespot2}',
    de: '${safespot1} + ${safespot2}',
    fr: '${safespot1} + ${safespot2}',
    ja: '${safespot1} + ${safespot2}',
    cn: '${safespot1} + ${safespot2}',
    ko: '${safespot1} + ${safespot2}',
  },
  'stock': {
    en: 'Stock: ${text}',
    de: 'Sammeln: ${text}',
    fr: 'Stocker : ${text}',
    ja: 'ストック: ${text}',
    cn: '暂存: ${text}',
    ko: '저장: ${text}',
  },
  'junctionSuffix': {
    en: '${text} (${junction})',
    de: '${text} (${junction})',
    fr: '${text} (${junction})',
    ja: '${text} (${junction})',
    cn: '${text} (${junction})',
    ko: '${text} (${junction})',
  },
  // Junctions.
  'spread': {
    // Shiva spread.
    en: 'spread',
    de: 'verteilen',
    fr: 'dispersez-vous',
    ja: '散開',
    cn: '散开',
    ko: '산개',
  },
  'stacks': {
    // Titan healer stacks.
    en: 'stacks',
    de: 'sammeln',
    fr: 'packez-vous',
    ja: 'ヒラ頭割り',
    cn: '双奶分组分摊',
    ko: '그룹 쉐어',
  },
  'stack': {
    // Obliterate whole group laser stack.
    // This is deliberately "stack" singular (vs Titan "stacks").
    en: 'group stack',
    de: 'In Gruppen sammeln',
    fr: 'package en groupe',
    ja: '全体頭割り',
    cn: '全体分摊',
    ko: '쉐어',
  },
};

// Due to changes introduced in patch 5.2, overhead markers now have a random offset
// added to their ID. This offset currently appears to be set per instance, so
// we can determine what it is from the first overhead marker we see.
// The first 1B marker in the encounter is the formless tankbuster, ID 004F.
const firstHeadmarker = parseInt('00DA', 16);
const getHeadmarkerId = (data: Data, matches: NetMatches['HeadMarker']) => {
  // If we naively just check !data.decOffset and leave it, it breaks if the first marker is 00DA.
  // (This makes the offset 0, and !0 is true.)
  if (typeof data.decOffset === 'undefined')
    data.decOffset = parseInt(matches.id, 16) - firstHeadmarker;
  // The leading zeroes are stripped when converting back to string, so we re-add them here.
  // Fortunately, we don't have to worry about whether or not this is robust,
  // since we know all the IDs that will be present in the encounter.
  return (parseInt(matches.id, 16) - data.decOffset).toString(16).toUpperCase().padStart(4, '0');
};

// These keys map effect ids to `intermediateRelativityOutputStrings` keys.
const effectIdToOutputStringKey: { [effectId: string]: string } = {
  '690': 'flare',
  '996': 'stack',
  '998': 'shadoweye',
  '99C': 'eruption',
  '99E': 'blizzard',
  '99F': 'aero',
};

// These are currently used for both the informative x > y > z callout,
// but also the individual alerts.  These are kept short and snappy.
const intermediateRelativityOutputStringsRaw = {
  flare: {
    en: 'Flare',
    de: 'Flare',
    fr: 'Brasier',
    ja: 'フレア',
    cn: '核爆',
    ko: '플레어',
  },
  stack: {
    en: 'Stack',
    de: 'Sammeln',
    fr: 'Packez-vous',
    ja: '頭割り',
    cn: '分摊',
    ko: '쉐어',
  },
  shadoweye: {
    en: 'Gaze',
    de: 'Blick',
    fr: 'Regard',
    ja: 'シャドウアイ',
    cn: '暗黑眼',
    ko: '마안',
  },
  eruption: Outputs.spread,
  blizzard: {
    en: 'Ice',
    de: 'Eis',
    fr: 'Glace',
    ja: 'ブリザガ',
    cn: '冰环',
    ko: '블리자가',
  },
  aero: {
    en: 'Aero',
    de: 'Wind',
    fr: 'Vent',
    ja: 'エアロガ',
    cn: '风击退',
    ko: '에어로가',
  },
};
type InterStrings = { [id in keyof typeof intermediateRelativityOutputStringsRaw]: LocaleText };
const intermediateRelativityOutputStrings: InterStrings = intermediateRelativityOutputStringsRaw;

// Returns integer value of x, y in matches based on cardinal or intercardinal
const matchedPositionToDir = (matches: NetMatches['AddedCombatant']) => {
  // Positions are moved downward 75
  const y = parseFloat(matches.y) + 75;
  const x = parseFloat(matches.x);

  // In Basic Relativity, hourglass positions are the 8 cardinals + numerical
  // slop on a radius=20 circle.
  // N = (0, -95), E = (20, -75), S = (0, -55), W = (-20, -75)
  // NE = (14, -89), SE = (14, -61), SW = (-14, -61), NW = (-14, -89)
  //
  // In Advanced Relativity, hourglass positions are the 3 northern positions and
  // three southern positions, plus numerical slop on a radius=10 circle
  // NW = (-10, -80), N = (0, -86), NE = (10, -80)
  // SW = (-10, -69), S = (0, -64), SE = (10, -69)
  //
  // Starting with northwest to favor sorting between north and south for
  // Advanced Relativity party splits.
  // Map NW = 0, N = 1, ..., W = 7

  return Math.round(5 - 4 * Math.atan2(x, y) / Math.PI) % 8;
};

// Convert dir to Output
const dirToOutput = (dir: number, output: Output) => {
  const dirs: { [dir: number]: string } = {
    0: output.northwest!(),
    1: output.north!(),
    2: output.northeast!(),
    3: output.east!(),
    4: output.southeast!(),
    5: output.south!(),
    6: output.southwest!(),
    7: output.west!(),
  };
  return dirs[dir];
};

const triggerSet: TriggerSet<Data> = {
  id: 'EdensPromiseEternitySavage',
  zoneId: ZoneId.EdensPromiseEternitySavage,
  timelineFile: 'e12s.txt',
  initData: () => {
    return {
      statueStacks: [],
      waterStacks: [],
      basicDebuffs: [],
      basicEyes: [],
      intermediateDebuffs: {},
      intermediateDebuffsOutputKeys: [],
      advancedDebuffs: [],
    };
  },
  triggers: [
    {
      // Headmarkers are randomized, so use a generic headMarker regex with no criteria.
      id: 'E12S Promise Formless Judgment You',
      type: 'HeadMarker',
      netRegex: {},
      condition: (data) => data.isDoorBoss,
      response: (data, matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          formlessBusterAndSwap: {
            en: 'Tank Buster + Swap',
            de: 'Tankbuster + Wechsel',
            fr: 'Tank buster + Swap',
            ja: 'タンクバスター + スイッチ',
            cn: '死刑 + 换T',
            ko: '탱버 + 교대',
          },
          formlessBusterBLU: {
            en: 'Buster on YOU (w/${player})',
            de: 'Tankbuster auf DIR (mit ${player})',
            fr: 'Tankbuster sur VOUS (avec ${player})',
            cn: '死刑点名 (与${player})',
            ko: '탱버 대상자 (+${player})',
          },
          formlessBusterOnYOU: Outputs.tankBusterOnYou,
        };

        const id = getHeadmarkerId(data, matches);

        // Track tankbuster targets, regardless if this is on you or not.
        // Use this to make more intelligent calls when the cast starts.
        if (id !== '00DA')
          return;

        data.formlessTargets ??= [];
        data.formlessTargets.push(matches.target);

        // From here on out, any response is for the current player.
        if (data.formlessTargets.length !== 2)
          return;
        if (!data.formlessTargets.includes(data.me))
          return;

        // Formless double tankbuster mechanic.
        if (data.role === 'tank')
          return { alertText: output.formlessBusterAndSwap!() };

        // BLU tends to avail here, so call out your friend.
        if (data.job === 'BLU') {
          const [otherPlayer] = data.formlessTargets.filter((x) => x !== data.me);
          return {
            alertText: output.formlessBusterBLU!({ player: data.party.member(otherPlayer) }),
          };
        }

        // Not that you personally can do anything about it, but maybe this
        // is your cue to yell on voice comms for cover.
        return { alarmText: output.formlessBusterOnYOU!() };
      },
    },
    {
      // Headmarkers are randomized, so use a generic headMarker regex with no criteria.
      id: 'E12S Promise Junction Titan Bombs',
      type: 'HeadMarker',
      netRegex: {},
      condition: (data) => data.isDoorBoss,
      response: (data, matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          // The first round has only one blue.
          titanBlueSingular: {
            en: 'Blue Weight',
            de: 'Blau - Gewicht',
            fr: 'Poids bleu',
            ja: '青、重圧',
            cn: '蓝色重压',
            ko: '파랑',
          },
          // The second and two rounds of bombs have a partner.
          // The third is technically fixed by role with a standard party (one dps, one !dps),
          // but call out your partner anyway in case you've got 8 blus or something.
          titanBlueWithPartner: {
            en: 'Blue (with ${player})',
            de: 'Blau (mit ${player})',
            fr: 'Bleu (avec ${player})',
            ja: '青、重圧 (${player}と)',
            cn: '蓝色重压 (与${player})',
            ko: '파랑 (다른 대상자: ${player})',
          },
          titanOrangeStack: {
            en: 'Orange Stack',
            de: 'Orange - versammeln',
            fr: 'Orange, packez-vous',
            ja: '橙、頭割り',
            cn: '橙色分摊',
            ko: '주황: 집합',
          },
          titanYellowSpread: {
            en: 'Yellow Spread',
            de: 'Gelb - Verteilen',
            fr: 'Jaune, dispersez-vous',
            ja: '黄、散開',
            cn: '黄色散开',
            ko: '노랑: 산개',
          },
        };

        const id = getHeadmarkerId(data, matches);

        if (id === '00BB') {
          data.weightTargets ??= [];
          data.weightTargets.push(matches.target);

          // Handle double blue titan on 2nd and 3rd iterations.
          if (data.seenFirstBombs && data.weightTargets.length === 2) {
            if (data.weightTargets.includes(data.me)) {
              const partner = data.weightTargets[data.weightTargets[0] === data.me ? 1 : 0];
              return {
                alarmText: output.titanBlueWithPartner!({ player: data.party.member(partner) }),
              };
            }
          }
        }

        // From here on out, any response is for the current player.
        if (matches.target !== data.me)
          return;

        // Titan Mechanics (double blue handled above)
        if (id === '00BB' && !data.seenFirstBombs)
          return { alarmText: output.titanBlueSingular!() };
        if (id === '00B9')
          return { alertText: output.titanYellowSpread!() };
        if (id === '00BA')
          return { infoText: output.titanOrangeStack!() };
      },
    },
    {
      id: 'E12S Promise Classical Sculpture',
      type: 'HeadMarker',
      netRegex: {},
      condition: (data, matches) => {
        if (!data.isDoorBoss)
          return false;
        if (getHeadmarkerId(data, matches) !== '003E')
          return false;
        data.statueStacks.push(matches.target);
        return data.statueStacks.length === 2;
      },
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          stackOnYou: {
            en: 'Stack on YOU (w/${player})',
            de: 'Auf DIR sammeln (mit ${player})',
            fr: 'Package sur VOUS (avec ${player})',
            cn: '分摊点名 (与${player})',
            ko: '쉐어 대상자 (+${player})',
          },
          stacks: {
            en: 'Stacks: ${players}',
            de: 'Sammeln: ${players}',
            fr: 'Package: ${players}',
            cn: '分摊: ${players}',
            ko: '쉐어: ${players}',
          },
        };

        if (!data.statueStacks.includes(data.me)) {
          const players = data.statueStacks.sort().map((x) => data.party.member(x));
          return { infoText: output.stacks!({ players: players }) };
        }

        const [otherPlayer] = data.statueStacks.filter((x) => x !== data.me);
        return { alertText: output.stackOnYou!({ player: data.party.member(otherPlayer) }) };
      },
    },
    {
      // Headmarkers are randomized, so use a generic headMarker regex with no criteria.
      id: 'E12S Promise Chiseled Sculpture',
      type: 'HeadMarker',
      netRegex: {},
      condition: (data, matches) => data.isDoorBoss && matches.target === data.me,
      run: (data, matches) => {
        const id = getHeadmarkerId(data, matches);

        // Statue laser mechanic.
        const firstLaserMarker = '0091';
        const lastLaserMarker = '0098';
        if (id >= firstLaserMarker && id <= lastLaserMarker) {
          // ids are sequential: #1 square, #2 square, #3 square, #4 square, #1 triangle etc
          const decOffset = parseInt(id, 16) - parseInt(firstLaserMarker, 16);
          data.statueTetherNumber = decOffset % 4 + 1;
        }
      },
    },
    {
      id: 'E12S Promise Chiseled Sculpture Collector',
      type: 'AddedCombatant',
      netRegex: { npcNameId: '9818' },
      run: (data, matches) => {
        // Collect both sculptures up front, so when we find the tether on the
        // current player we can look up both of them immediately.
        data.statueIds ??= [];
        data.statueIds.push(parseInt(matches.id, 16));
      },
    },
    {
      id: 'E12S Promise Chiseled Sculpture Tether',
      type: 'Tether',
      // This always directly follows the 1B: headmarker line.
      netRegex: { target: 'Chiseled Sculpture', id: '0011' },
      condition: (data, matches) => matches.source === data.me,
      durationSeconds: (data) => {
        // Handle laser #1 differently to not collide with the rapturous reach.
        if (data.statueTetherNumber === 0)
          return 3.5;
        if (data.statueTetherNumber)
          return data.statueTetherNumber * 3 + 4.5;
        return 8;
      },
      promise: async (data, matches) => {
        // Set an initial value here, just in case anything errors.
        data.statueDir = 'unknown';

        // Calculate distance to center to determine inner vs outer
        const statueData = await callOverlayHandler({
          call: 'getCombatants',
          ids: data.statueIds,
        });

        if (statueData === null) {
          console.error(`sculpture: null statueData`);
          return;
        }
        if (statueData.combatants.length !== 2) {
          console.error(`sculpture: unexpected length: ${JSON.stringify(statueData)}`);
          return;
        }

        // Mark up statue objects with their distance to the center and
        // convert their decimal id to an 8 character hex id.
        type AnnotatedStatue = {
          dist: number;
          hexId: string;
        };
        const statues: AnnotatedStatue[] = [];
        for (const statue of statueData.combatants) {
          const centerX = 0;
          const centerY = -75;
          const x = statue.PosX - centerX;
          const y = statue.PosY - centerY;
          statues.push({
            dist: Math.hypot(x, y),
            hexId: `00000000${statue.ID?.toString(16) ?? ''}`.slice(-8).toUpperCase(),
          });
        }

        // Sort so that closest statue (inner) is first
        statues.sort((a, b) => a.dist - b.dist);

        if (statues[0]?.hexId === matches.targetId)
          data.statueDir = 'inner';
        else if (statues[1]?.hexId === matches.targetId)
          data.statueDir = 'outer';
        else
          console.error(`sculpture: missing ${matches.targetId}, ${JSON.stringify(statues)}`);
      },
      infoText: (data, _matches, output) => {
        const numMap: { [num: number]: string } = {
          1: output.laser1!(),
          2: output.laser2!(),
          3: output.laser3!(),
          4: output.laser4!(),
        };
        const numStr = numMap[data.statueTetherNumber ?? -1];

        if (numStr === undefined) {
          console.error(`sculpture: invalid tether number: ${data.statueTetherNumber ?? '???'}`);
          return;
        }
        if (data.statueDir === undefined) {
          console.error(`sculpture: missing statueDir`);
          return;
        }

        return output[data.statueDir]!({ num: numStr });
      },
      outputStrings: {
        laser1: Outputs.num1,
        laser2: Outputs.num2,
        laser3: Outputs.num3,
        laser4: Outputs.num4,
        inner: {
          en: '#${num} (Inner)',
          de: '#${num} (innen)',
          fr: '#${num} (Intérieur)',
          ja: '#${num} (中)',
          cn: '#${num} (内)',
          ko: '#${num} (안쪽)',
        },
        outer: {
          en: '#${num} (Outer)',
          de: '#${num} (außen)',
          fr: '#${num} (Extérieur)',
          ja: '#${num} (外)',
          cn: '#${num} (外)',
          ko: '#${num} (바깥쪽)',
        },
        unknown: {
          en: '#${num} (???)',
          de: '#${num} (???)',
          fr: '#${num} (???)',
          ja: '#${num} (???)',
          cn: '#${num} (???)',
          ko: '#${num} (???)',
        },
      },
    },
    {
      id: 'E12S Promise Palm Of Temperance SE',
      type: 'StartsUsing',
      netRegex: { source: 'Guardian Of Eden', id: '58B4', capture: false },
      durationSeconds: 10,
      infoText: (_data, _matches, output) => output.knockback!(),
      outputStrings: {
        knockback: {
          en: 'SE Knockback',
          de: 'SO Rückstoß',
          fr: 'SE Poussée',
          ja: '東南ノックバック',
          cn: '右下击退',
          ko: '남동쪽(5시)에서 넉백',
        },
      },
    },
    {
      id: 'E12S Promise Palm Of Temperance SW',
      type: 'StartsUsing',
      netRegex: { source: 'Guardian Of Eden', id: '58B5', capture: false },
      durationSeconds: 10,
      infoText: (_data, _matches, output) => output.knockback!(),
      outputStrings: {
        knockback: {
          en: 'SW Knockback',
          de: 'SW Rückstoß',
          fr: 'SO Poussée',
          ja: '西南ノックバック',
          cn: '左下击退',
          ko: '남서쪽(7시)에서 넉백',
        },
      },
    },
    {
      id: 'E12S Promise Statue 2nd/3rd/4th Laser',
      type: 'Ability',
      netRegex: { source: 'Chiseled Sculpture', id: '58B3', capture: false },
      condition: (data) => !data.statueLaserCount || data.statueLaserCount < 4,
      durationSeconds: 3,
      suppressSeconds: 1,
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          laser1: Outputs.num1,
          laser2: Outputs.num2,
          laser3: Outputs.num3,
          laser4: Outputs.num4,
          baitInner: {
            en: 'Bait Inner #${num}',
            de: 'Köder innen #${num}',
            fr: 'Orientez vers l\'intérieur #${num}',
            ja: '中へ誘導 #${num}',
            cn: '诱导激光 #${num} (内)',
            ko: '내부 유도 #${num}',
          },
          baitOuter: {
            en: 'Bait Outer #${num}',
            de: 'Köder außen #${num}',
            fr: 'Orientez vers l\'extérieur #${num}',
            ja: '外へ誘導 #${num}',
            cn: '诱导激光 #${num} (外)',
            ko: '외부 유도 #${num}',
          },
          baitUnknown: {
            en: 'Bait #${num}',
            de: 'Köder #${num}',
            fr: 'Orientez #${num}',
            ja: '誘導 #${num}',
            cn: '诱导激光 #${num}',
            ko: '유도 #${num}',
          },
        };
        // Start one ahead, so that it calls out #2 after #1 has finished.
        data.statueLaserCount = (data.statueLaserCount ?? 1) + 1;

        const numMap: { [num: number]: string } = {
          1: output.laser1!(),
          2: output.laser2!(),
          3: output.laser3!(),
          4: output.laser4!(),
        };
        const numStr = numMap[data.statueLaserCount];

        // The lasers are VERY noisy and flashy, so don't print anything when not you.
        // This also helps prevent confusion with the knockback direction trigger.
        if (data.statueLaserCount !== data.statueTetherNumber)
          return;

        if (data.statueDir === 'inner')
          return { alertText: output.baitInner!({ num: numStr }) };
        else if (data.statueDir === 'outer')
          return { alertText: output.baitOuter!({ num: numStr }) };
        return { alertText: output.baitUnknown!({ num: numStr }) };
      },
      run: (data) => {
        if (data.statueLaserCount && data.statueLaserCount >= 4) {
          // Prevent future rapturous reach calls from thinking this is during lasers.
          delete data.statueTetherNumber;
          delete data.statueDir;
        }
      },
    },
    {
      id: 'E12S Promise Weight Cleanup',
      type: 'StartsUsing',
      netRegex: { source: 'Eden\'s Promise', id: '58A5', capture: false },
      run: (data) => {
        delete data.weightTargets;
        data.seenFirstBombs = true;
      },
    },
    {
      id: 'E12S Promise Formless Judgment',
      type: 'StartsUsing',
      netRegex: { source: 'Eden\'s Promise', id: '58A9', capture: false },
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          formlessBusterAndSwap: {
            en: 'Tank Buster + Swap',
            de: 'Tankbuster + Wechsel',
            fr: 'Tank buster + Swap',
            ja: 'タンクバスター + スイッチ',
            cn: '坦克死刑 + 换T',
            ko: '탱버 + 교대',
          },
          tankBusters: Outputs.tankBusters,
        };

        // Already called out in the headmarker trigger.
        if (data.formlessTargets && data.formlessTargets.includes(data.me))
          return;

        // TODO: should this call out who to cover if you are a paladin?
        if (data.role === 'tank')
          return { alertText: output.formlessBusterAndSwap!() };

        if (data.role === 'healer')
          return { alertText: output.tankBusters!() };

        // Be less noisy if this is just for feint.
        return { infoText: output.tankBusters!() };
      },
      run: (data) => delete data.formlessTargets,
    },
    {
      id: 'E12S Promise Rapturous Reach Left',
      type: 'StartsUsing',
      netRegex: { source: 'Eden\'s Promise', id: '58AD', capture: false },
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          goLeft: Outputs.left,
          goLeftBaitInner: {
            en: 'Left + Bait Inner #1',
            de: 'Links + Köder innen #1',
            fr: 'À gauche + Orientez vers l\'intérieur #1',
            ja: '左 + 中へ誘導 #1',
            cn: '左 + 诱导激光 #1 (内)',
            ko: '왼쪽 + 내부 유도 #1',
          },
          goLeftBaitOuter: {
            en: 'Left + Bait Outer #1',
            de: 'Links + Köder außen #1',
            fr: 'À gauche + Orientez vers l\'extérieur #1',
            ja: '左 + 外へ誘導 #1',
            cn: '左 + 诱导激光 #1 (外)',
            ko: '왼쪽 + 외부 유도 #1',
          },
          goLeftBaitUnknown: {
            en: 'Left + Bait #1',
            de: 'Links + Köder #1',
            fr: 'À gauche + Orientez #1',
            ja: '左 + 誘導 #1',
            cn: '左 + 诱导激光 #1',
            ko: '왼쪽 + 유도 #1',
          },
        };

        if (data.statueTetherNumber !== 1)
          return { infoText: output.goLeft!() };

        if (data.statueDir === 'inner')
          return { alarmText: output.goLeftBaitInner!() };
        else if (data.statueDir === 'outer')
          return { alarmText: output.goLeftBaitOuter!() };
        return { alarmText: output.goLeftBaitUnknown!() };
      },
      run: (data) => data.isDoorBoss = true,
    },
    {
      id: 'E12S Promise Rapturous Reach Right',
      type: 'StartsUsing',
      netRegex: { source: 'Eden\'s Promise', id: '58AE', capture: false },
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          goRight: Outputs.right,
          goRightBaitInner: {
            en: 'Right + Bait Inner #1',
            de: 'Rechts + Köder innen #1',
            fr: 'À droite + Orientez vers l\'intérieur #1',
            ja: '右 + 中へ誘導 #1',
            cn: '右 + 诱导激光 #1 (内)',
            ko: '오른쪽 + 내부 유도 #1',
          },
          goRightBaitOuter: {
            en: 'Right + Bait Outer #1',
            de: 'Rechts + Köder außen #1',
            fr: 'À droite + Orientez vers l\'extérieur #1',
            ja: '右 + 外へ誘導 #1',
            cn: '右 + 诱导激光 #1 (外)',
            ko: '오른쪽 + 외부 유도 #1',
          },
          goRightBaitUnknown: {
            en: 'Right + Bait #1',
            de: 'Rechts + Köder #1',
            fr: 'À droite + Orientez #1',
            ja: '右 + 誘導 #1',
            cn: '右 + 诱导激光 #1',
            ko: '오른쪽 + 유도 #1',
          },
        };

        if (data.statueTetherNumber !== 1)
          return { infoText: output.goRight!() };

        if (data.statueDir === 'inner')
          return { alarmText: output.goRightBaitInner!() };
        else if (data.statueDir === 'outer')
          return { alarmText: output.goRightBaitOuter!() };
        return { alarmText: output.goRightBaitUnknown!() };
      },
      run: (data) => data.isDoorBoss = true,
    },
    {
      id: 'E12S Promise Maleficium',
      type: 'StartsUsing',
      netRegex: { source: 'Eden\'s Promise', id: '58A8', capture: false },
      response: Responses.aoe(),
    },
    {
      id: 'E12S Promise Junction Shiva',
      type: 'Tether',
      netRegex: { id: shivaTetherId, capture: false },
      // Call out what the mechanic will be so that folks have time to move.
      preRun: (data) => {
        data.junctionSuffix = 'spread';
        data.junctionCount = (data.junctionCount ?? 0) + 1;
      },
      // Add in a slight delay for this big aoe so that trigger is < 10 seconds ahead.
      // Any further than 10 seconds and it's easy to miss reprisal or addle.
      delaySeconds: (data) => data.junctionCount === 2 ? 4 : 0,
      // For the junction with cast, keep the spread up for longer as a reminder.
      durationSeconds: (data) => data.junctionCount === 2 ? 4 : 13,
      alertText: (data, _matches, output) => {
        // The 2nd and 3rd junctions are different mechanics.
        if (data.junctionCount === 2)
          return output.diamondDust!();
        return output.junctionWithCast!();
      },
      outputStrings: {
        junctionWithCast: Outputs.spread,
        diamondDust: {
          en: 'Big AOE, Get Middle',
          de: 'Große AoE, geh in die Mitte',
          fr: 'Grosse AoE, allez au milieu',
          ja: '大ダメージ、中へ',
          cn: '超大伤害，去中间',
          ko: '아픈 광뎀, 중앙으로',
        },
      },
    },
    {
      id: 'E12S Promise Junction Titan',
      type: 'Tether',
      netRegex: { id: titanTetherId, capture: false },
      preRun: (data) => {
        data.junctionSuffix = 'stacks';
        data.junctionCount = (data.junctionCount ?? 0) + 1;
      },
      // Add in a slight delay for this big aoe so that trigger is < 10 seconds ahead.
      // Any further than 10 seconds and it's easy to miss reprisal or addle.
      // Note: Junction Titan is not the same distance away from the aoe as Junction Shiva.
      delaySeconds: (data) => data.junctionCount === 3 ? 5 : 0,
      // For the junction with cast, keep the stack up for longer as a reminder.
      durationSeconds: (data) => data.junctionCount === 3 ? 4 : 13,
      alertText: (data, _matches, output) => {
        // The 2nd and 3rd junctions are different mechanics.
        if (data.junctionCount === 3)
          return output.earthenFury!();
        return output.junctionWithCast!();
      },
      outputStrings: {
        junctionWithCast: Outputs.healerGroups,
        earthenFury: {
          en: 'Big AOE, Bombs Soon',
          de: 'Große AoE, bald Bomben',
          fr: 'Grosse AoE, Bombes bientôt',
          ja: '大ダメージ、まもなく岩落とし',
          cn: '超大伤害，即将落石',
          ko: '아픈 광뎀, 폭탄 떨어짐',
        },
      },
    },
    {
      id: 'E12S Promise Tether Collect',
      type: 'Tether',
      netRegex: { id: tetherIds },
      run: (data, matches) => {
        data.tethers ??= [];
        data.tethers.push(matches.id);
      },
    },
    {
      id: 'E12S Promise Stock',
      type: 'StartsUsing',
      netRegex: { source: 'Eden\'s Promise', id: '5892', capture: false },
      infoText: (data, _matches, output) => {
        data.stockedTethers = data.tethers;
        delete data.tethers;

        const text = getTetherString(data.stockedTethers, output);
        if (text === undefined)
          return;
        return output.stock!({ text: text });
      },
      outputStrings: primalOutputStrings,
    },
    {
      id: 'E12S Promise Cast Release',
      type: 'StartsUsing',
      netRegex: { source: 'Eden\'s Promise', id: ['4E43', '5893'] },
      preRun: (data) => data.castCount = (data.castCount ?? 0) + 1,
      // The pattern is cast - cast - release - release - cast - release.
      // #4 (the 2nd release) starts casting just before the second lion fire breath.
      // Delay just a smidgen so that hypothetically you don't jump off your bait spot early.
      // This is a 7 second long cast bar, so you still have 5 seconds to make it in.
      delaySeconds: (data) => data.castCount === 4 ? 1.8 : 0,
      alertText: (data, matches, output) => {
        // The second cast comes with an obliteration group laser (and no junction).
        // The entire party should stack this one.
        if (data.castCount === 2)
          data.junctionSuffix = 'stack';

        // At the end of the fight, there is a stock -> cast -> release,
        // which means that we need to grab the original tethers during the first stock.
        const isRelease = matches.id === '5893';
        const text = getTetherString(isRelease ? data.stockedTethers : data.tethers, output);
        if (text === undefined)
          return;
        if (data.junctionSuffix === undefined)
          return text;
        return output.junctionSuffix!({
          text: text,
          junction: output[data.junctionSuffix]!(),
        });
      },
      run: (data) => {
        delete data.tethers;
        delete data.junctionSuffix;
      },
      outputStrings: primalOutputStrings,
    },
    {
      id: 'E12S Promise Tether Cleanup',
      type: 'StartsUsing',
      netRegex: { id: ['4E43', '5892', '5893'], capture: false },
      delaySeconds: 10,
      run: (data) => delete data.tethers,
    },
    {
      id: 'E12S Promise Plunging Ice',
      type: 'StartsUsing',
      // This has a 9 second cast. :eyes:
      netRegex: { source: 'Eden\'s Promise', id: '589D', capture: false },
      delaySeconds: 4,
      response: Responses.knockback(),
    },
    {
      id: 'E12S Promise Small Lion Spawn',
      type: 'AddedCombatant',
      netRegex: { npcNameId: '9819' },
      run: (data, matches) => {
        data.smallLions ??= [];
        data.smallLions.push(matches);
      },
    },
    {
      id: 'E12S Promise Small Lion Tether',
      type: 'Tether',
      netRegex: { source: 'Beastly Sculpture', id: '0011' },
      condition: Conditions.targetIsYou(),
      // Don't collide with reach left/right call.
      delaySeconds: 0.5,
      durationSeconds: 7,
      response: (data, matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          lionTetherOnYou: {
            en: 'Lion Tether on YOU',
            de: 'Löwen-Verbindung auf DIR',
            fr: 'Lien lion sur VOUS',
            ja: '自分にライオン線',
            cn: '狮子连线点名',
            ko: '작은 사자 대상자',
          },
          northEastLion: {
            en: 'NE Lion Tether',
            de: 'NO Löwen-Verbindung',
            fr: 'NE Lien lion',
            cn: '右上狮子连线',
            ko: '1시 사자 연결됨',
          },
          northWestLion: {
            en: 'NW Lion Tether',
            de: 'NW Löwen-Verbindung',
            fr: 'NO Lien lion',
            cn: '左上狮子连线',
            ko: '11시 사자 연결됨',
          },
          southEastLion: {
            en: 'SE Lion Tether',
            de: 'SO Löwen-Verbindung',
            fr: 'SE Lien lion',
            cn: '右下狮子连线',
            ko: '5시 사자 연결됨',
          },
          southWestLion: {
            en: 'SW Lion Tether',
            de: 'SW Löwen-Verbindung',
            fr: 'SO Lien lion',
            cn: '左下狮子连线',
            ko: '7시 사자 연결됨',
          },
        };
        if (!data.smallLions || data.smallLions.length === 0)
          return;

        const lion = data.smallLions?.find((l) =>
          l.id.toUpperCase() === matches.sourceId.toUpperCase()
        );
        if (!lion) {
          console.error('Unable to locate a valid lion.');
          return { alertText: output.lionTetherOnYou!() };
        }
        if (!lion.x || !lion.y) {
          console.error('Invalid Lion', lion);
          return { alertText: output.lionTetherOnYou!() };
        }
        const centerY = -75;
        const x = parseFloat(lion.x);
        const y = parseFloat(lion.y);
        if (y < centerY) {
          if (x > 0)
            return { alertText: output.northEastLion!() };
          return { alertText: output.northWestLion!() };
        }
        if (x > 0)
          return { alertText: output.southEastLion!() };
        return { alertText: output.southWestLion!() };
      },
    },
    {
      id: 'E12S Promise Laser Eye',
      type: 'StartsUsing',
      // This has a 14.5 second cast. :eyes:
      netRegex: { source: 'Eden\'s Promise', id: '58B8', capture: false },
      delaySeconds: 9.5,
      response: Responses.knockback(),
    },
    {
      id: 'E12S Oracle Shockwave Pulsar',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58F0', capture: false },
      response: Responses.aoe(),
    },
    {
      id: 'E12S Relativity Phase',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58E[0-3]' },
      run: (data, matches) => {
        const phaseMap: { [id: string]: Data['phase'] } = {
          '58E0': 'basic',
          '58E1': 'intermediate',
          '58E2': 'advanced',
          '58E3': 'terminal',
        };
        data.phase = phaseMap[matches.id];
      },
    },
    {
      id: 'E12S Oracle Basic Relativity',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58E0', capture: false },
      response: Responses.bigAoe(),
    },
    {
      id: 'E12S Oracle Intermediate Relativity',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58E1', capture: false },
      response: Responses.bigAoe(),
    },
    {
      id: 'E12S Oracle Advanced Relativity',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58E2', capture: false },
      response: Responses.bigAoe(),
    },
    {
      id: 'E12S Oracle Terminal Relativity',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58E3', capture: false },
      response: Responses.bigAoe(),
    },
    {
      id: 'E12S Oracle Darkest Dance',
      type: 'StartsUsing',
      // Darkest and Somber Dance both.
      netRegex: { source: 'Oracle Of Darkness', id: ['58BE', '58BD'], capture: false },
      infoText: (data, _matches, output) => {
        if (data.role === 'tank')
          return output.tanksOutPartyIn!();
        return output.partyInTanksOut!();
      },
      outputStrings: {
        partyInTanksOut: {
          en: 'Party In (Tanks Out)',
          de: 'Gruppe Rein (Tanks Raus)',
          fr: 'Équipe à l\'intérieur (Tanks à l\'extérieur)',
          ja: 'ボスの足元へ (タンクは離れる)',
          cn: '人群靠近 (T远离引导)',
          ko: '본대 안 (탱커 밖)',
        },
        tanksOutPartyIn: {
          en: 'Tanks Out (Party In)',
          de: 'Tanks Raus (Gruppe Rein)',
          fr: 'Tanks à l\'extérieur (Équipe à l\'intérieur',
          ja: 'ボスからはなれる (パーティーが内側)',
          cn: 'T远离引导 (人群靠近)',
          ko: '탱커 밖 (본대 안)',
        },
      },
    },
    {
      id: 'E12S Oracle Somber Dance',
      type: 'Ability',
      // Call for second hit of somber dance after first hit lands.
      netRegex: { source: 'Oracle Of Darkness', id: '58BD', capture: false },
      suppressSeconds: 5,
      infoText: (data, _matches, output) => {
        if (data.role === 'tank')
          return output.tanksInPartyOut!();
        return output.partyOutTanksIn!();
      },
      outputStrings: {
        partyOutTanksIn: {
          en: 'Party Out (Tanks In)',
          de: 'Gruppe Raus (Tanks Rein)',
          fr: 'Équipe à l\'extérieur (Tanks à l\'intérieur)',
          ja: 'ボスから離れる (タンクが内側)',
          cn: '人群远离 (T靠近引导)',
          ko: '본대 밖 (탱커 안)',
        },
        tanksInPartyOut: {
          en: 'Tanks In (Party Out)',
          de: 'Gruppe Rein (Tanks Raus)',
          fr: 'Tanks à l\'intérieur (Équipe à l\'extérieur',
          ja: 'ボスに足元へ (パーティーは離れる)',
          cn: 'T靠近引导 (人群远离)',
          ko: '탱커 안 (본대 밖)',
        },
      },
    },
    {
      id: 'E12S Oracle Cataclysm',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58C2' },
      delaySeconds: 0.5,
      promise: async (data, matches, output) => {
        // select the Oracle Of Darkness with same source id
        let oracleData = null;
        oracleData = await callOverlayHandler({
          call: 'getCombatants',
          ids: [parseInt(matches.sourceId, 16)],
        });

        // if we could not retrieve combatant data, the
        // trigger will not work, so just resume promise here
        if (oracleData === null) {
          console.error(`Oracle Of Darkness: null data`);
          delete data.safeZone;
          return;
        }
        if (oracleData.combatants.length !== 1) {
          console.error(`Oracle Of Darkness: expected 1, got ${oracleData.combatants.length}`);
          delete data.safeZone;
          return;
        }

        const oracle = oracleData.combatants[0];
        if (!oracle)
          return;

        // Snap heading to closest card and add 2 for opposite direction
        // N = 0, E = 1, S = 2, W = 3
        const cardinal = (2 - Math.round(oracle.Heading * 4 / Math.PI) / 2 + 2) % 4;

        const dirs: { [dir: number]: string } = {
          0: output.north!(),
          1: output.east!(),
          2: output.south!(),
          3: output.west!(),
        };

        data.safeZone = dirs[cardinal];
      },
      infoText: (data, _matches, output) => data.safeZone ?? output.unknown!(),
      outputStrings: {
        unknown: Outputs.unknown,
        north: Outputs.north,
        east: Outputs.east,
        south: Outputs.south,
        west: Outputs.west,
      },
    },
    {
      id: 'E12S Shell Crusher',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58C3', capture: false },
      response: Responses.getTogether(),
    },
    {
      id: 'E12S Spirit Taker',
      type: 'Ability',
      // Spirit Taker always comes after Shell Crusher, so trigger on Shell Crusher damage
      // to warn people a second or two earlier than `starts using Spirit Taker` would occur.
      netRegex: { source: 'Oracle Of Darkness', id: '58C3', capture: false },
      suppressSeconds: 1,
      response: Responses.spread(),
    },
    {
      id: 'E12S Black Halo',
      type: 'StartsUsing',
      netRegex: { source: 'Oracle Of Darkness', id: '58C7' },
      response: Responses.tankBuster(),
    },
    {
      id: 'E12S Dark Water Collect',
      type: 'GainsEffect',
      netRegex: { effectId: '99D' },
      run: (data, matches) => data.waterStacks.push(matches.target),
    },
    {
      id: 'E12S Dark Water Cleanup',
      type: 'Ability',
      netRegex: { source: 'Oracle of Darkness', id: '58CA', capture: false },
      suppressSeconds: 5,
      run: (data) => data.waterStacks = [],
    },
    {
      id: 'E12S Basic Relativity Debuffs',
      type: 'GainsEffect',
      // 997 Spell-In-Waiting: Dark Fire III
      // 998 Spell-In-Waiting: Shadoweye
      // 99D Spell-In-Waiting: Dark Water III
      // 99E Spell-In-Waiting: Dark Blizzard III
      netRegex: { effectId: '99[78DE]' },
      condition: (data, matches) => {
        if (data.phase !== 'basic')
          return false;
        data.basicDebuffs.push(matches);
        return true;
      },
      delaySeconds: 0.5,
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          shadoweye: {
            en: 'Eye (w/${player})',
            de: 'Auge (mit ${player})',
            fr: 'Œil (avec ${player})',
            ja: '自分に目 (w/${player})', // FIXME
            cn: '石化眼点名 (与${player})',
            ko: '시선징 (+${player})',
          },
          water: {
            en: 'Stack (w/${player})',
            de: 'Sammeln (mit ${player})',
            fr: 'Pack (avec ${player})',
            cn: '分摊 (与${player})',
            ko: '쉐어징 (+${player})',
          },
          longFire: {
            en: 'Long Fire (w/${player})',
            de: 'langes Feuer (w/${player})',
            fr: 'Feu long (avec ${player})',
            ja: 'ファイガ(遅い) (w/${player})', // FIXME
            cn: '长火 (与${player})',
            ko: '느린 파이가 (+${player})',
          },
          shortFire: {
            en: 'Short Fire (w/${player})',
            de: 'kurzes Feuer (w/${player})',
            fr: 'Feu court (avec ${player})',
            ja: 'ファイガ(早い) (w/${player})', // FIXME
            cn: '短火 (与${player})',
            ko: '빠른 파이가 (+${player})',
          },
          longIce: {
            en: 'Long Ice (w/${player})',
            de: 'langes Eis (w/${player})',
            fr: 'Glace longue (avec ${player})',
            ja: 'ブリザガ(遅い) (w/${player})', // FIXME
            cn: '长冰 (与${player})',
            ko: '느린 블리자가 (+${player})',
          },
          shortIce: {
            en: 'Short Ice (w/${player})',
            de: 'kurzes Eis (w/${player})',
            fr: 'Glace courte (avec ${player})',
            ja: 'ブリザガ(早い) (w/${player})', // FIXME
            cn: '短冰 (与${player})',
            ko: '빠른 블리자가 (+${player})',
          },
          unknown: Outputs.unknown,
        };

        // Because this trigger is both collecting and calling, can't use suppress.
        // Use this set value to know if we've called anything out yet.
        if (data.myBasicDebuff !== undefined)
          return;

        const otherPlayer = (names: string[]): PartyMemberParamObject | string => {
          if (names.length !== 2)
            return output.unknown!();
          const [name1, name2] = names;
          if (!names.includes(data.me) || name1 === undefined || name2 === undefined)
            return output.unknown!();
          return data.party.member(name1 === data.me ? name2 : name1);
        };

        const eyes = data.basicDebuffs.filter((x) => x.effectId === '998').map((x) => x.target);
        data.basicEyes.push(...eyes);
        if (eyes.includes(data.me)) {
          data.myBasicDebuff = 'eye';
          return { infoText: output.shadoweye!({ player: otherPlayer(eyes) }) };
        }

        const waters = data.basicDebuffs.filter((x) => x.effectId === '99D').map((x) => x.target);
        if (waters.includes(data.me)) {
          data.myBasicDebuff = 'water';
          return { infoText: output.water!({ player: otherPlayer(waters) }) };
        }

        // Short fire/ice is 15 seconds, long fire/ice is 29 seconds.
        const longBuffs = data.basicDebuffs.filter((x) => parseFloat(x.duration) > 20);
        const shortBuffs = data.basicDebuffs.filter((x) => parseFloat(x.duration) < 20);

        const shortFires = shortBuffs.filter((x) => x.effectId === '997').map((x) => x.target);
        if (shortFires.includes(data.me)) {
          data.myBasicDebuff = 'shortFire';
          return { alertText: output.shortFire!({ player: otherPlayer(shortFires) }) };
        }

        const longFires = longBuffs.filter((x) => x.effectId === '997').map((x) => x.target);
        if (longFires.includes(data.me)) {
          data.myBasicDebuff = 'longFire';
          return { infoText: output.longFire!({ player: otherPlayer(longFires) }) };
        }

        const shortIces = shortBuffs.filter((x) => x.effectId === '99E').map((x) => x.target);
        if (shortIces.includes(data.me)) {
          data.myBasicDebuff = 'shortIce';
          return { alertText: output.shortIce!({ player: otherPlayer(shortIces) }) };
        }

        const longIces = longBuffs.filter((x) => x.effectId === '99E').map((x) => x.target);
        if (longIces.includes(data.me)) {
          data.myBasicDebuff = 'longIce';
          return { alertText: output.longIce!({ player: otherPlayer(longIces) }) };
        }
      },
    },
    {
      id: 'E12S Intermediate Relativity Debuff Collector',
      type: 'GainsEffect',
      // 690 Spell-In-Waiting: Flare
      // 996 Spell-In-Waiting: Unholy Darkness
      // 998 Spell-In-Waiting: Shadoweye
      // 99C Spell-In-Waiting: Dark Eruption
      // 99E Spell-In-Waiting: Dark Blizzard III
      // 99F Spell-In-Waiting: Dark Aero III
      netRegex: { effectId: ['690', '99[68CEF]'] },
      condition: (data, matches) => data.phase === 'intermediate' && matches.target === data.me,
      preRun: (data, matches) => {
        data.intermediateDebuffs[matches.effectId.toUpperCase()] = parseFloat(matches.duration);
      },
      durationSeconds: 20,
      infoText: (data, _matches, output) => {
        const unsortedIds = Object.keys(data.intermediateDebuffs);
        if (unsortedIds.length !== 3)
          return;

        // Sort effect ids descending by duration.
        const sortedIds = unsortedIds.sort((a, b) =>
          (data.intermediateDebuffs?.[b] ?? 0) - (data.intermediateDebuffs?.[a] ?? 0)
        );
        const keys = sortedIds.map((effectId) => effectIdToOutputStringKey[effectId]);

        const [key0, key1, key2] = keys;
        if (key0 === undefined || key1 === undefined || key2 === undefined)
          throw new UnreachableCode();

        // Stash outputstring keys to use later.
        data.intermediateDebuffsOutputKeys = [key1, key2];

        return output.comboText!({
          effect1: output[key0]!(),
          effect2: output[key1]!(),
          effect3: output[key2]!(),
        });
      },
      outputStrings: {
        comboText: {
          en: '${effect1} > ${effect2} > ${effect3}',
          de: '${effect1} > ${effect2} > ${effect3}',
          fr: '${effect1} > ${effect2} > ${effect3}',
          ja: '${effect1} > ${effect2} > ${effect3}',
          cn: '${effect1} > ${effect2} > ${effect3}',
          ko: '${effect1} > ${effect2} > ${effect3}',
        },
        ...intermediateRelativityOutputStrings,
      },
    },
    {
      id: 'E12S Relativity Debuffs',
      type: 'GainsEffect',
      // Players originally get `Spell-in-Waiting: Return` or `Spell-in-Waiting: Return IV`.
      // When Spell-in-Waiting Return IV wears off, players get Return IV effect.
      // When Return IV effect wears off, players get Return effect.
      // When Return effect wears off, players go back to previous locations
      //
      // Return = 994
      // Return IV = 995
      netRegex: { effectId: '99[45]' },
      condition: Conditions.targetIsYou(),
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = Object.assign({
          moveAway: {
            en: 'Move!',
            de: 'Bewegen!',
            fr: 'Bougez !',
            ja: '次へ！',
            cn: '下一步！',
            ko: '이동하기!',
          },
        }, intermediateRelativityOutputStrings);

        if (data.phase !== 'intermediate')
          return { infoText: output.moveAway!() };

        const key = data.intermediateDebuffsOutputKeys.shift();
        if (key === undefined)
          return { infoText: output.moveAway!() };
        return { alertText: output[key]!() };
      },
    },
    {
      id: 'E12S Oracle Basic Relativity Shadow Eye Other',
      type: 'GainsEffect',
      netRegex: { effectId: '998' },
      condition: (data) => data.phase === 'basic',
      delaySeconds: (_data, matches) => parseFloat(matches.duration) - 3,
      suppressSeconds: 3,
      alertText: (data, _matches, output) => {
        const [player1, player2] = data.basicEyes;
        if (player1 !== data.me && player2 !== data.me) {
          // Call out both player names if you don't have eye
          return output.lookAwayFromPlayers!({
            player1: data.party.member(player1),
            player2: data.party.member(player2),
          });
        } else if (player1 === data.me && player2 !== undefined) {
          // Call out second player name if exists and you have eye
          return output.lookAwayFromPlayer!({ player: data.party.member(player2) });
        } else if (player2 === data.me) {
          // Call out first player name if you have eye
          return output.lookAwayFromPlayer!({ player: data.party.member(player1) });
        }

        // Return empty when only you have eye
        return;
      },
      outputStrings: {
        lookAwayFromPlayers: {
          en: 'Look Away from ${player1} and ${player2}',
          de: 'Schau weg von ${player1} und ${player2}',
          fr: 'Ne regardez pas ${player1} et ${player2}',
          ja: '${player1}と${player2}を見ない',
          cn: '背对${player1}和${player2}',
          ko: '${player1}와 ${player2}에게서 뒤돌기',
        },
        lookAwayFromPlayer: Outputs.lookAwayFromPlayer,
      },
    },
    {
      // For intermediate and advanced, players should look outside during the final return effect.
      // For basic relativity, the shadoweye happens when the return puddle is dropped.
      id: 'E12S Relativity Look Outside',
      type: 'GainsEffect',
      netRegex: { effectId: '994' },
      condition: (data, matches) => data.phase !== 'basic' && matches.target === data.me,
      delaySeconds: (_data, matches) => parseFloat(matches.duration) - 2.5,
      alertText: (_data, _matches, output) => output.text!(),
      outputStrings: {
        text: {
          en: 'Look Outside',
          de: 'Nach draußen schauen',
          fr: 'Regardez vers l\'extérieur',
          ja: '外に向け',
          cn: '面向场外',
          ko: '바깥 보기',
        },
      },
    },
    {
      id: 'E12S Basic Relativity Yellow Hourglass',
      type: 'AddedCombatant',
      // Orient where "Yellow" Anger's Hourglass spawns
      netRegex: { npcNameId: '9824' },
      durationSeconds: 10,
      infoText: (_data, matches, output) => {
        return output.hourglass!({
          dir: dirToOutput(matchedPositionToDir(matches), output),
        });
      },
      outputStrings: {
        north: Outputs.north,
        northeast: Outputs.northeast,
        east: Outputs.east,
        southeast: Outputs.southeast,
        south: Outputs.south,
        southwest: Outputs.southwest,
        west: Outputs.west,
        northwest: Outputs.northwest,
        hourglass: {
          en: 'Yellow: ${dir}',
          de: 'Gelb: ${dir}',
          fr: 'Jaune : ${dir}',
          ja: '黄色: ${dir}',
          cn: '黄色: ${dir}',
          ko: '노랑: ${dir}',
        },
      },
    },
    {
      id: 'E12S Adv Relativity Hourglass Collect',
      type: 'AddedCombatant',
      // Collect Sorrow's Hourglass locations
      netRegex: { npcNameId: '9823' },
      run: (data, matches) => {
        const id = matches.id.toUpperCase();

        data.sorrows ??= {};
        data.sorrows[id] = matchedPositionToDir(matches);
      },
    },
    {
      id: 'E12S Adv Relativity Hourglass Collect Yellow Tethers',
      type: 'Tether',
      // '0086' is the Yellow tether that buffs "Quicken"
      // '0085' is the Red tether that buffs "Slow"
      netRegex: { id: '0086' },
      condition: (data) => data.phase === 'advanced',
      durationSeconds: 4,
      suppressSeconds: 3,
      infoText: (data, matches, output) => {
        const sorrow1 = data.sorrows?.[matches.sourceId.toUpperCase()];
        if (sorrow1 === undefined)
          return;

        // Calculate opposite side
        const sorrow2 = (sorrow1 + 4) % 8;

        return output.hourglass!({
          dir1: sorrow1 < sorrow2 ? dirToOutput(sorrow1, output) : dirToOutput(sorrow2, output),
          dir2: sorrow1 > sorrow2 ? dirToOutput(sorrow1, output) : dirToOutput(sorrow2, output),
        });
      },
      outputStrings: {
        north: Outputs.north,
        northeast: Outputs.northeast,
        east: Outputs.east,
        southeast: Outputs.southeast,
        south: Outputs.south,
        southwest: Outputs.southwest,
        west: Outputs.west,
        northwest: Outputs.northwest,
        hourglass: {
          en: 'Yellow: ${dir1} / ${dir2}',
          de: 'Gelb: ${dir1} / ${dir2}',
          fr: 'Jaune : ${dir1} / ${dir2}',
          ja: '黄色: ${dir1} / ${dir2}',
          cn: '黄色: ${dir1} / ${dir2}',
          ko: '노랑: ${dir1} / ${dir2}',
        },
      },
    },
    {
      id: 'E12S Initial Dark Water',
      type: 'GainsEffect',
      netRegex: { effectId: '99D', capture: false },
      condition: (data) => !data.phase,
      durationSeconds: 10,
      suppressSeconds: 5,
      alertText: (data, _matches, output) => {
        data.seenInitialStacks = true;

        if (data.waterStacks.length === 2) {
          const [player1, player2] = data.waterStacks.sort().map((x) => data.party.member(x));
          if (data.seenInitialSpread)
            return output.knockbackIntoStacksOn!({ player1: player1, player2: player2 });
          return output.stacksOn!({ player1: player1, player2: player2 });
        }

        if (data.seenInitialSpread)
          return output.knockbackIntoStackGroups!();
        return output.stackGroups!();
      },
      outputStrings: {
        stackGroups: {
          en: 'Stack Groups',
          de: 'In Gruppen sammeln',
          fr: 'Packez-vous en groupe',
          ja: '頭割り',
          cn: '分组分摊',
          ko: '쉐어',
        },
        stacksOn: {
          en: 'Stacks (${player1}, ${player2})',
          de: 'Sammeln (${player1}, ${player2})',
          fr: 'Packages (${player1}, ${player2})',
          cn: '分组分摊 (${player1}, ${player2})',
          ko: '쉐어 (${player1}, ${player2})',
        },
        knockbackIntoStackGroups: {
          en: 'Knockback Into Stack Groups',
          de: 'Rückstoß, dann in Gruppen sammeln',
          fr: 'Poussée puis packez-vous en groupe',
          ja: '頭割り位置に向かってノックバックを',
          cn: '击退 => 分摊',
          ko: '넉백 후 쉐어',
        },
        knockbackIntoStacksOn: {
          en: 'Knockback => Stacks (${player1}, ${player2})',
          de: 'Rückstoß => Sammeln (${player1}, ${player2})',
          fr: 'Poussée => Package (${player1}, ${player2})',
          cn: '击退 => 分摊 (${player1}, ${player2})',
          ko: '넉백 => 쉐어 (${player1}, ${player2})',
        },
      },
    },
    {
      id: 'E12S Initial Dark Eruption',
      type: 'GainsEffect',
      netRegex: { effectId: '99C' },
      condition: (data) => !data.phase,
      delaySeconds: (data, matches) => {
        const duration = parseFloat(matches.duration);
        return data.seenInitialSpread ? duration - 6 : duration - 8;
      },
      durationSeconds: 5,
      suppressSeconds: 5,
      alertText: (data, _matches, output) => {
        data.seenInitialSpread = true;
        if (data.seenInitialStacks)
          return output.knockbackIntoSpread!();
        return output.spread!();
      },
      outputStrings: {
        spread: Outputs.spread,
        knockbackIntoSpread: {
          en: 'Knockback Into Spread',
          de: 'Rückstoß dann verteilen',
          fr: 'Poussée puis dispersez-vous',
          ja: '散開のためノックバックを',
          cn: '击退 => 分散',
          ko: '넉백 후 산개',
        },
      },
    },
    {
      id: 'E12S Dark Water Stacks',
      type: 'GainsEffect',
      netRegex: { effectId: '99D' },
      // During Advanced Relativity, there is a very short Dark Water III stack (12s)
      // that applies when people position themselves for the initial Return placement.
      // Most strategies auto-handle this, and so this feels like noise.  HOWEVER,
      // using suppress here without this conditional will pick one of the short/long
      // Dark Water III buffs and suppress the other, so this is a load-bearing conditional.
      // Additionally, `data.phase` is checked here to avoid colliding with the special
      // case of the first dark water in `E12S Initial Dark Water`.
      condition: (data, matches) => data.phase !== undefined && parseFloat(matches.duration) > 13,
      delaySeconds: (_data, matches) => parseFloat(matches.duration) - 4,
      suppressSeconds: 5,
      alertText: (data, _matches, output) => {
        if (data.waterStacks.length === 2) {
          const [player1, player2] = data.waterStacks.sort().map((x) => data.party.member(x));
          return output.stacksOn!({ player1: player1, player2: player2 });
        }
        return output.stackGroups!();
      },
      outputStrings: {
        stackGroups: {
          en: 'Stack Groups',
          de: 'In Gruppen sammeln',
          fr: 'Packez-vous en groupe',
          ja: '集合',
          cn: '分组分摊',
          ko: '쉐어',
        },
        stacksOn: {
          en: 'Stacks (${player1}, ${player2})',
          de: 'Sammeln (${player1}, ${player2})',
          fr: 'Packages (${player1}, ${player2})',
          cn: '分组分摊 (${player1}, ${player2})',
          ko: '쉐어 (${player1}, ${player2})',
        },
      },
    },
    {
      id: 'E12S Adv Relativity Buff Collector',
      type: 'GainsEffect',
      // 997 Spell-In-Waiting: Dark Fire III
      // 998 Spell-In-Waiting: Shadoweye
      // 99F Spell-In-Waiting: Dark Aero III
      netRegex: { effectId: '99[78F]' },
      condition: (data, matches) => {
        if (data.phase !== 'advanced')
          return false;
        data.advancedDebuffs.push(matches);
        return true;
      },
      delaySeconds: 0.5,
      durationSeconds: 15,
      response: (data, _matches, output) => {
        // cactbot-builtin-response
        output.responseOutputStrings = {
          shadoweye: {
            en: 'Eye (w/${player})',
            de: 'Auge (mit ${player})',
            fr: 'Œil(avec ${player})',
            ja: '自分にシャドウアイ (w/${player})',
            cn: '暗黑眼点名 (与${player})',
            ko: '시선징 (+${player})',
          },
          doubleAero: {
            en: 'Double Aero (w/${player})',
            de: 'Doppel Windga (mit ${player})',
            fr: 'Double Vent(avec ${player})',
            ja: '自分にエアロガ×2 (w/${player})', // FIXME
            cn: '双风点名 (与${player})',
            ko: '더블 에어로가 (+${player})',
          },
          spread: {
            en: 'Spread (w/${player1}, ${player2}, ${player3})',
            de: 'Verteilen (mit ${player1}, ${player2}, ${player3})',
            fr: 'Dispersion (avec ${player1}, ${player2}, ${player3})',
            ja: '自分に散開 (w/${player1}, ${player2}, ${player3})', // FIXME
            cn: '分散点名 (与${player1}, ${player2}, ${player3})',
            ko: '산개징 (+${player1}, ${player2}, ${player3})',
          },
          unknown: Outputs.unknown,
        };

        if (data.advancedDebuffs.length === 0)
          return;

        const otherPlayer = (names: string[]): PartyMemberParamObject | string => {
          if (names.length !== 2)
            return output.unknown!();
          const [name1, name2] = names;
          if (!names.includes(data.me) || name1 === undefined || name2 === undefined)
            return output.unknown!();
          return data.party.member(name1 === data.me ? name2 : name1);
        };

        const aeros = data.advancedDebuffs.filter((x) => {
          if (x.effectId !== '99F')
            return false;
          // The shadoweye and the double aero person gets aero, so only consider the final aero.
          return parseFloat(x.duration) > 28;
        }).map((x) => x.target);
        if (aeros.includes(data.me))
          return { alarmText: output.doubleAero!({ player: otherPlayer(aeros) }) };

        const eyes = data.advancedDebuffs.filter((x) => x.effectId === '998').map((x) => x.target);
        if (eyes.includes(data.me))
          return { alertText: output.shadoweye!({ player: otherPlayer(eyes) }) };

        const spreads = data.advancedDebuffs.filter((x) => x.effectId === '997').map((x) =>
          x.target
        );
        if (spreads.includes(data.me)) {
          const otherSpreads = spreads.filter((x) => x !== data.me).sort().map((x) =>
            data.party.member(x)
          );
          const [player1, player2, player3] = otherSpreads;
          return {
            infoText: output.spread!({ player1: player1, player2: player2, player3: player3 }),
          };
        }
      },
      run: (data) => data.advancedDebuffs = [],
    },
  ],
  timelineReplace: [
    {
      'locale': 'de',
      'replaceSync': {
        'Beastly Sculpture': 'Abbild eines Löwen',
        'Bomb Boulder': 'Bomber-Brocken',
        'Chiseled Sculpture': 'Abbild eines Mannes',
        'Eden\'s Promise': 'Edens Verheißung',
        'Guardian Of Eden': 'Wächter von Eden',
        'Ice Pillar': 'Eissäule',
        'Oracle Of Darkness': 'Orakel der Dunkelheit',
        'Sorrow\'s Hourglass': 'Sanduhr der Sorge',
      },
      'replaceText': {
        'Advanced Relativity': 'Fortgeschrittene Relativität',
        '(?<! )Apocalypse': 'Apokalypse',
        'Basic Relativity': 'Grundlegende Relativität',
        'Black Halo': 'Geschwärzter Schein',
        'Blade Of Flame': 'Flammenschwert',
        'Cast': 'Auswerfen',
        'Cataclysm': 'Kataklysmus',
        'Classical Sculpture': 'Klassische Skulptur',
        'Dark Aero III': 'Dunkel-Windga',
        'Dark Current': 'Dunkel-Strom',
        'Dark Eruption': 'Dunkle Eruption',
        'Dark Fire III': 'Dunkel-Feuga',
        'Dark Water III': 'Dunkel-Aquaga',
        'Darkest Dance': 'Finsterer Tanz',
        'Diamond Dust': 'Diamantenstaub',
        'Dual Apocalypse': 'Doppelte Apokalypse',
        'Earthen Fury': 'Gaias Zorn',
        'Empty Hate': 'Gähnender Abgrund',
        'Empty Rage': 'Lockende Leere',
        'Force Of The Land': 'Gaias Tosen',
        'Formless Judgment': 'Formloses Urteil',
        'Frigid Stone': 'Eisstein',
        'Hell\'s Judgment': 'Höllenurteil',
        'Ice Floe': 'Eisfluss',
        'Ice Pillar': 'Eissäule',
        'Impact': 'Impakt',
        'Initialize Recall': 'Rückholung initialisieren',
        'Intermediate Relativity': 'Intermediäre Relativität',
        'Junction Shiva': 'Verbindung: Shiva',
        'Junction Titan': 'Verbindung: Titan',
        'Laser Eye': 'Laserauge',
        'Lionsblaze': 'Löwenfeuer',
        'Maleficium': 'Maleficium',
        'Maelstrom': 'Mahlstrom',
        'Memory\'s End': 'Ende der Erinnerungen',
        'Obliteration Laser': 'Auslöschung',
        'Palm Of Temperance': 'Hand der Mäßigung',
        'Paradise Lost': 'Verlorenes Paradies',
        'Pillar Pierce': 'Säulendurchschlag',
        'Plunging Ice': 'Fallendes Eis',
        'Pulse Of The Land': 'Gaias Beben',
        'Quicken': 'Schnell',
        'Rapturous Reach': 'Stürmischer Griff',
        'Release': 'Freilassen',
        'Return(?! IV)': 'Rückführung',
        'Return IV': 'Giga-Rückführung',
        'Shadoweye': 'Schattenauge',
        'Shell Crusher': 'Hüllenbrecher',
        'Shockwave Pulsar': 'Schockwellenpulsar',
        'Singular Apocalypse': 'Einfache Apokalypse',
        'Slow': 'Langsam',
        'Somber Dance': 'Düsterer Tanz',
        'Speed': 'Geschwindigkeit',
        'Spell-In-Waiting': 'Verzögerung',
        'Spirit Taker': 'Geistesdieb',
        'Stock': 'Sammeln',
        'Terminal Relativity': 'Terminale Relativität',
        '(?<!Junction )Titan': 'Titan',
        'Triple Apocalypse': 'Dreifache Apokalypse',
        'Under The Weight': 'Wucht der Erde',
        'Weight Of The World': 'Schwere der Erde',
      },
    },
    {
      'locale': 'fr',
      'replaceSync': {
        'Beastly Sculpture': 'création léonine',
        'Bomb Boulder': 'bombo rocher',
        'Chiseled Sculpture': 'création masculine',
        'Eden\'s Promise': 'Promesse d\'Éden',
        'Guardian Of Eden': 'Gardien d\'Éden',
        'Ice Pillar': 'Pilier de glace',
        'Oracle Of Darkness': 'prêtresse des Ténèbres',
        'Sorrow\'s Hourglass': 'sablier de chagrin',
      },
      'replaceText': {
        'Advanced Relativity': 'Relativité avancée',
        '(?<! )Apocalypse': 'Apocalypse',
        'Basic Relativity': 'Relativité basique',
        'Black Halo': 'Halo de noirceur',
        'Blade Of Flame': 'Flammes de Lumière colossales',
        'Cast': 'Lancer',
        'Cataclysm': 'Cataclysme',
        'Classical Sculpture': 'Serviteur colossal',
        'Dark Aero III': 'Méga Vent ténébreux',
        'Dark Current': 'Flux sombre',
        'Dark Eruption': 'Éruption ténébreuse',
        'Dark Fire III': 'Méga Feu ténébreux',
        'Dark Water III': 'Méga Eau ténébreuse',
        'Darkest Dance': 'Danse de la nuit profonde',
        'Diamond Dust': 'Poussière de diamant',
        'Dual Apocalypse': 'Apocalypse double',
        'Earthen Fury': 'Fureur tellurique',
        'Empty Hate': 'Vaine malice',
        'Empty Rage': 'Vaine cruauté',
        'Force Of The Land': 'Grondement tellurique',
        'Formless Judgment': 'Onde du châtiment',
        'Frigid Stone': 'Rocher de glace',
        'Hell\'s Judgment': 'Jugement dernier',
        'Ice Floe': 'Flux glacé',
        'Ice Pillar': 'Pilier de glace',
        'Impact': 'Impact',
        'Initialize Recall': 'Remembrances',
        'Intermediate Relativity': 'Relativité intermédiaire',
        'Junction Shiva': 'Associer : Shiva',
        'Junction Titan': 'Associer : Titan',
        'Laser Eye': 'Faisceau maser',
        'Lionsblaze': 'Feu léonin',
        'Maleficium': 'Maleficium',
        'Maelstrom': 'Maelström',
        'Memory\'s End': 'Mort des souvenirs',
        'Obliteration Laser': 'Oblitération',
        'Palm Of Temperance': 'Paume de tempérance',
        'Paradise Lost': 'Paradis perdu',
        'Pillar Pierce': 'Frappe puissante',
        'Plunging Ice': 'Chute de glace',
        'Pulse Of The Land': 'Vibration tellurique',
        'Quicken': 'Accélération',
        'Rapturous Reach': 'Main voluptueuse',
        'Release': 'Relâcher',
        'Return(?! IV)': 'Retour',
        'Return IV': 'Giga Retour',
        'Shadoweye': 'Œil de l\'ombre',
        'Shell Crusher': 'Broyeur de carapace',
        'Shockwave Pulsar': 'Pulsar à onde de choc',
        'Singular Apocalypse': 'Apocalypse simple',
        'Slow': 'Lenteur',
        'Somber Dance': 'Danse du crépuscule',
        'Speed': 'Vitesse',
        'Spell-In-Waiting': 'Déphasage incantatoire',
        'Spirit Taker': 'Arracheur d\'esprit',
        'Stock': 'Stocker',
        'Terminal Relativity': 'Relativité terminale',
        '(?<!Junction )Titan': 'Titan',
        'Triple Apocalypse': 'Apocalypse triple',
        'Under The Weight': 'Pression tellurique',
        'Weight Of The World': 'Poids du monde',
      },
    },
    {
      'locale': 'ja',
      'replaceSync': {
        'Beastly Sculpture': '創られた獅子',
        'Bomb Boulder': 'ボムボルダー',
        'Chiseled Sculpture': '創られた男',
        'Eden\'s Promise': 'プロミス・オブ・エデン',
        'Guardian Of Eden': 'ガーディアン・オブ・エデン',
        'Ice Pillar': '氷柱',
        'Oracle Of Darkness': '闇の巫女',
        'Sorrow\'s Hourglass': '悲しみの砂時計',
      },
      'replaceText': {
        'Advanced Relativity': '時間圧縮・急',
        '(?<! )Apocalypse': 'アポカリプス',
        'Basic Relativity': '時間圧縮・序',
        'Black Halo': 'ブラックヘイロー',
        'Blade Of Flame': '巨兵の光炎',
        'Cast': 'はなつ',
        'Cataclysm': 'カタクリスム',
        'Classical Sculpture': '巨兵創出',
        'Dark Aero III': 'ダークエアロガ',
        'Dark Current': 'ダークストリーム',
        '(?<! )Dark Eruption(?! )': 'ダークエラプション',
        'Dark Eruption / Dark Water III': 'ダークエラプション/ダークウォタガ',
        'Dark Fire III': 'ダークファイガ',
        'Dark Water III / Dark Eruption': 'ダークウォタガ/ダークエラプション',
        '(?<! )Dark Water III(?! )': 'ダークウォタガ',
        'Darkest Dance': '暗夜の舞踏技',
        'Diamond Dust': 'ダイアモンドダスト',
        'Dual Apocalypse': 'アポカリプス・ダブル',
        'Earthen Fury': '大地の怒り',
        'Empty Hate': '虚ろなる悪意',
        'Empty Rage': '虚ろなる害意',
        'Force Of The Land': '大地の轟き',
        'Formless Judgment': '天罰の波動',
        'Frigid Stone': 'アイスストーン',
        'Hell\'s Judgment': 'ヘル・ジャッジメント',
        'Ice Floe': 'アイスフロー',
        'Ice Pillar': '氷柱',
        'Impact': '衝撃',
        'Initialize Recall': '記憶想起',
        'Intermediate Relativity': '時間圧縮・破',
        'Junction Shiva': 'ジャンクション：シヴァ',
        'Junction Titan': 'ジャンクション：タイタン',
        'Laser Eye': 'メーザーアイ',
        'Lionsblaze': '獅子の業火',
        'Maleficium': 'マレフィキウム',
        'Maelstrom': 'メイルシュトローム',
        'Memory\'s End': 'エンド・オブ・メモリーズ',
        'Obliteration Laser': 'マレフィキウム レーザー',
        'Palm Of Temperance': '拒絶の手',
        'Paradise Lost': 'パラダイスロスト',
        'Pillar Pierce': '激突',
        'Plunging Ice': '落氷衝撃',
        'Pulse Of The Land': '大地の響き',
        'Quicken': 'クイック',
        'Rapturous Reach': '悦楽の手',
        'Release': 'リリース',
        'Return(?! IV)': 'リターン',
        'Return IV': 'リタンジャ',
        'Shadoweye': 'シャドウアイ',
        'Shell Crusher': 'シェルクラッシャー',
        'Shockwave Pulsar': 'ショックウェーブ・パルサー',
        'Singular Apocalypse': 'アポカリプス・シングル',
        'Slow': 'スロウ',
        'Somber Dance': '宵闇の舞踏技',
        'Speed': 'スピード',
        'Spell-In-Waiting': 'ディレイスペル',
        'Spirit Taker': 'スピリットテイカー',
        'Stock': 'ストック',
        'Terminal Relativity': '時間圧縮・終',
        '(?<!Junction )Titan': 'タイタン',
        'Triple Apocalypse': 'アポカリプス・トリプル',
        'Under The Weight': '大地の重圧',
        'Weight Of The World': '大陸の重み',
      },
    },
    {
      'locale': 'cn',
      'replaceSync': {
        'Beastly Sculpture': '被创造的狮子',
        'Bomb Boulder': '爆破岩石',
        'Chiseled Sculpture': '被创造的男性',
        'Eden\'s Promise': '伊甸之约',
        'Guardian Of Eden': '伊甸守卫',
        'Ice Pillar': '冰柱',
        'Oracle Of Darkness': '暗之巫女',
        'Sorrow\'s Hourglass': '悲伤的沙漏',
      },
      'replaceText': {
        'Advanced Relativity': '时间压缩·转',
        '(?<! )Apocalypse': '启示',
        'Basic Relativity': '时间压缩·起',
        'Black Halo': '黑色光环',
        'Blade Of Flame': '巨兵光炎',
        'Cast': '释放',
        'Cataclysm': '大灾变',
        'Classical Sculpture': '创造巨兵',
        'Dark Aero III': '黑暗暴风',
        'Dark Current': '黑暗奔流',
        '(?<! )Dark Eruption(?! )': '暗炎喷发',
        'Dark Eruption / Dark Water III': '暗炎喷发/黑暗狂水',
        'Dark Fire III': '黑暗爆炎',
        'Dark Water III / Dark Eruption': '黑暗狂水/暗炎喷发',
        '(?<! )Dark Water III(?! )': '黑暗狂水',
        'Darkest Dance': '暗夜舞蹈',
        'Diamond Dust': '钻石星尘',
        'Dual Apocalypse': '双重启示',
        'Earthen Fury': '大地之怒',
        'Empty Hate': '空无的恶意',
        'Empty Rage': '空无的恶念',
        'Force Of The Land': '大地之轰',
        'Formless Judgment': '天罚波动',
        'Frigid Stone': '冰石',
        'Hell\'s Judgment': '地狱审判',
        'Ice Floe': '浮冰',
        'Ice Pillar': '冰柱',
        'Impact': '冲击',
        'Initialize Recall': '回想记忆',
        'Intermediate Relativity': '时间压缩·承',
        'Junction Shiva': '融合：希瓦',
        'Junction Titan': '融合：泰坦',
        'Laser Eye': '激射眼',
        'Lionsblaze': '狮子业火',
        'Maleficium': '邪法',
        'Maelstrom': '巨漩涡',
        'Memory\'s End': '记忆终结',
        'Obliteration Laser': '邪法激光',
        'Palm Of Temperance': '拒绝之手',
        'Paradise Lost': '失乐园',
        'Pillar Pierce': '激突',
        'Plunging Ice': '落冰冲击',
        'Pulse Of The Land': '大地之响',
        'Quicken': '神速',
        'Rapturous Reach': '愉悦之手',
        'Release': '施放',
        'Return(?! IV)': '回返',
        'Return IV': '强回返',
        'Shadoweye': '暗影之眼',
        'Shell Crusher': '破盾一击',
        'Shockwave Pulsar': '脉冲星震波',
        'Singular Apocalypse': '单一启示',
        'Slow': '减速',
        'Somber Dance': '真夜舞蹈',
        'Speed': '限速',
        'Spell-In-Waiting': '延迟咏唱',
        'Spirit Taker': '碎灵一击',
        'Stock': '储存',
        'Terminal Relativity': '时间压缩·合',
        '(?<!Junction )Titan': '泰坦',
        'Triple Apocalypse': '三重启示',
        'Under The Weight': '大地的重压',
        'Weight Of The World': '大陆之重',
      },
    },
    {
      'locale': 'ko',
      'replaceSync': {
        'Beastly Sculpture': '창조된 사자',
        'Bomb Boulder': '바위폭탄',
        'Chiseled Sculpture': '창조된 남자',
        'Eden\'s Promise': '에덴의 약속',
        'Guardian Of Eden': '에덴의 수호자',
        'Ice Pillar': '얼음기둥',
        'Oracle Of Darkness': '어둠의 무녀',
        'Sorrow\'s Hourglass': '슬픔의 모래시계',
      },
      'replaceText': {
        'Advanced Relativity': '시간 압축: 절정',
        '(?<! )Apocalypse': '대재앙',
        'Basic Relativity': '시간 압축: 발단',
        'Black Halo': '검은 빛무리',
        'Blade Of Flame': '거병의 광염',
        'Cast': '발현',
        'Cataclysm': '대격변',
        'Classical Sculpture': '거병 창조',
        'Dark Aero III': '다크 에어로가',
        'Dark Current': '어둠의 급류',
        '(?<! )Dark Eruption(?! )': '어둠의 불기둥',
        'Dark Eruption / Dark Water III': '어둠의 불기둥 / 다크 워터가',
        'Dark Fire III': '다크 파이가',
        'Dark Water III / Dark Eruption': '다크 워터가 / 어둠의 불기둥',
        '(?<! )Dark Water III(?! )': '다크 워터가',
        'Darkest Dance': '암야의 무도기',
        'Diamond Dust': '다이아몬드 더스트',
        'Dual Apocalypse': '대재앙 둘',
        'Earthen Fury': '대지의 분노',
        'Empty Hate': '공허한 악의',
        'Empty Rage': '공허한 적의',
        'Force Of The Land': '대지의 고동',
        'Formless Judgment': '천벌 파동',
        'Frigid Stone': '얼음돌',
        'Hell\'s Judgment': '황천의 심판',
        'Ice Floe': '유빙',
        'Ice Pillar': '고드름',
        'Impact': '충격',
        'Initialize Recall': '기억 상기',
        'Intermediate Relativity': '시간 압축: 전개',
        'Junction Shiva': '접속: 시바',
        'Junction Titan': '접속: 타이탄',
        'Laser Eye': '광선안',
        'Lionsblaze': '사자의 업화',
        'Maleficium': '마녀의 사술',
        'Maelstrom': '대격동',
        'Memory\'s End': '기억의 끝',
        'Obliteration Laser': '말소 레이저',
        'Palm Of Temperance': '거절의 손',
        'Paradise Lost': '실낙원',
        'Pillar Pierce': '고드름 격돌',
        'Plunging Ice': '낙수 충격',
        'Pulse Of The Land': '대지의 울림',
        'Quicken': '가속',
        'Rapturous Reach': '열락의 손',
        'Release': '기억 방출',
        'Return(?! IV)': '리턴',
        'Return IV': '리턴쟈',
        'Shadoweye': '그림자 시선',
        'Shell Crusher': '외피 파쇄',
        'Shockwave Pulsar': '맥동 충격파',
        'Singular Apocalypse': '대재앙 하나',
        'Slow': '감속',
        'Somber Dance': '어스름 무도기',
        'Speed': '속도 조절',
        'Spell-In-Waiting': '지연술',
        'Spirit Taker': '영혼 탈취',
        'Stock': '기억 보존',
        'Terminal Relativity': '시간 압축: 결말',
        '(?<!Junction )Titan': '타이탄',
        'Triple Apocalypse': '대재앙 셋',
        'Under The Weight': '대지의 중압',
        'Weight Of The World': '대륙의 무게',
      },
    },
  ],
};

export default triggerSet;
