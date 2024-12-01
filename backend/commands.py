"""
This is the command handler.

Used to deal with the command sent by client.
"""
import time
import json
import asyncio

start_time = time.time()
running_time = 0
afk_nicks = []
name_trip = {}
connected_clients = {}

safe_commands = {
    "help": {
        "description": "Get info about commands.",
        "usage": "/help <command name>",
        "return_value": ""
    },
    "status": {
        "description": "Get info about the server.",
        "usage": "/status",
        "return_value": "",
    },
    "afk": {
        "description": "Mark you \"afk\".",
        "usage": "afk",
        "return_value": "Command **afk** needn't use /.",
    },
    "offline": {
        "description": "Offline someone.",
        "usage": "/offline [name]",
        "return_value": "None",
    }
}

def initialize(clients, name_trip_dict):
    global connected_clients, name_trip
    connected_clients = clients
    name_trip = name_trip_dict
    print(name_trip)
    print(connected_clients)


async def register_name(websocket, name, tripcode, connected_clients, name_trip, name_set):
    if name not in name_set:
        connected_clients[websocket] = name
        name_trip[name] = tripcode
        name_set.add(name)
        res = {"status": "info", "msg": f"{name} has entered the chat.",'public':1}
        print(res)
        await broadcast("[{}]{}".format(res["status"], res["msg"]))
    else:
        await websocket.send("'Nickname taken.'")
        await websocket.close()

async def unregister_name(websocket, connected_clients, name_trip, name_set):
    name = connected_clients.pop(websocket, None)
    name_trip.pop(name, None)
    if name:
        name_set.remove(name)
        res = {"status": "info", "msg": f"{name} has left the chat."}
        await broadcast("[{}]{}".format(res["status"], res["msg"]))

async def broadcast(message):
    global connected_clients
    if connected_clients:
        message = json.dumps(message, ensure_ascii=False)
        await asyncio.wait([client.send(message) for client in connected_clients.keys()])

def handle(data, connected_clients, name_trip):
    response = {"status": "success", "msg": "Message received.", "public": 0}
    
    if 'msg' in data and 'sender' in data:
        msg = str(data['msg'])
        sender = str(data['sender'])
        if msg == "afk":
            if sender not in afk_nicks:
                afk_nicks.append(sender)
                response["status"] = "cmd_success"
                response["msg"] = sender + " is AFK now."
                response["public"] = 1
            else:
                response["status"] = "cmd_error"
                response['msg'] = sender + " has been AFK already."
        
        elif msg.startswith("/"):
            response['status'] = "cmd_success"
            splited_msg = msg.split()
            running_time = time.time() - start_time
            status_value = (f"<br>Online users: " + str([value for value in connected_clients.values()]) +
    """
Running time: """ + time.strftime("%H:%M:%S", time.gmtime(running_time)) + """
Running on MelonFish's server.
Author(Github username): MelonFrag""")
            safe_commands['status']['return_value'] = status_value
            if splited_msg[0][1:] in safe_commands:
                if splited_msg[0][1:] == "help":
                    try:
                        response['msg'] = f"""
$\\\\ \\small Command: {splited_msg[1]} \\\\ $
Description: {safe_commands[splited_msg[1]]['description']}
Usage: {safe_commands[splited_msg[1]]['usage']}"""
                    except IndexError:
                        response['msg'] = "All commands: **help**, **status**, **afk**"
                    except KeyError:
                        response['status'] = "cmd_error"
                        response['msg'] = "Command not exist."
                else:
                    response['msg'] = safe_commands[splited_msg[0][1:]]['return_value']
            if splited_msg[0][1:] == "offline":
                if name_trip[sender] == "ABfrag":
                    try:
                        for key in connected_clients.keys():
                            if connected_clients[key] == splited_msg[1]:
                                key.close()
                                unregister_name(key,connected_clients,name_trip,splited_msg[1])
                    except IndexError:
                        response['status'] = "cmd_error"
                        response['msg'] = "Invalid format."
                else:
                    response['status'] = "cmd_error"
                    response['msg'] = "Permission denied."
            else:
                response['status'] = "cmd_error"
                response['msg'] = "Command not exist, or permission denied."
        else:
            if sender in afk_nicks:
                afk_nicks.remove(sender)
                response['status'] = "cmd_success"
                response['msg'] = sender + ", welcome back."
                response["public"] = 1
    return response

def log_message(data, websocket):
    if isinstance(data, dict) and 'msg' in data and 'sender' in data:
        if all(isinstance(data[key], str) for key in ['sender', 'msg']):
            return f"{data['sender']}: {data['msg']}\n"
    return ""

def handle_error(error_message, websocket, data):
    log_entry = f"{error_message} from {websocket.remote_address}: {data}\n"
    response = {"status": "error", "msg": error_message}
    return response, log_entry
