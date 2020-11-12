/**
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2020
 */

const sshHelper = require('./ssh-helper');


describe('verify node-utils', function () {

  before('prepare SSH connection', async function () {
    await sshHelper.prepareConnection();
  });

  let start_path, start_node_home;
  before('get required parameters', async function () {
    start_path = await sshHelper.executeCommandWithNoError('echo $PATH');
    start_node_home = await sshHelper.executeCommandWithNoError('echo $NODE_HOME');
  });

  const ensure_node_is_on_path = 'ensure_node_is_on_path';
  describe(`verify ${ensure_node_is_on_path}`, function () {

    it('test node added to path if required', async function () {
      const node_home = '/junk_path1/node';
      await test_node_added_to_path(node_home, true);
    });

    it('test node added to path if bin missing', async function () {
      const path_pre_addition = '/junk_path2/node';
      const node_home = '/junk_path2/node';
      await test_node_added_to_path(node_home, true, path_pre_addition);
    });

    it('test node not added to path if already there', async function () {
      const path_pre_addition = '/junk_path3/node/bin';
      const node_home = '/junk_path3/node';
      await test_node_added_to_path(node_home, false, path_pre_addition);
    });

    async function test_node_added_to_path(node_home, expected_addition, path_pre_addition = '') {
      let command = path_pre_addition === '' ? '' : `export PATH=$PATH:${path_pre_addition} && `;
      command += `export NODE_HOME=${node_home} && ${ensure_node_is_on_path}`;
      const expected_out = expected_addition ? 'Appending NODE_HOME/bin to the PATH...' : '';
      await test_node_utils_function_has_expected_rc_stdout_stderr(command, 0, expected_out, '');
    }
  });

  const validate_node_home = 'validate_node_home';
  describe(`verify ${validate_node_home}`, function () {

    it('test empty node home throws error', async function () {
      const node_home = '';
      await test_validate_node_home(node_home, 1, '', 'NODE_HOME is empty');
    });

    it('test junk node home throws error', async function () {
      const node_home = '/junk/';
      await test_validate_node_home(node_home, 1, '', `NODE_HOME: ${node_home}/bin does not point to a valid install of Node`);
    });

    describe('node --version error caught with dummy node', async function () {
      const rc = 13;
      const error = 'This is not a real node version';
      let temp_dir, node_home;
      before('create dummy node', async function () {
        temp_dir = '~/delete_1234';
        node_home = `${temp_dir}/node`;
        await sshHelper.executeCommandWithNoError(`mkdir -p ${node_home}/bin && echo "echo ${error} 1>&2\nexit ${rc}" > ${node_home}/bin/node && chmod u+x ${node_home}/bin/node`);
      });

      after('dispose dummy node', async function () {
        await sshHelper.executeCommandWithNoError(`rm -rf ${temp_dir}`);
      });

      it('test node home with incorrect bin/node throws error', async function () {
        const expected_err = `Node version check failed with return code: ${rc}, error: ${error}`;
        await test_validate_node_home(node_home, 1, expected_err, expected_err);
      });
    });

    // I don't think we can rely on a system to have a valid node home of the right version, so skip for now
    it.skip('test real node home okay', async function () {
      await test_validate_node_home(start_node_home, 0, 'OK: Node is working\nOK: Node is at a supported version', '');
    });

    async function test_validate_node_home(node_home, expected_rc, expected_stdout, expected_stderr) {
      const command = `export NODE_HOME=${node_home} && ${validate_node_home}`;
      await test_node_utils_function_has_expected_rc_stdout_stderr(command, expected_rc, expected_stdout, expected_stderr);
    }
  });

  const check_node_version = 'check_node_version';
  describe(`verify ${check_node_version}`, function () {

    it('test pre-v6 fails', async function () {
      await test_node_version('v4.0.0', false);
    });

    it('test pre-v6.14 fails', async function () {
      await test_node_version('v6.13.1', false);
    });

    it('test pre-v6.14.4 fails', async function () {
      await test_node_version('v6.14.3', false);
    });

    it('test v6.14.4 issues warning', async function () {
      const command = `${check_node_version} "v6.14.4"`;
      const expected_rc = 0;
      let expected_out = 'Warning: Zowe is no longer offering support for Node v6. Please use a higher version.';
      await test_node_utils_function_has_expected_rc_stdout_stderr(command, expected_rc, expected_out, '');
    });

    it('test v6.17.0 issues warning', async function () {
      const command = `${check_node_version} "v6.17.0"`;
      const expected_rc = 0;
      let expected_out = 'Warning: Zowe is no longer offering support for Node v6. Please use a higher version.';
      await test_node_utils_function_has_expected_rc_stdout_stderr(command, expected_rc, expected_out, '');
    });

    it('test v8.16.0 passes', async function () {
      await test_node_version('v8.16.0', true);
    });

    it('test v8.16.1 fails with special message', async function () {
      const command = `${check_node_version} "v8.16.1"`;
      const expected_err = 'Node v8.16.1 specifically is not compatible with Zowe. Please use a different version. See https://docs.zowe.org/stable/troubleshoot/app-framework/app-known-issues.html#desktop-apps-fail-to-load for more details.';
      await test_node_utils_function_has_expected_rc_stdout_stderr(command, 1, expected_err, expected_err);
    });

    it('test v8.16.2 passes', async function () {
      await test_node_version('v8.16.2', true);
    });

    it('test v8.17.0 passes', async function () {
      await test_node_version('v8.17.0', true);
    });

    it('test v12.13.0 passes', async function () {
      await test_node_version('v12.13.0', true);
    });

    it('test v12.16.1 passes', async function () {
      await test_node_version('v12.16.1', true);
    });

    async function test_node_version(version, expected_valid) {
      const command = `${check_node_version} "${version}"`;
      const expected_rc = expected_valid ? 0 : 1;
      const expected_out = expected_valid ? `Node ${version} is supported.` : '';
      const expected_err = expected_valid ? '' : `Node ${version} is less than the minimum level required of v6.14.4`;
      await test_node_utils_function_has_expected_rc_stdout_stderr(command, expected_rc, expected_out, expected_err);
    }
  });

  const check_node_functional = 'check_node_functional';
  describe(`verify ${check_node_functional}`, function () {

    let home_dir, temp_dir, node_home;
    before('create dummy node', async function () {
      home_dir = await sshHelper.executeCommandWithNoError('echo $HOME');
      temp_dir = `${home_dir}/delete_1234`;
      node_home = `${temp_dir}/node`;
      await sshHelper.executeCommandWithNoError(`mkdir -p ${node_home}/bin && touch ${node_home}/bin/node && chmod u+x ${node_home}/bin/node`);
    });

    after('dispose dummy node', async function () {
      await sshHelper.executeCommandWithNoError(`rm -rf ${temp_dir}`);
    });

    it('test node home with incorrect bin/node throws error', async function () {
      await test_check_node_functional(node_home, 1, `NODE_HOME: ${node_home}/bin/node is not functioning correctly:`);
    });

    async function test_check_node_functional(node_home, expected_rc, expected_stderr) {
      const command = `export NODE_HOME=${node_home} && ${check_node_functional}`;
      await test_node_utils_function_has_expected_rc_stdout_stderr(command, expected_rc, expected_stderr, expected_stderr);
    }
  });

  async function test_node_utils_function_has_expected_rc_stdout_stderr(command, expected_rc, expected_stdout, expected_stderr) {
    const node_utils_path = process.env.ZOWE_ROOT_DIR + '/bin/utils/node-utils.sh';
    command = `export ZOWE_ROOT_DIR=${process.env.ZOWE_ROOT_DIR} && . ${node_utils_path} && ${command}`;
    // Whilst printErrorMessage outputs to STDERR and STDOUT we need to expect the err in both
    if (expected_stderr != '') {
      expected_stdout = expected_stderr;
    }
    await sshHelper.testCommand(command, expected_rc, expected_stdout, expected_stderr);
  }

  after('restore env', async function () {
    await sshHelper.executeCommandWithNoError(`export PATH=${start_path}`);
    await sshHelper.executeCommandWithNoError(`export NODE_HOME=${start_node_home}`);
  });

  after('dispose SSH connection', function () {
    sshHelper.cleanUpConnection();
  });
});
