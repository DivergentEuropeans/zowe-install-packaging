#!/bin/sh

#######################################################################
# This program and the accompanying materials are made available
# under the terms of the Eclipse Public License v2.0 which
# accompanies this distribution, and is available at
# https://www.eclipse.org/legal/epl-v20.html
#
# SPDX-License-Identifier: EPL-2.0
#
# Copyright Contributors to the Zowe Project.
#######################################################################

###############################
# Read JSON configuration from shell script
#
# Note: this is not a reliable way to read JSON file. The JSON file must be
#       properly formatted, each key/value pair takes one line.
#
# FIXME: we should have a language neutral JSON reading tool, not using shell script.
#
# @param string   JSON file name
# @param string   parent key to read after
# @param string   which key to read
# @param string   if this variable is required. If this is true and we cannot
#                 find the value of the key, an error will be displayed.
shell_read_json_config() {
  json_file="${1}"
  parent_key="${2}"
  key="${3}"
  required="${4}"

  val=$(cat "${json_file}" | awk "/\"${parent_key}\":/{x=NR+200}(NR<=x){print}" | grep "\"${key}\":" | head -n 1 | awk -F: '{print $2;}' | tr -d '[[:space:]]' | sed -e 's/,$//' | sed -e 's/^"//' -e 's/"$//')
  if [ -z "${val}" ]; then
    if [ "${required}" = "true" ]; then
      print_error_and_exit "Error ZWEL0131E: Cannot find key ${parent_key}.${key} defined in file ${json_file}." "" 131
    fi
  else
    printf "${val}"
  fi
}

###############################
# Read YAML configuration from shell script
#
# Note: this is not a reliable way to read YAML file, but we need this to find
#       out ROOT_DIR to execute further functions.
#
# FIXME: we should have a language neutral YAML reading tool, not using shell script.
#
# @param string   YAML file name
# @param string   parent key to read after
# @param string   which key to read
# @param string   if this variable is required. If this is true and we cannot
#                 find the value of the key, an error will be displayed.
shell_read_yaml_config() {
  yaml_file="${1}"
  parent_key="${2}"
  key="${3}"
  required="${4}"

  val=$(cat "${yaml_file}" | awk "/^ *${parent_key}:/{x=NR+2000;next}(NR<=x){print}" | grep -e "^ \+${key}:" | head -n 1 | awk -F: '{print $2;}' | tr -d '[[:space:]]' | sed -e 's/^"//' -e 's/"$//')
  if [ -z "${val}" ]; then
    if [ "${required}" = "true" ]; then
      print_error_and_exit "Error ZWEL0131E: Cannot find key ${parent_key}.${key} defined in file ${yaml_file}." "" 131
    fi
  else
    printf "${val}"
  fi
}

read_yaml() {
  file="${1}"
  key="${2}"
  ignore_null="${3:-true}"

  utils_dir="${ZWE_zowe_runtimeDirectory}/bin/utils"
  fconv="${utils_dir}/fconv/src/index.js"
  jq="${utils_dir}/njq/src/index.js"

  print_trace "- read_yaml load content from ${file}"
  ZWE_PRIVATE_YAML_CACHE=$(node "${fconv}" --input-format=yaml "${file}" 2>&1)
  code=$?
  print_trace "  * Exit code: ${code}"
  if [ ${code} -ne 0 ]; then
    # Check for "node ... FSUM7351 not found". Common user error that we can solve more quickly by providing advice below.
    missing_id_check=$(echo "${ZWE_PRIVATE_YAML_CACHE}" | grep "FSUM7351" 2>&1)
    if [ -n "${missing_id_check}" ]; then
      print_error "Error ZWEL0319E: NodeJS required but not found. Errors such as ZWEL0157E may occur as a result."
      print_error "The value 'node.home' in the Zowe YAML is not correct. Set it to the parent directory of 'bin/node'."
      print_error "For example, if NodeJS is at '/opt/nodejs/bin/node', then set 'node.home' to '/opt/nodejs'."
    fi
    print_error "  * Output:"
    print_error "$(padding_left "${ZWE_PRIVATE_YAML_CACHE}" "    ")"
    return ${code}
  fi

  print_trace "- read_yaml ${key} from yaml content"
  result=$(echo "${ZWE_PRIVATE_YAML_CACHE}" | node "${jq}" -r "${key}" 2>&1)
  code=$?
  print_trace "  * Exit code: ${code}"
  print_trace "  * Output:"
  if [ -n "${result}" ]; then
    print_trace "$(padding_left "${result}" "    ")"
  fi

  if [ ${code} -eq 0 ]; then
    if [ "${ignore_null}" = "true" ]; then
      if [ "${result}" = "null" -o "${result}" = "undefined" ]; then
        result=
      fi
    fi
    printf "${result}"
  fi

  return ${code}
}

