/*
  This program and the accompanying materials are made available
  under the terms of the Eclipse Public License v2.0 which
  accompanies this distribution, and is available at
  https://www.eclipse.org/legal/epl-v20.html
 
  SPDX-License-Identifier: EPL-2.0
 
  Copyright Contributors to the Zowe Project.
*/

import * as std from 'cm_std';
import * as os from 'cm_os';
import * as fs from './fs';
import * as common from './common';
import * as javaCI from './java_ci'
import * as shell from './shell';
import * as config from './config';

export function ensureJavaIsOnPath(): void {
  let path=std.getenv('PATH') || '/bin:.:/usr/bin';
  let javaHome=std.getenv('JAVA_HOME');
  if (!path.includes(`:${javaHome}/bin:`)) {
    std.setenv('PATH', `${javaHome}/bin:${path}`);
  }
}

export function readConfigJavaHome(configList?: string, skipValidate?: boolean): string {
  const zoweConfig = config.getZoweConfig();
  if (zoweConfig && zoweConfig.java && zoweConfig.java.home) {
    if (!skipValidate) {
      if (!javaCI.validateJavaHome(zoweConfig.java.home)) {
        return '';
      }
    }
    return zoweConfig.java.home;
  }
  return '';
}

export function detectJavaHome(): string|undefined {
  let javaBinHome = shell.which(`java`);
  if (javaBinHome) {
    let returnVal = os.realpath(`${javaBinHome}/../..`);
    if (!returnVal[1]) {
      return returnVal[0];
    }
  }

  if (!javaBinHome && fs.fileExists('/usr/lpp/java/J17.0_64/bin/java')) {
    return '/usr/lpp/java/J17.0_64';
  }
  return undefined;
}

let _javaCheckComplete = false;
export function requireJava() {
  if ((_javaCheckComplete === true) && std.getenv('JAVA_HOME')) {
    return;
  }
  if (std.getenv('ZWE_CLI_PARAMETER_CONFIG')) {
    const customJavaHome = readConfigJavaHome();
    if (customJavaHome) {
      std.setenv('JAVA_HOME', customJavaHome);
    }
  }
  if (!std.getenv('JAVA_HOME')) {
    let detectedHome = detectJavaHome();
    if (detectedHome){
      std.setenv('JAVA_HOME', detectedHome);
    } 
  }
  if (!std.getenv('JAVA_HOME')) {
    common.printErrorAndExit("Error ZWEL0122E: Cannot find java. Set the java.home value in the Zowe YAML, or include java in the PATH environment variable of any accounts that start or manage Zowe", undefined, 122);
  }

  ensureJavaIsOnPath();
  _javaCheckComplete = true;
}

export function getJavaPkcs12KeystoreFlag(javaHome:string|undefined=std.getenv("JAVA_HOME")): string {
  if (!javaHome) {
    common.printError("Cannot find java. Please define JAVA_HOME environment variable.");
    return ' ';
  }
  if (!fs.fileExists(fs.resolvePath(javaHome,`/bin/java`))) {
    common.printError(`JAVA_HOME: ${javaHome}/bin does not point to a valid install of Java.`);
    return ' ';
  }

  let execReturn = shell.execErrSync(fs.resolvePath(javaHome,`/bin/java`), `-version`);
  const version = execReturn.err;
  if (execReturn.rc != 0) {
    common.printError(`Java version check failed with return code: ${execReturn.rc}: ${version}`);
    return ' ';
  }
 
  try {
    let index = 0;
    let javaVersionShort;
    let versionLines = (version as string).split('\n'); // valid because of above rc check
    for (let i = 0; i < versionLines.length; i++) {
      if ((index = versionLines[i].indexOf('java version')) != -1) {
        //format of: java version "1.8.0_321"
        javaVersionShort=versionLines[i].substring(index+('java version'.length)+2, versionLines[i].length-1);
        break;
      } else if ((index = versionLines[i].indexOf('openjdk version')) != -1) {
        javaVersionShort=versionLines[i].substring(index+('openjdk version'.length)+2, versionLines[i].length-1);
        break;
      }
    }
    if (!javaVersionShort){
      common.printError("could not find java version");
      return ' ';
    }
    let versionParts = javaVersionShort.split('.');
    const javaMajorVersion=Number(versionParts[0]);
    const javaMinorVersion=Number(versionParts[1]);
    let fixParts = javaVersionShort.split('_');
    const javaFixVersion=Number(fixParts[1]);

    if (javaMajorVersion == 1 && javaMinorVersion == 8) {
      if (javaFixVersion < 341) {
        return ' ';
      } else if (javaFixVersion < 361) {
        return " -J-Dkeystore.pkcs12.certProtectionAlgorithm=PBEWithSHAAnd40BitRC2 -J-Dkeystore.pkcs12.certPbeIterationCount=50000 -J-Dkeystore.pkcs12.keyProtectionAlgorithm=PBEWithSHAAnd3KeyTripleDES -J-Dkeystore.pkcs12.keyPbeIterationCount=50000 "
      } else {
        return " -J-Dkeystore.pkcs12.legacy ";
      }
    } else if (javaMajorVersion == 1 && javaMinorVersion > 8) {
      return " -J-Dkeystore.pkcs12.legacy ";
    } else {
      return ' ';
    }

  } catch (e) {
    return ' ';
  }
}
