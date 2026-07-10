import { walkDirSync } from '../util/file_utils';

import testOopsyFiles from './helper/test_oopsy';
import testTimelineFiles from './helper/test_timeline';
import testTriggerFiles from './helper/test_trigger';

const timelineFiles: string[] = [];
const triggerFiles: string[] = [];
const oopsyFiles: string[] = [];

const processInputs = (inputPath: string[]) => {
  inputPath.forEach((path: string) => {
    walkDirSync(path, (filepath) => {
      if (/\/(?:raidboss|oopsy)_manifest.txt/.test(filepath) || /\/99-custom\//.test(filepath)) {
        return;
      }
      if (/\/raidboss\/data\/.*\.txt/.test(filepath)) {
        timelineFiles.push(filepath);
        return;
      }
      if (/\/raidboss\/data\/.*\.[jt]s/.test(filepath)) {
        triggerFiles.push(filepath);
        return;
      }
      if (/\/oopsyraidsy\/data\/.*\.[jt]s/.test(filepath)) {
        oopsyFiles.push(filepath);
        return;
      }
    });
  });
};

// Run all data files by default, but allow individual directories / files via
// the command-line.
// TODO: use this with lint-staged to run on individual file changes.
const defaultInput = ['ui/raidboss/data', 'ui/oopsyraidsy/data'];
const dataFileInputs = process.env.CACTBOT_TEST_DATA_FILES?.split('\n').filter(Boolean) ?? [];
const inputs: string[] = dataFileInputs.length > 0
  ? dataFileInputs
  : defaultInput;
processInputs(inputs);

if (triggerFiles.length > 0)
  testTriggerFiles(triggerFiles);
if (timelineFiles.length > 0)
  testTimelineFiles(timelineFiles);
if (oopsyFiles.length > 0)
  testOopsyFiles(oopsyFiles);
