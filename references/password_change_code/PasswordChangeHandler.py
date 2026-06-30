import base64
import datetime
import json
import logging
import re
import threading
import time
import xml.etree.ElementTree as ET

import PySimpleGUI as sg
import requests
from netmiko import ConnectHandler
from requests.auth import HTTPBasicAuth
from requests.exceptions import SSLError

from GUIHandler import (new_password_gui, password_change_gui,
                        select_password_change_devices_gui)
from HelperFunctions import blank_out, center_window, intersperse
from JSONHandler import pull_commands_by_device_type
from LoggingHandler import create_log
from LoginHandler import get_credentials
from PullingHandler import get_vty_range

#List for getting results from threads for changing device password
results_list = []

def bulk_password_change(devices_rows, window):
    #Initialize device table window
    select_password_change_devices_window = select_password_change_devices_gui(devices_rows)
    
    #Display new window at location of old window
    center_window(window, select_password_change_devices_window)
    select_password_change_devices_window.set_alpha(1)
    
    devices = []
    
    select_all_check = False
    #Device table window loop
    global device
    while select_password_change_devices_window:
        event, values = select_password_change_devices_window.read()
        #print("event:", event, "values:", values)
        
        #Returns to main menu when window is closed or back button is pressed
        if event in (sg.WIN_CLOSED, '-CancelButton-'):
            select_password_change_devices_window.Close()
            return
        
        if event == '-SelectAll-':
            rows_to_select = []
            if select_all_check:
                select_password_change_devices_window['-SelectDeviceTable-'].Update(select_rows=rows_to_select)
                select_all_check = False
            else:
                for i in enumerate(devices_rows):
                    rows_to_select.append(i[0])
                select_password_change_devices_window['-SelectDeviceTable-'].Update(select_rows=rows_to_select)
                select_all_check = True
        
        #Creates confirmation popup and if yes is selected continues with the bulk password change
        if event == '-SelectButton-':
            # Get list of devices from values
            devices = []
            for i in values['-SelectDeviceTable-']:
                devices.append(devices_rows[i])
                
            if devices == []:
                sg.popup_ok('You must select at least one device.', modal=True)
                continue
            
            confirmation = sg.popup_yes_no("Are you sure you would like to change the passwords of the selected following devices?", title="Password Change Devices Confirmation", modal=True)
            print(confirmation)
            if confirmation == "Yes":
                break
            else:
                select_password_change_devices_window.Close()
                return

    select_password_change_devices_window.Close()
    
    #Get username and password for logging in
    credentials = get_credentials()
    
    device_types_in_list = []
    for device_row in devices:
        if device_row[2] not in device_types_in_list:
            device_types_in_list.append(device_row[2])
    
    passwords = get_new_password(window)
    
    if passwords == None:
        return
    
    #Get enable for logging in if it's required
    enable = passwords[0]
    
    new_password = passwords[1]
    
    password_change_commands_list = []
    for device_type in device_types_in_list:
        password_change_commands_list.append(f'{device_type} commands:\n')
        password_change_commands_list.append('\t')
        commands_list = pull_commands_by_device_type(device_type)
        interspersed_commands_list = intersperse(commands_list, '\n\t')
        for command in interspersed_commands_list:
            password_change_commands_list.append(command)
        password_change_commands_list.append('\n\n')
        
    password_change_commands = ''.join(password_change_commands_list)
    password_change_commands = password_change_commands.replace('new_password', blank_out(new_password))
    password_change_commands = password_change_commands.replace('current_enable', blank_out(enable))
    
    #Show new password toggle tracking varaiables
    new_password_visible = False
    enable_visible = False
    
    #Track successful password changes
    success_list = []
    failed_list = []
    
    #Open up the password change window
    password_change_window = password_change_gui( 
        devices=devices, 
        device_types=device_types_in_list,
        enable=enable, 
        new_password=new_password,
        password_change_commands=password_change_commands
        )
    
    #Display new window at location of old window
    center_window(window, password_change_window)
    password_change_window.set_alpha(1)
    
    while True:
        event, values = password_change_window.read()
        #print("event:", event, "values:", values)

        if event == '-CompleteButton-':
            create_log(password_change_window['-Result-'].get(), credentials[0])
        
        #Returns to device window when window is closed or cancel button is pressed
        if event in (sg.WIN_CLOSED, '-CancelButton-', '-CompleteButton-', sg.WINDOW_CLOSE_ATTEMPTED_EVENT):
            break
        
        #Toggle displaying the new password
        if event == '-ShowNewPassword-':
            if new_password_visible:
                password_change_window['-NewPassword-'].update(f'New Password: {blank_out(new_password)}')
                new_password_visible = False
            else:
                password_change_window['-NewPassword-'].update(f'New Password: {new_password}')
                new_password_visible = True
        
        #Toggle displaying the enable
        if event == '-ShowEnable-':
            if enable_visible:
                password_change_window['-Enable-'].update(f'Enable password: {blank_out(enable)}')
                enable_visible = False
            else:
                password_change_window['-Enable-'].update(f'Enable password: {enable}')
                enable_visible = True
                
        if event == '-ChangePasswordButton-':
            #Reset result text to empty
            password_change_window['-Result-'].update(f'')
            
            #Disable buttons during password changes
            password_change_window['-ChangePasswordButton-'].update(disabled=True)
            password_change_window['-CancelButton-'].update(disabled=True)
            password_change_window['-ShowNewPassword-'].update(disabled=True)
            password_change_window['-ShowEnable-'].update(disabled=True)
            
            password_change_window['-ProgressBar-'].update(current_count=0, max=len(devices))
            
            args = (credentials, new_password, enable)
            
            threading.Thread(target=password_long_function, args=(password_change_window, devices, args), daemon=True).start()
            counter = 0
            
        if event == '-RetryButton-':
            #Allows rerunning on just the devices which couldn't connect
            devices = failed_list
            success_list = []
            failed_list = []
            password_change_window['-Result-'].update(f'{password_change_window['-Result-'].get()}\n{len(devices)} devices set to change passwords. Press the change password button to continue.')
            password_change_window['-ChangePasswordButton-'].update(disabled=False)
            password_change_window['-CancelButton-'].update(disabled=False)
        
        
        if event == '-FinishPasswordChange-':
            #Make list of results strings as well as the success and fail lists
            for result in results_list:
                if result[0] == True:
                    success_list.append(result[1])
                elif result[0] == False:
                    failed_list.append(result[1])
            
            #End the results output with conclusion statement
            if failed_list != [] and success_list == []:
                password_change_window['-Result-'].update(f'{password_change_window['-Result-'].get()}\n{len(failed_list)} out of {len(results_list)} devices failed to connect or send commands.\nReturning to password change step')
                password_change_window['-ChangePasswordButton-'].update(disabled=False)
                password_change_window['-CancelButton-'].update(disabled=False)
                success_list = []
                failed_list = []
            elif failed_list != []:
                password_change_window['-Result-'].update(f'{password_change_window['-Result-'].get()}\n{len(failed_list)} out of {len(results_list)} devices failed to connect or send commands.')
                
                password_change_window['-Result-'].update(f'{password_change_window['-Result-'].get()}\nThe following devices had problems connecting or changing passwords:')
                failed_ips = []
                for device in failed_list:
                    failed_ips.append(device[0])
                failed_ips = intersperse(failed_ips, '\n\t')
                failed_ip_string = ''.join(failed_ips)
                password_change_window['-Result-'].update(f'{password_change_window['-Result-'].get()}\n\t{failed_ip_string}')
                
                password_change_window['-Result-'].update(f'{password_change_window['-Result-'].get()}\nPress complete to exit or retry to allow attempting password changes on failed devices.')
                
                password_change_window['-RetryButton-'].update(disabled=False)
                password_change_window['-CompleteButton-'].update(disabled=False)
                #password_change_window['-DeviceTable-'].update(values=success_list)
            else: 
                password_change_window['-Result-'].update(f'{password_change_window['-Result-'].get()}\nAll {len(success_list)} devices had their passwords changed successfully.')
                password_change_window['-CompleteButton-'].update(disabled=False)
            
            #Reenable buttons after password changes
            password_change_window['-ShowNewPassword-'].update(disabled=False) 
            password_change_window['-ShowEnable-'].update(disabled=False)    
                    
                
        if event == '-ThreadProgress-':
            device_complete = values['-ThreadProgress-'][0]
            
            thread_string = values['-ThreadProgress-'][1]
            password_change_window['-Result-'].update(f'{password_change_window['-Result-'].get()}\n{thread_string}')
            
            if device_complete:
                counter += 1
                password_change_window['-ProgressBar-'].update(counter) 
                password_change_window['-ProgressBarText-'].update(f'{counter} / {len(devices)} devices complete')
        
    #Close the new password window before opening the password change window
    password_change_window.Close()

def password_long_function(window, devices, args):
    results_list.clear()
    
    # Create threads
    threads = []
    for device in devices:
        thread = threading.Thread(target=globals()[f'change_{device[2]}_password'], args=(device, args[0], args[1], args[2], window), daemon=True)
        threads.append(thread)
    
    # Start threads in batches of 30
    for i in range(0, len(threads), 30):
        batch = threads[i:i+30]
        for t in batch:
            t.start()
        for t in batch:
            t.join()
    
    #Update once all threads have joined
    window['-ProgressBarText-'].update(f'All {len(devices)} devices complete')
    window.write_event_value('-FinishPasswordChange-', '')
    
