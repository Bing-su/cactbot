import { defineConfig } from 'vitest/config';

const dataFileInputs = process.argv.filter((arg) =>
  /^ui\/(?:raidboss|oopsyraidsy)\/data(?:\/|$)/.test(arg)
);
if (dataFileInputs.length > 0)
  process.env.CACTBOT_TEST_DATA_FILES = dataFileInputs.join('\n');

export default defineConfig({
  test: {
    fileParallelism: true,
    include: [
      'test/unittests/*_test.ts',
      'test/test_data_files.ts',
    ],
    testTimeout: 5000,
  },
});