read_yaml_configmgr() {
  file="${1}"
  key=$(echo "${2}" | tr '.' '/')
  ignore_null="${3:-true}"

  print_trace "- read_yaml_configmgr process ${file} and extract '${2} -> ${key}'"

  configmgr="${ZWE_zowe_runtimeDirectory}/bin/utils/configmgr"
  schema="${ZWE_zowe_runtimeDirectory}/schemas/server-common.json:${ZWE_zowe_runtimeDirectory}/schemas/zowe-yaml-schema.json"

  result=$(_CEE_RUNOPTS="XPLINK(ON)" "${configmgr}" -s "$schema" -p "FILE(${file})" extract "${key}" 2>&1);
  code=$?

  # When the item is not defined in config, configmgr returns
  #   code 0 and
  #   stdout = "error not found, reason=nnn"
  if [[ "${result}" == "error not found, reason="* ]]; then
    result=""
  fi

  print_trace "  * Exit code: ${code}"
  print_trace "  * Output:"
  print_trace "$(padding_left "${result}" "    ")"

  if [ ${code} -eq 0 ]; then
    if [ "${ignore_null}" = "true" ]; then
      if [ "${result}" = "null" -o "${result}" = "undefined" ]; then
        result=
      fi
    fi
    printf "${result}"
  fi
}

read_json() {
  file="${1}"
  key="${2}"
  ignore_null="${3:-true}"

  utils_dir="${ZWE_zowe_runtimeDirectory}/bin/utils"
  jq="${utils_dir}/njq/src/index.js"

  print_trace "- read_json ${key} from ${file}"
  result=$(cat "${file}" | node "${jq}" -r "${key}" 2>&1)
  code=$?
  print_trace "  * Exit code: ${code}"
  print_trace "  * Output:"
  if [ -n "${result}" ]; then
    print_trace "$(padding_left "${result}" "    ")"
  fi

  if [ ${code} -eq 0 ]; then
    if [ "${ignore_null}" = "true" -a "${result}" = "null" ]; then
      result=
    fi
    printf "${result}"
  fi

  return ${code}
}

read_json_string() {	
  string="${1}"	
  key="${2}"	
  ignore_null="${3:-true}"	
  utils_dir="${ZWE_zowe_runtimeDirectory}/bin/utils"	
  jq="${utils_dir}/njq/src/index.js"	
  result=$(echo "${string}" | node "${jq}" -r "${key}" 2>&1)	
  code=$?	
  print_trace "  * Exit code: ${code}"	
  print_trace "  * Output:"	
  if [ -n "${result}" ]; then	
    print_trace "$(padding_left "${result}" "    ")"	
  fi	
  if [ ${code} -eq 0 ]; then	
    if [ "${ignore_null}" = "true" -a "${result}" = "null" ]; then	
      result=	
    fi	
    printf "${result}"	
  fi	
  return ${code}	
}

update_yaml() {
  file="${1}"
  key="${2}"
  val="${3}"
  expected_sample="${4}"

  utils_dir="${ZWE_zowe_runtimeDirectory}/bin/utils"
  config_converter="${utils_dir}/config-converter/src/cli.js"
  
  print_message "- update \"${key}\" with value: ${val}"
  result=$(node "${config_converter}" yaml update "${file}" "${key}" "${val}")
  code=$?
  if [ ${code} -eq 0 ]; then
    print_trace "  * Exit code: ${code}"
    print_trace "  * Output:"
    if [ -n "${result}" ]; then
      print_trace "$(padding_left "${result}" "    ")"
    fi
  else
    print_error "  * Exit code: ${code}"
    print_error "  * Output:"
    if [ -n "${result}" ]; then
      print_error "$(padding_left "${result}" "    ")"
    fi
    print_error_and_exit "Error ZWEL0138E: Failed to update key ${key} of file ${file}." "" 138
  fi

  ensure_file_encoding "${file}" "${expected_sample}"
}

update_zowe_yaml() {
  update_yaml "${1}" "${2}" "${3}" "zowe:"
}

delete_yaml() {
  file="${1}"
  key="${2}"
  expected_sample="${3}"

  utils_dir="${ZWE_zowe_runtimeDirectory}/bin/utils"
  config_converter="${utils_dir}/config-converter/src/cli.js"

  print_message "- delete \"${key}\""
  result=$(node "${config_converter}" yaml delete "${file}" "${key}")
  code=$?
  if [ ${code} -eq 0 ]; then
    print_trace "  * Exit code: ${code}"
    print_trace "  * Output:"
    if [ -n "${result}" ]; then
      print_trace "$(padding_left "${result}" "    ")"
    fi
  else
    print_error "  * Exit code: ${code}"
    print_error "  * Output:"
    if [ -n "${result}" ]; then
      print_error "$(padding_left "${result}" "    ")"
    fi
    print_error_and_exit "Error ZWEL0138E: Failed to delete key ${key} of file ${file}." "" 138
  fi

  ensure_file_encoding "${file}" "${expected_sample}"
}

delete_zowe_yaml() {
  delete_yaml "${1}" "${2}" "zowe:"
}