def get_new_password(window):
    new_password_window = new_password_gui()
    
    #Display new window at location of old window
    center_window(window, new_password_window)
    new_password_window.set_alpha(1)
    
    while True:
        event, values = new_password_window.read()
        print("event:", event, "values:", values)

        #Returns to device window when window is closed or cancel button is pressed
        if event in (sg.WIN_CLOSED, '-CancelButton-', sg.WINDOW_CLOSE_ATTEMPTED_EVENT):
            new_password_window.Close()
            return
        
        #When submit is pressed 
        if event == '-SubmitButton-':
            #Throw error if fields are both empty
            if values['-NewPassword-'] == '' and values['-CheckNewPassword-'] == '':
                new_password_window['-ErrorNewText-'].update('Passwords cannot be empty!')
                
            #Throw error if fields don't match
            elif values['-NewPassword-'] != values['-CheckNewPassword-']:
                new_password_window['-ErrorNewText-'].update('Passwords do not match!')
            else:
                new_password_window['-ErrorNewText-'].update('')
            #Reset error text
                
            #Throw error if fields are both empty
            if values['-CurrentPassword-'] == '' and values['-CheckCurrentPassword-'] == '':
                new_password_window['-ErrorCurrentText-'].update('Passwords cannot be empty!')
            #Throw error if fields don't match
            elif values['-CurrentPassword-'] != values['-CheckCurrentPassword-']:
                new_password_window['-ErrorCurrentText-'].update('Passwords do not match!')   
            #Reset error text
            else:
                new_password_window['-ErrorCurrentText-'].update('')
                
            #Pass new password from input field and continue
            if new_password_window['-ErrorNewText-'].DisplayText == '' and new_password_window['-ErrorCurrentText-'].DisplayText == '':
                new_password_window['-ErrorNewText-'].update('')
                new_password_window['-ErrorCurrentText-'].update('')
                #Close the new password window before opening the password change window
                new_password_window.Close()
                return [values['-CurrentPassword-'], values['-NewPassword-']]
            
#Change a given cisco_nxos device password
def change_cisco_nxos_password(device, credentials, new_password, enable_secret = '', window = None):
    
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': device[2],
        'host': device[0],
        'username': credentials[0],
        'password': credentials[1],
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Enter enable
    try:
        connection.enable()
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to enter enable: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        connection.send_config_set(password_change_commands)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Exit configuration mode
    try:
        connection.exit_config_mode()
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} exited from config mode successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} exit from config mode failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.save_config()
            
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes saved successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes failed to save with exception: {e}'))
        return
    
def validate_WLC_password(
    host,
    username,
    password,
    *,
    enable_secret=None,
    device_type="cisco_wlc_ssh",
    port=None,
    timeout=None,
    banner_timeout=30,
    probe_enable=False,
    probe_command="show sysinfo",
):
    """
    Netmiko-based validation for WLC:
      - Fresh SSH auth using (username, password)
      - Optionally attempts enable using enable_secret and checks for obvious failures
      - Runs a minimal safe command, then disconnects
    Returns: (ok: bool, detail: str). Never raises. Secrets are not included in detail.
    """
    def _snip(text, limit=280):
        if text is None:
            return ""
        s = str(text)
        return s if len(s) <= limit else (s[:limit] + "...(snip)")

    def _classify_cli_failure(output):
        if not output:
            return None
        o = output.lower()
        # Common negative signals (keep conservative)
        needles = [
            "invalid",
            "denied",
            "not authorized",
            "error",
            "failed",
            "failure",
            "incomplete",
            "unknown command",
            "incorrect",
            "% ",
        ]
        for n in needles:
            if n in o:
                return n.strip()
        return None

    def _bucket_exc(exc):
        name = type(exc).__name__
        msg = _snip(getattr(exc, "args", [""])[0] if getattr(exc, "args", None) else str(exc), 180)
        # Avoid importing new exception types; bucket by name
        if "Authentication" in name:
            bucket = "auth"
        elif "Timeout" in name:
            bucket = "timeout"
        elif "SSH" in name:
            bucket = "ssh"
        else:
            bucket = "other"
        return bucket, name, msg

    netmiko_config = {
        "device_type": device_type,
        "host": host,
        "username": username,
        "password": password,
        "banner_timeout": banner_timeout,
    }
    if enable_secret is not None:
        netmiko_config["secret"] = enable_secret
    if port is not None:
        netmiko_config["port"] = port
    if timeout is not None:
        # Do not set unless explicitly provided by caller
        netmiko_config["timeout"] = timeout

    conn = None
    try:
        conn = ConnectHandler(**netmiko_config)
    except Exception as exc:
        bucket, name, msg = _bucket_exc(exc)
        return False, f"connect failed [{bucket}]: {name}: {msg}"

    try:
        # Optional enable probe (mirrors existing flow using send_command_timing)
        if probe_enable or (enable_secret is not None):
            out1 = conn.send_command_timing("enable")
            # "Password:" prompt here is expected, so don't classify this output.
            out2 = conn.send_command_timing(enable_secret if enable_secret is not None else "")
            fail = _classify_cli_failure(out2)
            # If device re-prompts for password after submitting secret, likely wrong
            if "password" in (out2 or "").lower() or fail:
                return False, f"enable probe failed: {_snip(out2, 200)}"

        # Minimal safe command
        out = conn.send_command_timing(probe_command)
        fail = _classify_cli_failure(out)
        if fail:
            return False, f"probe cmd flagged '{fail}': {_snip(out, 220)}"

        return True, "ok"
    except Exception as exc:
        bucket, name, msg = _bucket_exc(exc)
        return False, f"validation error [{bucket}]: {name}: {msg}"
    finally:
        try:
            if conn:
                conn.disconnect()
        except Exception:
            pass


def validate_WLC_password(
    host,
    username,
    password,
    *,
    enable_secret=None,
    device_type="cisco_wlc_ssh",
    port=None,
    timeout=None,
    banner_timeout=30,
    probe_enable=False,
    privilege_probe_command="conf t",
    privilege_probe_exit_command="end",
):
    """
    Fresh SSH auth using (username, password), prompt-based.
    If probe_enable: attempt enable and CONFIRM privilege by successfully entering config mode
    using the same 'conf t' flow, then 'end' to exit.

    Returns (ok: bool, detail: str). Never raises. Secrets never included.
    """
    def _snip(text, limit=220):
        if text is None:
            return ""
        s = str(text)
        return s if len(s) <= limit else (s[:limit] + "...(snip)")

    def _bucket_exc(exc):
        name = type(exc).__name__
        msg = _snip(getattr(exc, "args", [""])[0] if getattr(exc, "args", None) else str(exc), 200)
        if "Authentication" in name:
            bucket = "auth"
        elif "Timeout" in name:
            bucket = "timeout"
        elif "SSH" in name:
            bucket = "ssh"
        else:
            bucket = "other"
        return bucket, name, msg

    def _has_password_prompt(output):
        return "password" in (output or "").lower()

    def _is_invalid_input(output):
        o = (output or "").lower()
        return ("% invalid input" in o) or ("invalid input detected" in o)

    netmiko_config = {
        "device_type": device_type,
        "host": host,
        "username": username,
        "password": password,
        "banner_timeout": banner_timeout,
    }
    if enable_secret is not None:
        netmiko_config["secret"] = enable_secret
    if port is not None:
        netmiko_config["port"] = port
    if timeout is not None:
        netmiko_config["timeout"] = timeout

    conn = None
    try:
        conn = ConnectHandler(**netmiko_config)
    except Exception as exc:
        bucket, name, msg = _bucket_exc(exc)
        return False, f"connect failed [{bucket}]: {name}: {msg}"

    try:
        try:
            prompt1 = conn.find_prompt()
        except Exception as exc:
            bucket, name, msg = _bucket_exc(exc)
            return False, f"prompt read failed [{bucket}]: {name}: {msg}"

        if not prompt1 or not str(prompt1).strip():
            return False, "empty prompt after connect"

        if probe_enable or (enable_secret is not None):
            out_enable = conn.send_command_timing("enable")
            if _is_invalid_input(out_enable) and (not _has_password_prompt(out_enable)):
                return False, f"enable cmd invalid (no password prompt): out={_snip(out_enable, 200)}"

            if _has_password_prompt(out_enable):
                out_secret = conn.send_command_timing(enable_secret if enable_secret is not None else "")
                if _has_password_prompt(out_secret):
                    return False, f"enable secret rejected (reprompted): out={_snip(out_secret, 200)}"
            else:
                out_secret = ""

            out_probe = conn.send_command_timing(privilege_probe_command)
            if _is_invalid_input(out_probe):
                return False, f"privilege not confirmed (conf t rejected): out={_snip(out_probe, 220)}"

            try:
                conn.send_command_timing(privilege_probe_exit_command)
            except Exception:
                pass

        return True, f"ok (prompt={_snip(prompt1, 60)})"
    except Exception as exc:
        bucket, name, msg = _bucket_exc(exc)
        return False, f"validation error [{bucket}]: {name}: {msg}"
    finally:
        try:
            if conn:
                conn.disconnect()
        except Exception:
            pass


