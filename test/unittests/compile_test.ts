import fs from 'fs';
import path from 'path';

import { exec } from '@actions/exec';
import { afterEach, assert, describe, it } from 'vitest';

const projectRoot = path.resolve('.');

describe('compile test', () => {
  afterEach(() => {
    process.chdir(projectRoot);
    fs.rmSync('dist', { recursive: true, force: true });
  });

  it('npm package should compile successfully', { timeout: 30000 }, async () => {
    let output = '';
    let exitCode = -1;
    try {
      process.chdir(projectRoot);
      fs.rmSync('dist', { recursive: true, force: true });
      exitCode = await exec('npx tsc --declaration', [], {
        listeners: {
          stdout: (data) => output += data.toString(),
          stderr: (data) => output += data.toString(),
        },
      });
    } catch (err) {
      console.error(err);
    }
    assert.ok(exitCode === 0, output);
  });
});
