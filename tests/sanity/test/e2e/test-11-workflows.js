/**
 * This program and the accompanying materials are made available under the terms of the
 * Eclipse Public License v2.0 which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Copyright IBM Corporation 2019
 */

const path = require('path');
const expect = require('chai').expect;
const debug = require('debug')('zowe-sanity-test:e2e:workflows');
const addContext = require('mochawesome/addContext');
const testName = path.basename(__filename, path.extname(__filename));

const {
  saveScreenshot,
  getDefaultDriver,
  waitUntilElement,
  loginMVD,
  launchApp,
  locateApp,
} = require('./utils');
let driver;

const APP_TO_TEST = 'User Tasks/Workflows';

describe.skip(`test ${APP_TO_TEST}`, function() {
  before('verify environment variable and load login page', async function() {
    expect(process.env.ZOWE_EXTERNAL_HOST, 'ZOWE_EXTERNAL_HOST is empty').to.not.be.empty;
    expect(process.env.SSH_USER, 'SSH_USER is not defined').to.not.be.empty;
    expect(process.env.SSH_PASSWD, 'SSH_PASSWD is not defined').to.not.be.empty;
    expect(process.env.ZOWE_ZLUX_HTTPS_PORT, 'ZOWE_ZLUX_HTTPS_PORT is not defined').to.not.be.empty;

    // init webdriver
    driver = await getDefaultDriver();
    debug('webdriver initialized');

    // load MVD login page
    await loginMVD(
      driver,
      `https://${process.env.ZOWE_EXTERNAL_HOST}:${process.env.ZOWE_API_MEDIATION_GATEWAY_HTTP_PORT}/zlux/ui/v1/ZLUX/plugins/org.zowe.zlux.bootstrap/web/`,
      process.env.SSH_USER,
      process.env.SSH_PASSWD
    );
  });


  it('should launch app correctly', async function() {
    // load app
    await launchApp(driver, APP_TO_TEST);
    const app = await locateApp(driver, APP_TO_TEST);
    expect(app).to.be.an('object');
    debug('app launched');

    // save screenshot
    const file = await saveScreenshot(driver, testName, 'app-loading');
    addContext(this, file);

    // wait for caption is loaded
    const caption = await waitUntilElement(driver, 'rs-com-mvd-window .heading .caption');
    expect(caption).to.be.an('object');
    debug('caption is ready');
    const captionTest = await caption.getText();
    expect(captionTest).to.be.equal(APP_TO_TEST);
    debug('app caption checked ok');

    // wait for caption is loaded
    const viewport = await waitUntilElement(driver, 'rs-com-mvd-window .body com-rs-mvd-viewport');
    expect(viewport).to.be.an('object');
    debug('app viewport is ready');

    // wait for page is loaded
    const canvas = await waitUntilElement(driver, 'workflow-app', viewport);
    expect(canvas).to.be.an('object');
    debug('app is fully loaded');

    // save screenshot
    const file2 = await saveScreenshot(driver, testName, 'app-loaded');
    addContext(this, file2);
  });


  after('quit webdriver', async function() {
    // quit webdriver
    if (driver) {
      await driver.quit();
    }
  });
});