#Change a given WLC device password
def change_WLC_password(device, credentials, new_password, enable_secret='', window=None):
    host = device[0]
    username = 'admin'
    device_type = 'cisco_wlc_ssh'
    banner_timeout = 30

    def _snip(text, limit=320):
        if text is None:
            return ""
        s = str(text)
        return s if len(s) <= limit else (s[:limit] + "...(snip)")

    def _emit(done_flag, message):
        if window is not None:
            window.write_event_value('-ThreadProgress-', (done_flag, message))

    def _extract_old_admin_password(creds):
        if isinstance(creds, str) and creds.strip():
            return creds
        if isinstance(creds, dict):
            for k in ("password", "admin_password", "pass", "passwd"):
                v = creds.get(k)
                if isinstance(v, str) and v.strip():
                    return v
        if isinstance(creds, (tuple, list)) and len(creds) >= 2 and isinstance(creds[1], str) and creds[1].strip():
            return creds[1]
        return ""

    def _redact_text(s):
        t = str(s or "")
        for secret in (new_password, enable_secret):
            if secret:
                t = t.replace(secret, "***")
        return t

    def _has_password_prompt(output):
        return "password" in (output or "").lower()

    def _is_invalid_input(output):
        o = (output or "").lower()
        return ("% invalid input" in o) or ("invalid input detected" in o)

    def _diag(stage, cmd=None, output=None, exc=None):
        parts = [f"{host} {stage}"]
        if cmd:
            parts.append(f"cmd={cmd}")
        if exc is not None:
            parts.append(f"exc={type(exc).__name__}: {_snip(str(exc), 200)}")
        if output is not None:
            parts.append(f"out={_snip(_redact_text(output), 240)}")
        _emit(True, " | ".join(parts))

    old_admin_password = _extract_old_admin_password(credentials) or enable_secret or ""

    # --- Determine admin login password (new vs old) ---
    admin_new_ok, admin_new_detail = validate_WLC_password(
        host, username, new_password,
        device_type=device_type, banner_timeout=banner_timeout, probe_enable=False
    )
    if admin_new_ok:
        admin_login_password = new_password
        admin_state = "new"
    else:
        admin_old_ok, admin_old_detail = validate_WLC_password(
            host, username, old_admin_password,
            device_type=device_type, banner_timeout=banner_timeout, probe_enable=False
        )
        if not admin_old_ok:
            results_list.append([False, device])
            _emit(True, f"{host} failed to authenticate (admin) with new+old candidates | new={admin_new_detail} | old={admin_old_detail}")
            return
        admin_login_password = old_admin_password
        admin_state = "old"

    # --- Determine enable secret (new vs old) using CONF T probe ---
    enable_new_ok, enable_new_detail = validate_WLC_password(
        host, username, admin_login_password,
        device_type=device_type, banner_timeout=banner_timeout,
        enable_secret=new_password, probe_enable=True
    )
    if enable_new_ok:
        enable_current = new_password
        enable_state = "new"
    else:
        enable_old_ok, enable_old_detail = validate_WLC_password(
            host, username, admin_login_password,
            device_type=device_type, banner_timeout=banner_timeout,
            enable_secret=enable_secret, probe_enable=True
        )
        if not enable_old_ok:
            results_list.append([False, device])
            _emit(True, f"{host} failed to determine enable secret (new+old candidates) | new={enable_new_detail} | old={enable_old_detail}")
            return
        enable_current = enable_secret
        enable_state = "old"

    need_update_admin = (admin_state != "new")
    need_update_enable = (enable_state != "new")

    # ---- Idempotent fast-path: already compliant -> skip commands ----
    if (not need_update_admin) and (not need_update_enable):
        # Still perform a final validation with the new creds (fresh auth + conf t probe)
        v_ok, v_detail = validate_WLC_password(
            host, username, new_password,
            device_type=device_type, banner_timeout=banner_timeout,
            enable_secret=new_password, probe_enable=True
        )
        if not v_ok:
            results_list.append([False, device])
            _emit(True, f"{host} validation failed: {v_detail}")
            return

        results_list.append([True, device])
        _emit(True, f"{host} already compliant; skipped password update")
        return

    _emit(False, f"{host} auth state detected: admin={admin_state}, enable={enable_state} | updating: admin={need_update_admin}, enable={need_update_enable}")

    # Pull + substitute commands (same commands, same order)
    password_change_commands = pull_commands_by_device_type(device[2])
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    password_change_commands = [sub.replace('current_enable', enable_current) for sub in password_change_commands]

    # Filter only redundant config lines (update whichever is still old)
    filtered = []
    for cmd in password_change_commands:
        low = cmd.strip().lower()
        if (not need_update_enable) and low.startswith("enable secret"):
            continue
        if (not need_update_admin) and low.startswith("username ") and " admin " in f" {low} ":
            continue
        filtered.append(cmd)
    password_change_commands = filtered

    #Connect to device (use detected working admin + enable current)
    netmiko_config = {
        'device_type': device_type,
        'host': host,
        'username': username,
        'password': admin_login_password,
        'secret': enable_current,
        'banner_timeout': banner_timeout,
    }

    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        _diag("failed to connect", exc=e)
        return

    #Send password change commands
    try:
        # Preserve printing side-effect but redact secrets
        print([_redact_text(c).replace(enable_current, "***") for c in password_change_commands])

        i = 0
        while i < len(password_change_commands):
            cmd = password_change_commands[i]
            cmd_strip = cmd.strip()
            cmd_low = cmd_strip.lower()

            if cmd_low == "enable":
                out1 = connection.send_command_timing(cmd)

                if _is_invalid_input(out1) and (not _has_password_prompt(out1)):
                    results_list.append([False, device])
                    _diag("enable step failed", cmd="enable", output=out1)
                    try:
                        connection.disconnect()
                    except Exception:
                        pass
                    return

                if _has_password_prompt(out1):
                    if i + 1 >= len(password_change_commands):
                        results_list.append([False, device])
                        _emit(True, f"{host} enable prompted for password but secret command is missing")
                        try:
                            connection.disconnect()
                        except Exception:
                            pass
                        return

                    out2 = connection.send_command_timing(password_change_commands[i + 1])
                    if _has_password_prompt(out2):
                        results_list.append([False, device])
                        _diag("enable secret rejected", cmd="<enable_secret>", output=out2)
                        try:
                            connection.disconnect()
                        except Exception:
                            pass
                        return
                    i += 2
                else:
                    if i + 1 < len(password_change_commands) and password_change_commands[i + 1] == enable_current:
                        i += 2
                    else:
                        i += 1
                continue

            out = connection.send_command_timing(cmd)

            if cmd_low == "conf t" and _is_invalid_input(out):
                results_list.append([False, device])
                _emit(True, f"{host} 'conf t' rejected; likely not privileged (enable secret mismatch). out={_snip(_redact_text(out), 240)}")
                try:
                    connection.disconnect()
                except Exception:
                    pass
                return

            if _is_invalid_input(out):
                results_list.append([False, device])
                _diag("command soft-failure", cmd=_redact_text(cmd_strip), output=out)
                try:
                    connection.disconnect()
                except Exception:
                    pass
                return

            i += 1

        _emit(False, f'{host} password change commands sent successfully')

    except Exception as e:
        results_list.append([False, device])
        _diag("password change failed", exc=e)
        try:
            connection.disconnect()
        except Exception:
            pass
        return

    #Exit configuration mode
    try:
        connection.exit_config_mode()
        _emit(False, f'{host} exited from config mode successfully')
    except Exception as e:
        results_list.append([False, device])
        _diag("exit from config mode failed", exc=e)
        try:
            connection.disconnect()
        except Exception:
            pass
        return

    #Save configuration changes
    try:
        connection.save_config()
    except Exception as e:
        results_list.append([False, device])
        _diag("config changes failed to save", exc=e)
        try:
            connection.disconnect()
        except Exception:
            pass
        return
    finally:
        try:
            connection.disconnect()
        except Exception:
            pass

    # --- Post-change validation (fresh auth with NEW password + NEW enable, CONF T probe) ---
    v_ok, v_detail = validate_WLC_password(
        host, username, new_password,
        device_type=device_type, banner_timeout=banner_timeout,
        enable_secret=new_password, probe_enable=True
    )
    if not v_ok:
        results_list.append([False, device])
        _emit(True, f'{host} password change validation failed: {v_detail}')
        return

    results_list.append([True, device])
    _emit(True, f'{host} config changes saved successfully')
    return
    
