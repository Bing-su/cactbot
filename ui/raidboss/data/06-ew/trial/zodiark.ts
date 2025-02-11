import { Responses } from '../../../../../resources/responses';
import ZoneId from '../../../../../resources/zone_id';
import { RaidbossData } from '../../../../../types/data';
import { TriggerSet } from '../../../../../types/trigger';

// TODO: how to call out Astral Flow rotations? Behemoths can be adjacent/catty corner
// TODO: Esoteric Ray has only one id for starting mid / starting sides (maybe startsUsing pos?)
// TODO: Exoterikos has differentiating ids, but need to know where (maybe startsUsing pos?)
// TODO: Astral Eclipse star patterns? Are they fixed?
// TODO: in the last phase, is the Exoterikos always Sect during Triple Esoteric Ray?
// TODO: heal to full for Kokytos

export type Data = RaidbossData;

const triggerSet: TriggerSet<Data> = {
  id: 'TheDarkInside',
  zoneId: ZoneId.TheDarkInside,
  timelineFile: 'zodiark.txt',
  triggers: [
    {
      id: 'Zodiark Ania',
      type: 'StartsUsing',
      netRegex: { id: '6B62', source: 'Zodiark' },
      response: Responses.tankBuster(),
    },
    {
      id: 'Zodiark Algedon NE',
      type: 'StartsUsing',
      netRegex: { id: '67D1', source: 'Zodiark', capture: false },
      alertText: (_data, _matches, output) => output.text!(),
      // Warn about knockback just as a precaution in case players don't make it.
      // Also, technically NE/SW is safe, but having all players run together is better.
      outputStrings: {
        text: {
          en: 'Go NE (knockback)',
          de: 'Geh nach NO (Rückstoß)',
          fr: 'Allez au NE (poussée)',
          ja: '北東へ (ノックバック)',
          cn: '去右上',
          ko: '북동쪽으로 (넉백)',
        },
      },
    },
    {
      id: 'Zodiark Algedon NW',
      type: 'StartsUsing',
      netRegex: { id: '67D2', source: 'Zodiark', capture: false },
      alertText: (_data, _matches, output) => output.text!(),
      outputStrings: {
        text: {
          en: 'Go NW (knockback)',
          de: 'Geh nach NW (Rückstoß)',
          fr: 'Allez au NO (poussée)',
          ja: '北西へ (ノックバック)',
          cn: '去左上',
          ko: '북서쪽으로 (넉백)',
        },
      },
    },
  ],
  timelineReplace: [
    {
      'locale': 'en',
      'replaceText': {
        'Esoteric Dyad/Esoteric Sect': 'Esoteric Dyad/Sect',
      },
    },
    {
      'locale': 'de',
      'replaceSync': {
        'Arcane Sigil': 'Geheimzeichen',
        'Behemoth': 'Behemoth',
        'Python': 'Python',
        'Zodiark': 'Zodiark',
      },
      'replaceText': {
        'Adikia': 'Adikia',
        'Algedon': 'Algedon',
        'Ania': 'Ania',
        'Astral Eclipse': 'Astraleklipse',
        'Astral Flow': 'Lichtstrom',
        'Complete Control': 'Totale Verbindung',
        'Esoteric Dyad': 'Esoterische Dyade',
        '(?<!Triple )Esoteric Ray': 'Esoterischer Strahl',
        'Esoteric Sect': 'Esoterische Sekte',
        '(?<!Trimorphos )Exoterikos': 'Exoterikos',
        'Explosion': 'Explosion',
        'Kokytos': 'Kokytos',
        'Meteoros Eidolon': 'Meteoros',
        'Opheos Eidolon': 'Opheos',
        'Paradeigma': 'Paradeigma',
        'Phlegethon': 'Phlegethon',
        'Styx': 'Styx',
        'Trimorphos Exoterikos': 'Trimorphos Exoterikos',
        'Triple Esoteric Ray': 'Esoterischer Dreierstrahl',
      },
    },
    {
      'locale': 'fr',
      'replaceSync': {
        'Arcane Sigil': 'emblème secret',
        'Behemoth': 'béhémoth',
        'Python': 'Python',
        'Zodiark': 'Zordiarche',
      },
      'replaceText': {
        'Adikia': 'Adikia',
        'Algedon': 'Algedon',
        'Ania': 'Ania',
        'Astral Eclipse': 'Éclipse astrale',
        'Astral Flow': 'Flux astral',
        'Complete Control': 'Contrôle total',
        'Esoteric Dyad(?!/)': 'Dyade ésotérique',
        'Esoteric Dyad/Esoteric Sect': 'Dyade/Cabale ésotérique',
        '(?<!Triple )Esoteric Ray': 'Rayon ésotérique',
        '(?<!/)Esoteric Sect': 'Cabale ésotérique',
        '(?<!Trimorphos )Exoterikos': 'Exoterikos',
        'Explosion': 'Explosion',
        'Kokytos': 'Kokytos',
        'Meteoros Eidolon': 'Meteoros',
        'Opheos Eidolon': 'Opheos',
        'Paradeigma': 'Paradeigma',
        'Phlegethon': 'Phlégéthon',
        'Styx': 'Styx',
        'Trimorphos Exoterikos': 'Trimorphos Exoterikos',
        'Triple Esoteric Ray': 'Rayon ésotérique triple',
      },
    },
    {
      'locale': 'ja',
      'replaceSync': {
        'Arcane Sigil': '秘紋',
        'Behemoth': 'ベヒーモス',
        'Python': 'ピュトン',
        'Zodiark': 'ゾディアーク',
      },
      'replaceText': {
        'Adikia': 'アディキア',
        'Algedon': 'アルゲドン',
        'Ania': 'アニア',
        'Astral Eclipse': 'アストラルエクリプス',
        'Astral Flow': 'アストラルフロウ',
        'Complete Control': '完全接続',
        'Esoteric Dyad': 'エソテリックダイアド',
        '(?<!Triple )Esoteric Ray': 'エソテリックレイ',
        'Esoteric Sect': 'エソテリックセクト',
        '(?<!Trimorphos )Exoterikos': 'エクソーテリコス',
        'Explosion': '爆発',
        'Kokytos': 'コキュートス',
        'Meteoros Eidolon': 'メテオロス・エイドロン',
        'Opheos Eidolon': 'オフェオス・エイドロン',
        'Paradeigma': 'パラデイグマ',
        'Phlegethon': 'プレゲトン',
        'Styx': 'ステュクス',
        'Trimorphos Exoterikos': 'トライ・エクソーテリコス',
        'Triple Esoteric Ray': 'トライ・エソテリックレイ',
      },
    },
    {
      'locale': 'cn',
      'replaceSync': {
        'Arcane Sigil': '秘纹',
        'Behemoth': '贝希摩斯',
        'Python': '大蟒',
        'Zodiark': '佐迪亚克',
      },
      'replaceText': {
        'Adikia': '不义',
        'Algedon': '痛苦',
        'Ania': '悲伤',
        'Astral Eclipse': '星蚀',
        'Astral Flow': '星极超流',
        'Complete Control': '完全控制',
        'Esoteric Dyad': '神秘二分',
        '(?<!Triple )Esoteric Ray': '神秘光线',
        'Esoteric Sect': '神秘切割',
        '(?<!Trimorphos )Exoterikos': '外纹',
        'Explosion': '爆炸',
        'Kokytos': '悲痛',
        'Meteoros Eidolon': '陨石幻影',
        'Opheos Eidolon': '巨蛇幻影',
        'Paradeigma': '范式',
        'Phlegethon': '冥火',
        'Styx': '仇恨',
        'Trimorphos Exoterikos': '三重外纹',
        'Triple Esoteric Ray': '三重神秘光线',
      },
    },
    {
      'locale': 'ko',
      'replaceSync': {
        'Arcane Sigil': '비문',
        'Behemoth': '베히모스',
        'Python': '퓌톤',
        'Zodiark': '조디아크',
      },
      'replaceText': {
        'Adikia': '불의',
        'Algedon': '아픔',
        'Ania': '핍박',
        'Astral Eclipse': '별들의 식',
        'Astral Flow': '천상의 흐름',
        'Complete Control': '완전 접속',
        'Esoteric Dyad(?!/)': '내밀한 양면',
        'Esoteric Dyad/Esoteric Sect': '내밀한 양면/종파',
        '(?<!/)Esoteric Sect': '내밀한 종파',
        'Explosion': '폭산',
        'Kokytos': '코퀴토스',
        'Meteoros Eidolon': '허깨비 운석',
        'Opheos Eidolon': '허깨비 뱀',
        'Paradeigma': '시범',
        'Phlegethon': '플레게톤',
        'Styx': '스틱스',
        'Trimorphos Exoterikos': '삼중 엑소테리코스',
        'Triple Esoteric Ray': '내밀한 삼중 광선',
        '(?<!Triple )Esoteric Ray': '내밀한 광선',
        '(?<!Trimorphos )Exoterikos': '엑소테리코스',
      },
    },
  ],
};

export default triggerSet;
