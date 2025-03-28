import ZoneId from '../../../../../resources/zone_id';
import { RaidbossData } from '../../../../../types/data';
import { TriggerSet } from '../../../../../types/trigger';

export type Data = RaidbossData;

const triggerSet: TriggerSet<Data> = {
  id: 'AacCruiserweightM2',
  zoneId: ZoneId.AacCruiserweightM2,
  timelineFile: 'r6n.txt',
  triggers: [],
};

export default triggerSet;