#Change a given cisco_ftd device password
def change_cisco_ftd_password(device, credentials, new_password, enable_secret = '', window = None):
    
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': device[2],
        'host': device[0],
        'username': 'admin',
        'password': enable_secret,
    }
    
    password_change_commands = []
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    password_change_commands = [sub.replace('current_enable', enable_secret) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        for command in password_change_commands:
            connection.send_command_timing(command)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes saved successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes failed to save with exception: {e}'))
        return
    
#Change a given juniper_junos device password
def change_juniper_junos_password(device, credentials, new_password, enable_secret = '', window = None):
    
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': device[2],
        'host': device[0],
        'username': credentials[0],
        'password': credentials[1],
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        for command in password_change_commands:
            connection.send_command_timing(command)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes saved successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes failed to save with exception: {e}'))
        return

'''#Change a given F5 device password
def change_F5_password(device, credentials, new_password, enable_secret = '', window = None):
    
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': 'f5_linux_ssh',
        'host': device[0],
        'username': credentials[0],
        'password': credentials[1],
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        output = connection.send_command(password_change_commands[0], expect_string=re.escape("password:"))
        print(output)
        output = connection.send_command(password_change_commands[1], cmd_verify=False, expect_string=re.escape("password:"))
        print(output)
        output = connection.send_command_timing(password_change_commands[2], cmd_verify=False)
        print(output)
        output = connection.send_command(password_change_commands[3], expect_string=re.escape("password:"))
        print(output) 
        output = connection.send_command(password_change_commands[4], cmd_verify=False, expect_string=re.escape("password:"))
        print(output)
        output = connection.send_command_timing(password_change_commands[5], cmd_verify=False)
        print(output)
        output = connection.send_command_timing(password_change_commands[6])
        print(output)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes saved successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes failed to save with exception: {e}'))
        return'''

def validate_gigamon_password(host, username, password, verify=False, timeout=20):
    """
    Netmiko-based validation: open a *fresh* session with the supplied password and run a minimal safe check.
    Must not raise; returns (ok: bool, detail: str). Secrets must be redacted.
    """
    def _snip(text, limit=260):
        try:
            s = "" if text is None else str(text)
        except Exception:
            return "<unprintable>"
        s = " ".join(s.split())
        return (s[:limit] + "…") if len(s) > limit else s

    def _redact(s):
        try:
            out = "" if s is None else str(s)
        except Exception:
            return "<unprintable>"
        if password:
            out = out.replace(password, "***")
        # Best-effort redaction of obvious secrets (no new deps)
        for key in ("Authorization", "Cookie", "Set-Cookie", "X-Auth", "X-Token", "token"):
            out = out.replace(key, key)  # no-op, keeps intent explicit
        return _snip(out)

    def _bucket_exc(exc):
        name = type(exc).__name__
        msg = _redact(exc)
        # Bucket by common Netmiko/Paramiko exception class names without importing new deps
        if "Authentication" in name:
            bucket = "auth"
        elif "Timeout" in name:
            bucket = "timeout"
        elif "SSHException" in name:
            bucket = "ssh"
        else:
            bucket = "error"
        return bucket, f"{name}: {msg}"

    try:
        cfg = {
            "device_type": "generic_termserver",
            "host": host,
            "username": username,
            "password": password,
        }
        # Best-effort timeouts (do not increase existing timeouts; these were missing here)
        for k in ("timeout", "conn_timeout"):
            try:
                cfg[k] = timeout
            except Exception:
                pass

        conn = ConnectHandler(**cfg)
        try:
            # Minimal safe check: prompt retrieval (no config changes)
            try:
                prompt = conn.find_prompt()
                prompt = _snip(prompt, 120)
            except Exception as e:
                # Session established but prompt check failed; treat as validation failure (auth/session not healthy)
                bucket, detail = _bucket_exc(e)
                try:
                    conn.disconnect()
                except Exception:
                    pass
                return False, f"authenticated but prompt-check failed ({bucket}): {detail}"

            try:
                conn.disconnect()
            except Exception:
                pass
            return True, f"authenticated (netmiko session established), prompt={prompt}"
        except Exception as e:
            try:
                conn.disconnect()
            except Exception:
                pass
            bucket, detail = _bucket_exc(e)
            return False, f"auth/session failed ({bucket}): {detail}"
    except Exception as e:
        bucket, detail = _bucket_exc(e)
        return False, f"auth failed ({bucket}): {detail}"


# Change a given gigamon device password
def change_gigamon_password(device, credentials, new_password, enable_secret='', window=None):

    def _emit(done_flag, message):
        # Preserve existing behavior (window event); add best-effort console output when no window
        if window is not None:
            window.write_event_value('-ThreadProgress-', (done_flag, message))
        else:
            try:
                print(message)
            except Exception:
                pass

    def _snip(text, limit=260):
        try:
            s = "" if text is None else str(text)
        except Exception:
            return "<unprintable>"
        # Collapse whitespace/newlines so Netmiko multi-line errors don't spam output
        s = " ".join(s.split())
        return (s[:limit] + "…") if len(s) > limit else s

    def _redact_text(s):
        try:
            out = "" if s is None else str(s)
        except Exception:
            return "<unprintable>"
        if new_password:
            out = out.replace(new_password, "***")
        if enable_secret:
            out = out.replace(enable_secret, "***")
        return out

    def _diag_netmiko(stage, exc=None, output=None, prompt=None, ctx=None):
        """
        Concise diagnostics for Netmiko stages.
        - No secrets (best-effort redaction).
        - Includes host/device_type context when available.
        """
        host = None
        dtype = None
        try:
            host = (ctx or {}).get("host") or device[0]
            dtype = (ctx or {}).get("device_type")
        except Exception:
            host = None
            dtype = None

        parts = [f"[netmiko:{stage}]"]
        if host:
            parts.append(f"host={host}")
        if dtype:
            parts.append(f"device_type={dtype}")

        if prompt is not None:
            parts.append(f"prompt={_snip(_redact_text(prompt), 120)}")

        if exc is not None:
            name = type(exc).__name__
            msg = _snip(_redact_text(exc))
            # Bucket without importing new deps
            if "Authentication" in name:
                bucket = "auth"
            elif "Timeout" in name:
                bucket = "timeout"
            elif "SSHException" in name:
                bucket = "ssh"
            else:
                bucket = "error"
            parts.append(f"exc_bucket={bucket}")
            parts.append(f"exc={name}: {msg}")

        if output is not None:
            parts.append(f"output={_snip(_redact_text(output), 320)}")

        return " ".join(parts)

    def _classify_cli_failure(output):
        """
        Detect common failure indicators in CLI output.
        Returns (is_failure: bool, reason: str|None).
        Conservative: used for diagnostics only; success is still gated by new-password validation.
        """
        if output is None:
            return False, None
        try:
            s = str(output)
        except Exception:
            return False, None
        s_l = " ".join(s.split()).lower()
        # Common failure tokens (vendor-agnostic)
        needles = [
            "invalid", "denied", "not permitted", "permission", "error", "failed",
            "failure", "incomplete", "unknown command", "bad", "unauthorized",
            "forbidden", "not found", "refused",
        ]
        for n in needles:
            if n in s_l:
                return True, f"matched '{n}'"
        return False, None

    def _fmt_exc(stage, exc):
        return f"{stage} exception: {type(exc).__name__}: {_snip(_redact_text(exc))}"

    def _redact_command_list(cmds):
        redacted = []
        for c in cmds or []:
            s = _redact_text(c)
            lowered = s.lower()
            # Best-effort: redact token immediately following 'password'
            if " password " in lowered:
                parts = s.split()
                for i, tok in enumerate(parts[:-1]):
                    if tok.lower() == "password":
                        parts[i + 1] = "***"
                s = " ".join(parts)
            redacted.append(s)
        return redacted

    # Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': 'generic_termserver',
        'host': device[0],
        'username': 'admin',
        'password': enable_secret,  # (behavior preserved)
    }

    if device[0] == '10.97.4.14':
        netmiko_config['password'] = 'Erie123456!!..'  # (behavior preserved)

    # Add best-effort timeouts if missing (does not increase existing values; they were absent)
    for k in ("timeout", "conn_timeout"):
        if k not in netmiko_config:
            try:
                netmiko_config[k] = 20
            except Exception:
                pass

    logging.basicConfig(filename="netmiko_debug.log")
    logger = logging.getLogger("netmiko")

    password_change_commands = pull_commands_by_device_type(device[2])
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    password_change_commands = [sub.replace('current_enable', enable_secret) for sub in password_change_commands]

    # Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])

        auth_source = "enable_secret" if device[0] != "10.97.4.14" else "hardcoded override"
        _emit(True, f"{device[0]} failed to connect ({auth_source} used for SSH password): "
                    f"{_diag_netmiko('connect', exc=e, ctx=netmiko_config)}")
        return

    # Send password change commands
    collected_outputs = []  # for diagnostics only; does not change external behavior
    try:
        if device[0] == '10.1.1.79':
            time.sleep(10)
            temp_commands = [
                'enable',
                'conf t',
                'username admin password new_password',
                'current_enable',
                'write mem'
            ]
            temp_commands = [sub.replace('new_password', new_password) for sub in temp_commands]
            temp_commands = [sub.replace('current_enable', enable_secret) for sub in temp_commands]

            print(_redact_command_list(temp_commands))
            for command in temp_commands:
                out = connection.send_command_timing(command)
                print(_redact_text(out))  # preserve printing side effect (now redacted)
                collected_outputs.append((command, out))
        else:
            print(_redact_command_list(password_change_commands))
            for command in password_change_commands:
                out = connection.send_command_timing(command)
                collected_outputs.append((command, out))

        # Soft-failure diagnostics (do not alter command flow; final success still gated by validation)
        for cmd, out in collected_outputs:
            is_fail, reason = _classify_cli_failure(out)
            if is_fail:
                _emit(False, f"{device[0]} possible CLI failure detected ({reason}) "
                             f"for cmd='{_snip(_redact_text(cmd), 120)}': "
                             f"{_diag_netmiko('command_output', output=out, ctx=netmiko_config)}")
                # Do not return here; validation with NEW password is authoritative.

        _emit(False, f'{device[0]} password change commands sent successfully')

    except Exception as e:
        try:
            # Best-effort prompt capture for diagnostics
            try:
                p = connection.find_prompt()
            except Exception:
                p = None
            _emit(False, f"{device[0]} { _diag_netmiko('command_send', exc=e, prompt=p, ctx=netmiko_config) }")
        except Exception:
            pass

        try:
            connection.disconnect()
        except Exception:
            pass
        results_list.append([False, device])
        _emit(True, f'{device[0]} password change failed with {_fmt_exc("command_send", e)}')
        return

    # Disconnect + validate NEW password before reporting success
    try:
        connection.disconnect()
    except Exception as e:
        results_list.append([False, device])
        _emit(True, f'{device[0]} config changes failed to save with {_fmt_exc("disconnect", e)}')
        return

    ok, detail = validate_gigamon_password(
        host=device[0],
        username='admin',
        password=new_password,
        verify=False,
        timeout=20,
    )

    if not ok:
        results_list.append([False, device])
        _emit(True, f'{device[0]} password change reported success but validation failed: {_snip(detail)}')
        return

    results_list.append([True, device])
    _emit(True, f'{device[0]} config changes saved successfully (validated with new password)')
    return

#Change a given lantronix device password
def change_lantronix_password(device, credentials, new_password, enable_secret = '', window = None):
    
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': 'generic_termserver',
        'host': device[0],
        'username': 'sysadmin',
        'password': enable_secret,
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        for command in password_change_commands:
            connection.send_command_timing(command)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes saved successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes failed to save with exception: {e}'))
        return

