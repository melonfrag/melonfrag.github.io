"""
This is a websocket server.

Valid message format:
{
"sender":"someone"
"tripcode":"(Should be) AUTO_GENERATED"
"msg":"message"
}
"""

import os
import json
import asyncio
import importlib
import hashlib
import websockets
import commands
from Gypsi import convert

print(f"Current working directory: {os.getcwd()}")
os.chdir('D:\\web-service\\backend')
print("Auto changed to 'D:\\web-service\\backend'.")
print(f"Current working directory: {os.getcwd()}")

def file_md5(file_path):
    with open(file_path, 'rb') as f:
        file_data = f.read()
        return hashlib.md5(file_data).hexdigest()

file_path = 'commands.py'
initial_md5 = file_md5(file_path)
tripcode = '000000'
connected_clients = {}  # Dictionary to store websocket and name
name_trip = {}
name_set = set()

def auto_reload():
    global initial_md5, connected_clients, name_trip
    # Check for file change and reload commands module if needed
    current_md5 = file_md5(file_path)
    if current_md5 != initial_md5:
        print("Auto reloaded `commands.py`.")
        initial_md5 = current_md5
        importlib.reload(commands)
        commands.initialize(connected_clients, name_trip)

async def register(websocket, name, password):
    global tripcode
    commands.handle("", connected_clients, name_trip)
    auto_reload()
    if password != '9cX48wGbaZWYc6KBI9TOIr':
        tripcode = convert(str(hashlib.md5(password.encode("utf-8")).hexdigest()), 16, 64)[0:6]
    await commands.register_name(websocket, name, tripcode, connected_clients, name_trip, name_set)

async def unregister(websocket):
    auto_reload()
    await commands.unregister_name(websocket, connected_clients, name_trip, name_set)

async def broadcast(message):
    auto_reload()
    if connected_clients:
        message = json.dumps(message, ensure_ascii=False)
        await asyncio.wait([client.send(message) for client in connected_clients.keys()])

async def handle_connection(websocket, path):
    """
    Handle the connection from websocket.

    Thanks to MelonFish's help!
    """
    print(f"Current path: {path}")
    name = "Anonymous"

    name_message = await websocket.recv()
    name_data = json.loads(name_message)
    password = "9cX48wGbaZWYc6KBI9TOIr"
    if 'name' in name_data:
        name = name_data['name']
    if 'password' in name_data:
        if name_data['password']:
            password = name_data['password']
        else:
            password = "9cX48wGbaZWYc6KBI9TOIr"

    
    auto_reload()
    await register(websocket, name, password)
    
    try:
        async for message in websocket:
            log_entry = ""
            response = ""
            
            try:
                data = json.loads(message)
                log_entry = commands.log_message(data, websocket)
                if log_entry:
                    response = commands.handle(data, connected_clients, name_trip)
                else:
                    response, log_entry = commands.handle_error("Invalid message format", websocket, message)
            except json.JSONDecodeError as e:
                response, log_entry = commands.handle_error(f"Invalid JSON message. Error: {str(e)}", websocket, message)
            except asyncio.IncompleteReadError as e:
                response, log_entry = commands.handle_error(f"Data is incomplete. Details: {e}", websocket, message)
            
            print(log_entry[:-1])
            if response['public'] == 1:
                await broadcast("[{}]{}".format(response['status'], response['msg']))
            elif response['msg'] != "Message received.":
                await websocket.send("'[{}]{}'".format(response['status'], response['msg']))

            if response["status"] == "success" or 'welcome back.' in response['msg']:
                await broadcast("[{}]{}: {}".format(name_trip[data['sender']], data['sender'], data['msg']))
            
            with open("websocket_messages.log", "a", encoding="UTF-8") as log_file:
                log_file.write(log_entry)

    except websockets.exceptions.ConnectionClosedOK:
        print(f"Connection closed normally: {websocket.remote_address}")

    finally:
        await unregister(websocket)

start_server = websockets.serve(handle_connection, '0.0.0.0', 12345)

print("WebSocket server started on ws://0.0.0.0:12345")
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