# Change a given WTI device password
def change_WTI_password(device, credentials, new_password, enable_secret='', window=None):
    timeout = 20
    base_path = "/api/v2/config/users"
    url = f"https://{device[0]}{base_path}"

    username = "sysadmin"
    current_password = enable_secret  # confirm this is truly the current sysadmin password

    payload = {
        "users": {
            "username": username,
            "newpasswd": new_password,
        }
    }

    headers = {"Content-Type": "application/json"}

    try:
        resp = requests.put(
            url,
            json=payload,
            headers=headers,
            timeout=timeout,
            auth=(username, current_password),
            verify=False,
        )

        if resp.status_code == 200:
            try:
                dstatus = resp.json().get("status")
            except ValueError:
                dstatus = None

            results_list.append([True, device])
            if window is not None:
                window.write_event_value(
                    "-ThreadProgress-",
                    (True, f"{device[0]} password change OK (200){' status=' + str(dstatus) if dstatus else ''}")
                )
            return

        # Failure diagnostics
        diag = resp.text.strip()
        www_auth = resp.headers.get("WWW-Authenticate")
        results_list.append([False, device])
        if window is not None:
            window.write_event_value(
                "-ThreadProgress-",
                (True, f"{device[0]} password change FAILED ({resp.status_code}). "
                       f"{'WWW-Authenticate=' + www_auth + '. ' if www_auth else ''}"
                       f"Body: {diag[:500]}")
            )
        return

    except SSLError as e:
        results_list.append([False, device])
        if window is not None:
            window.write_event_value(
                "-ThreadProgress-",
                (True, f"{device[0]} TLS/SSL negotiation failed: {e}")
            )
        return

    except requests.exceptions.Timeout as e:
        results_list.append([False, device])
        if window is not None:
            window.write_event_value("-ThreadProgress-", (True, f"{device[0]} timed out: {e}"))
        return

    except requests.exceptions.ConnectionError as e:
        results_list.append([False, device])
        if window is not None:
            window.write_event_value("-ThreadProgress-", (True, f"{device[0]} connection error: {e}"))
        return

    except requests.exceptions.RequestException as e:
        results_list.append([False, device])
        if window is not None:
            window.write_event_value("-ThreadProgress-", (True, f"{device[0]} request failed: {e}"))
        return

#Change a given F5 device password
def change_F5_password(device, credentials, new_password, enable_secret = '', window = None):
    sURL = ""
    URI = "https://"
    HOST_NAME = device[0]
    usernames = ['admin', 'root']
    PASSWORD = enable_secret
    VERIFY = False

    '''#Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': 'f5_linux_ssh',
        'host': device[0],
        'username': username,
        'password': PASSWORD,
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Send password change commands
    try:
        
        for command in password_change_commands:
            output = connection.send_command_timing(command, strip_command=False, strip_prompt=False)
            print(output)
            
        output = connection.send_command(password_change_commands[0], expect_string=r"#")
        print(output)
        output = connection.send_command(password_change_commands[1], expect_string=r"password:")
        print(output)
        output = connection.write_channel(password_change_commands[2])
        print(output)
        time.sleep(1)
        output = connection.write_channel(password_change_commands[3])
        print(output)
        time.sleep(1)
        output = connection.send_command(password_change_commands[4], expect_string=r"password:")
        print(output) 
        output = connection.write_channel(password_change_commands[5])
        print(output)
        time.sleep(1)
        output = connection.write_channel(password_change_commands[6])
        print(output)
        time.sleep(1)
        output = connection.send_command(password_change_commands[7], expect_string=r"#")
        print(output)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.disconnect()
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes saved successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes failed to save with exception: {e}'))
        return'''
    # Assemble the full sURL
    login_path = "/mgmt/shared/authn/login"
    login_URL = URI+HOST_NAME+login_path

    # Assemble the JSON load to PUT to the f5 device
    login_payload = {
        "username": usernames[0],
        "password": PASSWORD,
        "loginProviderName": "tmos"
        }
    login_headers = {
        'Content-Type': 'application/json'
    }

    try:
        # Put request is for editing, login with the old password
        response = requests.post(login_URL, json=login_payload, headers=login_headers, verify=VERIFY)
        if (response.status_code == 200):
            token = response.json().get('token').get('token')
            if window != None:
                window.write_event_value('-ThreadProgress-', (False, f'{device[0]} successfully logged in with status code: {response.status_code}'))
        else:
            results_list.append([False, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to login with status code: {response.status_code}'))
            return

    except requests.exceptions.HTTPError as errh:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
        return
    except requests.exceptions.ConnectionError as errc:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
        return
    except requests.exceptions.Timeout as errt:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
        return
    except requests.exceptions.RequestException as err:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
        return

    # Assemble the full sURL
    password_change_path = "/mgmt/tm/auth/user/"
    password_change_URL = URI+HOST_NAME+password_change_path+usernames[0]
    
    # Assemble the JSON load to PUT to the ACI device
    password_change_payload = {
        "password": new_password
        }

    password_change_headers = {
        "Content-Type": "application/json",
        "X-F5-Auth-Token": token
    }
    
    try:
        # Put request is for editing, login with the old password
        response = requests.patch(password_change_URL, json=password_change_payload, headers=password_change_headers, verify=VERIFY)
        if (response.status_code == 200):
            parsed_json = response.json()
            if window != None:
                window.write_event_value('-ThreadProgress-', (False, f'{device[0]} successfully changed admin password with status code: {response.status_code}'))
        else:
            results_list.append([False, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to change admin password with status code: {response.status_code}'))
            return

    except requests.exceptions.HTTPError as errh:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
        return
    except requests.exceptions.ConnectionError as errc:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
        return
    except requests.exceptions.Timeout as errt:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
        return
    except requests.exceptions.RequestException as err:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
        return
    
    # Assemble the full sURL
    password_change_path = "/mgmt/shared/authn/"
    password_change_URL = URI+HOST_NAME+password_change_path+usernames[1]
    
    # Assemble the JSON load to PUT to the ACI device
    password_change_payload = {
        "oldPassword": PASSWORD,
        "newPassword": new_password
        }

    password_change_headers = {
        "Content-Type": "application/json",
        "X-F5-Auth-Token": token
    }
    
    try:
        # Put request is for editing, login with the old password
        response = requests.post(password_change_URL, json=password_change_payload, headers=password_change_headers, verify=VERIFY)
        if (response.status_code == 200):
            parsed_json = response.json()
            if window != None:
                window.write_event_value('-ThreadProgress-', (False, f'{device[0]} successfully root changed password with status code: {response.status_code}'))
        else:
            results_list.append([False, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to change root password with status code: {response.status_code}'))
            return

    except requests.exceptions.HTTPError as errh:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
        return
    except requests.exceptions.ConnectionError as errc:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
        return
    except requests.exceptions.Timeout as errt:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
        return
    except requests.exceptions.RequestException as err:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
        return
    
    # Assemble the full sURL
    get_device_group_path = "/mgmt/tm/cm/device-group"
    get_device_group_URL = URI+HOST_NAME+get_device_group_path

    get_device_group_headers = {
        "Content-Type": "application/json",
        "X-F5-Auth-Token": token
    }
    
    try:
        # Put request is for editing, login with the old password
        response = requests.get(get_device_group_URL, headers=get_device_group_headers, verify=VERIFY)
        if (response.status_code == 200):
            device_groups = response.json().get('items', [])
            if device_groups:
                device_group_name = device_groups[0]['name']
                if window != None:
                    window.write_event_value('-ThreadProgress-', (False, f'{device[0]} successfully pulled device group name with status code: {response.status_code}'))
            else:
                results_list.append([True, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} no device group found for device with status code: {response.status_code}'))
                return
        else:
            results_list.append([False, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to pull device group name with status code: {response.status_code}'))
            return

    except requests.exceptions.HTTPError as errh:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
        return
    except requests.exceptions.ConnectionError as errc:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
        return
    except requests.exceptions.Timeout as errt:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
        return
    except requests.exceptions.RequestException as err:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
        return
    
    # Assemble the full sURL
    password_sync_path = "/mgmt/tm/cm/config-sync"
    password_sync_URL = URI+HOST_NAME+password_sync_path
    
    # Assemble the JSON load to PUT to the ACI device
    password_sync_payload = {
        "command": "run",
        "options": [
            {
                "to-group": device_group_name
            }
        ]
    }

    password_sync_headers = {
        "Content-Type": "application/json",
        "X-F5-Auth-Token": token
    }
    
    try:
        # Put request is for editing, login with the old password
        response = requests.post(password_sync_URL, json=password_sync_payload, headers=password_sync_headers, verify=VERIFY)
        if (response.status_code == 200):
            parsed_json = response.json()
            results_list.append([True, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} successfully synced password with status code: {response.status_code}'))
            return
        else:
            results_list.append([False, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to sync password with status code: {response.status_code}'))
            return

    except requests.exceptions.HTTPError as errh:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
        return
    except requests.exceptions.ConnectionError as errc:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
        return
    except requests.exceptions.Timeout as errt:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
        return
    except requests.exceptions.RequestException as err:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
        return

def _set_f5_last_change(host, username, token, verify, window=None):
    base = f"https://{host}:8888/restconf/data/openconfig-system:system/aaa/authentication/users/user={username}/config"
    headers = {"Content-Type": "application/yang-data+json", "X-Auth-Token": token}

    today = datetime.date.today()
    payload_date = {"openconfig-system:last-change": today.isoformat()}
    payload_days = {"openconfig-system:last-change": (today - datetime.date(1970, 1, 1)).days}

    # Try F5OS-A style first (YYYY-MM-DD), fall back to F5OS-C style (days since epoch)
    r = requests.patch(base, json=payload_date, headers=headers, verify=verify)
    if r.status_code in (200, 204):
        return True

    r2 = requests.patch(base, json=payload_days, headers=headers, verify=verify)
    return r2.status_code in (200, 204)

#Change a given F5_oshost device password
def change_F5_oshost_password(device, credentials, new_password, enable_secret = '', window = None):
    URI = "https://"
    HOST_NAME = device[0]
    usernames = ['admin', 'root']
    PASSWORD = enable_secret
    VERIFY = False

    temp_pass = 'gawfcv93674!'
    passwords = [temp_pass, new_password]
    
    for username in usernames:
        temp_set_check = False
        for password in passwords:
            # Assemble the full sURL
            login_path = ":8888/restconf/data/openconfig-system:system/aaa"
            login_URL = URI+HOST_NAME+login_path

            login_headers = {
                'Content-Type': 'application/json'
            }

            try:
                if temp_set_check:
                    response = requests.get(login_URL, auth=HTTPBasicAuth(username, temp_pass), headers=login_headers, verify=VERIFY)
                else:
                    response = requests.get(login_URL, auth=HTTPBasicAuth(username, PASSWORD), headers=login_headers, verify=VERIFY)
                if (response.status_code == 200):
                    token = response.headers.get('x-auth-token')
                    if window != None:
                        window.write_event_value('-ThreadProgress-', (False, f'{device[0]} successfully logged in with status code: {response.status_code}'))
                else:
                    results_list.append([False, device])
                    if window != None:
                        window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to login with status code: {response.status_code}'))
                    return

            except requests.exceptions.HTTPError as errh:
                results_list.append([False, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
                return
            except requests.exceptions.ConnectionError as errc:
                results_list.append([False, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
                return
            except requests.exceptions.Timeout as errt:
                results_list.append([False, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
                return
            except requests.exceptions.RequestException as err:
                results_list.append([False, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
                return
            
            # Assemble the full sURL
            password_change_path = f":8888/restconf/operations/openconfig-system:system/aaa/authentication/users/user={username}/config/change-password"
            password_change_URL = URI+HOST_NAME+password_change_path
            
            # Assemble the JSON load to POST to the F5_oshost device
            if temp_set_check:
                password_change_payload = {
                    "input": [
                        {
                            "old-password": temp_pass,
                            "new-password": password,
                            "confirm-password": password
                        }
                    ]
                }
            else:
                password_change_payload = {
                    "input": [
                        {
                            "old-password": PASSWORD,
                            "new-password": password,
                            "confirm-password": password
                        }
                    ]
                }

            password_change_headers = {
                "Content-Type": "application/yang-data+json",
                "X-Auth-Token": token
            }
            
            try:
                # Put request is for editing, login with the old password
                response = requests.post(password_change_URL, json=password_change_payload, headers=password_change_headers, verify=VERIFY)
                if (response.status_code in [200, 204]):
                    if username == 'root' and temp_set_check == True: 
                        results_list.append([True, device])
                        if window != None:
                            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} successfully changed {username} password with status code: {response.status_code}'))
                    else:
                        if window != None:
                            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} successfully changed {username} password with status code: {response.status_code}'))
                    temp_set_check = True
                    # Avoid "must change password on next login" by updating last-change
                    _set_f5_last_change(HOST_NAME, username, token, VERIFY, window=window)
                else:
                    results_list.append([False, device])
                    if window != None:
                        window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to change {username} password with status code: {response.status_code}'))
                    return

            except requests.exceptions.HTTPError as errh:
                results_list.append([False, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
                return
            except requests.exceptions.ConnectionError as errc:
                results_list.append([False, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
                return
            except requests.exceptions.Timeout as errt:
                results_list.append([False, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
                return
            except requests.exceptions.RequestException as err:
                results_list.append([False, device])
                if window != None:
                    window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
                return
            time.sleep(5)
        

import json

import requests
from requests.exceptions import SSLError


def validate_APIC_password(host, username, password, verify=False, timeout=20):
    """
    Validate APIC credentials by performing an APIC login against /api/aaaLogin.json.
    Returns (ok: bool, detail: str). Never raises.
    Secrets (password/token/cookies) are never returned in detail.
    """
    base = f"https://{host}"
    login_url = f"{base}/api/aaaLogin.json"

    def _snip(text: str, limit: int = 500) -> str:
        t = (text or "").strip()
        return t if len(t) <= limit else (t[:limit] + "…(truncated)")

    def _aci_error_from_json(resp_json) -> str | None:
        # Common APIC error shape:
        # {"imdata":[{"error":{"attributes":{"code":"401","text":"...","severity":"..."}}}],"totalCount":"1"}
        try:
            imdata = resp_json.get("imdata") or []
            if not imdata:
                return None
            first = imdata[0]
            if "error" in first:
                attrs = (first["error"].get("attributes") or {})
                code = attrs.get("code")
                text = attrs.get("text")
                sev = attrs.get("severity")
                parts = [p for p in [code and f"code={code}", sev and f"severity={sev}", text and f"text={text}"] if p]
                return "ACI error: " + ", ".join(parts) if parts else "ACI error (unparsed attributes)"
            return None
        except Exception:
            return None

    payload = {
        "aaaUser": {
            "attributes": {
                "name": username,
                "pwd": password,  # do not log
            }
        }
    }

    session = requests.Session()
    session.verify = verify

    try:
        resp = session.post(login_url, json=payload, timeout=timeout)
    except requests.exceptions.SSLError as e:
        return (False, f"validate login SSL error: {e}")
    except requests.exceptions.Timeout as e:
        return (False, f"validate login timeout: {e}")
    except requests.exceptions.ConnectionError as e:
        return (False, f"validate login connection error: {e}")
    except requests.exceptions.RequestException as e:
        return (False, f"validate login request error: {e}")
    except Exception as e:
        return (False, f"validate login unexpected error: {e}")

    if resp.status_code != 200:
        www_auth = resp.headers.get("WWW-Authenticate")
        allow = resp.headers.get("Allow")
        hdr_bits = []
        if www_auth:
            hdr_bits.append(f"WWW-Authenticate={_snip(www_auth, 200)}")
        if allow:
            hdr_bits.append(f"Allow={_snip(allow, 200)}")
        hdr = (" | " + " | ".join(hdr_bits)) if hdr_bits else ""
        return (False, f"validate login HTTP {resp.status_code} {resp.reason}{hdr} | body={_snip(resp.text)}")

    # Soft-failure detection + token parse
    try:
        rj = resp.json()
    except ValueError:
        return (False, f"validate login HTTP 200 but non-JSON body={_snip(resp.text)}")

    aci_err = _aci_error_from_json(rj)
    if aci_err:
        return (False, f"validate login HTTP 200 but {aci_err}")

    try:
        _ = rj["imdata"][0]["aaaLogin"]["attributes"]["token"]
    except Exception as e:
        # Token missing implies auth didn't complete as expected.
        return (False, f"validate login HTTP 200 but token parse failed: {e}")

    return (True, "validate login OK")


def change_APIC_password(device, credentials, new_password, enable_secret='', window=None):
    timeout = 20
    host = device[0]
    base = f"https://{host}"
    verify = False

    # NOTE: This looks like a fallback realm format; keep as-is if it's correct in your env.
    username = r"apic:fallback\admin"
    old_password = enable_secret  # your current password for admin (used for login + oldPassword)

    def _emit(is_done: bool, msg: str) -> None:
        if window is not None:
            window.write_event_value("-ThreadProgress-", (is_done, msg))

    def _snip(text: str, limit: int = 800) -> str:
        t = (text or "").strip()
        return t if len(t) <= limit else (t[:limit] + "…(truncated)")

    def _aci_error_from_json(resp_json) -> str | None:
        """
        APIC commonly returns:
          {"imdata":[{"error":{"attributes":{"code":"401","text":"...","severity":"..."}}}],"totalCount":"1"}
        """
        try:
            imdata = resp_json.get("imdata") or []
            if not imdata:
                return None
            first = imdata[0]
            if "error" in first:
                attrs = (first["error"].get("attributes") or {})
                code = attrs.get("code")
                text = attrs.get("text")
                sev = attrs.get("severity")
                parts = [p for p in [code and f"code={code}", sev and f"severity={sev}", text and f"text={text}"] if p]
                return "ACI error: " + ", ".join(parts) if parts else "ACI error (unparsed attributes)"
            return None
        except Exception:
            return None

    def _diag_response(stage: str, resp: requests.Response) -> str:
        # Best-effort body (JSON compact if possible) + APIC embedded error extraction.
        aci_err = None
        body_snip = ""
        try:
            rj = resp.json()
            aci_err = _aci_error_from_json(rj)
            body_snip = _snip(json.dumps(rj, separators=(",", ":"), ensure_ascii=False))
        except ValueError:
            body_snip = _snip(resp.text)

        # Redact sensitive headers. Never log Cookie/Set-Cookie values (tokens/session ids).
        www_auth = resp.headers.get("WWW-Authenticate")
        allow = resp.headers.get("Allow")
        set_cookie_present = "Set-Cookie" in resp.headers

        extra = []
        if aci_err:
            extra.append(aci_err)
        if www_auth:
            extra.append(f"WWW-Authenticate={_snip(www_auth, 200)}")
        if allow:
            extra.append(f"Allow={_snip(allow, 200)}")
        if set_cookie_present:
            extra.append("Set-Cookie=***")

        extra_str = (" | " + " | ".join(extra)) if extra else ""
        return f"{host} {stage} FAILED ({resp.status_code} {resp.reason}). Body: {body_snip}{extra_str}"

    session = requests.Session()
    session.verify = verify

    # -----------------------
    # 1) Login to get token
    # -----------------------
    login_url = f"{base}/api/aaaLogin.json"
    login_payload = {
        "aaaUser": {
            "attributes": {
                "name": username,
                "pwd": old_password,  # do not log
            }
        }
    }

    try:
        resp = session.post(login_url, json=login_payload, timeout=timeout)
    except requests.exceptions.SSLError as e:
        results_list.append([False, device])
        _emit(True, f"{host} login TLS/SSL negotiation failed: {e}")
        return
    except requests.exceptions.Timeout as e:
        results_list.append([False, device])
        _emit(True, f"{host} login timed out: {e}")
        return
    except requests.exceptions.ConnectionError as e:
        results_list.append([False, device])
        _emit(True, f"{host} login connection error: {e}")
        return
    except requests.exceptions.RequestException as e:
        results_list.append([False, device])
        _emit(True, f"{host} login request failed: {e}")
        return

    if resp.status_code != 200:
        results_list.append([False, device])
        _emit(True, _diag_response("login", resp))
        return

    # Soft-failure detection for login (200 with embedded error)
    try:
        login_json = resp.json()
        login_aci_err = _aci_error_from_json(login_json)
        if login_aci_err:
            results_list.append([False, device])
            _emit(True, f"{host} login returned 200 but indicated error. {login_aci_err}. Body: {_snip(json.dumps(login_json, separators=(',',':')))}")
            return
    except ValueError:
        results_list.append([False, device])
        _emit(True, f"{host} login OK (200) but returned non-JSON body. Body: {_snip(resp.text)}")
        return

    # Parse token (do not log token)
    try:
        auth_token = login_json["imdata"][0]["aaaLogin"]["attributes"]["token"]
    except Exception as e:
        results_list.append([False, device])
        _emit(True, f"{host} login OK (200) but could not parse token: {e}. Body: {_snip(resp.text)}")
        return

    _emit(False, f"{host} login OK (200).")

    # --------------------------------
    # 2) Change self password
    # --------------------------------
    change_url = f"{base}/api/changeSelfPassword.json"
    change_payload = {
        "aaaChangePassword": {
            "attributes": {
                "userName": "admin",
                "oldPassword": old_password,   # do not log
                "newPassword": new_password,   # do not log
            }
        }
    }

    # You can let Session manage cookies; APIC-cookie header also works.
    # Never log this header value (contains token).
    headers = {"Cookie": f"APIC-cookie={auth_token}"}

    try:
        resp = session.post(change_url, json=change_payload, headers=headers, timeout=timeout)
    except requests.exceptions.SSLError as e:
        results_list.append([False, device])
        _emit(True, f"{host} change password TLS/SSL negotiation failed: {e}")
        return
    except requests.exceptions.Timeout as e:
        results_list.append([False, device])
        _emit(True, f"{host} change password timed out: {e}")
        return
    except requests.exceptions.ConnectionError as e:
        results_list.append([False, device])
        _emit(True, f"{host} change password connection error: {e}")
        return
    except requests.exceptions.RequestException as e:
        results_list.append([False, device])
        _emit(True, f"{host} change password request failed: {e}")
        return

    if resp.status_code != 200:
        results_list.append([False, device])
        _emit(True, _diag_response("change password", resp))
        return

    # Sometimes APIC returns 200 with an embedded error; check for it.
    try:
        rj = resp.json()
        aci_err = _aci_error_from_json(rj)
        if aci_err:
            results_list.append([False, device])
            _emit(True, f"{host} change password returned 200 but indicated error. {aci_err}. Body: {_snip(json.dumps(rj, separators=(',',':')))}")
            return
    except ValueError:
        # Non-JSON response; preserve prior behavior: treat HTTP 200 as success path.
        pass

    # --------------------------------
    # 3) Post-change validation (NEW)
    # --------------------------------
    ok, detail = validate_APIC_password(
        host=host,
        username=username,
        password=new_password,  # do not log
        verify=verify,
        timeout=timeout,
    )
    if not ok:
        results_list.append([False, device])
        _emit(True, f"{host} password change reported success (200) but validation failed: {detail}")
        return

    results_list.append([True, device])
    _emit(True, f"{host} successfully changed password (200) and validated new credentials.")
    return
    
#Change a given NDO device password
def change_NDO_password(device, credentials, new_password, enable_secret = '', window = None):
    
    sURL = ""
    URI = "https://"
    HOST_NAME = device[0]
    USERNAME = 'admin'
    PASSWORD = enable_secret
    VERIFY = False

    # Assemble the full sURL
    path = "/login"
    sURL = URI+HOST_NAME+path

    # Assemble the JSON load to PUT to the NDO device
    login_payload = {
        "userName": USERNAME,
        "userPasswd": PASSWORD,
        "domain": "local"
        }

    try:
        # Put request is for editing, login with the old password
        response = requests.post(sURL, json=login_payload, verify=VERIFY)
        if (response.status_code == 200):
            auth_token = response.json().get('token')
            if window != None:
                window.write_event_value('-ThreadProgress-', (False, f'{device[0]} successfully logged in with status code: {response.status_code}'))
        else:
            results_list.append([False, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to login with status code: {response.status_code}'))
            return

    except requests.exceptions.HTTPError as errh:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
        return
    except requests.exceptions.ConnectionError as errc:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
        return
    except requests.exceptions.Timeout as errt:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
        return
    except requests.exceptions.RequestException as err:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
        return
    
    # Assemble the full sURL
    path = "/nexus/infra/api/aaa/v4/localusers/"
    sURL = URI+HOST_NAME+path+'admin'
    
    #Encode base64 password
    password_string_bytes = new_password.encode("ascii")
    base64_password_bytes = base64.b64encode(password_string_bytes)
    base64_password_string = base64_password_bytes.decode("ascii")
    
    # Assemble the JSON load to PUT to the NDO device
    change_pass_payload = {
        "spec": {
            "password": base64_password_string
        }
    }

    headers = {
        "Cookie": f"AuthCookie={auth_token}",
        "Content-Type": "application/json"
    }
    
    try:
        # Put request is for editing, login with the old password
        response = requests.put(sURL, json=change_pass_payload, headers=headers, verify=VERIFY)
        if (response.status_code == 200):
            parsed_json = response.json()
            results_list.append([True, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} successfully changed password with status code: {response.status_code}'))
            return
        else:
            results_list.append([False, device])
            if window != None:
                window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to change password with status code: {response.status_code}'))
            return

    except requests.exceptions.HTTPError as errh:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} http error with exception: {errh}'))
        return
    except requests.exceptions.ConnectionError as errc:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {errc}'))
        return
    except requests.exceptions.Timeout as errt:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} timed out with exception: {errt}'))
        return
    except requests.exceptions.RequestException as err:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed with exception: {err}'))
        return

def validate_Expressway_password(host, username, password, verify=False, timeout=10, base_url=None):
    """
    Validate Expressway credentials by performing a minimal safe authenticated GET.
    Returns (ok: bool, detail: str). Never raises.
    """
    import json

    import requests
    from requests.auth import HTTPBasicAuth

    def _snip(text, limit=800):
        if text is None:
            return ""
        s = str(text)
        return s if len(s) <= limit else (s[:limit] + "...(truncated)")

    def _redact_headers(headers):
        if not headers:
            return {}
        redacted = {}
        for k, v in headers.items():
            lk = str(k).lower()
            if lk in ("authorization", "cookie", "set-cookie") or ("token" in lk) or ("secret" in lk) or ("password" in lk):
                redacted[k] = "***"
            else:
                redacted[k] = _snip(v, 200)
        return redacted

    def _diag_response(stage, resp):
        try:
            hdrs = {}
            for k in ("WWW-Authenticate", "Allow", "Set-Cookie", "Content-Type"):
                if k in resp.headers:
                    hdrs[k] = resp.headers.get(k)
            hdrs = _redact_headers(hdrs)

            body_snip = ""
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "json" in ctype:
                try:
                    body_snip = _snip(json.dumps(resp.json(), separators=(",", ":"), ensure_ascii=True), 900)
                except Exception:
                    body_snip = _snip(resp.text, 900)
            else:
                body_snip = _snip(resp.text, 900)

            return f"{stage}: {resp.status_code} {resp.reason}; headers={hdrs}; body={body_snip}"
        except Exception as e:
            return f"{stage}: unable to format response diag ({type(e).__name__}: {_snip(e, 200)})"

    try:
        # Prefer caller-provided base_url if they have one; otherwise construct from host.
        if base_url is None:
            base_url = f"https://{host}/api"

        # A safe, read-only status endpoint path (does not modify config).
        # Keep it minimal and authenticated with basic auth.
        url = f"{base_url}/status/common/smartlicensing/licensing"

        resp = requests.get(
            url,
            auth=HTTPBasicAuth(username, password),
            headers={"Accept": "application/json"},
            verify=verify,
            timeout=timeout,
        )

        if resp.status_code == 200:
            return True, f"validated via GET {url} -> 200"
        return False, _diag_response("validation", resp)

    except requests.exceptions.SSLError as e:
        return False, f"validation SSL error: {type(e).__name__}: {_snip(e, 200)}"
    except requests.exceptions.Timeout as e:
        return False, f"validation timeout: {type(e).__name__}: {_snip(e, 200)}"
    except requests.exceptions.ConnectionError as e:
        return False, f"validation connection error: {type(e).__name__}: {_snip(e, 200)}"
    except requests.exceptions.RequestException as e:
        return False, f"validation request error: {type(e).__name__}: {_snip(e, 200)}"
    except Exception as e:
        return False, f"validation unexpected error: {type(e).__name__}: {_snip(e, 200)}"


# Change a given Expressway device password
def change_Expressway_password(device, credentials, new_password, enable_secret='', window=None):

    import json

    import requests
    from requests.auth import HTTPBasicAuth

    URI = "https://"
    HOST_NAME = device[0]
    USERNAME = 'admin'
    PASSWORD = enable_secret
    VERIFY = False
    BASE_URL = URI + HOST_NAME + '/api'

    # Assemble the full URL
    path = "/provisioning/common/adminaccount/changepassword"
    password_change_URL = BASE_URL + path

    # Assemble the JSON load to PUT to the NDO device
    change_pass_payload = {
        "Name": USERNAME,
        "Password": new_password,
        "ConfirmPassword": new_password,
        "YourCurrentPassword": PASSWORD
    }

    headers = {
        "Content-Type": "application/json"
    }

    def _snip(text, limit=900):
        if text is None:
            return ""
        s = str(text)
        return s if len(s) <= limit else (s[:limit] + "...(truncated)")

    def _emit(done_flag, message):
        # Preserve existing side effects: window event only (no new prints).
        if window is not None:
            window.write_event_value('-ThreadProgress-', (done_flag, message))

    def _redact_headers(hdrs):
        if not hdrs:
            return {}
        out = {}
        for k, v in hdrs.items():
            lk = str(k).lower()
            if lk in ("authorization", "cookie", "set-cookie") or ("token" in lk) or ("secret" in lk) or ("password" in lk):
                out[k] = "***"
            else:
                out[k] = _snip(v, 200)
        return out

    def _extract_api_error(obj):
        """
        Best-effort extraction of embedded error details from common shapes.
        Returns short string or "".
        """
        try:
            if isinstance(obj, dict):
                # Common keys
                for key in ("error", "errors", "message", "Message", "detail", "details", "reason", "fault"):
                    if key in obj and obj[key]:
                        val = obj[key]
                        if isinstance(val, (dict, list)):
                            return _snip(json.dumps(val, separators=(",", ":"), ensure_ascii=True), 300)
                        return _snip(val, 300)
                # Nested shapes
                if "imdata" in obj and obj["imdata"]:
                    return _snip(json.dumps(obj["imdata"], separators=(",", ":"), ensure_ascii=True), 300)
            elif isinstance(obj, list) and obj:
                return _snip(json.dumps(obj, separators=(",", ":"), ensure_ascii=True), 300)
        except Exception:
            return ""
        return ""

    def _diag_response(stage, response):
        """
        Concise diagnostic: status/reason, selected headers (redacted), body snippet.
        """
        try:
            selected = {}
            for k in ("WWW-Authenticate", "Allow", "Set-Cookie", "Content-Type"):
                if k in response.headers:
                    selected[k] = response.headers.get(k)
            selected = _redact_headers(selected)

            ctype = (response.headers.get("Content-Type") or "").lower()
            body_snip = ""
            embedded_err = ""
            if "json" in ctype:
                try:
                    obj = response.json()
                    body_snip = _snip(json.dumps(obj, separators=(",", ":"), ensure_ascii=True), 1000)
                    embedded_err = _extract_api_error(obj)
                except Exception as e:
                    body_snip = _snip(response.text, 1000)
                    embedded_err = f"json_parse_error={type(e).__name__}: {_snip(e, 150)}"
            else:
                body_snip = _snip(response.text, 1000)

            extra = f"; embedded_error={embedded_err}" if embedded_err else ""
            return f"{stage}: {response.status_code} {response.reason}; headers={selected}; body={body_snip}{extra}"
        except Exception as e:
            return f"{stage}: unable to format response diag ({type(e).__name__}: {_snip(e, 200)})"

    try:
        # Put request is for editing, login with the old password
        response = requests.put(
            password_change_URL,
            json=change_pass_payload,
            auth=HTTPBasicAuth(USERNAME, PASSWORD),
            headers=headers,
            verify=VERIFY,
            timeout=10,  # Added (was missing). Keep modest; do not increase existing timeouts.
        )

        if response.status_code == 200:
            # Parse JSON with diagnostics (previous code could raise here and escape)
            parsed_json = None
            embedded_err = ""
            try:
                parsed_json = response.json()
                embedded_err = _extract_api_error(parsed_json)
            except Exception as e:
                results_list.append([False, device])
                _emit(True, f"{device[0]} failed to change password: invalid JSON response ({type(e).__name__}) :: {_diag_response('password_change', response)}")
                return

            # Soft-failure detection: HTTP 200 but body indicates error.
            if embedded_err:
                results_list.append([False, device])
                _emit(True, f"{device[0]} failed to change password: API returned error despite 200 ({embedded_err})")
                _emit(True, f"{device[0]} diag :: {_diag_response('password_change', response)}")
                return

            # Post-change validation: authenticate with the NEW password before reporting success.
            ok, detail = validate_Expressway_password(
                host=HOST_NAME,
                username=USERNAME,
                password=new_password,
                verify=VERIFY,
                timeout=10,
                base_url=BASE_URL,
            )

            if not ok:
                results_list.append([False, device])
                _emit(True, f"{device[0]} password change may not have taken effect: validation failed ({detail})")
                return

            results_list.append([True, device])
            _emit(True, f"{device[0]} successfully changed password with status code: {response.status_code} (validated)")
            return

        else:
            results_list.append([False, device])
            _emit(True, f"{device[0]} failed to change password with status code: {response.status_code}")
            _emit(True, f"{device[0]} diag :: {_diag_response('password_change', response)}")
            return

    except requests.exceptions.SSLError as e:
        results_list.append([False, device])
        _emit(True, f"{device[0]} SSL error: {type(e).__name__}: {_snip(e, 200)}")
        return
    except requests.exceptions.Timeout as e:
        results_list.append([False, device])
        _emit(True, f"{device[0]} timed out with exception: {type(e).__name__}: {_snip(e, 200)}")
        return
    except requests.exceptions.ConnectionError as e:
        results_list.append([False, device])
        _emit(True, f"{device[0]} failed to connect with exception: {type(e).__name__}: {_snip(e, 200)}")
        return
    except requests.exceptions.RequestException as e:
        results_list.append([False, device])
        _emit(True, f"{device[0]} failed with exception: {type(e).__name__}: {_snip(e, 200)}")
        return
    except Exception as e:
        results_list.append([False, device])
        _emit(True, f"{device[0]} unexpected error: {type(e).__name__}: {_snip(e, 200)}")
        return

#Change a given cimc device password
def change_cimc_password(device, credentials, new_password, enable_secret = '', window = None):
    
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': 'cisco_ios',
        'host': device[0],
        'username': 'admin',
        'password': enable_secret,
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        for command in password_change_commands:
            connection.send_command_timing(command)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes saved successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes failed to save with exception: {e}'))
        return

#Change a given cisco_asa device password
def change_cisco_asa_password(device, credentials, new_password, enable_secret = '', window = None):
    
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': device[2],
        'host': device[0],
        'username': credentials[0],
        'password': credentials[1],
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Enter enable
    try:
        connection.enable()
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to enter enable: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        connection.send_config_set(password_change_commands)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Exit configuration mode
    try:
        connection.exit_config_mode()
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} exited from config mode successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} exit from config mode failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.save_config()
            
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes saved successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} config changes failed to save with exception: {e}'))
        return

#Change a given cisco_xr device password
def change_cisco_xr_password(device, credentials, new_password, enable_secret = '', window = None):
    
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': device[2],
        'host': device[0],
        'username': credentials[0],
        'password': credentials[1],
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Enter enable
    try:
        connection.enable()
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to enter enable: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        connection.send_config_set(password_change_commands)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Exit configuration mode
    try:
        connection.exit_config_mode()
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} exited from config mode successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} exit from config mode failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} disconnected successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} disconnection failed with exception: {e}'))
        return

#Changes password of a given cisco_xe device
def change_cisco_xe_password(device, credentials, new_password, enable_secret, window):
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': device[2],
        'host': device[0],
        'username': credentials[0],
        'password': credentials[1],
        'secret': enable_secret,
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Pull vty range
    try:
        vty_range = get_vty_range(credentials[0], credentials[1], enable_secret, device[0])
        if vty_range == None:
            raise('Failure to connect')
        
        #Swap in the vty ranges in commands
        password_change_commands = [sub.replace('min_vty', vty_range[0]) for sub in password_change_commands]
        password_change_commands = [sub.replace('max_vty', vty_range[1]) for sub in password_change_commands]
        
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to get vty range for xe device: {e}'))
        return
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Enter enable
    try:
        connection.enable()
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to enter enable: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        connection.send_config_set(password_change_commands)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Exit configuration mode
    try:
        connection.exit_config_mode()
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} exited from config mode successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} exit from config mode failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.save_config()
        
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} save config set successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} save config set failed with exception: {e}'))
        return
    
#Changes password of a given cisco_ios device
def change_cisco_ios_password(device, credentials, new_password, enable_secret, window):
    #Set configurations for netmiko connecthandler
    netmiko_config = {
        'device_type': device[2],
        'host': device[0],
        'username': credentials[0],
        'password': credentials[1],
        'secret': enable_secret,
    }
    
    password_change_commands = pull_commands_by_device_type(device[2])
    
    #Swap in the new password in commands
    password_change_commands = [sub.replace('new_password', new_password) for sub in password_change_commands]
    
    #Pull vty range
    try:
        vty_range = get_vty_range(credentials[0], credentials[1], enable_secret, device[0])
        if vty_range == None:
            raise('Failure to connect')
        
        #Swap in the vty ranges in commands
        password_change_commands = [sub.replace('min_vty', vty_range[0]) for sub in password_change_commands]
        password_change_commands = [sub.replace('max_vty', vty_range[1]) for sub in password_change_commands]
        
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to get vty range for xe device: {e}'))
        return
    
    #Connect to device
    try:
        connection = ConnectHandler(**netmiko_config)
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to connect with exception: {e}'))
        return
    
    #Enter enable
    try:
        connection.enable()
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} failed to enter enable: {e}'))
        return
    
    #Send password change commands
    try:
        print(password_change_commands)
        connection.send_config_set(password_change_commands)
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} password change commands sent successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} password change failed with exception: {e}'))
        return
    
    #Exit configuration mode
    try:
        connection.exit_config_mode()
        
        if window != None:
            window.write_event_value('-ThreadProgress-', (False, f'{device[0]} exited from config mode successfully'))
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} exit from config mode failed with exception: {e}'))
        return
    
    #Save configuration changes
    try:
        connection.save_config()
        
        connection.disconnect()
        
        results_list.append([True, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} save config set successfully'))
        return
    
    except Exception as e:
        results_list.append([False, device])
        if window != None:
            window.write_event_value('-ThreadProgress-', (True, f'{device[0]} save config set failed with exception: {e}'))
        return